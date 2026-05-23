const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { createReceiptNumber } = require("../services/billingPeriod.service");

const paymentChannels = ["cash", "bank", "mpesa_paybill", "manual_adjustment"];

const normalizeChannel = (value) => {
  if (value === "mobile_money") return "mpesa_paybill";
  if (paymentChannels.includes(value)) return value;
  return "cash";
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

const normalizeImportHeader = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

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
    notes
  },
  { auditReason = null } = {}
) => {
  const paymentAmount = Number(amount);
  const channel = normalizeChannel(payment_channel || method);
  const nextExternalReference = external_reference ?? reference ?? null;

  if ((!customerIdentifier && !customer_id) || amount === undefined) {
    throw new ApiError(400, "Customer and amount are required.");
  }

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
  }

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

  const paymentResult = await client.query(
    `INSERT INTO payments (
      customer_id, bill_id, amount, payment_date, method, reference,
      receipt_number, payment_channel, external_reference, received_from,
      status, total_allocated_amount, unallocated_amount, notes, recorded_by
    )
    VALUES (
      $1, NULL, $2, COALESCE($3, CURRENT_DATE), $4, $5,
      $6, $4, $5, $7, 'posted', 0, $2, $8, $9
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
      req.user.id
    ]
  );

  const payment = paymentResult.rows[0];
  const { allocations, bills, unallocatedAmount } = await allocatePayment(client, payment.id, customer.id, paymentAmount, bill_id);
  const firstBillId = allocations[0]?.bill_id || null;
  const totalAllocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const nextReceiptNumber = receipt_number || (await buildReceiptNumber(client));

  const updatedPayment = await client.query(
    `UPDATE payments
     SET bill_id = $1,
         receipt_number = COALESCE(receipt_number, $2),
         total_allocated_amount = $3,
         unallocated_amount = $4,
         updated_by = $5,
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [firstBillId, nextReceiptNumber, totalAllocated, unallocatedAmount, req.user.id, payment.id]
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
    reason: auditReason
  });

  return {
    payment: updatedPayment.rows[0],
    allocations,
    bills,
    unallocatedAmount
  };
};

const listPayments = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS customer_name,
            c.acc_number,
            COUNT(pa.id) AS allocation_count,
            COALESCE(SUM(pa.amount), 0) AS allocated_amount,
            STRING_AGG(DISTINCT b.bill_number, ', ' ORDER BY b.bill_number) FILTER (WHERE b.bill_number IS NOT NULL) AS bill_numbers
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     LEFT JOIN bills b ON b.id = pa.bill_id
     GROUP BY p.id, c.name, c.acc_number
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
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
            b.bill_number,
            b.billing_month,
            b.due_date,
            COALESCE(NULLIF(b.total_amount, 0), b.amount) AS bill_total,
            b.paid_amount,
            b.balance_amount,
            b.status AS bill_status
     FROM payment_allocations pa
     JOIN bills b ON b.id = pa.bill_id
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
    customerBalance: balanceResult.rows[0]?.balance_due || 0
  });
});

const createPayment = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await createPaymentWithAllocations(client, req, req.body);
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
        external_reference: external_reference ?? suspense.external_reference,
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
    const notes = readImportValue(row, ["notes", "note"]);
    const billIdValue = readImportValue(row, ["bill_id"]);
    const billNumber = readImportValue(row, ["bill_number", "bill"]);
    const paymentAmount = Number(amountValue);
    const customerId = customerIdValue ? Number(customerIdValue) : null;
    const billId = billIdValue ? Number(billIdValue) : null;
    const channel = normalizeImportChannel(channelValue);

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
      receipt_number: receiptNumber || "",
      external_reference: externalReference || "",
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
          notes: row.notes
        },
        { auditReason: `CSV payment import row ${row.rowNumber}` }
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

    await recordAuditEvent(client, {
      req,
      action: "payment_import.committed",
      entityType: "payment_import",
      afterData: {
        totalRows: rows.length,
        importedRows: imported.length,
        totalAmount: imported.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      }
    });

    await client.query("COMMIT");
    res.status(201).json({
      imported,
      summary: {
        total: rows.length,
        imported: imported.length,
        totalAmount: imported.reduce((sum, row) => sum + Number(row.amount || 0), 0)
      }
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
    notes
  } = req.body;
  const paymentAmount = amount === undefined ? undefined : Number(amount);

  if (paymentAmount !== undefined && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
    throw new ApiError(400, "Payment amount must be greater than zero.");
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
      throw new ApiError(400, "Only posted payments can be edited.");
    }

    const nextAmount = paymentAmount === undefined ? Number(payment.amount) : paymentAmount;
    const nextChannel = normalizeChannel(payment_channel || method || payment.payment_channel || payment.method);
    const nextExternalReference = external_reference ?? reference ?? payment.external_reference ?? payment.reference;
    const nextReceiptNumber = receipt_number ?? payment.receipt_number;

    if (nextReceiptNumber && nextReceiptNumber !== payment.receipt_number) {
      const duplicateReceipt = await client.query(
        "SELECT id FROM payments WHERE receipt_number = $1 AND id <> $2",
        [nextReceiptNumber, payment.id]
      );
      if (duplicateReceipt.rows[0]) {
        throw new ApiError(400, "Receipt number is already in use.");
      }
    }

    const beforeAllocationsResult = await client.query(
      "SELECT * FROM payment_allocations WHERE payment_id = $1 ORDER BY id ASC",
      [payment.id]
    );
    const reversed = await reverseAllocations(client, payment.id);
    const billIdForReallocation =
      reversed.allocations.length === 1 ? reversed.allocations[0].bill_id : null;
    const { allocations, bills, unallocatedAmount } = await allocatePayment(
      client,
      payment.id,
      payment.customer_id,
      nextAmount,
      billIdForReallocation
    );
    const totalAllocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);

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
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        nextAmount,
        payment_date || null,
        nextChannel,
        nextExternalReference || null,
        nextReceiptNumber || (await buildReceiptNumber(client)),
        received_from ?? payment.received_from,
        totalAllocated,
        unallocatedAmount,
        notes ?? payment.notes,
        req.user.id,
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
      }
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
  listPayments,
  createPayment,
  previewPaymentImport,
  listPaymentSuspense,
  voidPaymentToSuspense,
  reapplyPaymentSuspense,
  discardPaymentSuspense,
  updatePayment
};
