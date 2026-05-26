const ApiError = require("../utils/apiError");
const { sendEmail } = require("./email.service");

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const label = (value) => String(value || "-").replace(/_/g, " ");

const getBusinessSettings = async (client) => {
  const { rows } = await client.query("SELECT * FROM business_settings WHERE id = 1");
  return rows[0] || {};
};

const getCustomerEmailRecipient = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT c.email AS customer_email,
            c.name AS customer_name,
            c.email_delivery_enabled,
            u.email AS user_email,
            u.name AS user_name
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT email, name
       FROM users
       WHERE customer_id = c.id
         AND is_active = TRUE
         AND email IS NOT NULL
       ORDER BY role = 'customer' DESC, id ASC
       LIMIT 1
     ) u ON TRUE
     WHERE c.id = $1`,
    [customerId]
  );
  const customer = rows[0];
  if (!customer) throw new ApiError(404, "Customer not found.");
  if (customer.email_delivery_enabled === false) {
    throw new ApiError(400, "Email delivery is disabled for this customer.");
  }
  const email = customer.customer_email || customer.user_email;
  if (!email) {
    throw new ApiError(400, "This customer does not have an email address for document delivery.");
  }
  return {
    email,
    name: customer.customer_name || customer.user_name
  };
};

const createDeliveryLog = async (
  client,
  { documentType, documentId, customerId, recipient, subject, status, errorMessage = null, providerMessageId = null, sentBy = null }
) => {
  const { rows } = await client.query(
    `INSERT INTO document_delivery_logs (
      document_type, document_id, customer_id, channel, recipient, subject,
      status, error_message, provider_message_id, sent_by, sent_at
    )
    VALUES ($1, $2, $3, 'email', $4, $5, $6, $7, $8, $9, CASE WHEN $6::text = 'sent' THEN NOW() ELSE NULL END)
    RETURNING *`,
    [documentType, documentId, customerId, recipient, subject, status, errorMessage, providerMessageId, sentBy]
  );
  return rows[0];
};

const listDeliveryLogs = async (client, documentType, documentId) => {
  const { rows } = await client.query(
    `SELECT ddl.*, u.name AS sent_by_name
     FROM document_delivery_logs ddl
     LEFT JOIN users u ON u.id = ddl.sent_by
     WHERE ddl.document_type = $1
       AND ddl.document_id = $2
     ORDER BY ddl.created_at DESC
     LIMIT 20`,
    [documentType, documentId]
  );
  return rows;
};

const buildBillEmail = ({ bill, business }) => {
  const businessName = business.business_name || "Water Billing";
  const total = Number(bill.total_amount || bill.amount || 0);
  const balance = Number(bill.balance_amount ?? total - Number(bill.paid_amount || 0));
  const subject = `${businessName} bill ${bill.bill_number || bill.id}`;
  const lines = [
    `Hello ${bill.customer_name},`,
    "",
    `Your bill ${bill.bill_number || bill.id} for ${bill.billing_period_name || dateOnly(bill.billing_month)} is ready.`,
    "",
    `Account: ${bill.acc_number}`,
    `Units used: ${Number(bill.units_used || 0).toLocaleString()}`,
    `Total billed: ${money(total)}`,
    `Paid / credit applied: ${money(bill.paid_amount)}`,
    `Amount due: ${money(balance)}`,
    `Due date: ${dateOnly(bill.due_date)}`,
    "",
    business.paybill_number ? `Paybill: ${business.paybill_number}` : null,
    business.till_number ? `Till: ${business.till_number}` : null,
    business.bank_details ? `Bank details: ${business.bank_details}` : null,
    "",
    business.receipt_footer_note || "Thank you."
  ].filter((line) => line !== null);

  return { subject, text: lines.join("\n") };
};

const buildReceiptEmail = ({ payment, allocations, customerBalance, business }) => {
  const businessName = business.business_name || "Water Billing";
  const subject = `${businessName} receipt ${payment.receipt_number || payment.id}`;
  const allocationLines = allocations.length
    ? allocations.map(
        (allocation) =>
          `- ${allocation.bill_number || `Bill ${allocation.bill_id}`}: ${money(allocation.amount)} allocated, balance ${money(allocation.balance_amount)}`
      )
    : ["- No open bills. Full amount stored as customer credit."];
  const lines = [
    `Hello ${payment.customer_name},`,
    "",
    `We have received your payment ${payment.receipt_number || payment.id}.`,
    "",
    `Account: ${payment.acc_number}`,
    `Date: ${dateOnly(payment.payment_date)}`,
    `Amount received: ${money(payment.amount)}`,
    `Channel: ${label(payment.payment_channel || payment.method)}`,
    `Reference: ${payment.external_reference || payment.reference || "-"}`,
    "",
    "Allocations:",
    ...allocationLines,
    "",
    `Customer credit: ${money(payment.unallocated_amount)}`,
    `Account position after receipt: ${money(Math.abs(Number(customerBalance || 0)))} ${Number(customerBalance || 0) < 0 ? "credit" : "due"}`,
    "",
    business.receipt_footer_note || "Thank you."
  ];

  return { subject, text: lines.join("\n") };
};

const sendDocumentEmail = async (client, req, { documentType, documentId, customerId, recipient, subject, text }) => {
  try {
    const result = await sendEmail({ to: recipient, subject, text });
    const status = result.skipped ? "skipped" : "sent";
    const log = await createDeliveryLog(client, {
      documentType,
      documentId,
      customerId,
      recipient,
      subject,
      status,
      errorMessage: result.skipped ? "SMTP is not configured." : null,
      providerMessageId: result.messageId || null,
      sentBy: req.user.id
    });
    return { status, log };
  } catch (error) {
    const log = await createDeliveryLog(client, {
      documentType,
      documentId,
      customerId,
      recipient,
      subject,
      status: "failed",
      errorMessage: error.message,
      sentBy: req.user.id
    });
    return { status: "failed", log };
  }
};

module.exports = {
  buildBillEmail,
  buildReceiptEmail,
  getBusinessSettings,
  getCustomerEmailRecipient,
  listDeliveryLogs,
  sendDocumentEmail
};
