const pool = require("../db/pool");
const crypto = require("crypto");
const { mpesaCallbackToken } = require("../config/env");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { recordSystemEvent } = require("../services/systemEvent.service");
const { createReceiptNumber } = require("../services/billingPeriod.service");
const { assertNotFutureDate } = require("../services/dateGuard.service");
const {
  buildReceiptEmail,
  buildReceiptPdfAttachment,
  buildReceiptSms,
  getBusinessSettings,
  getCustomerEmailRecipient,
  getCustomerSmsRecipient,
  listDeliveryLogs,
  sendDocumentEmail,
  sendDocumentSms
} = require("../services/documentDelivery.service");

const paymentChannels = ["cash", "bank", "mpesa_paybill", "manual_adjustment"];
const importMappingChannels = ["bank", "mpesa_paybill"];
const importMappingFields = new Set([
  "payment_date",
  "amount",
  "acc_number",
  "external_reference",
  "transaction_status",
  "received_from",
  "narration",
  "receipt_number",
  "notes"
]);

const normalizeChannel = (value) => {
  const raw = String(value || "cash").trim().toLowerCase();
  if (raw === "mobile_money") return "mpesa_paybill";
  if (paymentChannels.includes(raw)) return raw;
  throw new ApiError(400, "Payment channel must be cash, bank, mpesa_paybill, or manual_adjustment.");
};

const normalizeImportChannel = (value) => {
  const raw = String(value || "cash").trim().toLowerCase();
  if (raw === "mobile_money" || raw === "mpesa" || raw === "m_pesa" || raw === "paybill") {
    return { channel: "mpesa_paybill" };
  }
  if (paymentChannels.includes(raw)) {
    return { channel: raw };
  }
  return { channel: "cash", error: "Payment channel must be cash, bank, mpesa_paybill, or manual_adjustment." };
};

const normalizeImportTransactionStatus = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return { value: "", isCompleted: false };

  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const completed = ["completed", "complete", "success", "successful", "posted", "settled"];
  return { value: raw, isCompleted: completed.includes(normalized) };
};

const normalizeImportHeader = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const normalizeImportMappingProfile = ({ name, payment_channel: paymentChannel, mapping }) => {
  const normalizedName = String(name || "").trim();
  const normalizedChannel = String(paymentChannel || "").trim().toLowerCase();
  if (!normalizedName || normalizedName.length > 120) {
    throw new ApiError(400, "Profile name is required and must be 120 characters or fewer.");
  }
  if (!importMappingChannels.includes(normalizedChannel)) {
    throw new ApiError(400, "Mapping profiles are available for bank or mpesa_paybill imports.");
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new ApiError(400, "Profile mapping must be an object.");
  }

  const normalizedMapping = {};
  for (const [header, field] of Object.entries(mapping)) {
    const normalizedHeader = String(header || "").trim();
    const normalizedField = String(field || "").trim();
    if (!normalizedHeader || normalizedHeader.length > 160) {
      throw new ApiError(400, "Each mapped statement column must be between 1 and 160 characters.");
    }
    if (normalizedField && !importMappingFields.has(normalizedField)) {
      throw new ApiError(400, `Unsupported statement mapping field: ${normalizedField}.`);
    }
    normalizedMapping[normalizedHeader] = normalizedField;
  }

  if (Object.keys(normalizedMapping).length > 80) {
    throw new ApiError(400, "A mapping profile can include at most 80 statement columns.");
  }

  return { name: normalizedName, paymentChannel: normalizedChannel, mapping: normalizedMapping };
};

const callbackTokenMatches = (providedToken) => {
  const expected = Buffer.from(String(mpesaCallbackToken || ""));
  const provided = Buffer.from(String(providedToken || ""));
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
};

const parseMpesaTransactionDate = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:\d{2}){0,3}$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const mpesaCallbackDetails = ({ transactionId, accountNumber, amount, shortcode, failureReason = null }) => ({
  transaction_id: String(transactionId || "").slice(0, 120) || null,
  account_number: String(accountNumber || "").slice(0, 120) || null,
  amount: Number.isFinite(Number(amount)) ? Number(amount) : null,
  shortcode: String(shortcode || "").slice(0, 80) || null,
  failure_reason: failureReason ? String(failureReason).slice(0, 400) : null
});

const recordMpesaCallbackEvent = ({ req, eventType, severity, message, details, statusCode }) =>
  recordSystemEvent({
    eventType,
    severity,
    source: "server",
    message,
    details,
    req,
    statusCode: statusCode ?? (eventType === "payment.mpesa_confirmation_posted" ? 201 : 200)
  });

const getMpesaIntegrationStatus = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT paybill_number FROM business_settings WHERE id = 1");
  const paybillConfigured = Boolean(rows[0]?.paybill_number);
  const callbackTokenConfigured = Boolean(mpesaCallbackToken);
  res.json({
    enabled: callbackTokenConfigured && paybillConfigured,
    callback_path: "/api/payments/mpesa/confirmation",
    callback_token_configured: callbackTokenConfigured,
    paybill_configured: paybillConfigured,
    mode: callbackTokenConfigured && paybillConfigured ? "guarded_callback" : "statement_reconciliation"
  });
});

const listMpesaCallbackEvents = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
  const status = String(req.query.status || "").trim().toLowerCase();
  if (status && !["posted", "duplicate", "rejected"].includes(status)) {
    throw new ApiError(400, "M-Pesa callback status must be posted, duplicate, or rejected.");
  }

  const { rows } = await pool.query(
    `SELECT
       sel.id,
       CASE
         WHEN sel.event_type = 'payment.mpesa_confirmation_posted' THEN 'posted'
         WHEN sel.event_type = 'payment.mpesa_confirmation_duplicate' THEN 'duplicate'
         ELSE 'rejected'
       END AS status,
       sel.message,
       sel.details ->> 'transaction_id' AS transaction_id,
       sel.details ->> 'account_number' AS account_number,
       NULLIF(sel.details ->> 'amount', '')::numeric AS amount,
       sel.details ->> 'shortcode' AS shortcode,
       sel.details ->> 'failure_reason' AS failure_reason,
       sel.created_at
     FROM system_event_logs sel
     WHERE sel.event_type IN (
       'payment.mpesa_confirmation_posted',
       'payment.mpesa_confirmation_duplicate',
       'payment.mpesa_confirmation_rejected'
     )
       AND ($1::varchar IS NULL OR
         CASE
           WHEN sel.event_type = 'payment.mpesa_confirmation_posted' THEN 'posted'
           WHEN sel.event_type = 'payment.mpesa_confirmation_duplicate' THEN 'duplicate'
           ELSE 'rejected'
         END = $1)
     ORDER BY sel.created_at DESC
     LIMIT $2`,
    [status || null, limit]
  );
  res.json(rows);
});

const receiveMpesaConfirmation = asyncHandler(async (req, res) => {
  if (!mpesaCallbackToken) {
    throw new ApiError(503, "M-Pesa confirmation posting is not enabled.");
  }
  if (!callbackTokenMatches(req.get("x-agua-callback-token"))) {
    throw new ApiError(401, "M-Pesa confirmation is not authorized.");
  }

  const transactionId = String(req.body?.TransID || req.body?.transaction_id || "").trim();
  const accountNumber = String(req.body?.BillRefNumber || req.body?.account_number || "").trim();
  const amount = Number(req.body?.TransAmount ?? req.body?.amount);
  const payerName = [req.body?.FirstName, req.body?.MiddleName, req.body?.LastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const shortcode = String(req.body?.BusinessShortCode || "").trim();
  const callbackDetails = (failureReason = null) =>
    mpesaCallbackDetails({ transactionId, accountNumber, amount, shortcode, failureReason });
  const rejectConfirmation = async (message) => {
    await recordMpesaCallbackEvent({
      req,
      eventType: "payment.mpesa_confirmation_rejected",
      severity: "warning",
      message: "M-Pesa confirmation rejected before posting.",
      details: callbackDetails(message),
      statusCode: 400
    });
    throw new ApiError(400, message);
  };

  if (!transactionId || transactionId.length > 120) {
    await rejectConfirmation("M-Pesa confirmation must include a valid transaction ID.");
  }
  if (!accountNumber || accountNumber.length > 120) {
    await rejectConfirmation("M-Pesa confirmation must include the customer account reference.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    await rejectConfirmation("M-Pesa confirmation must include a positive transaction amount.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [transactionId]);
    const business = await getBusinessSettings(client);
    if (!business.paybill_number) {
      throw new ApiError(503, "M-Pesa confirmation posting requires a configured business paybill.");
    }
    if (!shortcode) {
      throw new ApiError(400, "M-Pesa confirmation must include the receiving paybill shortcode.");
    }
    if (business.paybill_number !== shortcode) {
      throw new ApiError(400, "M-Pesa confirmation shortcode does not match the configured paybill.");
    }
    const duplicate = await client.query(
      `SELECT id, receipt_number
       FROM payments
       WHERE payment_channel = 'mpesa_paybill'
         AND status = 'posted'
         AND LOWER(BTRIM(external_reference)) = LOWER(BTRIM($1))
       LIMIT 1`,
      [transactionId]
    );
    if (duplicate.rows[0]) {
      await client.query("COMMIT");
      await recordMpesaCallbackEvent({
        req,
        eventType: "payment.mpesa_confirmation_duplicate",
        severity: "info",
        message: "M-Pesa confirmation was already posted.",
        details: callbackDetails()
      });
      res.json({ ResultCode: 0, ResultDesc: "Confirmation already processed.", receipt_number: duplicate.rows[0].receipt_number });
      return;
    }

    const result = await createPaymentWithAllocations(
      client,
      req,
      {
        customerIdentifier: accountNumber,
        amount,
        payment_date: parseMpesaTransactionDate(req.body?.TransTime || req.body?.transaction_date),
        payment_channel: "mpesa_paybill",
        external_reference: transactionId,
        received_from: payerName || String(req.body?.MSISDN || "").trim(),
        notes: `M-Pesa confirmation | shortcode: ${String(req.body?.BusinessShortCode || "").trim() || "-"} | phone: ${String(req.body?.MSISDN || "").trim() || "-"}`
      },
      { auditReason: "M-Pesa confirmation callback" }
    );
    await client.query("COMMIT");
    await recordMpesaCallbackEvent({
      req,
      eventType: "payment.mpesa_confirmation_posted",
      severity: "info",
      message: "M-Pesa confirmation posted as a receipt.",
      details: callbackDetails()
    });
    res.status(201).json({
      ResultCode: 0,
      ResultDesc: "Confirmation accepted.",
      receipt_number: result.payment.receipt_number,
      payment_id: result.payment.id
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof ApiError) {
      await recordMpesaCallbackEvent({
        req,
        eventType: "payment.mpesa_confirmation_rejected",
        severity: "warning",
        message: "M-Pesa confirmation rejected before posting.",
        details: callbackDetails(error.message),
        statusCode: error.statusCode || 400
      });
    }
    throw error;
  } finally {
    client.release();
  }
});

const parseCsv = (csvText) => {
  const text = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new ApiError(400, "CSV content is required.");
  }

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);

  if (quoted) {
    throw new ApiError(400, "CSV has an unclosed quoted value.");
  }
  if (rows.length < 2) {
    throw new ApiError(400, "CSV must include a header row and at least one payment row.");
  }

  const headers = rows[0].map(normalizeImportHeader);
  return rows.slice(1).map((values, index) => {
    const parsed = { rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      parsed[header] = values[headerIndex] || "";
    });
    return parsed;
  });
};

const readImportValue = (row, keys) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== "");

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const getBillTotal = (bill) => Number(bill.total_amount || bill.amount);

const getBillBalance = (bill) => getBillTotal(bill) - Number(bill.paid_amount);

const getBillStatus = (paidAmount, billTotal) => {
  if (paidAmount <= 0) return "unpaid";
  return paidAmount >= billTotal ? "paid" : "partial";
};

const updateBillPaidAmount = async (client, billId, paidAmount) => {
  const billResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [billId]);
  const bill = billResult.rows[0];
  if (!bill) {
    throw new ApiError(404, "Linked bill not found.");
  }

  const billTotal = getBillTotal(bill);
  const nextPaidAmount = Math.max(0, Number(paidAmount));
  const nextStatus = getBillStatus(nextPaidAmount, billTotal);
  const nextBalanceAmount = Math.max(billTotal - nextPaidAmount, 0);

  const updated = await client.query(
    `UPDATE bills
     SET paid_amount = $1,
         status = $2::varchar,
         balance_amount = $3,
         paid_at = CASE WHEN $2::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
     WHERE id = $4
     RETURNING *`,
    [nextPaidAmount, nextStatus, nextBalanceAmount, billId]
  );
  return updated.rows[0];
};

const findCustomer = async (client, customerIdentifier, customerId) => {
  if (customerId) {
    const { rows } = await client.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    return rows[0];
  }

  const { rows } = await client.query(
    `SELECT * FROM customers
     WHERE acc_number = $1 OR LOWER(name) = LOWER($1)
     ORDER BY CASE WHEN acc_number = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [customerIdentifier]
  );
  return rows[0];
};

const selectAllocatableBills = async (client, customerId, billId = null) => {
  if (billId) {
    const billResult = await client.query(
      "SELECT * FROM bills WHERE id = $1 AND customer_id = $2 AND bill_pay_status = 'payable' FOR UPDATE",
      [billId, customerId]
    );
    return billResult.rows;
  }

  const billResult = await client.query(
    `SELECT *
     FROM bills
     WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'
     ORDER BY billing_month ASC, id ASC
     FOR UPDATE`,
    [customerId]
  );
  return billResult.rows;
};

const allocatePayment = async (client, paymentId, customerId, amount, billId = null) => {
  const paymentAmount = Number(amount);
  const bills = await selectAllocatableBills(client, customerId, billId);

  if (billId && !bills.length) {
    throw new ApiError(404, "No payable unpaid bill found for this customer.");
  }

  let remainingPayment = paymentAmount;
  const allocations = [];
  const updatedBills = [];

  for (const bill of bills) {
    if (remainingPayment <= 0) break;

    const billBalance = getBillBalance(bill);
    if (billBalance <= 0) continue;

    const appliedAmount = Math.min(remainingPayment, billBalance);
    const nextPaidAmount = Number(bill.paid_amount) + appliedAmount;

    const allocationResult = await client.query(
      `INSERT INTO payment_allocations (payment_id, bill_id, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [paymentId, bill.id, appliedAmount]
    );

    const updatedBill = await updateBillPaidAmount(client, bill.id, nextPaidAmount);

    allocations.push(allocationResult.rows[0]);
    updatedBills.push(updatedBill);
    remainingPayment -= appliedAmount;
  }

  return { allocations, bills: updatedBills, unallocatedAmount: Math.max(remainingPayment, 0) };
};

const normalizeAllocationPlan = (value, paymentAmount) => {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new ApiError(400, "Payment allocation plan must be a list of customer accounts.");
  if (!value.length) return [];
  if (value.length > 12) throw new ApiError(400, "A payment can be split across up to 12 customer accounts.");

  const seenCustomerIds = new Set();
  const plan = value.map((line, index) => {
    const customerId = Number(line?.customer_id);
    const amount = Number(line?.amount);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw new ApiError(400, `Allocation ${index + 1} must identify a customer account.`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, `Allocation ${index + 1} must have a positive amount.`);
    }
    if (seenCustomerIds.has(customerId)) {
      throw new ApiError(400, "Each customer account can appear only once in a split payment.");
    }
    seenCustomerIds.add(customerId);
    return { customer_id: customerId, amount: Math.round(amount * 100) / 100 };
  });
  const plannedAmount = plan.reduce((sum, line) => sum + line.amount, 0);
  if (plannedAmount - Number(paymentAmount) > 0.005) {
    throw new ApiError(400, "Split allocations cannot exceed the receipt amount.");
  }
  return plan.sort((left, right) => left.customer_id - right.customer_id);
};

const allocatePaymentPlan = async (client, paymentId, allocationPlan, paymentAmount) => {
  const allocations = [];
  const bills = [];
  for (const line of allocationPlan) {
    const result = await allocatePayment(client, paymentId, line.customer_id, line.amount);
    if (result.unallocatedAmount > 0.005) {
      throw new ApiError(400, "A split allocation exceeds the payable balance on one of the selected customer accounts.");
    }
    allocations.push(...result.allocations);
    bills.push(...result.bills);
  }
  const totalAllocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  return { allocations, bills, unallocatedAmount: Math.max(Number(paymentAmount) - totalAllocated, 0) };
};

const reverseAllocations = async (client, paymentId) => {
  const allocationResult = await client.query(
    "SELECT * FROM payment_allocations WHERE payment_id = $1 ORDER BY id ASC FOR UPDATE",
    [paymentId]
  );
  const allocations = allocationResult.rows;

  const updatedBills = [];
  for (const allocation of allocations) {
    const billResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [
      allocation.bill_id
    ]);
    const bill = billResult.rows[0];
    if (!bill) continue;
    const nextPaidAmount = Number(bill.paid_amount) - Number(allocation.amount);
    updatedBills.push(await updateBillPaidAmount(client, bill.id, nextPaidAmount));
  }

  await client.query("DELETE FROM payment_allocations WHERE payment_id = $1", [paymentId]);
  return { allocations, bills: updatedBills };
};

const buildReceiptNumber = async (client) => createReceiptNumber(client);

const createPaymentWithAllocations = async (
  client,
  req,
  {
    customerIdentifier,
    customer_id,
    bill_id,
    amount,
    payment_date,
    method,
    payment_channel,
    receipt_number,
    reference,
    external_reference,
    received_from,
    notes,
    idempotency_key,
    allocation_plan
  },
  { auditReason = null } = {}
) => {
  const paymentAmount = Number(amount);
  const channel = normalizeChannel(payment_channel || method);
  const nextExternalReference = String(external_reference ?? reference ?? "").trim() || null;
  const targetBillId =
    bill_id !== undefined && bill_id !== null && String(bill_id).trim() !== "" ? bill_id : null;
  const allocationPlan = normalizeAllocationPlan(allocation_plan, paymentAmount);
  if (targetBillId && allocationPlan.length) {
    throw new ApiError(400, "Choose either a specific bill or a split payment plan, not both.");
  }
  const allocationMode = allocationPlan.length ? "cross_account" : targetBillId === null ? "automatic" : "targeted";

  if ((!customerIdentifier && !customer_id) || amount === undefined) {
    throw new ApiError(400, "Customer and amount are required.");
  }

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
  }
  const futureOverrideReason = assertNotFutureDate(payment_date, req, "Payment date");

  const customer = await findCustomer(client, customerIdentifier, customer_id);
  if (!customer) {
    throw new ApiError(404, "Customer not found by name or account number.");
  }

  if (receipt_number) {
    const duplicateReceipt = await client.query("SELECT id FROM payments WHERE receipt_number = $1", [
      receipt_number
    ]);
    if (duplicateReceipt.rows[0]) {
      throw new ApiError(400, "Receipt number is already in use.");
    }
  }

  if (["bank", "mpesa_paybill"].includes(channel) && !nextExternalReference) {
    throw new ApiError(400, "Transaction reference is required for bank and M-Pesa payments.");
  }

  if (["bank", "mpesa_paybill"].includes(channel) && nextExternalReference) {
    const duplicateReference = await client.query(
      `SELECT id FROM payments
       WHERE status = 'posted'
         AND payment_channel = $1
         AND LOWER(BTRIM(external_reference)) = LOWER(BTRIM($2))
       LIMIT 1`,
      [channel, nextExternalReference]
    );
    if (duplicateReference.rows[0]) {
      throw new ApiError(400, "This bank or M-Pesa transaction reference is already posted.");
    }
  }

  const paymentResult = await client.query(
    `INSERT INTO payments (
      customer_id, bill_id, amount, payment_date, method, reference,
      receipt_number, payment_channel, external_reference, received_from,
      status, total_allocated_amount, unallocated_amount, notes, recorded_by, idempotency_key,
      allocation_mode, target_bill_id, allocation_plan
    )
    VALUES (
      $1, NULL, $2, COALESCE($3, CURRENT_DATE), $4, $5,
      $6, $4, $5, $7, 'posted', 0, $2, $8, $9, $10, $11, NULL, $12::jsonb
    )
    RETURNING *`,
    [
      customer.id,
      paymentAmount,
      payment_date || null,
      channel,
      nextExternalReference,
      receipt_number || null,
      received_from || customer.name,
      notes || null,
      req.user?.id || null,
      idempotency_key || null,
      allocationMode,
      JSON.stringify(allocationPlan)
    ]
  );

  const payment = paymentResult.rows[0];
  const { allocations, bills, unallocatedAmount } = allocationPlan.length
    ? await allocatePaymentPlan(client, payment.id, allocationPlan, paymentAmount)
    : await allocatePayment(client, payment.id, customer.id, paymentAmount, targetBillId);
  const firstBillId = allocations[0]?.bill_id || null;
  const totalAllocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const nextReceiptNumber = receipt_number || (await buildReceiptNumber(client));

  const updatedPayment = await client.query(
    `UPDATE payments
     SET bill_id = $1,
         receipt_number = COALESCE(receipt_number, $2),
         total_allocated_amount = $3,
         unallocated_amount = $4,
         target_bill_id = $5,
         allocation_plan = $6::jsonb,
         updated_by = $7,
         updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [firstBillId, nextReceiptNumber, totalAllocated, unallocatedAmount, targetBillId, JSON.stringify(allocationPlan), req.user.id, payment.id]
  );
  await recordAuditEvent(client, {
    req,
    action: "payment.created",
    entityType: "payment",
    entityId: updatedPayment.rows[0].id,
    afterData: {
      payment: updatedPayment.rows[0],
      allocations,
      unallocatedAmount
    },
    reason: auditReason || futureOverrideReason
  });

  return {
    payment: updatedPayment.rows[0],
    allocations,
    bills,
    unallocatedAmount
  };
};

const listPaymentImportMappingProfiles = asyncHandler(async (req, res) => {
  const requestedChannel = String(req.query.channel || "").trim().toLowerCase();
  if (requestedChannel && !importMappingChannels.includes(requestedChannel)) {
    throw new ApiError(400, "Mapping profiles are available for bank or mpesa_paybill imports.");
  }

  const { rows } = await pool.query(
    `SELECT profile.*, updater.name AS updated_by_name
     FROM payment_import_mapping_profiles profile
     LEFT JOIN users updater ON updater.id = profile.updated_by
     WHERE ($1::varchar IS NULL OR profile.payment_channel = $1)
     ORDER BY profile.payment_channel ASC, LOWER(profile.name) ASC`,
    [requestedChannel || null]
  );
  res.json(rows);
});

const savePaymentImportMappingProfile = asyncHandler(async (req, res) => {
  const { name, paymentChannel, mapping } = normalizeImportMappingProfile(req.body || {});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      `SELECT *
       FROM payment_import_mapping_profiles
       WHERE payment_channel = $1
         AND LOWER(BTRIM(name)) = LOWER(BTRIM($2))
       FOR UPDATE`,
      [paymentChannel, name]
    );
    const existing = existingResult.rows[0];
    const result = existing
      ? await client.query(
          `UPDATE payment_import_mapping_profiles
           SET name = $1, mapping = $2::jsonb, updated_by = $3, updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [name, JSON.stringify(mapping), req.user.id, existing.id]
        )
      : await client.query(
          `INSERT INTO payment_import_mapping_profiles
             (name, payment_channel, mapping, created_by, updated_by)
           VALUES ($1, $2, $3::jsonb, $4, $4)
           RETURNING *`,
          [name, paymentChannel, JSON.stringify(mapping), req.user.id]
        );
    const profile = result.rows[0];
    await recordAuditEvent(client, {
      req,
      action: existing ? "payment_import_mapping_profile.updated" : "payment_import_mapping_profile.created",
      entityType: "payment_import_mapping_profile",
      entityId: profile.id,
      beforeData: existing ? { name: existing.name, payment_channel: existing.payment_channel, mapping: existing.mapping } : null,
      afterData: { name: profile.name, payment_channel: profile.payment_channel, mapping: profile.mapping }
    });
    await client.query("COMMIT");
    res.status(existing ? 200 : 201).json(profile);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listPayments = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS customer_name,
            c.acc_number,
            COUNT(pa.id) AS allocation_count,
            STRING_AGG(DISTINCT allocation_customer.acc_number, ', ' ORDER BY allocation_customer.acc_number) AS allocated_accounts,
            COALESCE(SUM(pa.amount), 0) AS allocated_amount,
            STRING_AGG(DISTINCT b.bill_number, ', ' ORDER BY b.bill_number) FILTER (WHERE b.bill_number IS NOT NULL) AS bill_numbers
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     LEFT JOIN bills b ON b.id = pa.bill_id
     LEFT JOIN customers allocation_customer ON allocation_customer.id = b.customer_id
     GROUP BY p.id, c.name, c.acc_number
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const listPaymentRegister = asyncHandler(async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const requestedOffset = Number.parseInt(req.query.offset, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const channel = String(req.query.channel || "").trim();
  const dateFrom = String(req.query.date_from || "").trim();
  const dateTo = String(req.query.date_to || "").trim();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const creditsOnly = String(req.query.credits_only || "").toLowerCase() === "true";

  if (channel && !paymentChannels.includes(channel)) {
    throw new ApiError(400, "Payment channel must be cash, bank, mpesa_paybill, or manual_adjustment.");
  }
  if (dateFrom && !isDateOnly(dateFrom)) throw new ApiError(400, "date_from must be a YYYY-MM-DD date.");
  if (dateTo && !isDateOnly(dateTo)) throw new ApiError(400, "date_to must be a YYYY-MM-DD date.");
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ApiError(400, "date_from cannot be after date_to.");

  const params = [];
  const filters = ["1 = 1"];
  if (channel) filters.push(`p.payment_channel = $${params.push(channel)}`);
  if (dateFrom) filters.push(`p.payment_date >= $${params.push(dateFrom)}::date`);
  if (dateTo) filters.push(`p.payment_date <= $${params.push(dateTo)}::date`);
  if (creditsOnly) filters.push("p.unallocated_amount > 0 AND p.status = 'posted'");
  if (search) {
    const searchTerm = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const placeholder = `$${params.push(searchTerm)}`;
    filters.push(
      `(c.name ILIKE ${placeholder} ESCAPE '\\' OR c.acc_number ILIKE ${placeholder} ESCAPE '\\' OR COALESCE(p.receipt_number, '') ILIKE ${placeholder} ESCAPE '\\' OR COALESCE(p.external_reference, '') ILIKE ${placeholder} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM payment_allocations search_allocation
          JOIN bills search_bill ON search_bill.id = search_allocation.bill_id
          JOIN customers search_customer ON search_customer.id = search_bill.customer_id
          WHERE search_allocation.payment_id = p.id
            AND (search_customer.name ILIKE ${placeholder} ESCAPE '\\' OR search_customer.acc_number ILIKE ${placeholder} ESCAPE '\\')
        ))`
    );
  }
  const where = filters.join(" AND ");
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(p.amount), 0) AS received_total,
            COALESCE(SUM(p.unallocated_amount), 0) AS credit_total
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     WHERE ${where}`,
    params
  );
  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS customer_name,
            c.acc_number,
            COUNT(pa.id) AS allocation_count,
            STRING_AGG(DISTINCT allocation_customer.acc_number, ', ' ORDER BY allocation_customer.acc_number) AS allocated_accounts,
            COALESCE(SUM(pa.amount), 0) AS allocated_amount,
            STRING_AGG(DISTINCT b.bill_number, ', ' ORDER BY b.bill_number) FILTER (WHERE b.bill_number IS NOT NULL) AS bill_numbers
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     LEFT JOIN bills b ON b.id = pa.bill_id
     LEFT JOIN customers allocation_customer ON allocation_customer.id = b.customer_id
     WHERE ${where}
     GROUP BY p.id, c.name, c.acc_number
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
    params
  );

  res.json({
    limit,
    offset,
    total: countResult.rows[0].total,
    summary: {
      received_total: Number(countResult.rows[0].received_total || 0),
      credit_total: Number(countResult.rows[0].credit_total || 0)
    },
    rows
  });
});

const paymentCorrectionEventTypes = {
  "payment.updated": "corrected",
  "payment.voided_to_suspense": "voided",
  "payment_suspense.reapplied": "reapplied",
  "payment_suspense.discarded": "discarded"
};

const parseAuditData = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const firstAuditValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const auditNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePaymentCorrection = (event) => {
  const afterData = parseAuditData(event.after_data);
  const nestedPayment = parseAuditData(afterData.payment);
  const nestedSuspense = parseAuditData(afterData.suspense);
  const isPaymentEvent = event.action === "payment.updated" || event.action === "payment.voided_to_suspense";
  const payment = Object.keys(nestedPayment).length ? nestedPayment : isPaymentEvent ? afterData : {};
  const suspense = Object.keys(nestedSuspense).length ? nestedSuspense : isPaymentEvent ? {} : afterData;
  const paymentId = isPaymentEvent
    ? firstAuditValue(payment.id, suspense.source_payment_id, afterData.payment_id, event.entity_id)
    : firstAuditValue(suspense.source_payment_id, payment.source_payment_id, afterData.payment_id);

  return {
    id: auditNumber(event.id),
    action: event.action,
    event_type: paymentCorrectionEventTypes[event.action],
    payment_id: auditNumber(paymentId),
    related_payment_id:
      event.action === "payment_suspense.reapplied"
        ? auditNumber(firstAuditValue(suspense.reapplied_payment_id, payment.id, afterData.related_payment_id))
        : null,
    related_receipt_number: event.related_receipt_number || null,
    suspense_id: auditNumber(
      firstAuditValue(suspense.id, afterData.suspense_id, isPaymentEvent ? null : event.entity_id)
    ),
    customer_id: auditNumber(firstAuditValue(payment.customer_id, suspense.customer_id, afterData.customer_id)),
    receipt_number: firstAuditValue(suspense.receipt_number, payment.receipt_number, afterData.receipt_number) || null,
    amount: auditNumber(firstAuditValue(payment.amount, suspense.amount, afterData.amount)),
    status: firstAuditValue(payment.status, suspense.status, afterData.status) || null,
    reason: firstAuditValue(event.reason, afterData.reason, suspense.discard_reason, suspense.reason) || null,
    actor_name: event.actor_name || null,
    created_at: event.created_at || null
  };
};

const normalizeImportSourceName = (value) => {
  const source = String(value || "").trim().replace(/\s+/g, " ");
  return source.slice(0, 160) || "CSV payment import";
};

const normalizeReconciliationExclusions = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ApiError(400, "Reconciliation exclusions must be a list of statement rows.");
  }
  if (value.length > 250) {
    throw new ApiError(400, "A reconciliation import can record up to 250 excluded statement rows.");
  }

  return value.map((row, index) => {
    const sourceRowNumber = Number(row?.source_row_number);
    const amount = Number(row?.amount || 0);
    const reference = String(row?.external_reference || "").trim();
    const reason = String(row?.reason || "").trim().replace(/\s+/g, " ");
    if (!Number.isInteger(sourceRowNumber) || sourceRowNumber < 1) {
      throw new ApiError(400, `Excluded statement row ${index + 1} must include its source row number.`);
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, `Excluded statement row ${sourceRowNumber} must include a valid amount.`);
    }
    if (reason.length < 3 || reason.length > 600) {
      throw new ApiError(400, `Excluded statement row ${sourceRowNumber} needs an exclusion reason between 3 and 600 characters.`);
    }
    return {
      source_row_number: sourceRowNumber,
      external_reference: reference.slice(0, 160),
      amount,
      reason
    };
  });
};

const toPaymentImportBatch = (event) => {
  const data = parseAuditData(event.after_data);
  return {
    id: Number(event.id),
    batch_reference: data.batch_reference || `PAYIMP-AUDIT-${event.id}`,
    source_name: data.source_name || "CSV payment import",
    csv_sha256: data.csv_sha256 || null,
    total_rows: Number(data.total_rows ?? data.totalRows ?? 0),
    imported_rows: Number(data.imported_rows ?? data.importedRows ?? 0),
    total_amount: Number(data.total_amount ?? data.totalAmount ?? 0),
    channel_summary: data.channel_summary && typeof data.channel_summary === "object" ? data.channel_summary : {},
    excluded_rows: Number(data.reconciliation_exclusions?.count ?? 0),
    excluded_total: Number(data.reconciliation_exclusions?.total_amount ?? 0),
    actor_name: event.actor_name || null,
    created_at: event.created_at
  };
};

const listPaymentCorrections = asyncHandler(async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;
  const { rows } = await pool.query(
    `SELECT ae.id, ae.action, ae.entity_id, ae.after_data, ae.reason, ae.created_at,
            u.name AS actor_name,
            related_payment.receipt_number AS related_receipt_number
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     LEFT JOIN payments related_payment
       ON related_payment.id = CASE
         WHEN ae.action = 'payment_suspense.reapplied'
          AND COALESCE(ae.after_data->>'reapplied_payment_id', '') ~ '^[0-9]+$'
         THEN (ae.after_data->>'reapplied_payment_id')::integer
         ELSE NULL
       END
     WHERE ae.action IN (
       'payment.updated',
       'payment.voided_to_suspense',
       'payment_suspense.reapplied',
       'payment_suspense.discarded'
     )
     ORDER BY ae.created_at DESC, ae.id DESC
     LIMIT $1`,
    [limit]
  );

  res.json(rows.map(normalizePaymentCorrection));
});

const listPaymentImportBatches = asyncHandler(async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;
  const { rows } = await pool.query(
    `SELECT ae.id, ae.after_data, ae.created_at, u.name AS actor_name
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     WHERE ae.action = 'payment_import.committed'
       AND ae.entity_type = 'payment_import'
     ORDER BY ae.created_at DESC, ae.id DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows.map(toPaymentImportBatch));
});

const getPayment = asyncHandler(async (req, res) => {
  const paymentResult = await pool.query(
    `SELECT p.*,
            c.name AS customer_name,
            c.acc_number,
            c.phone,
            c.location,
            z.name AS zone_name,
            u.name AS recorded_by_name
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     JOIN zones z ON z.id = c.zone_id
     LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.id = $1`,
    [req.params.id]
  );
  const payment = paymentResult.rows[0];

  if (!payment) {
    throw new ApiError(404, "Payment not found.");
  }

  const allocationsResult = await pool.query(
    `SELECT pa.*,
            allocation_customer.name AS allocation_customer_name,
            allocation_customer.acc_number AS allocation_acc_number,
            b.bill_number,
            b.billing_month,
            b.due_date,
            COALESCE(NULLIF(b.total_amount, 0), b.amount) AS bill_total,
            b.paid_amount,
            b.balance_amount,
            b.status AS bill_status
     FROM payment_allocations pa
     JOIN bills b ON b.id = pa.bill_id
     JOIN customers allocation_customer ON allocation_customer.id = b.customer_id
     WHERE pa.payment_id = $1
     ORDER BY b.billing_month ASC, b.id ASC`,
    [payment.id]
  );

  const balanceResult = await pool.query(
    `SELECT
       COALESCE((
         SELECT SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount))
         FROM bills
         WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'
       ), 0) -
       COALESCE((
         SELECT SUM(unallocated_amount)
         FROM payments
         WHERE customer_id = $1 AND status = 'posted'
       ), 0) AS balance_due`,
    [payment.customer_id]
  );

  res.json({
    payment,
    allocations: allocationsResult.rows,
    customerBalance: balanceResult.rows[0]?.balance_due || 0,
    delivery_logs: await listDeliveryLogs(pool, "receipt", payment.id)
  });
});

const sendReceiptEmail = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const paymentResult = await client.query(
      `SELECT p.*,
              c.name AS customer_name,
              c.acc_number,
              c.phone,
              c.location,
              z.name AS zone_name,
              u.name AS recorded_by_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN zones z ON z.id = c.zone_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.id = $1`,
      [req.params.id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new ApiError(404, "Payment not found.");

    const allocationsResult = await client.query(
      `SELECT pa.*,
              allocation_customer.name AS allocation_customer_name,
              allocation_customer.acc_number AS allocation_acc_number,
              b.bill_number,
              b.billing_month,
              b.due_date,
              COALESCE(NULLIF(b.total_amount, 0), b.amount) AS bill_total,
              b.paid_amount,
              b.balance_amount,
              b.status AS bill_status
       FROM payment_allocations pa
       JOIN bills b ON b.id = pa.bill_id
       JOIN customers allocation_customer ON allocation_customer.id = b.customer_id
       WHERE pa.payment_id = $1
       ORDER BY b.billing_month ASC, b.id ASC`,
      [payment.id]
    );
    const balanceResult = await client.query(
      `SELECT
         COALESCE((
           SELECT SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount))
           FROM bills
           WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'
         ), 0) -
         COALESCE((
           SELECT SUM(unallocated_amount)
           FROM payments
           WHERE customer_id = $1 AND status = 'posted'
         ), 0) AS balance_due`,
      [payment.customer_id]
    );

    const [business, recipient] = await Promise.all([
      getBusinessSettings(client),
      getCustomerEmailRecipient(client, payment.customer_id)
    ]);
    const email = buildReceiptEmail({
      payment,
      allocations: allocationsResult.rows,
      customerBalance: balanceResult.rows[0]?.balance_due || 0,
      business
    });
    const result = await sendDocumentEmail(client, req, {
      documentType: "receipt",
      documentId: payment.id,
      customerId: payment.customer_id,
      recipient: recipient.email,
      subject: email.subject,
      text: email.text,
      attachments: [
        buildReceiptPdfAttachment({
          payment,
          allocations: allocationsResult.rows,
          customerBalance: balanceResult.rows[0]?.balance_due || 0,
          business
        })
      ]
    });

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: "payment.receipt_email_sent",
        entityType: "payment",
        entityId: payment.id,
        afterData: {
          recipient: recipient.email,
          status: result.status,
          delivery_log_id: result.log?.id || null,
          delivery_log_error: result.log_error || null
        },
        reason: `Receipt email ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Receipt email audit event could not be recorded.", error);
    }

    const logNote = result.log_error ? " Delivery history could not be updated." : "";
    const auditNote = auditError ? " Audit event could not be recorded." : "";
    res.json({
      ...result,
      audit_error: auditError,
      message: result.status === "sent" ? `Receipt email sent.${logNote}${auditNote}` : `Receipt email was not sent.${logNote}${auditNote}`
    });
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
});

const sendReceiptSms = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const paymentResult = await client.query(
      `SELECT p.*,
              c.name AS customer_name,
              c.acc_number,
              c.phone,
              c.location,
              z.name AS zone_name,
              u.name AS recorded_by_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN zones z ON z.id = c.zone_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.id = $1`,
      [req.params.id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new ApiError(404, "Payment not found.");

    const balanceResult = await client.query(
      `SELECT
         COALESCE((
           SELECT SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount))
           FROM bills
           WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'
         ), 0) -
         COALESCE((
           SELECT SUM(unallocated_amount)
           FROM payments
           WHERE customer_id = $1 AND status = 'posted'
         ), 0) AS balance_due`,
      [payment.customer_id]
    );

    const [business, recipient] = await Promise.all([
      getBusinessSettings(client),
      getCustomerSmsRecipient(client, payment.customer_id)
    ]);
    const messageText = buildReceiptSms({
      payment,
      customerBalance: balanceResult.rows[0]?.balance_due || 0,
      business
    });
    const result = await sendDocumentSms(client, req, {
      documentType: "receipt",
      documentId: payment.id,
      customerId: payment.customer_id,
      recipient: recipient.phone,
      subject: `Receipt ${payment.receipt_number || payment.id}`,
      message: messageText
    });

    let auditError = null;
    try {
      await recordAuditEvent(client, {
        req,
        action: "payment.receipt_sms_sent",
        entityType: "payment",
        entityId: payment.id,
        afterData: {
          recipient: recipient.phone,
          status: result.status,
          delivery_log_id: result.log?.id || null,
          delivery_log_error: result.log_error || null
        },
        reason: `Receipt SMS ${result.status}`
      });
    } catch (error) {
      auditError = error.message;
      console.error("Receipt SMS audit event could not be recorded.", error);
    }

    const logNote = result.log_error ? " Delivery history could not be updated." : "";
    const auditNote = auditError ? " Audit event could not be recorded." : "";
    res.json({
      ...result,
      audit_error: auditError,
      message: result.status === "sent" ? `Receipt SMS sent.${logNote}${auditNote}` : `Receipt SMS was not sent.${logNote}${auditNote}`
    });
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
});

const paymentResultForReplay = async (client, payment) => {
  const allocationResult = await client.query(
    "SELECT * FROM payment_allocations WHERE payment_id = $1 ORDER BY id ASC",
    [payment.id]
  );
  const billIds = allocationResult.rows.map((allocation) => allocation.bill_id);
  const billResult = billIds.length
    ? await client.query("SELECT * FROM bills WHERE id = ANY($1::int[]) ORDER BY billing_month ASC, id ASC", [billIds])
    : { rows: [] };
  return {
    payment,
    allocations: allocationResult.rows,
    bills: billResult.rows,
    unallocatedAmount: Number(payment.unallocated_amount || 0),
    idempotent_replay: true
  };
};

const createPayment = asyncHandler(async (req, res) => {
  const idempotencyKey = String(req.body.idempotency_key || "").trim();
  if (idempotencyKey && !/^[A-Za-z0-9:_-]{16,100}$/.test(idempotencyKey)) {
    throw new ApiError(400, "Payment idempotency key is invalid.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (idempotencyKey) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);
      const existingResult = await client.query("SELECT * FROM payments WHERE idempotency_key = $1", [idempotencyKey]);
      const existing = existingResult.rows[0];
      if (existing) {
        const requestedChannel = normalizeChannel(req.body.payment_channel || req.body.method);
        const requestedReference = String(req.body.external_reference ?? req.body.reference ?? "").trim();
        const sameCustomer = Number(existing.customer_id) === Number(req.body.customer_id);
        const sameAmount = Number(existing.amount) === Number(req.body.amount);
        const sameChannel = existing.payment_channel === requestedChannel;
        const sameReference = String(existing.external_reference || "").trim() === requestedReference;
        const sameDate = !req.body.payment_date || String(existing.payment_date).slice(0, 10) === String(req.body.payment_date).slice(0, 10);
        const requestedPlan = normalizeAllocationPlan(req.body.allocation_plan, req.body.amount);
        const storedPlan = normalizeAllocationPlan(existing.allocation_plan, existing.amount);
        const samePlan = JSON.stringify(requestedPlan) === JSON.stringify(storedPlan);
        if (!sameCustomer || !sameAmount || !sameChannel || !sameReference || !sameDate || !samePlan) {
          throw new ApiError(409, "This payment submission key was already used for different payment details.");
        }
        const replay = await paymentResultForReplay(client, existing);
        await client.query("COMMIT");
        res.status(200).json(replay);
        return;
      }
    }
    const result = await createPaymentWithAllocations(client, req, {
      ...req.body,
      idempotency_key: idempotencyKey || null
    });
    await client.query("COMMIT");
    res.status(201).json(result);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listPaymentSuspense = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT psi.*,
            c.name AS customer_name,
            c.acc_number,
            rp.receipt_number AS reapplied_receipt_number,
            sp.status AS source_payment_status
     FROM payment_suspense_items psi
     LEFT JOIN customers c ON c.id = psi.customer_id
     LEFT JOIN payments rp ON rp.id = psi.reapplied_payment_id
     JOIN payments sp ON sp.id = psi.source_payment_id
     ORDER BY
       CASE psi.status WHEN 'held' THEN 0 WHEN 'reapplied' THEN 1 ELSE 2 END,
       psi.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const voidPaymentToSuspense = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body || {};
  if (!String(reason).trim()) {
    throw new ApiError(400, "A void reason is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query("SELECT * FROM payments WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new ApiError(404, "Payment not found.");
    }
    if (payment.status !== "posted") {
      throw new ApiError(400, "Only posted payments can be voided to suspense.");
    }

    const existingSuspense = await client.query(
      "SELECT id FROM payment_suspense_items WHERE source_payment_id = $1 AND status = 'held'",
      [payment.id]
    );
    if (existingSuspense.rows[0]) {
      throw new ApiError(400, "This payment is already held in suspense.");
    }

    const beforeAllocationsResult = await client.query(
      "SELECT * FROM payment_allocations WHERE payment_id = $1 ORDER BY id ASC",
      [payment.id]
    );
    const reversed = await reverseAllocations(client, payment.id);
    const updatedPayment = await client.query(
      `UPDATE payments
       SET status = 'voided_to_suspense',
           total_allocated_amount = 0,
           unallocated_amount = 0,
           voided_by = $1,
           voided_at = NOW(),
           updated_by = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, payment.id]
    );
    const suspenseResult = await client.query(
      `INSERT INTO payment_suspense_items (
         source_payment_id, customer_id, amount, receipt_number, payment_channel,
         external_reference, received_from, payment_date, reason, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        payment.id,
        payment.customer_id,
        payment.amount,
        payment.receipt_number,
        payment.payment_channel || payment.method,
        payment.external_reference || payment.reference,
        payment.received_from,
        payment.payment_date,
        reason.trim(),
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "payment.voided_to_suspense",
      entityType: "payment",
      entityId: payment.id,
      beforeData: { payment, allocations: beforeAllocationsResult.rows },
      afterData: { payment: updatedPayment.rows[0], suspense: suspenseResult.rows[0], reversedBills: reversed.bills },
      reason: reason.trim()
    });
    await recordAuditEvent(client, {
      req,
      action: "payment_suspense.created",
      entityType: "payment_suspense",
      entityId: suspenseResult.rows[0].id,
      afterData: suspenseResult.rows[0],
      reason: reason.trim()
    });

    await client.query("COMMIT");
    res.json({ payment: updatedPayment.rows[0], suspense: suspenseResult.rows[0], bills: reversed.bills });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const reapplyPaymentSuspense = asyncHandler(async (req, res) => {
  const { customer_id, bill_id, payment_date, payment_channel, external_reference, received_from, notes } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const suspenseResult = await client.query("SELECT * FROM payment_suspense_items WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const suspense = suspenseResult.rows[0];
    if (!suspense) {
      throw new ApiError(404, "Suspense item not found.");
    }
    if (suspense.status !== "held") {
      throw new ApiError(400, "Only held suspense items can be reapplied.");
    }

    const targetCustomerId = customer_id || suspense.customer_id;
    if (!targetCustomerId) {
      throw new ApiError(400, "Choose a customer before reapplying this suspense item.");
    }

    const result = await createPaymentWithAllocations(
      client,
      req,
      {
        customer_id: Number(targetCustomerId),
        bill_id: bill_id || null,
        amount: suspense.amount,
        payment_date: payment_date || suspense.payment_date,
        payment_channel: payment_channel || suspense.payment_channel || "bank",
        external_reference: external_reference || suspense.external_reference || suspense.receipt_number,
        received_from: received_from ?? suspense.received_from,
        notes: notes || `Reapplied from suspense item #${suspense.id}`
      },
      { auditReason: `Reapplied suspense item #${suspense.id}` }
    );

    const updatedSuspense = await client.query(
      `UPDATE payment_suspense_items
       SET status = 'reapplied',
           reapplied_payment_id = $1,
           resolved_by = $2,
           resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [result.payment.id, req.user.id, suspense.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "payment_suspense.reapplied",
      entityType: "payment_suspense",
      entityId: suspense.id,
      beforeData: suspense,
      afterData: updatedSuspense.rows[0],
      reason: `Reapplied as payment ${result.payment.receipt_number || result.payment.id}`
    });

    await client.query("COMMIT");
    res.json({ suspense: updatedSuspense.rows[0], ...result });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const discardPaymentSuspense = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body || {};
  if (!String(reason).trim()) {
    throw new ApiError(400, "A discard reason is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const suspenseResult = await client.query("SELECT * FROM payment_suspense_items WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const suspense = suspenseResult.rows[0];
    if (!suspense) {
      throw new ApiError(404, "Suspense item not found.");
    }
    if (suspense.status !== "held") {
      throw new ApiError(400, "Only held suspense items can be discarded.");
    }

    const updatedSuspense = await client.query(
      `UPDATE payment_suspense_items
       SET status = 'discarded',
           discard_reason = $1,
           resolved_by = $2,
           resolved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason.trim(), req.user.id, suspense.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "payment_suspense.discarded",
      entityType: "payment_suspense",
      entityId: suspense.id,
      beforeData: suspense,
      afterData: updatedSuspense.rows[0],
      reason: reason.trim()
    });

    await client.query("COMMIT");
    res.json({ suspense: updatedSuspense.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const getCustomerOpenBalance = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS balance
     FROM bills
     WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'`,
    [customerId]
  );
  return Number(rows[0]?.balance || 0);
};

const getOpenBillForImport = async (client, customerId, billId, billNumber) => {
  if (!billId && !billNumber) return null;

  const { rows } = await client.query(
    `SELECT *,
            COALESCE(NULLIF(balance_amount, 0), amount - paid_amount) AS import_balance
     FROM bills
     WHERE customer_id = $1
       AND bill_pay_status = 'payable'
       AND (($2::integer IS NOT NULL AND id = $2) OR ($3::text IS NOT NULL AND bill_number = $3))
     LIMIT 1`,
    [customerId, billId || null, billNumber || null]
  );
  return rows[0] || null;
};

const resolvePaymentImportRows = async (client, csvText, { commitMode = false } = {}) => {
  const parsedRows = parseCsv(csvText);
  const receiptNumbers = new Set();
  const externalReferences = new Set();
  const runningBalances = new Map();
  const resolvedRows = [];

  for (const row of parsedRows) {
    const errors = [];
    const warnings = [];
    const customerIdValue = readImportValue(row, ["customer_id", "id"]);
    const accountNumber = readImportValue(row, ["acc_number", "account_number", "account", "customer_account"]);
    const customerName = readImportValue(row, ["customer_name", "name"]);
    const paymentDate = readImportValue(row, ["payment_date", "date"]);
    const amountValue = readImportValue(row, ["amount", "payment_amount", "received_amount"]);
    const receiptNumber = readImportValue(row, ["receipt_number", "receipt", "receipt_no"]);
    const channelValue = readImportValue(row, ["payment_channel", "channel", "method"]);
    const externalReference = readImportValue(row, [
      "external_reference",
      "reference",
      "transaction_code",
      "mpesa_code",
      "bank_reference"
    ]);
    const receivedFrom = readImportValue(row, ["received_from", "payer"]);
    const transactionStatusValue = readImportValue(row, [
      "transaction_status",
      "mpesa_status",
      "transaction_state",
      "status"
    ]);
    const notes = readImportValue(row, ["notes", "note"]);
    const billIdValue = readImportValue(row, ["bill_id"]);
    const billNumber = readImportValue(row, ["bill_number", "bill"]);
    const paymentAmount = Number(amountValue);
    const customerId = customerIdValue ? Number(customerIdValue) : null;
    const billId = billIdValue ? Number(billIdValue) : null;
    const channel = normalizeImportChannel(channelValue);
    const normalizedExternalReference = String(externalReference || "").trim();
    const transactionStatus = normalizeImportTransactionStatus(transactionStatusValue);

    if (!customerIdValue && !accountNumber && !customerName) {
      errors.push("Customer ID, account number, or customer name is required.");
    }
    if (customerIdValue && (!Number.isInteger(customerId) || customerId <= 0)) {
      errors.push("Customer ID must be a valid number.");
    }
    if (billIdValue && (!Number.isInteger(billId) || billId <= 0)) {
      errors.push("Bill ID must be a valid number.");
    }
    if (!paymentDate || !isDateOnly(paymentDate)) {
      errors.push("Payment date must use YYYY-MM-DD.");
    }
    if (amountValue === undefined || amountValue === "") {
      errors.push("Amount is required.");
    } else if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      errors.push("Amount must be greater than zero.");
    }
    if (channel.error) errors.push(channel.error);
    if (["bank", "mpesa_paybill"].includes(channel.channel) && !normalizedExternalReference) {
      errors.push("Transaction reference is required for bank and M-Pesa payments.");
    }
    if (channel.channel === "mpesa_paybill" && !transactionStatus.value) {
      errors.push("M-Pesa transaction status is required and must show a completed payment.");
    } else if (channel.channel === "mpesa_paybill" && !transactionStatus.isCompleted) {
      errors.push(`M-Pesa transaction status \"${transactionStatus.value}\" is not a completed payment.`);
    }

    if (["bank", "mpesa_paybill"].includes(channel.channel) && normalizedExternalReference) {
      const referenceKey = `${channel.channel}:${normalizedExternalReference.toLowerCase()}`;
      if (externalReferences.has(referenceKey)) {
        errors.push("Transaction reference is duplicated in this CSV.");
      }
      externalReferences.add(referenceKey);

      const duplicateReference = await client.query(
        `SELECT id FROM payments
         WHERE status = 'posted'
           AND payment_channel = $1
           AND LOWER(BTRIM(external_reference)) = LOWER(BTRIM($2))
         LIMIT 1`,
        [channel.channel, normalizedExternalReference]
      );
      if (duplicateReference.rows[0]) {
        errors.push("Transaction reference is already posted.");
      }
    }

    if (receiptNumber) {
      if (receiptNumbers.has(receiptNumber)) {
        errors.push("Receipt number is duplicated in this CSV.");
      }
      receiptNumbers.add(receiptNumber);

      const duplicateReceipt = await client.query("SELECT id FROM payments WHERE receipt_number = $1", [
        receiptNumber
      ]);
      if (duplicateReceipt.rows[0]) {
        errors.push("Receipt number is already in use.");
      }
    }

    let customer = null;
    if (!errors.some((error) => error.startsWith("Customer"))) {
      customer = await findCustomer(client, accountNumber || customerName || null, customerId);
      if (!customer) {
        errors.push("Customer was not found.");
      }
    }

    let bill = null;
    if (customer && (billId || billNumber)) {
      bill = await getOpenBillForImport(client, customer.id, billId, billNumber);
      if (!bill) {
        errors.push("Open bill was not found for this customer.");
      } else if (bill.status === "paid" || Number(bill.import_balance) <= 0) {
        errors.push("Selected bill is already paid.");
      }
    }

    let availableBalance = 0;
    if (customer && !errors.some((error) => error.includes("Amount"))) {
      const balanceKey = bill ? `bill:${bill.id}` : `customer:${customer.id}`;
      if (!runningBalances.has(balanceKey)) {
        runningBalances.set(
          balanceKey,
          bill ? Number(bill.import_balance) : await getCustomerOpenBalance(client, customer.id)
        );
      }

      availableBalance = Number(runningBalances.get(balanceKey) || 0);
      if (paymentAmount > availableBalance) {
        warnings.push(`Excess ${paymentAmount - availableBalance} will be stored as customer credit.`);
      }
      if (!errors.length) {
        runningBalances.set(balanceKey, Math.max(availableBalance - paymentAmount, 0));
      }
    }

    resolvedRows.push({
      rowNumber: row.rowNumber,
      customer_id: customer?.id || customerId,
      customer_name: customer?.name || customerName || "",
      acc_number: customer?.acc_number || accountNumber || "",
      bill_id: bill?.id || billId || null,
      bill_number: bill?.bill_number || billNumber || "",
      payment_date: paymentDate || "",
      amount: amountValue === undefined || amountValue === "" ? "" : paymentAmount,
      payment_channel: channel.channel,
      transaction_status: transactionStatus.value,
      receipt_number: receiptNumber || "",
      external_reference: normalizedExternalReference,
      received_from: receivedFrom || customer?.name || "",
      notes: notes || "",
      available_balance: availableBalance,
      errors,
      warnings: [
        ...(customer && !bill ? ["Payment will allocate across the oldest unpaid bills."] : []),
        ...warnings
      ],
      status: errors.length ? "invalid" : commitMode ? "ready" : "valid"
    });
  }

  return resolvedRows;
};

const previewPaymentImport = asyncHandler(async (req, res) => {
  const rows = await resolvePaymentImportRows(pool, req.body.csv);
  res.json({
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => !row.errors.length).length,
      invalid: rows.filter((row) => row.errors.length).length,
      totalAmount: rows
        .filter((row) => !row.errors.length)
        .reduce((sum, row) => sum + Number(row.amount || 0), 0)
    }
  });
});

const commitPaymentImport = asyncHandler(async (req, res) => {
  const reconciliationExclusions = normalizeReconciliationExclusions(req.body.reconciliation_exclusions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await resolvePaymentImportRows(client, req.body.csv, { commitMode: true });
    const invalidRows = rows.filter((row) => row.errors.length);

    if (invalidRows.length) {
      throw new ApiError(400, "CSV still has invalid rows. Preview and fix the errors before import.");
    }

    const imported = [];
    for (const row of rows) {
      const result = await createPaymentWithAllocations(
        client,
        req,
        {
          customer_id: row.customer_id,
          bill_id: row.bill_id,
          amount: row.amount,
          payment_date: row.payment_date,
          payment_channel: row.payment_channel,
          receipt_number: row.receipt_number,
          external_reference: row.external_reference,
          received_from: row.received_from,
          notes: [
            row.notes,
            row.transaction_status ? `Source transaction status: ${row.transaction_status}` : ""
          ]
            .filter(Boolean)
            .join(" | ")
        },
        {
          auditReason: row.transaction_status
            ? `CSV payment import row ${row.rowNumber} (${row.payment_channel} status: ${row.transaction_status})`
            : `CSV payment import row ${row.rowNumber}`
        }
      );

      imported.push({
        rowNumber: row.rowNumber,
        payment_id: result.payment.id,
        receipt_number: result.payment.receipt_number,
        customer_name: row.customer_name,
        acc_number: row.acc_number,
        amount: result.payment.amount,
        payment_date: result.payment.payment_date,
        allocation_count: result.allocations.length,
        unallocated_amount: result.payment.unallocated_amount
      });
    }

    const totalAmount = imported.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const channelSummary = rows.reduce((summary, row) => {
      const channel = row.payment_channel || "cash";
      summary[channel] = Number(summary[channel] || 0) + 1;
      return summary;
    }, {});
    const csvSha256 = crypto
      .createHash("sha256")
      .update(String(req.body.csv || "").replace(/\r\n/g, "\n"))
      .digest("hex");
    const batchReference = `PAYIMP-${Date.now()}-${csvSha256.slice(0, 8).toUpperCase()}`;
    const sourceName = normalizeImportSourceName(req.body.source_name);
    const auditEvent = await recordAuditEvent(client, {
      req,
      action: "payment_import.committed",
      entityType: "payment_import",
      afterData: {
        batch_reference: batchReference,
        source_name: sourceName,
        csv_sha256: csvSha256,
        total_rows: rows.length,
        imported_rows: imported.length,
        total_amount: totalAmount,
        channel_summary: channelSummary,
        reconciliation_exclusions: reconciliationExclusions.length
          ? {
              count: reconciliationExclusions.length,
              total_amount: reconciliationExclusions.reduce((sum, row) => sum + row.amount, 0),
              rows: reconciliationExclusions
            }
          : null
      }
    });

    await client.query("COMMIT");
    res.status(201).json({
      imported,
      summary: {
        total: rows.length,
        imported: imported.length,
        totalAmount
      },
      batch: toPaymentImportBatch({
        id: auditEvent.id,
        after_data: auditEvent.after_data,
        created_at: auditEvent.created_at,
        actor_name: req.user?.name || null
      })
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updatePayment = asyncHandler(async (req, res) => {
  const {
    amount,
    payment_date,
    method,
    payment_channel,
    receipt_number,
    reference,
    external_reference,
    received_from,
    notes,
    correction_reason
  } = req.body;
  const paymentAmount = amount === undefined ? undefined : Number(amount);
  const correctionReason = String(correction_reason || "").trim();

  if (!correctionReason) {
    throw new ApiError(400, "Correction reason is required.");
  }

  if (paymentAmount !== undefined && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
  }
  const futureOverrideReason = assertNotFutureDate(payment_date, req, "Payment date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query("SELECT * FROM payments WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const payment = paymentResult.rows[0];
    if (!payment) {
      throw new ApiError(404, "Payment not found.");
    }

    if (payment.status !== "posted") {
      throw new ApiError(400, "Only posted payments can be edited.");
    }

    const nextAmount = paymentAmount === undefined ? Number(payment.amount) : paymentAmount;
    const nextChannel = normalizeChannel(payment_channel || method || payment.payment_channel || payment.method);
    const nextExternalReference =
      String(external_reference ?? reference ?? payment.external_reference ?? payment.reference ?? "").trim() || null;

    if (["bank", "mpesa_paybill"].includes(nextChannel) && !nextExternalReference) {
      throw new ApiError(400, "Transaction reference is required for bank and M-Pesa payments.");
    }

    if (["bank", "mpesa_paybill"].includes(nextChannel) && nextExternalReference) {
      const duplicateReference = await client.query(
        `SELECT id FROM payments
         WHERE status = 'posted'
           AND payment_channel = $1
           AND LOWER(BTRIM(external_reference)) = LOWER(BTRIM($2))
           AND id <> $3
         LIMIT 1`,
        [nextChannel, nextExternalReference, payment.id]
      );
      if (duplicateReference.rows[0]) {
        throw new ApiError(400, "This bank or M-Pesa transaction reference is already posted.");
      }
    }

    if (receipt_number !== undefined && receipt_number !== payment.receipt_number) {
      throw new ApiError(400, "Receipt number cannot be changed after a payment is posted.");
    }
    if (payment.allocation_mode === "cross_account" && Math.abs(nextAmount - Number(payment.amount)) > 0.005) {
      throw new ApiError(400, "Change a cross-account receipt by voiding and reposting its reviewed allocation plan.");
    }

    const beforeAllocationsResult = await client.query(
      "SELECT * FROM payment_allocations WHERE payment_id = $1 ORDER BY id ASC",
      [payment.id]
    );
    await reverseAllocations(client, payment.id);
    const billIdForReallocation =
      payment.allocation_mode === "targeted" ? payment.target_bill_id : null;
    const savedAllocationPlan =
      payment.allocation_mode === "cross_account" ? normalizeAllocationPlan(payment.allocation_plan, nextAmount) : [];
    const { allocations, bills, unallocatedAmount } = savedAllocationPlan.length
      ? await allocatePaymentPlan(client, payment.id, savedAllocationPlan, nextAmount)
      : await allocatePayment(client, payment.id, payment.customer_id, nextAmount, billIdForReallocation);
    const totalAllocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const firstBillId = allocations[0]?.bill_id || null;

    const updatedPayment = await client.query(
      `UPDATE payments
       SET amount = $1,
           payment_date = COALESCE($2::date, payment_date),
           method = $3,
           reference = $4,
           receipt_number = $5,
           payment_channel = $3,
           external_reference = $4,
           received_from = $6,
           total_allocated_amount = $7,
           unallocated_amount = $8,
           notes = $9,
           updated_by = $10,
           bill_id = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        nextAmount,
        payment_date || null,
        nextChannel,
        nextExternalReference || null,
        payment.receipt_number,
        received_from ?? payment.received_from,
        totalAllocated,
        unallocatedAmount,
        notes ?? payment.notes,
        req.user.id,
        firstBillId,
        payment.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "payment.updated",
      entityType: "payment",
      entityId: updatedPayment.rows[0].id,
      beforeData: {
        payment,
        allocations: beforeAllocationsResult.rows
      },
      afterData: {
        payment: updatedPayment.rows[0],
        allocations
      },
      reason: futureOverrideReason
        ? `${correctionReason} | Future-date override: ${futureOverrideReason}`
        : correctionReason
    });

    await client.query("COMMIT");
    res.json({ payment: updatedPayment.rows[0], allocations, bills });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  commitPaymentImport,
  createPaymentWithAllocations,
  getPayment,
  getMpesaIntegrationStatus,
  listMpesaCallbackEvents,
  listPaymentCorrections,
  listPaymentImportBatches,
  listPaymentImportMappingProfiles,
  listPayments,
  listPaymentRegister,
  createPayment,
  previewPaymentImport,
  receiveMpesaConfirmation,
  savePaymentImportMappingProfile,
  sendReceiptEmail,
  sendReceiptSms,
  listPaymentSuspense,
  voidPaymentToSuspense,
  reapplyPaymentSuspense,
  discardPaymentSuspense,
  updatePayment
};
