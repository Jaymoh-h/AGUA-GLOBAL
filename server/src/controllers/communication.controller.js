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
  const paidAmount = asNumber(row.recent_paid_amount);
  const outstanding = asNumber(row.statement_total_outstanding);
  const priorOutstanding = asNumber(row.statement_arrears_after_payment);
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
    amount_paid: money(paidAmount, currency),
    arrears_after_payment: money(priorOutstanding, currency),
    total_outstanding: money(outstanding, currency),
    overdue_balance: money(row.overdue_balance, currency),
    oldest_due_date: dateOnly(row.oldest_due_date),
    days_overdue: String(Math.max(asNumber(row.days_overdue), 0)),
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

const defaultPaymentPlanTemplate = [
  "{{business_name}}",
  "Dear {{customer_name}} ({{acc_number}}),",
  "Your payment plan {{arrangement_number}} is currently behind.",
  "Expected by {{as_of_date}}: {{expected_amount}}. Payments received: {{received_amount}}. Shortfall: {{shortfall_amount}}.",
  "Your agreed instalment is {{installment_amount}} {{frequency}}, with the next due date {{next_due_date}}.",
  "{{payment_information}}",
  "For enquiries contact customer care on {{business_phone}}."
].join("\n");

const defaultStandingOrderTemplate = [
  "{{business_name}}",
  "Dear {{customer_name}} ({{acc_number}}),",
  "We have not yet matched your scheduled bank standing-order payment reference {{mandate_reference}}.",
  "Expected by {{as_of_date}}: {{expected_amount}}. Confirmed receipts matched: {{matched_amount}}. Outstanding schedule amount: {{shortfall_amount}}.",
  "Your standing order is {{installment_amount}} {{frequency}}, with the next due date {{next_due_date}}.",
  "Please check the bank reference or contact customer care if payment has already been made.",
  "{{payment_information}}",
  "For enquiries contact customer care on {{business_phone}}."
].join("\n");

const defaultDisconnectionWarningTemplate = [
  "{{business_name}}",
  "Dear {{customer_name}} ({{acc_number}}),",
  "Your overdue water balance of {{overdue_balance}} has been outstanding since {{oldest_due_date}} ({{days_overdue}} days).",
  "This is a formal payment warning. Please pay or contact customer care promptly to discuss your account. Service action may be considered only in line with the applicable service terms.",
  "{{payment_information}}",
  "For enquiries contact customer care on {{business_phone}}."
].join("\n");
const disconnectionWarningCooldownDays = 7;

const alertTypes = ["invoice_alert", "payment_plan_alert", "standing_order_alert", "disconnection_warning"];

const normalizeAlertType = (value) => {
  const alertType = String(value || "invoice_alert").trim().toLowerCase();
  if (!alertTypes.includes(alertType)) throw new ApiError(400, "Unsupported communication alert type.");
  return alertType;
};

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

const buildWhatsAppTemplate = ({ values, templatePayload }) => {
  if (!templatePayload?.name) return null;
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
    alertType: normalizeAlertType(payload.alert_type),
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
        COALESCE(recent_payments.recent_paid_amount, 0) AS recent_paid_amount,
        COALESCE(customer_totals.gross_outstanding, 0) AS gross_outstanding,
        COALESCE(prior_totals.prior_outstanding, 0) AS prior_outstanding,
        COALESCE(customer_credit.credit_balance, 0) AS credit_balance,
        COALESCE(statement_totals.arrears_after_payment, 0) AS statement_arrears_after_payment,
        COALESCE(statement_totals.total_outstanding, 0) AS statement_total_outstanding,
        COALESCE(overdue_totals.overdue_balance, 0) AS overdue_balance,
        overdue_totals.oldest_due_date,
        COALESCE(CURRENT_DATE - overdue_totals.oldest_due_date, 0) AS days_overdue
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
       SELECT
         b.id,
         b.bill_number,
         b.billing_month,
         bp.name AS billing_period_name,
         b.previous_reading,
         b.current_reading,
         b.units_used,
         b.amount,
         COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) AS total_amount,
         GREATEST(COALESCE(b.paid_amount, 0), COALESCE(bill_allocations.allocated_amount, 0)) AS paid_amount,
         GREATEST(
           COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
             GREATEST(COALESCE(b.paid_amount, 0), COALESCE(bill_allocations.allocated_amount, 0)),
           0
         ) AS balance_amount,
         b.due_date,
         b.status,
         b.issued_at,
         b.created_at
       FROM bills b
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
         FROM payment_allocations pa
         WHERE pa.bill_id = b.id
       ) bill_allocations ON TRUE
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
       ORDER BY b.billing_month DESC, b.created_at DESC, b.id DESC
       LIMIT 1
     ) latest_bill ON TRUE
     LEFT JOIN LATERAL (
       SELECT b.billing_month, b.issued_at, b.created_at
       FROM bills b
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
         AND latest_bill.id IS NOT NULL
         AND (
           b.billing_month < latest_bill.billing_month
           OR (b.billing_month = latest_bill.billing_month AND b.id < latest_bill.id)
         )
       ORDER BY b.billing_month DESC, b.created_at DESC, b.id DESC
       LIMIT 1
     ) previous_bill ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(p.amount), 0) AS recent_paid_amount
       FROM payments p
       WHERE p.customer_id = c.id
         AND p.status = 'posted'
         AND latest_bill.id IS NOT NULL
         AND p.payment_date > COALESCE(
           previous_bill.issued_at::date,
           previous_bill.created_at::date,
           previous_bill.billing_month,
           latest_bill.billing_month - INTERVAL '1 month'
         )
         AND p.payment_date <= COALESCE(
           latest_bill.issued_at::date,
           latest_bill.created_at::date,
           CURRENT_DATE
         )
     ) recent_payments ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(balance_amount), 0) AS gross_outstanding
       FROM (
         SELECT GREATEST(
                  COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
                    GREATEST(COALESCE(b.paid_amount, 0), COALESCE(bill_allocations.allocated_amount, 0)),
                  0
                ) AS balance_amount
         FROM bills b
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
           FROM payment_allocations pa
           WHERE pa.bill_id = b.id
         ) bill_allocations ON TRUE
         WHERE b.customer_id = c.id
           AND b.bill_pay_status = 'payable'
       ) balances
     ) customer_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(balance_amount), 0) AS prior_outstanding
       FROM (
         SELECT
           b.billing_month,
           b.id,
           GREATEST(
             COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
               GREATEST(COALESCE(b.paid_amount, 0), COALESCE(bill_allocations.allocated_amount, 0)),
             0
           ) AS balance_amount
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
         FROM payment_allocations pa
         WHERE pa.bill_id = b.id
       ) bill_allocations ON TRUE
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
         AND b.status <> 'paid'
         AND latest_bill.id IS NOT NULL
         AND (
           b.billing_month < latest_bill.billing_month
           OR (b.billing_month = latest_bill.billing_month AND b.id < latest_bill.id)
         )
       ) balances
     ) prior_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(unallocated_amount), 0) AS credit_balance
       FROM payments
       WHERE customer_id = c.id
         AND status = 'posted'
     ) customer_credit ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         GREATEST(prior_debits - prior_credits, 0) AS arrears_after_payment,
         GREATEST(prior_debits - prior_credits + COALESCE(latest_bill.total_amount, 0), 0) AS total_outstanding
       FROM (
         SELECT
           COALESCE((
             SELECT SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount, 0))
             FROM bills b
             WHERE b.customer_id = c.id
               AND b.bill_pay_status = 'payable'
               AND latest_bill.id IS NOT NULL
               AND (
                 b.billing_month < latest_bill.billing_month
                 OR (b.billing_month = latest_bill.billing_month AND b.id < latest_bill.id)
               )
           ), 0) +
           CASE
             WHEN COALESCE(c.opening_balance_amount, 0) > 0
              AND c.opening_balance_date <= COALESCE(
                latest_bill.issued_at::date,
                latest_bill.created_at::date,
                CURRENT_DATE
              )
              AND NOT EXISTS (
                SELECT 1 FROM bills mb
                WHERE mb.customer_id = c.id
                  AND mb.bill_number = 'MIG-' || c.id::text
              )
             THEN c.opening_balance_amount
             ELSE 0
           END AS prior_debits,
           COALESCE((
             SELECT SUM(p.amount)
             FROM payments p
             WHERE p.customer_id = c.id
               AND p.status = 'posted'
               AND latest_bill.id IS NOT NULL
               AND p.payment_date <= COALESCE(
                 latest_bill.issued_at::date,
                 latest_bill.created_at::date,
                 CURRENT_DATE
               )
           ), 0) +
           CASE
             WHEN COALESCE(c.opening_balance_amount, 0) < 0
              AND c.opening_balance_date <= COALESCE(
                latest_bill.issued_at::date,
                latest_bill.created_at::date,
                CURRENT_DATE
              )
             THEN ABS(c.opening_balance_amount)
             ELSE 0
           END AS prior_credits
       ) ledger
     ) statement_totals ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(SUM(
           GREATEST(
             COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
               GREATEST(COALESCE(b.paid_amount, 0), COALESCE(bill_allocations.allocated_amount, 0)),
             0
           )
         ), 0) AS overdue_balance,
         MIN(COALESCE(b.due_date, b.billing_month)) AS oldest_due_date
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
         FROM payment_allocations pa
         WHERE pa.bill_id = b.id
       ) bill_allocations ON TRUE
       WHERE b.customer_id = c.id
         AND b.bill_pay_status = 'payable'
         AND b.status <> 'paid'
         AND COALESCE(b.due_date, b.billing_month) < CURRENT_DATE
     ) overdue_totals ON TRUE
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
  const arrearsAfterPayment = asNumber(row.statement_arrears_after_payment);
  const totalOutstanding = asNumber(row.statement_total_outstanding);
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
    amount_paid: asNumber(row.recent_paid_amount),
    arrears_after_payment: arrearsAfterPayment,
    total_outstanding: totalOutstanding,
    overdue_balance: asNumber(row.overdue_balance),
    oldest_due_date: row.oldest_due_date,
    days_overdue: asNumber(row.days_overdue),
    due_date: row.due_date,
    contacts,
    issues,
    template_values: templateValues,
    message: hasInvoice ? renderTemplate(defaultInvoiceTemplate, templateValues) : ""
  };
};

const buildPaymentPlanTemplateValues = ({ row, business }) => {
  const currency = business.default_currency || "KES";
  return {
    business_name: business.business_name || "Water Billing",
    customer_name: row.customer_name || "-",
    acc_number: row.acc_number || "-",
    arrangement_number: row.arrangement_number || `Plan ${row.arrangement_id}`,
    installment_amount: money(row.installment_amount, currency),
    frequency: String(row.frequency || "-").toLowerCase(),
    expected_amount: money(row.expected_amount, currency),
    received_amount: money(row.received_amount, currency),
    shortfall_amount: money(row.shortfall_amount, currency),
    as_of_date: dateOnly(row.as_of_date || new Date()),
    next_due_date: dateOnly(row.next_due_date),
    payment_information: buildPaymentInformation(business, row.acc_number),
    paybill_number: business.paybill_number || "",
    till_number: business.till_number || "",
    business_phone: business.phone || "-"
  };
};

const mapPaymentPlanFollowUpRow = ({ row, business }) => {
  const normalizedPhone = normalizePhoneNumber(row.phone);
  const normalizedWhatsApp = normalizeWhatsAppNumber(row.phone);
  const contacts = {
    email: { value: row.email || "", enabled: row.email_delivery_enabled !== false, ready: row.email_delivery_enabled !== false && Boolean(row.email) },
    sms: { value: normalizedPhone, enabled: row.sms_delivery_enabled === true, ready: row.sms_delivery_enabled === true && Boolean(normalizedPhone) },
    whatsapp: { value: normalizedWhatsApp, enabled: row.whatsapp_delivery_enabled === true, ready: row.whatsapp_delivery_enabled === true && Boolean(normalizedWhatsApp) }
  };
  const templateValues = buildPaymentPlanTemplateValues({ row, business });
  return { ...row, contacts, template_values: templateValues, message: renderTemplate(defaultPaymentPlanTemplate, templateValues) };
};

const getPaymentPlanFollowUpRows = async (client, arrangementId = null) => {
  const params = [];
  const arrangementClause = arrangementId ? `AND pa.id = $${params.push(arrangementId)}` : "";
  const { rows } = await client.query(
    `SELECT pa.id AS arrangement_id, pa.arrangement_number, pa.customer_id, pa.agreed_amount,
            pa.installment_amount, pa.frequency, pa.first_due_date, c.name AS customer_name,
            c.acc_number, c.phone, COALESCE(c.email, portal_user.email) AS email,
            c.preferred_delivery_channel, c.email_delivery_enabled, c.sms_delivery_enabled,
            c.whatsapp_delivery_enabled, schedule.installments_due,
            LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) AS expected_amount,
            receipts.received_amount,
            GREATEST(LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) - receipts.received_amount, 0) AS shortfall_amount,
            CASE pa.frequency
              WHEN 'weekly' THEN pa.first_due_date + (schedule.installments_due * 7)
              ELSE (pa.first_due_date + (schedule.installments_due * INTERVAL '1 month'))::date
            END AS next_due_date,
            CURRENT_DATE AS as_of_date
     FROM payment_arrangements pa
     JOIN customers c ON c.id = pa.customer_id
     LEFT JOIN LATERAL (
       SELECT email FROM users
       WHERE customer_id = c.id AND is_active = TRUE AND email IS NOT NULL
       ORDER BY role = 'customer' DESC, id ASC
       LIMIT 1
     ) portal_user ON TRUE
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN CURRENT_DATE < pa.first_due_date THEN 0
         WHEN pa.frequency = 'weekly' THEN ((CURRENT_DATE - pa.first_due_date) / 7) + 1
         ELSE (EXTRACT(YEAR FROM age(CURRENT_DATE, pa.first_due_date))::integer * 12) +
              EXTRACT(MONTH FROM age(CURRENT_DATE, pa.first_due_date))::integer + 1
       END::integer AS installments_due
     ) schedule ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(p.amount), 0) AS received_amount
       FROM payments p
       WHERE p.customer_id = pa.customer_id
         AND p.status = 'posted'
         AND p.payment_date >= COALESCE(pa.approved_at::date, pa.created_at::date)
     ) receipts ON TRUE
     WHERE pa.status = 'active'
       AND schedule.installments_due > 0
       AND receipts.received_amount < LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due)
       ${arrangementClause}
     ORDER BY shortfall_amount DESC, pa.first_due_date ASC, pa.id ASC`,
    params
  );
  return rows;
};

const buildStandingOrderTemplateValues = ({ row, business }) => {
  const currency = business.default_currency || "KES";
  return {
    business_name: business.business_name || "Water Billing",
    customer_name: row.customer_name || "-",
    acc_number: row.acc_number || "-",
    mandate_reference: row.mandate_reference || `Mandate ${row.standing_order_id}`,
    installment_amount: money(row.expected_amount, currency),
    frequency: String(row.frequency || "-").toLowerCase(),
    expected_amount: money(row.expected_to_date, currency),
    matched_amount: money(row.matched_amount, currency),
    shortfall_amount: money(row.shortfall_amount, currency),
    as_of_date: dateOnly(row.as_of_date || new Date()),
    next_due_date: dateOnly(row.next_due_date),
    payment_information: buildPaymentInformation(business, row.acc_number),
    paybill_number: business.paybill_number || "",
    till_number: business.till_number || "",
    business_phone: business.phone || "-"
  };
};

const mapStandingOrderFollowUpRow = ({ row, business }) => {
  const normalizedPhone = normalizePhoneNumber(row.phone);
  const normalizedWhatsApp = normalizeWhatsAppNumber(row.phone);
  const contacts = {
    email: { value: row.email || "", enabled: row.email_delivery_enabled !== false, ready: row.email_delivery_enabled !== false && Boolean(row.email) },
    sms: { value: normalizedPhone, enabled: row.sms_delivery_enabled === true, ready: row.sms_delivery_enabled === true && Boolean(normalizedPhone) },
    whatsapp: { value: normalizedWhatsApp, enabled: row.whatsapp_delivery_enabled === true, ready: row.whatsapp_delivery_enabled === true && Boolean(normalizedWhatsApp) }
  };
  const templateValues = buildStandingOrderTemplateValues({ row, business });
  return { ...row, contacts, template_values: templateValues, message: renderTemplate(defaultStandingOrderTemplate, templateValues) };
};

const getStandingOrderFollowUpRows = async (client, standingOrderId = null) => {
  const params = [];
  const orderClause = standingOrderId ? `AND so.id = $${params.push(standingOrderId)}` : "";
  const { rows } = await client.query(
    `SELECT so.id AS standing_order_id, so.customer_id, so.mandate_reference, so.expected_amount, so.frequency, so.first_due_date,
            c.name AS customer_name, c.acc_number, c.phone, COALESCE(c.email, portal_user.email) AS email,
            c.preferred_delivery_channel, c.email_delivery_enabled, c.sms_delivery_enabled, c.whatsapp_delivery_enabled,
            schedule.installments_due, so.expected_amount * schedule.installments_due AS expected_to_date,
            receipts.matched_amount,
            GREATEST(so.expected_amount * schedule.installments_due - receipts.matched_amount, 0) AS shortfall_amount,
            CASE so.frequency
              WHEN 'weekly' THEN so.first_due_date + (schedule.installments_due * 7)
              ELSE (so.first_due_date + (schedule.installments_due * INTERVAL '1 month'))::date
            END AS next_due_date,
            CURRENT_DATE AS as_of_date
     FROM standing_orders so
     JOIN customers c ON c.id = so.customer_id
     LEFT JOIN LATERAL (
       SELECT email FROM users
       WHERE customer_id = c.id AND is_active = TRUE AND email IS NOT NULL
       ORDER BY role = 'customer' DESC, id ASC
       LIMIT 1
     ) portal_user ON TRUE
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN CURRENT_DATE < so.first_due_date THEN 0
         WHEN so.frequency = 'weekly' THEN ((CURRENT_DATE - so.first_due_date) / 7) + 1
         ELSE (EXTRACT(YEAR FROM age(CURRENT_DATE, so.first_due_date))::integer * 12) +
              EXTRACT(MONTH FROM age(CURRENT_DATE, so.first_due_date))::integer + 1
       END::integer AS installments_due
     ) schedule ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(p.amount), 0) AS matched_amount
       FROM payments p
       WHERE p.customer_id = so.customer_id
         AND p.status = 'posted'
         AND p.payment_date >= so.first_due_date
         AND CONCAT_WS(' ', p.external_reference, p.receipt_number, p.received_from, p.notes)
           ILIKE '%' || so.mandate_reference || '%'
     ) receipts ON TRUE
     WHERE so.status = 'active'
       AND schedule.installments_due > 0
       AND receipts.matched_amount < so.expected_amount * schedule.installments_due
       ${orderClause}
     ORDER BY shortfall_amount DESC, so.first_due_date ASC, so.id ASC`,
    params
  );
  return rows;
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

const listArrearsFollowUp = asyncHandler(async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const requestedOffset = Number(req.query.offset);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
  const offset = Number.isInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const client = await pool.connect();

  try {
    const business = await getBusinessSettings(client);
    const overdueRows = (await getInvoicePreviewRows(client))
      .map((row) => mapInvoicePreviewRow({ row, business }))
      .filter((row) => row.overdue_balance > 0)
      .sort(
        (left, right) =>
          right.days_overdue - left.days_overdue ||
          right.overdue_balance - left.overdue_balance ||
          String(left.acc_number || "").localeCompare(String(right.acc_number || ""))
      );

    // Keep the exposure marker portfolio-relative so it remains useful as the customer base grows.
    const topExposureCount = overdueRows.length ? Math.max(1, Math.ceil(overdueRows.length * 0.2)) : 0;
    const topExposureCustomerIds = new Set(
      [...overdueRows]
        .sort(
          (left, right) =>
            right.overdue_balance - left.overdue_balance ||
            right.days_overdue - left.days_overdue ||
            String(left.acc_number || "").localeCompare(String(right.acc_number || ""))
        )
        .slice(0, topExposureCount)
        .map((row) => row.customer_id)
    );
    const prioritizedRows = overdueRows.map((row) => {
      const priorityTier = row.days_overdue > 90 ? "critical" : row.days_overdue > 30 ? "at_risk" : "early_arrears";
      const isTopExposure = topExposureCustomerIds.has(row.customer_id);
      return {
        ...row,
        priority_tier: priorityTier,
        priority_reason: row.days_overdue > 90
          ? "Over 90 days overdue"
          : row.days_overdue > 30
            ? "Over 30 days overdue"
            : "New overdue balance",
        is_top_exposure: isTopExposure
      };
    });
    const summary = prioritizedRows.reduce(
      (totals, row) => ({
        account_count: totals.account_count + 1,
        overdue_balance: totals.overdue_balance + row.overdue_balance,
        contact_ready_count:
          totals.contact_ready_count + Number(Object.values(row.contacts).some((contact) => contact.ready)),
        contact_gap_count:
          totals.contact_gap_count + Number(!Object.values(row.contacts).some((contact) => contact.ready)),
        contact_gap_balance:
          totals.contact_gap_balance + (!Object.values(row.contacts).some((contact) => contact.ready) ? row.overdue_balance : 0),
        critical_count: totals.critical_count + Number(row.priority_tier === "critical"),
        at_risk_count: totals.at_risk_count + Number(row.priority_tier === "at_risk"),
        early_arrears_count: totals.early_arrears_count + Number(row.priority_tier === "early_arrears"),
        top_exposure_count: totals.top_exposure_count + Number(row.is_top_exposure),
        top_exposure_balance: totals.top_exposure_balance + (row.is_top_exposure ? row.overdue_balance : 0)
      }),
      {
        account_count: 0,
        overdue_balance: 0,
        contact_ready_count: 0,
        contact_gap_count: 0,
        contact_gap_balance: 0,
        critical_count: 0,
        at_risk_count: 0,
        early_arrears_count: 0,
        top_exposure_count: 0,
        top_exposure_balance: 0
      }
    );
    const rows = prioritizedRows.slice(offset, offset + limit).map((row) => ({
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      acc_number: row.acc_number,
      zone_name: row.zone_name,
      bill_id: row.bill_id,
      bill_number: row.bill_number,
      overdue_balance: row.overdue_balance,
      total_outstanding: row.total_outstanding,
      oldest_due_date: row.oldest_due_date,
      days_overdue: row.days_overdue,
      priority_tier: row.priority_tier,
      priority_reason: row.priority_reason,
      is_top_exposure: row.is_top_exposure,
      has_ready_contact: Object.values(row.contacts).some((contact) => contact.ready),
      contacts: Object.fromEntries(
        Object.entries(row.contacts).map(([medium, contact]) => [medium, { ready: contact.ready }])
      )
    }));

    res.json({ limit, offset, total: overdueRows.length, summary, rows });
  } finally {
    client.release();
  }
});

const listPaymentPlanFollowUp = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const rows = (await getPaymentPlanFollowUpRows(client)).map((row) => mapPaymentPlanFollowUpRow({ row, business }));
    res.json({
      channels: { whatsapp: getWhatsAppStatus() },
      default_template: defaultPaymentPlanTemplate,
      rows
    });
  } finally {
    client.release();
  }
});

const listStandingOrderFollowUp = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const rows = (await getStandingOrderFollowUpRows(client)).map((row) => mapStandingOrderFollowUpRow({ row, business }));
    res.json({
      channels: { whatsapp: getWhatsAppStatus() },
      default_template: defaultStandingOrderTemplate,
      rows
    });
  } finally {
    client.release();
  }
});

const getDisconnectionWarningRows = async (client, customerId = null) => {
  const business = await getBusinessSettings(client);
  const previewRows = await getInvoicePreviewRows(client, customerId);
  const arrangementResult = await client.query("SELECT DISTINCT customer_id FROM payment_arrangements WHERE status = 'active'");
  const warningResult = await client.query(
    `SELECT DISTINCT ON (customer_id) customer_id, channel, sent_at
     FROM document_delivery_logs
     WHERE document_type = 'disconnection_warning'
       AND status = 'sent'
     ORDER BY customer_id, sent_at DESC NULLS LAST, id DESC`
  );
  const protectedCustomerIds = new Set(arrangementResult.rows.map((row) => Number(row.customer_id)));
  const recentWarningsByCustomer = new Map(warningResult.rows.map((row) => [Number(row.customer_id), row]));
  const criticalRows = previewRows
    .map((row) => mapInvoicePreviewRow({ row, business }))
    .filter((row) => row.overdue_balance > 0 && row.days_overdue > 90)
    .sort(
      (left, right) =>
        right.days_overdue - left.days_overdue ||
        right.overdue_balance - left.overdue_balance ||
        String(left.acc_number || "").localeCompare(String(right.acc_number || ""))
    );
  const now = new Date();
  const eligibleRows = criticalRows
    .filter((row) => !protectedCustomerIds.has(Number(row.customer_id)))
    .map((row) => {
      const previousWarning = recentWarningsByCustomer.get(Number(row.customer_id));
      const lastWarningSentAt = previousWarning?.sent_at || null;
      const cooldownUntil = lastWarningSentAt
        ? new Date(new Date(lastWarningSentAt).getTime() + disconnectionWarningCooldownDays * 24 * 60 * 60 * 1000)
        : null;
      return {
        ...row,
        last_warning_channel: previousWarning?.channel || null,
        last_warning_sent_at: lastWarningSentAt,
        cooldown_until: cooldownUntil,
        can_send: !cooldownUntil || cooldownUntil <= now
      };
    });

  return {
    business,
    rows: eligibleRows,
    summary: {
      critical_account_count: criticalRows.length,
      eligible_count: eligibleRows.length,
      ready_to_send_count: eligibleRows.filter((row) => row.can_send).length,
      cooldown_count: eligibleRows.filter((row) => !row.can_send).length,
      protected_payment_plan_count: criticalRows.length - eligibleRows.length,
      overdue_balance: criticalRows.reduce((total, row) => total + row.overdue_balance, 0),
      eligible_balance: eligibleRows.reduce((total, row) => total + row.overdue_balance, 0),
      contact_ready_count: eligibleRows.reduce(
        (total, row) => total + Number(Object.values(row.contacts).some((contact) => contact.ready)),
        0
      )
    }
  };
};

const listDisconnectionWarningFollowUp = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const { rows, summary } = await getDisconnectionWarningRows(client);
    res.json({
      channels: { whatsapp: getWhatsAppStatus() },
      default_template: defaultDisconnectionWarningTemplate,
      summary,
      rows
    });
  } finally {
    client.release();
  }
});

const listTemplates = asyncHandler(async (req, res) => {
  const medium = String(req.query.medium || "").toLowerCase();
  const params = [];
  const alertType = normalizeAlertType(req.query.alert_type);
  const clauses = [`alert_type = $${params.push(alertType)}`];
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
         WHERE alert_type = $2
           AND medium = $3`,
        [req.user.id, payload.alertType, payload.medium]
      );
    }
    const { rows } = await client.query(
      `INSERT INTO communication_templates (
         name, alert_type, medium, body, whatsapp_template_name, whatsapp_template_language,
         whatsapp_template_variables, is_default, created_by, updated_by
       )
       VALUES ($1::varchar, $2::varchar, $3::varchar, $4, $5::varchar, $6::varchar, $7::jsonb, $8, $9, $9)
       RETURNING *`,
      [
        payload.name,
        payload.alertType,
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
    if (beforeResult.rows[0].alert_type !== payload.alertType) {
      throw new ApiError(400, "Communication template type cannot be changed.");
    }
    if (payload.isDefault) {
      await client.query(
        `UPDATE communication_templates
         SET is_default = FALSE,
             updated_by = $1,
             updated_at = NOW()
         WHERE alert_type = $2
           AND medium = $3
           AND id <> $4`,
        [req.user.id, payload.alertType, payload.medium, req.params.id]
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
    values: buildInvoiceTemplateValues({ row, business }),
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

const sendPaymentPlanAlert = asyncHandler(async (req, res) => {
  const medium = String(req.body?.medium || "").toLowerCase();
  const template = String(req.body?.template || defaultPaymentPlanTemplate);
  validateMedium(medium);

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const row = (await getPaymentPlanFollowUpRows(client, req.params.arrangementId))[0];
    if (!row) throw new ApiError(400, "This payment plan is not currently behind or is no longer active.");
    const previewRow = mapPaymentPlanFollowUpRow({ row, business });
    const contact = previewRow.contacts[medium];
    if (!contact?.value) throw new ApiError(400, `This customer does not have a ${medium} contact.`);
    if (!contact.enabled) throw new ApiError(400, `${medium.toUpperCase()} delivery is disabled for this customer.`);

    const message = renderTemplate(template, previewRow.template_values);
    const subject = `${business.business_name || "Water Billing"} payment plan reminder ${row.arrangement_number || row.arrangement_id}`;
    const whatsappTemplate = buildWhatsAppTemplate({
      values: previewRow.template_values,
      templatePayload: normalizeWhatsAppTemplatePayload(req.body?.whatsapp_template)
    });
    let result;
    if (medium === "email") {
      result = await sendDocumentEmail(client, req, {
        documentType: "payment_arrangement",
        documentId: row.arrangement_id,
        customerId: row.customer_id,
        recipient: contact.value,
        subject,
        text: message
      });
    } else if (medium === "whatsapp") {
      result = await sendDocumentWhatsApp(client, req, {
        documentType: "payment_arrangement",
        documentId: row.arrangement_id,
        customerId: row.customer_id,
        recipient: contact.value,
        subject,
        message,
        whatsappTemplate
      });
    } else {
      result = await sendDocumentSms(client, req, {
        documentType: "payment_arrangement",
        documentId: row.arrangement_id,
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
        action: `communication.payment_plan_alert_${medium}_sent`,
        entityType: "payment_arrangement",
        entityId: row.arrangement_id,
        afterData: {
          customer_id: row.customer_id,
          arrangement_number: row.arrangement_number,
          recipient: contact.value,
          medium,
          status: result.status,
          delivery_log_id: result.log?.id || null
        },
        reason: `Payment plan alert ${medium} ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Payment-plan communication audit event could not be recorded.", error);
    }

    res.json({
      ...result,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      arrangement_id: row.arrangement_id,
      arrangement_number: row.arrangement_number,
      recipient: contact.value,
      medium,
      message_text: message,
      audit_error: auditError,
      message: result.status === "sent" ? `Payment-plan reminder sent to ${row.customer_name}.` : `Payment-plan reminder was not sent to ${row.customer_name}.`
    });
  } finally {
    client.release();
  }
});

const sendStandingOrderAlert = asyncHandler(async (req, res) => {
  const medium = String(req.body?.medium || "").toLowerCase();
  const template = String(req.body?.template || defaultStandingOrderTemplate);
  validateMedium(medium);

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    const row = (await getStandingOrderFollowUpRows(client, req.params.standingOrderId))[0];
    if (!row) throw new ApiError(400, "This standing order is not currently behind or is no longer active.");
    const previewRow = mapStandingOrderFollowUpRow({ row, business });
    const contact = previewRow.contacts[medium];
    if (!contact?.value) throw new ApiError(400, `This customer does not have a ${medium} contact.`);
    if (!contact.enabled) throw new ApiError(400, `${medium.toUpperCase()} delivery is disabled for this customer.`);

    const message = renderTemplate(template, previewRow.template_values);
    const subject = `${business.business_name || "Water Billing"} standing-order reminder ${row.mandate_reference || row.standing_order_id}`;
    const whatsappTemplate = buildWhatsAppTemplate({
      values: previewRow.template_values,
      templatePayload: normalizeWhatsAppTemplatePayload(req.body?.whatsapp_template)
    });
    let result;
    if (medium === "email") {
      result = await sendDocumentEmail(client, req, { documentType: "standing_order", documentId: row.standing_order_id, customerId: row.customer_id, recipient: contact.value, subject, text: message });
    } else if (medium === "whatsapp") {
      result = await sendDocumentWhatsApp(client, req, { documentType: "standing_order", documentId: row.standing_order_id, customerId: row.customer_id, recipient: contact.value, subject, message, whatsappTemplate });
    } else {
      result = await sendDocumentSms(client, req, { documentType: "standing_order", documentId: row.standing_order_id, customerId: row.customer_id, recipient: contact.value, subject, message });
    }

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: `communication.standing_order_alert_${medium}_sent`,
        entityType: "standing_order",
        entityId: row.standing_order_id,
        afterData: { customer_id: row.customer_id, mandate_reference: row.mandate_reference, recipient: contact.value, medium, status: result.status, delivery_log_id: result.log?.id || null },
        reason: `Standing-order alert ${medium} ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Standing-order communication audit event could not be recorded.", error);
    }

    res.json({
      ...result,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      standing_order_id: row.standing_order_id,
      mandate_reference: row.mandate_reference,
      recipient: contact.value,
      medium,
      message_text: message,
      audit_error: auditError,
      message: result.status === "sent" ? `Standing-order reminder sent to ${row.customer_name}.` : `Standing-order reminder was not sent to ${row.customer_name}.`
    });
  } finally {
    client.release();
  }
});

const sendDisconnectionWarning = asyncHandler(async (req, res) => {
  const medium = String(req.body?.medium || "").toLowerCase();
  const template = String(req.body?.template || defaultDisconnectionWarningTemplate);
  const approvalNote = String(req.body?.approval_note || "").trim();
  validateMedium(medium);
  if (!approvalNote) throw new ApiError(400, "An approval reference or note is required before sending a formal warning.");

  const client = await pool.connect();
  try {
    const { business, rows } = await getDisconnectionWarningRows(client, req.params.customerId);
    const row = rows[0];
    if (!row) {
      throw new ApiError(400, "This account is not eligible for a disconnection warning. It must be more than 90 days overdue and have no active payment plan.");
    }
    if (!row.can_send) {
      throw new ApiError(
        400,
        `A formal warning was successfully sent on ${dateOnly(row.last_warning_sent_at)}. This account can be reviewed again after ${dateOnly(row.cooldown_until)}.`
      );
    }
    const contact = row.contacts[medium];
    if (!contact?.value) throw new ApiError(400, `This customer does not have a ${medium} contact.`);
    if (!contact.enabled) throw new ApiError(400, `${medium.toUpperCase()} delivery is disabled for this customer.`);

    const message = renderTemplate(template, row.template_values);
    const subject = `${business.business_name || "Water Billing"} formal payment warning for ${row.acc_number || row.customer_id}`;
    const whatsappTemplate = buildWhatsAppTemplate({
      values: row.template_values,
      templatePayload: normalizeWhatsAppTemplatePayload(req.body?.whatsapp_template)
    });
    let result;
    const delivery = {
      documentType: "disconnection_warning",
      documentId: row.bill_id,
      customerId: row.customer_id,
      recipient: contact.value,
      subject,
      message
    };
    if (medium === "email") result = await sendDocumentEmail(client, req, { ...delivery, text: message });
    else if (medium === "whatsapp") result = await sendDocumentWhatsApp(client, req, { ...delivery, whatsappTemplate });
    else result = await sendDocumentSms(client, req, delivery);

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: `communication.disconnection_warning_${medium}_sent`,
        entityType: "bill",
        entityId: row.bill_id,
        afterData: {
          customer_id: row.customer_id,
          recipient: contact.value,
          medium,
          status: result.status,
          delivery_log_id: result.log?.id || null,
          approval_note: approvalNote
        },
        reason: `Disconnection warning ${medium} ${result.status}: ${approvalNote}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Disconnection-warning audit event could not be recorded.", error);
    }

    res.json({
      ...result,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      bill_id: row.bill_id,
      recipient: contact.value,
      medium,
      message_text: message,
      approval_note: approvalNote,
      audit_error: auditError,
      message: result.status === "sent" ? `Disconnection warning sent to ${row.customer_name}.` : `Disconnection warning was not sent to ${row.customer_name}.`
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
  const zoneName = String(req.body?.zone_name || "").trim().slice(0, 160) || null;

  const uniqueIds = [...new Set((req.body?.customer_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) throw new ApiError(400, "Select at least one customer to send.");
  if (uniqueIds.length > 50) throw new ApiError(400, "Send up to 50 customers at a time.");

  const client = await pool.connect();
  try {
    const business = await getBusinessSettings(client);
    if (zoneName) {
      const previewRows = await getInvoicePreviewRows(client);
      const zoneCustomerIds = new Set(
        previewRows.filter((row) => row.zone_name === zoneName).map((row) => Number(row.customer_id))
      );
      if (uniqueIds.some((customerId) => !zoneCustomerIds.has(customerId))) {
        throw new ApiError(400, "Every selected customer must belong to the campaign service zone.");
      }
    }
    const campaignResult = await client.query(
      `INSERT INTO communication_campaigns (
         campaign_name, zone_name, alert_type, medium, template, status, total_count, created_by
       )
       VALUES ($1::varchar, $2::varchar, 'invoice_alert', $3::varchar, $4, 'running', $5, $6)
       RETURNING *`,
      [campaignName, zoneName, medium, template, uniqueIds.length, req.user.id]
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
      zone_name: campaign.zone_name,
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

const listDeliveryExceptions = asyncHandler(async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const requestedDays = Number(req.query.days);
  const requestedBillingPeriodId = String(req.query.billing_period_id || "").trim();
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;
  const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 1), 90) : 30;
  const status = String(req.query.status || "all").trim().toLowerCase();
  if (!["all", "failed", "skipped"].includes(status)) {
    throw new ApiError(400, "Delivery exception status must be failed, skipped, or all.");
  }

  const billingPeriodId = requestedBillingPeriodId ? Number(requestedBillingPeriodId) : null;
  if (requestedBillingPeriodId && (!Number.isInteger(billingPeriodId) || billingPeriodId <= 0)) {
    throw new ApiError(400, "billing_period_id must be a positive integer.");
  }

  const params = [days];
  const billingPeriodClause = billingPeriodId
    ? `AND EXISTS (
         SELECT 1
         FROM bills scoped_bill
         WHERE ddl.document_type = 'bill'
           AND scoped_bill.id = ddl.document_id
           AND scoped_bill.billing_period_id = $${params.push(billingPeriodId)}
       )`
    : "";
  const statusClause = status === "all" ? "" : `AND ddl.status = $${params.push(status)}`;
  const [summaryResult, rowsResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed_count,
         COUNT(*) FILTER (WHERE status = 'skipped')::integer AS skipped_count,
         COUNT(*)::integer AS exception_count
       FROM document_delivery_logs ddl
       WHERE ddl.status IN ('failed', 'skipped')
         AND ddl.created_at >= NOW() - ($1::integer * INTERVAL '1 day')
         ${billingPeriodClause}`,
      params.filter((_, index) => index < (billingPeriodId ? 2 : 1))
    ),
    pool.query(
      `SELECT
         ddl.id,
         ddl.document_type,
         ddl.document_id,
         ddl.customer_id,
         ddl.channel,
         ddl.recipient,
         ddl.subject,
         ddl.status,
         ddl.error_message,
         ddl.created_at,
         c.name AS customer_name,
         c.acc_number,
         b.billing_period_id,
         COALESCE(
           b.bill_number,
           p.receipt_number,
           pa.arrangement_number,
           so.mandate_reference,
           CONCAT(UPPER(LEFT(ddl.document_type, 1)), '-', ddl.document_id)
         ) AS document_reference
       FROM document_delivery_logs ddl
       LEFT JOIN customers c ON c.id = ddl.customer_id
       LEFT JOIN bills b ON ddl.document_type = 'bill' AND b.id = ddl.document_id
       LEFT JOIN payments p ON ddl.document_type = 'receipt' AND p.id = ddl.document_id
       LEFT JOIN payment_arrangements pa ON ddl.document_type = 'payment_arrangement' AND pa.id = ddl.document_id
       LEFT JOIN standing_orders so ON ddl.document_type = 'standing_order' AND so.id = ddl.document_id
       WHERE ddl.status IN ('failed', 'skipped')
         AND ddl.created_at >= NOW() - ($1::integer * INTERVAL '1 day')
         ${billingPeriodClause}
         ${statusClause}
       ORDER BY ddl.created_at DESC, ddl.id DESC
       LIMIT $${params.push(limit)}`,
      params
    )
  ]);

  res.json({
    days,
    limit,
    status,
    billing_period_id: billingPeriodId,
    summary: summaryResult.rows[0],
    rows: rowsResult.rows
  });
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
            ddl.sent_at,
            COALESCE(NULLIF(ccr.error_message, ''), ddl.error_message) AS delivery_error_message
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
  listArrearsFollowUp,
  listPaymentPlanFollowUp,
  listStandingOrderFollowUp,
  listDisconnectionWarningFollowUp,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendInvoiceAlert,
  sendPaymentPlanAlert,
  sendStandingOrderAlert,
  sendDisconnectionWarning,
  sendBulkInvoiceAlerts,
  listCampaigns,
  listDeliveryExceptions,
  getCampaign
};
