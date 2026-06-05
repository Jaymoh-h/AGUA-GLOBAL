const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { sendDocumentEmail, sendDocumentSms, sendDocumentWhatsApp } = require("../services/documentDelivery.service");
const { normalizePhoneNumber } = require("../services/sms.service");
const { getWhatsAppStatus, normalizeWhatsAppNumber } = require("../services/whatsapp.service");

const asNumber = (value) => Number(value || 0);
const dateOnly = (value) => {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const formatNumber = (value) => asNumber(value).toLocaleString("en-KE");
const money = (value, currency = "KES") => `${currency} ${asNumber(value).toLocaleString("en-KE")}`;

const buildPaymentInformation = (business, accountNumber) => {
  const lines = ["PAYMENTS information"];
  lines.push(`Paybill number, ${business.paybill_number || business.till_number || "-"}.`);
  lines.push(`Account, ${accountNumber || "-"}.`);
  if (business.bank_details) {
    lines.push(`Bank, ${business.bank_details}.`);
  }
  return lines.join("\n");
};

const buildInvoiceTemplateValues = ({ row, business }) => {
  const businessName = business.business_name || "Water Billing";
  const currency = business.default_currency || "KES";
  const total = asNumber(row.total_amount || row.amount);
  const outstanding = Math.max(asNumber(row.gross_outstanding) - asNumber(row.credit_balance), 0);
  const priorOutstanding = Math.max(asNumber(row.prior_outstanding) - asNumber(row.credit_balance), 0);
  const invoicePeriod = row.billing_period_name || dateOnly(row.billing_month);

  return {
    business_name: businessName,
    customer_name: row.customer_name || "-",
    acc_number: row.acc_number || "-",
    invoice_period: invoicePeriod,
    previous_reading: formatNumber(row.previous_reading),
    current_reading: formatNumber(row.current_reading),
    units_consumed: formatNumber(row.units_used),
    amount: money(total, currency),
    amount_paid: money(row.paid_amount, currency),
    arrears_after_payment: money(priorOutstanding, currency),
    total_outstanding: money(outstanding, currency),
    due_date: dateOnly(row.due_date),
    payment_information: buildPaymentInformation(business, row.acc_number),
    paybill_number: business.paybill_number || "",
    till_number: business.till_number || "",
    business_phone: business.phone || "-"
  };
};

const renderTemplate = (template, values) =>
  String(template || defaultInvoiceTemplate).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    values[key] === undefined || values[key] === null ? "" : String(values[key])
  );

const renderInvoiceMessage = ({ row, business, template = defaultInvoiceTemplate }) => {
  if (!row.bill_id) return "";
  return renderTemplate(template, buildInvoiceTemplateValues({ row, business }));
};

const defaultInvoiceTemplate = [
  "{{business_name}}",
  "Dear, {{customer_name}}. {{acc_number}}",
  "Water bill dated {{invoice_period}}.",
  "Previous reading. {{previous_reading}}.",
  "Current reading. {{current_reading}}.",
  "Units consumed. {{units_consumed}}. {{amount}}",
  "Amount paid. {{amount_paid}}",
  "Arrears after payment. {{arrears_after_payment}}",
  "Total outstanding. {{total_outstanding}}",
  "Due date. {{due_date}}",
  "{{payment_information}}",
  "For enquiries contact customer care on {{business_phone}}."
].join("\n");

const summarizeTemplate = (template) => {
  const line = String(template || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, "").replace(/[.,:;]+/g, " ").trim())
    .find((item) => item.length >= 4);
  return line || "Invoice alert";
};

const normalizeCampaignName = ({ campaignName, medium, template }) => {
  const explicitName = String(campaignName || "").trim();
  const fallback = `${summarizeTemplate(template)} - ${String(medium || "").toUpperCase()}`;
  return (explicitName || fallback).slice(0, 160);
};

const normalizeWhatsAppTemplateVariables = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
};

const normalizeWhatsAppTemplatePayload = (payload = {}) => {
  const name = String(payload.name || "").trim();
  if (!name) return null;
  const language = String(payload.language || "en_US").trim().slice(0, 20) || "en_US";
  return {
    name: name.slice(0, 160),
    language,
    variables: normalizeWhatsAppTemplateVariables(payload.variables)
  };
};

const buildWhatsAppTemplate = ({ row, business, templatePayload }) => {
  if (!templatePayload?.name) return null;
  const values = buildInvoiceTemplateValues({ row, business });
  return {
    name: templatePayload.name,
    language: templatePayload.language || "en_US",
    parameters: templatePayload.variables.map((key) => String(values[key] ?? ""))
  };
};

const normalizeTemplatePayload = (payload = {}) => {
  const name = String(payload.name || "").trim();
  const medium = String(payload.medium || "").toLowerCase();
  const body = String(payload.body || "").trim();
  const whatsappTemplateName = String(payload.whatsapp_template_name || "").trim();
  const whatsappTemplateLanguage = String(payload.whatsapp_template_language || "en_US").trim();
  if (!name) throw new ApiError(400, "Template name is required.");
  validateMedium(medium);
  if (!body) throw new ApiError(400, "Template body is required.");
  return {
    name: name.slice(0, 160),
    medium,
    body,
    whatsappTemplateName: medium === "whatsapp" && whatsappTemplateName ? whatsappTemplateName.slice(0, 160) : null,
    whatsappTemplateLanguage: medium === "whatsapp" ? whatsappTemplateLanguage.slice(0, 20) || "en_US" : "en_US",
    whatsappTemplateVariables: medium === "whatsapp" ? normalizeWhatsAppTemplateVariables(payload.whatsapp_template_variables) : [],
    isDefault: payload.is_default === true
  };
};

const getBusinessSettings = async (client) => {
  const businessResult = await client.query("SELECT * FROM business_settings WHERE id = 1");
  return businessResult.rows[0] || {};
};

const getInvoicePreviewRows = async (client, customerId = null) => {
  const params = [];
  const customerClause = customerId ? `AND c.id = $${params.push(customerId)}` : "";
  const previewResult = await client.query(
    `SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.acc_number,
        c.phone,
        COALESCE(c.email, portal_user.email) AS email,
        c.status AS customer_status,
        c.preferred_delivery_channel,
        c.email_delivery_enabled,
        c.sms_delivery_enabled,
        c.whatsapp_delivery_enabled,
        z.name AS zone_name,
        latest_bill.id AS bill_id,
        latest_bill.bill_number,
        latest_bill.billing_month,
        latest_bill.billing_period_name,
        latest_bill.previous_reading,
        latest_bill.current_reading,
        latest_bill.units_used,
        latest_bill.amount,
        latest_bill.total_amount,
        latest_bill.paid_amount,
        latest_bill.balance_amount,
        latest_bill.due_date,
        latest_bill.status AS bill_status,
        COALESCE(customer_totals.gross_outstanding, 0) AS gross_outstanding,
        COALESCE(prior_totals.prior_outstanding, 0) AS prior_outstanding,
        COALESCE(customer_credit.credit_balance, 0) AS credit_balance
     FROM customers c
     LEFT JOIN zones z ON z.id = c.zone_id
     LEFT JOIN LATERAL (
       SELECT email
       FROM users
       WHERE customer_id = c.id
         AND is_active = TRUE
         AND email IS NOT NULL
       ORDER BY role = 'customer' DESC, id ASC
       LIMIT 1
     ) portal_user ON TRUE
     LEFT JOIN LATERAL (
       SELECT b.*, bp.name AS billing_period_name
       FROM bills b
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
       ORDER BY b.billing_month DESC, b.created_at DESC, b.id DESC
       LIMIT 1
     ) latest_bill ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(balance_amount), 0) AS gross_outstanding
       FROM bills
       WHERE customer_id = c.id
         AND bill_pay_status = 'payable'
     ) customer_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(balance_amount), 0) AS prior_outstanding
       FROM bills b
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
         AND b.status <> 'paid'
         AND latest_bill.id IS NOT NULL
         AND (
           b.billing_month < latest_bill.billing_month
           OR (b.billing_month = latest_bill.billing_month AND b.id < latest_bill.id)
         )
     ) prior_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(unallocated_amount), 0) AS credit_balance
       FROM payments
       WHERE customer_id = c.id
         AND status = 'posted'
     ) customer_credit ON TRUE
     WHERE c.status = 'active'
       ${customerClause}
     ORDER BY c.name ASC, c.id ASC`,
    params
  );
  return previewResult.rows;
};

const mapInvoicePreviewRow = ({ row, business }) => {
  const normalizedPhone = normalizePhoneNumber(row.phone);
  const normalizedWhatsApp = normalizeWhatsAppNumber(row.phone);
  const hasInvoice = Boolean(row.bill_id);
  const totalOutstanding = Math.max(asNumber(row.gross_outstanding) - asNumber(row.credit_balance), 0);
  const contacts = {
    email: {
      value: row.email || "",
      enabled: row.email_delivery_enabled !== false,
      ready: row.email_delivery_enabled !== false && Boolean(row.email)
    },
    sms: {
      value: normalizedPhone,
      enabled: row.sms_delivery_enabled === true,
      ready: row.sms_delivery_enabled === true && Boolean(normalizedPhone)
    },
    whatsapp: {
      value: normalizedWhatsApp,
      enabled: row.whatsapp_delivery_enabled === true,
      ready: row.whatsapp_delivery_enabled === true && Boolean(normalizedWhatsApp)
    }
  };
  const issues = [];
  if (!hasInvoice) issues.push("No payable invoice found.");
  if (!row.email) issues.push("Email missing.");
  if (!normalizedPhone) issues.push("Phone missing.");
  const templateValues = hasInvoice ? buildInvoiceTemplateValues({ row, business }) : {};

  return {
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    acc_number: row.acc_number,
    customer_status: row.customer_status,
    zone_name: row.zone_name,
    preferred_delivery_channel: row.preferred_delivery_channel,
    bill_id: row.bill_id,
    bill_number: row.bill_number,
    bill_status: row.bill_status,
    billing_month: row.billing_month,
    billing_period_name: row.billing_period_name,
    previous_reading: row.previous_reading,
    current_reading: row.current_reading,
    units_used: row.units_used,
    amount: row.total_amount || row.amount,
    amount_paid: row.paid_amount,
    arrears_after_payment: Math.max(asNumber(row.prior_outstanding) - asNumber(row.credit_balance), 0),
    total_outstanding: totalOutstanding,
    due_date: row.due_date,
    contacts,
    issues,
    template_values: templateValues,
    message: hasInvoice ? renderTemplate(defaultInvoiceTemplate, templateValues) : ""
  };
};

const listInvoicePreview = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const rows = (await getInvoicePreviewRows(client)).map((row) => mapInvoicePreviewRow({ row, business }));

    res.json({
      business: {
        business_name: business.business_name || "Water Billing",
        phone: business.phone || "",
        paybill_number: business.paybill_number || "",
        till_number: business.till_number || "",
        default_currency: business.default_currency || "KES"
      },
      channels: {
        whatsapp: getWhatsAppStatus()
      },
      default_template: defaultInvoiceTemplate,
      rows
    });
  } finally {
    client.release();
  }
});

const listTemplates = asyncHandler(async (req, res) => {
  const medium = String(req.query.medium || "").toLowerCase();
  const params = [];
  const clauses = ["alert_type = 'invoice_alert'"];
  if (medium) {
    validateMedium(medium);
    params.push(medium);
    clauses.push(`medium = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT ct.*,
            created_user.name AS created_by_name,
            updated_user.name AS updated_by_name
     FROM communication_templates ct
     LEFT JOIN users created_user ON created_user.id = ct.created_by
     LEFT JOIN users updated_user ON updated_user.id = ct.updated_by
     WHERE ${clauses.join(" AND ")}
     ORDER BY ct.medium ASC, ct.is_default DESC, ct.name ASC`,
    params
  );
  res.json(rows);
});

const createTemplate = asyncHandler(async (req, res) => {
  const payload = normalizeTemplatePayload(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (payload.isDefault) {
      await client.query(
        `UPDATE communication_templates
         SET is_default = FALSE,
             updated_by = $1,
             updated_at = NOW()
         WHERE alert_type = 'invoice_alert'
           AND medium = $2`,
        [req.user.id, payload.medium]
      );
    }
    const { rows } = await client.query(
      `INSERT INTO communication_templates (
         name, alert_type, medium, body, whatsapp_template_name, whatsapp_template_language,
         whatsapp_template_variables, is_default, created_by, updated_by
       )
       VALUES ($1::varchar, 'invoice_alert', $2::varchar, $3, $4::varchar, $5::varchar, $6::jsonb, $7, $8, $8)
       RETURNING *`,
      [
        payload.name,
        payload.medium,
        payload.body,
        payload.whatsappTemplateName,
        payload.whatsappTemplateLanguage,
        JSON.stringify(payload.whatsappTemplateVariables),
        payload.isDefault,
        req.user.id
      ]
    );
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "A template with this name already exists for this medium.");
    throw error;
  } finally {
    client.release();
  }
});

const updateTemplate = asyncHandler(async (req, res) => {
  const payload = normalizeTemplatePayload(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM communication_templates WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!beforeResult.rows[0]) throw new ApiError(404, "Communication template not found.");
    if (payload.isDefault) {
      await client.query(
        `UPDATE communication_templates
         SET is_default = FALSE,
             updated_by = $1,
             updated_at = NOW()
         WHERE alert_type = 'invoice_alert'
           AND medium = $2
           AND id <> $3`,
        [req.user.id, payload.medium, req.params.id]
      );
    }
    const { rows } = await client.query(
      `UPDATE communication_templates
       SET name = $1::varchar,
           medium = $2::varchar,
           body = $3,
           whatsapp_template_name = $4::varchar,
           whatsapp_template_language = $5::varchar,
           whatsapp_template_variables = $6::jsonb,
           is_default = $7,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payload.name,
        payload.medium,
        payload.body,
        payload.whatsappTemplateName,
        payload.whatsappTemplateLanguage,
        JSON.stringify(payload.whatsappTemplateVariables),
        payload.isDefault,
        req.user.id,
        req.params.id
      ]
    );
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new ApiError(400, "A template with this name already exists for this medium.");
    throw error;
  } finally {
    client.release();
  }
});

const validateMedium = (medium) => {
  if (!["email", "sms", "whatsapp"].includes(medium)) {
    throw new ApiError(400, "Medium must be email, sms, or whatsapp.");
  }
};

const sendInvoiceAlertForRow = async ({ client, req, business, row, medium, template }) => {
  if (!row) throw new ApiError(404, "Customer not found.");
  if (!row.bill_id) throw new ApiError(400, "This customer does not have a payable invoice to send.");

  const previewRow = mapInvoicePreviewRow({ row, business });
  const contact = previewRow.contacts[medium];
  if (!contact?.value) throw new ApiError(400, `This customer does not have a ${medium} contact.`);
  if (!contact.enabled) throw new ApiError(400, `${medium.toUpperCase()} delivery is disabled for this customer.`);

  const message = renderInvoiceMessage({ row, business, template });
  const whatsappTemplate = buildWhatsAppTemplate({
    row,
    business,
    templatePayload: normalizeWhatsAppTemplatePayload(req.body?.whatsapp_template)
  });
  const subject = `${business.business_name || "Water Billing"} invoice ${row.bill_number || row.bill_id}`;
  let result;
  if (medium === "email") {
    result = await sendDocumentEmail(client, req, {
      documentType: "bill",
      documentId: row.bill_id,
      customerId: row.customer_id,
      recipient: contact.value,
      subject,
      text: message
    });
  } else if (medium === "whatsapp") {
    result = await sendDocumentWhatsApp(client, req, {
      documentType: "bill",
      documentId: row.bill_id,
      customerId: row.customer_id,
      recipient: contact.value,
      subject,
      message,
      whatsappTemplate
    });
  } else {
    result = await sendDocumentSms(client, req, {
      documentType: "bill",
      documentId: row.bill_id,
      customerId: row.customer_id,
      recipient: contact.value,
      subject,
      message
    });
  }

  let auditError = null;
  try {
    await recordAuditEvent(client, {
      req,
      action: `communication.invoice_alert_${medium}_sent`,
      entityType: "bill",
      entityId: row.bill_id,
      afterData: {
        customer_id: row.customer_id,
        recipient: contact.value,
        medium,
        status: result.status,
        delivery_log_id: result.log?.id || null,
        delivery_log_error: result.log_error || null
      },
      reason: `Invoice alert ${medium} ${result.status}`
    });
  } catch (error) {
    auditError = error.message;
    console.error("Communication audit event could not be recorded.", error);
  }

  return {
    ...result,
    audit_error: auditError,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    bill_id: row.bill_id,
    recipient: contact.value,
    medium,
    message_text: message
  };
};

const sendInvoiceAlert = asyncHandler(async (req, res) => {
  const medium = String(req.body?.medium || "").toLowerCase();
  const template = String(req.body?.template || defaultInvoiceTemplate);
  validateMedium(medium);

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const row = (await getInvoicePreviewRows(client, req.params.customerId))[0];
    const result = await sendInvoiceAlertForRow({ client, req, business, row, medium, template });

    const logNote = result.log_error ? " Delivery history could not be updated." : "";
    const auditNote = result.audit_error ? " Audit event could not be recorded." : "";
    res.json({
      ...result,
      message:
        result.status === "sent"
          ? `Invoice alert sent to ${row.customer_name}.${logNote}${auditNote}`
          : `Invoice alert was not sent to ${row.customer_name}.${logNote}${auditNote}`
    });
  } finally {
    client.release();
  }
});

const sendBulkInvoiceAlerts = asyncHandler(async (req, res) => {
  const medium = String(req.body?.medium || "").toLowerCase();
  const template = String(req.body?.template || defaultInvoiceTemplate);
  validateMedium(medium);
  const campaignName = normalizeCampaignName({
    campaignName: req.body?.campaign_name,
    medium,
    template
  });

  const uniqueIds = [...new Set((req.body?.customer_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new ApiError(400, "Select at least one customer to send.");
  if (uniqueIds.length > 50) throw new ApiError(400, "Send up to 50 customers at a time.");

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const campaignResult = await client.query(
      `INSERT INTO communication_campaigns (
         campaign_name, alert_type, medium, template, status, total_count, created_by
       )
       VALUES ($1::varchar, 'invoice_alert', $2::varchar, $3, 'running', $4, $5)
       RETURNING *`,
      [campaignName, medium, template, uniqueIds.length, req.user.id]
    );
    const campaign = campaignResult.rows[0];
    const results = [];

    for (const customerId of uniqueIds) {
      try {
        const row = (await getInvoicePreviewRows(client, customerId))[0];
        const result = await sendInvoiceAlertForRow({ client, req, business, row, medium, template });
        const resultRow = {
          customer_id: customerId,
          customer_name: result.customer_name,
          bill_id: result.bill_id,
          recipient: result.recipient,
          status: result.status,
          error_message: result.error_message || result.log_error || result.audit_error || "",
          delivery_log_id: result.log?.id || null
        };
        await client.query(
          `INSERT INTO communication_campaign_recipients (
             campaign_id, customer_id, bill_id, recipient, status, error_message, delivery_log_id
           )
           VALUES ($1, $2, $3, $4::varchar, $5::varchar, $6, $7)`,
          [
            campaign.id,
            resultRow.customer_id,
            resultRow.bill_id,
            resultRow.recipient || null,
            resultRow.status,
            resultRow.error_message || null,
            resultRow.delivery_log_id
          ]
        );
        results.push(resultRow);
      } catch (error) {
        const resultRow = {
          customer_id: customerId,
          customer_name: "",
          bill_id: null,
          recipient: "",
          status: "failed",
          error_message: error.message || "Send failed."
        };
        await client.query(
          `INSERT INTO communication_campaign_recipients (
             campaign_id, customer_id, bill_id, recipient, status, error_message
           )
           VALUES ($1, $2, NULL, NULL, 'failed', $3)`,
          [campaign.id, customerId, resultRow.error_message]
        );
        results.push(resultRow);
      }
    }

    const sent = results.filter((row) => row.status === "sent").length;
    const skipped = results.filter((row) => row.status === "skipped").length;
    const failed = results.filter((row) => row.status === "failed").length;
    const campaignStatus = failed || skipped ? "completed_with_errors" : "completed";
    await client.query(
      `UPDATE communication_campaigns
       SET status = $1::varchar,
           sent_count = $2,
           skipped_count = $3,
           failed_count = $4,
           completed_at = NOW()
       WHERE id = $5`,
      [campaignStatus, sent, skipped, failed, campaign.id]
    );
    res.json({
      campaign_id: campaign.id,
      campaign_name: campaign.campaign_name,
      campaign_status: campaignStatus,
      medium,
      total: results.length,
      sent,
      skipped,
      failed,
      results,
      message: `Bulk ${medium} alerts completed: ${sent} sent, ${skipped} skipped, ${failed} failed.`
    });
  } finally {
    client.release();
  }
});

const listCampaigns = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT cc.*,
            u.name AS created_by_name
     FROM communication_campaigns cc
     LEFT JOIN users u ON u.id = cc.created_by
     ORDER BY cc.created_at DESC
     LIMIT 100`
  );
  res.json(rows);
});

const getCampaign = asyncHandler(async (req, res) => {
  const campaignResult = await pool.query(
    `SELECT cc.*,
            u.name AS created_by_name
     FROM communication_campaigns cc
     LEFT JOIN users u ON u.id = cc.created_by
     WHERE cc.id = $1`,
    [req.params.id]
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw new ApiError(404, "Communication campaign not found.");

  const recipientResult = await pool.query(
    `SELECT ccr.*,
            c.name AS customer_name,
            c.acc_number,
            b.bill_number,
            ddl.provider_message_id,
            ddl.sent_at
     FROM communication_campaign_recipients ccr
     LEFT JOIN customers c ON c.id = ccr.customer_id
     LEFT JOIN bills b ON b.id = ccr.bill_id
     LEFT JOIN document_delivery_logs ddl ON ddl.id = ccr.delivery_log_id
     WHERE ccr.campaign_id = $1
     ORDER BY ccr.created_at ASC, ccr.id ASC`,
    [campaign.id]
  );

  res.json({
    campaign,
    recipients: recipientResult.rows
  });
});

module.exports = {
  listInvoicePreview,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendInvoiceAlert,
  sendBulkInvoiceAlerts,
  listCampaigns,
  getCampaign
};
