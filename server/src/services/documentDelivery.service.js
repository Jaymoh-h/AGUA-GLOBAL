const ApiError = require("../utils/apiError");
const { sendEmail } = require("./email.service");
const { normalizePhoneNumber, sendSms } = require("./sms.service");
const { normalizeWhatsAppNumber, sendWhatsApp } = require("./whatsapp.service");

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const label = (value) => String(value || "-").replace(/_/g, " ");
const truncate = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

const pdfEscape = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const buildTextPdfBuffer = (lines) => {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const pages = [];
  for (let index = 0; index < lines.length; index += 52) {
    pages.push(lines.slice(index, index + 52));
  }
  (pages.length ? pages : [["Document"]]).forEach((pageLines) => {
    const content = [
      "BT",
      "/F1 10 Tf",
      "14 TL",
      ...pageLines.map((line, index) => `1 0 0 1 50 ${790 - index * 14} Tm (${pdfEscape(line).slice(0, 110)}) Tj`),
      "ET"
    ].join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pageIds.forEach((pageId) => {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  });
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(chunks.join(""), "utf8");
};

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

const getCustomerSmsRecipient = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT name, phone, sms_delivery_enabled
     FROM customers
     WHERE id = $1`,
    [customerId]
  );
  const customer = rows[0];
  if (!customer) throw new ApiError(404, "Customer not found.");
  if (customer.sms_delivery_enabled === false) {
    throw new ApiError(400, "SMS delivery is disabled for this customer.");
  }
  const phone = normalizePhoneNumber(customer.phone);
  if (!phone) {
    throw new ApiError(400, "This customer does not have a valid phone number for SMS delivery.");
  }
  return {
    phone,
    name: customer.name
  };
};

const getCustomerWhatsAppRecipient = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT name, phone, whatsapp_delivery_enabled
     FROM customers
     WHERE id = $1`,
    [customerId]
  );
  const customer = rows[0];
  if (!customer) throw new ApiError(404, "Customer not found.");
  if (customer.whatsapp_delivery_enabled === false) {
    throw new ApiError(400, "WhatsApp delivery is disabled for this customer.");
  }
  const phone = normalizeWhatsAppNumber(customer.phone);
  if (!phone) {
    throw new ApiError(400, "This customer does not have a valid phone number for WhatsApp delivery.");
  }
  return {
    phone,
    name: customer.name
  };
};

const createDeliveryLog = async (
  client,
  {
    documentType,
    documentId,
    customerId,
    channel = "email",
    recipient,
    subject,
    status,
    errorMessage = null,
    providerMessageId = null,
    sentBy = null
  }
) => {
  const { rows } = await client.query(
    `INSERT INTO document_delivery_logs (
      document_type, document_id, customer_id, channel, recipient, subject,
      status, error_message, provider_message_id, sent_by, sent_at
    )
    VALUES (
      $1, $2, $3, $4::varchar, $5::varchar, $6::varchar, $7::varchar,
      $8, $9::varchar, $10, CASE WHEN $7::varchar = 'sent' THEN NOW() ELSE NULL END
    )
    RETURNING *`,
    [
      documentType,
      documentId,
      customerId,
      channel,
      truncate(recipient, 180),
      truncate(subject, 220),
      status,
      errorMessage,
      truncate(providerMessageId, 180),
      sentBy
    ]
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

const buildBillPdfAttachment = ({ bill, business }) => {
  const total = Number(bill.total_amount || bill.amount || 0);
  const balance = Number(bill.balance_amount ?? total - Number(bill.paid_amount || 0));
  const filename = `${bill.bill_number || `bill-${bill.id}`}.pdf`.replace(/[^\w.-]+/g, "_");
  const lines = [
    business.business_name || "Water Billing",
    business.legal_name || "",
    business.physical_address || "",
    [business.phone, business.email].filter(Boolean).join(" | "),
    business.tax_pin ? `PIN: ${business.tax_pin}` : "",
    "",
    `Bill: ${bill.bill_number || bill.id}`,
    `Customer: ${bill.customer_name}`,
    `Account: ${bill.acc_number}`,
    `Zone: ${bill.zone_name || "-"}`,
    `Billing period: ${bill.billing_period_name || dateOnly(bill.billing_month)}`,
    `Due date: ${dateOnly(bill.due_date)}`,
    "",
    `Previous reading: ${Number(bill.previous_reading || 0).toLocaleString()}`,
    `Current reading: ${Number(bill.current_reading || 0).toLocaleString()}`,
    `Units used: ${Number(bill.units_used || 0).toLocaleString()}`,
    `Rate: ${money(bill.rate)}`,
    "",
    `Usage subtotal: ${money(bill.subtotal_amount || total)}`,
    `Fixed charge: ${money(bill.fixed_charge_amount)}`,
    `Penalty: ${money(bill.penalty_amount)}`,
    `VAT: ${money(bill.vat_amount)}`,
    `Reconnection fee: ${money(bill.reconnection_fee_amount)}`,
    `Adjustment: ${money(bill.adjustment_amount)}`,
    "",
    `Total billed: ${money(total)}`,
    `Paid / credit applied: ${money(bill.paid_amount)}`,
    `Amount due: ${money(balance)}`,
    "",
    business.paybill_number ? `Paybill: ${business.paybill_number}` : "",
    business.till_number ? `Till: ${business.till_number}` : "",
    business.bank_details ? `Bank details: ${business.bank_details}` : "",
    business.receipt_footer_note || "Thank you."
  ].filter((line) => line !== "");
  return {
    filename,
    content: buildTextPdfBuffer(lines),
    contentType: "application/pdf"
  };
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

const buildReceiptPdfAttachment = ({ payment, allocations, customerBalance, business }) => {
  const filename = `${payment.receipt_number || `receipt-${payment.id}`}.pdf`.replace(/[^\w.-]+/g, "_");
  const allocationLines = allocations.length
    ? allocations.map(
        (allocation) =>
          `${allocation.bill_number || `Bill ${allocation.bill_id}`}: ${money(allocation.amount)} allocated, balance ${money(allocation.balance_amount)}`
      )
    : ["No open bills. Full amount stored as customer credit."];
  const lines = [
    business.business_name || "Water Billing",
    business.legal_name || "",
    business.physical_address || "",
    [business.phone, business.email].filter(Boolean).join(" | "),
    business.tax_pin ? `PIN: ${business.tax_pin}` : "",
    "",
    `Receipt: ${payment.receipt_number || payment.id}`,
    `Customer: ${payment.customer_name}`,
    `Account: ${payment.acc_number}`,
    `Date: ${dateOnly(payment.payment_date)}`,
    `Amount received: ${money(payment.amount)}`,
    `Channel: ${label(payment.payment_channel || payment.method)}`,
    `Reference: ${payment.external_reference || payment.reference || "-"}`,
    "",
    "Allocations:",
    ...allocationLines,
    "",
    `Allocated to bills: ${money(payment.total_allocated_amount)}`,
    `Customer credit: ${money(payment.unallocated_amount)}`,
    `Account position after receipt: ${money(Math.abs(Number(customerBalance || 0)))} ${Number(customerBalance || 0) < 0 ? "credit" : "due"}`,
    "",
    business.receipt_footer_note || "Thank you."
  ].filter((line) => line !== "");
  return {
    filename,
    content: buildTextPdfBuffer(lines),
    contentType: "application/pdf"
  };
};

const buildBillSms = ({ bill, business }) => {
  const businessName = business.business_name || "Water Billing";
  const total = Number(bill.total_amount || bill.amount || 0);
  const balance = Number(bill.balance_amount ?? total - Number(bill.paid_amount || 0));
  const payHint = business.paybill_number ? ` Paybill ${business.paybill_number}.` : business.till_number ? ` Till ${business.till_number}.` : "";
  return `${businessName}: Bill ${bill.bill_number || bill.id} for ${bill.acc_number}. Amount due ${money(balance)} by ${dateOnly(
    bill.due_date
  )}. Total ${money(total)}.${payHint}`;
};

const buildReceiptSms = ({ payment, customerBalance, business }) => {
  const businessName = business.business_name || "Water Billing";
  const position = Number(customerBalance || 0) < 0 ? `Credit ${money(Math.abs(Number(customerBalance || 0)))}` : `Balance ${money(customerBalance)}`;
  return `${businessName}: Receipt ${payment.receipt_number || payment.id}. Received ${money(payment.amount)} from ${
    payment.acc_number
  } on ${dateOnly(payment.payment_date)}. ${position}.`;
};

const sendDocumentEmail = async (client, req, { documentType, documentId, customerId, recipient, subject, text, attachments = [] }) => {
  let sendResult;
  try {
    sendResult = await sendEmail({ to: recipient, subject, text, attachments });
  } catch (error) {
    try {
      const log = await createDeliveryLog(client, {
        documentType,
        documentId,
        customerId,
        channel: "email",
        recipient,
        subject,
        status: "failed",
        errorMessage: error.message,
        sentBy: req.user.id
      });
      return { status: "failed", log, error_message: error.message };
    } catch (logError) {
      console.error("Failed to record failed document email delivery.", logError);
      return { status: "failed", log: null, error_message: error.message, log_error: logError.message };
    }
  }

  const status = sendResult.skipped ? "skipped" : "sent";
  try {
    const log = await createDeliveryLog(client, {
      documentType,
      documentId,
      customerId,
      channel: "email",
      recipient,
      subject,
      status,
      errorMessage: sendResult.skipped ? "SMTP is not configured." : null,
      providerMessageId: sendResult.messageId || null,
      sentBy: req.user.id
    });
    return { status, log };
  } catch (logError) {
    console.error("Document email sent, but delivery log could not be recorded.", logError);
    return { status, log: null, log_error: logError.message };
  }
};

const sendDocumentSms = async (client, req, { documentType, documentId, customerId, recipient, subject, message }) => {
  let sendResult;
  try {
    sendResult = await sendSms({ to: recipient, message });
  } catch (error) {
    try {
      const log = await createDeliveryLog(client, {
        documentType,
        documentId,
        customerId,
        channel: "sms",
        recipient,
        subject,
        status: "failed",
        errorMessage: error.message,
        sentBy: req.user.id
      });
      return { status: "failed", log, error_message: error.message };
    } catch (logError) {
      console.error("Failed to record failed document SMS delivery.", logError);
      return { status: "failed", log: null, error_message: error.message, log_error: logError.message };
    }
  }

  const status = sendResult.skipped ? "skipped" : "sent";
  try {
    const log = await createDeliveryLog(client, {
      documentType,
      documentId,
      customerId,
      channel: "sms",
      recipient,
      subject,
      status,
      errorMessage: sendResult.skipped ? sendResult.error || "SMS provider is not configured." : null,
      providerMessageId: sendResult.messageId || sendResult.providerStatus || null,
      sentBy: req.user.id
    });
    return { status, log };
  } catch (logError) {
    console.error("Document SMS sent, but delivery log could not be recorded.", logError);
    return { status, log: null, log_error: logError.message };
  }
};

const sendDocumentWhatsApp = async (client, req, { documentType, documentId, customerId, recipient, subject, message, whatsappTemplate }) => {
  let sendResult;
  try {
    sendResult = await sendWhatsApp({ to: recipient, message, template: whatsappTemplate });
  } catch (error) {
    try {
      const log = await createDeliveryLog(client, {
        documentType,
        documentId,
        customerId,
        channel: "whatsapp",
        recipient,
        subject,
        status: "failed",
        errorMessage: error.message,
        sentBy: req.user.id
      });
      return { status: "failed", log, error_message: error.message };
    } catch (logError) {
      console.error("Failed to record failed document WhatsApp delivery.", logError);
      return { status: "failed", log: null, error_message: error.message, log_error: logError.message };
    }
  }

  const status = sendResult.skipped ? "skipped" : "sent";
  try {
    const log = await createDeliveryLog(client, {
      documentType,
      documentId,
      customerId,
      channel: "whatsapp",
      recipient,
      subject,
      status,
      errorMessage: sendResult.skipped ? sendResult.error || "WhatsApp provider is not configured." : null,
      providerMessageId: sendResult.messageId || sendResult.providerStatus || null,
      sentBy: req.user.id
    });
    return { status, log };
  } catch (logError) {
    console.error("Document WhatsApp sent, but delivery log could not be recorded.", logError);
    return { status, log: null, log_error: logError.message };
  }
};

module.exports = {
  buildBillEmail,
  buildBillPdfAttachment,
  buildBillSms,
  buildReceiptEmail,
  buildReceiptPdfAttachment,
  buildReceiptSms,
  getBusinessSettings,
  getCustomerEmailRecipient,
  getCustomerSmsRecipient,
  getCustomerWhatsAppRecipient,
  listDeliveryLogs,
  sendDocumentEmail,
  sendDocumentSms,
  sendDocumentWhatsApp
};
