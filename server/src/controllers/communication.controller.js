const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { sendDocumentEmail, sendDocumentSms } = require("../services/documentDelivery.service");
const { normalizePhoneNumber } = require("../services/sms.service");

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
  const billBalance = asNumber(row.balance_amount);
  const outstanding = Math.max(asNumber(row.gross_outstanding) - asNumber(row.credit_balance), 0);
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
    arrears_after_payment: money(billBalance, currency),
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
      value: normalizedPhone,
      enabled: row.whatsapp_delivery_enabled === true,
      ready: row.whatsapp_delivery_enabled === true && Boolean(normalizedPhone)
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
    arrears_after_payment: row.balance_amount,
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
      default_template: defaultInvoiceTemplate,
      rows
    });
  } finally {
    client.release();
  }
});

const validateMedium = (medium) => {
  if (!["email", "sms", "whatsapp"].includes(medium)) {
    throw new ApiError(400, "Medium must be email, sms, or whatsapp.");
  }
  if (medium === "whatsapp") {
    throw new ApiError(400, "WhatsApp sending is not configured yet. Use SMS or email for this slice.");
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
  const subject = `${business.business_name || "Water Billing"} invoice ${row.bill_number || row.bill_id}`;
  const result =
    medium === "email"
      ? await sendDocumentEmail(client, req, {
          documentType: "bill",
          documentId: row.bill_id,
          customerId: row.customer_id,
          recipient: contact.value,
          subject,
          text: message
        })
      : await sendDocumentSms(client, req, {
          documentType: "bill",
          documentId: row.bill_id,
          customerId: row.customer_id,
          recipient: contact.value,
          subject,
          message
        });

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

  const uniqueIds = [...new Set((req.body?.customer_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new ApiError(400, "Select at least one customer to send.");
  if (uniqueIds.length > 50) throw new ApiError(400, "Send up to 50 customers at a time.");

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const campaignResult = await client.query(
      `INSERT INTO communication_campaigns (
         alert_type, medium, template, status, total_count, created_by
       )
       VALUES ('invoice_alert', $1::varchar, $2, 'running', $3, $4)
       RETURNING *`,
      [medium, template, uniqueIds.length, req.user.id]
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

module.exports = {
  listInvoicePreview,
  sendInvoiceAlert,
  sendBulkInvoiceAlerts
};
