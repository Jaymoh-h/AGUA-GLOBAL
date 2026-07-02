const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { createPaymentWithAllocations } = require("./payment.controller");
const { createExpenseRecord } = require("./expense.controller");
const { createBillNumber } = require("../services/billingPeriod.service");
const { assertNoFutureDates, assertNotFutureDate } = require("../services/dateGuard.service");
const { assertPortalCustomerAccess, getPortalCustomerIds } = require("../services/portalAccount.service");

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

const normalizeImportHeader = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const normalizeEmail = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const email = String(value).trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Email must be a valid address.");
  }
  return email;
};
const normalizeDeliveryChannel = (value) => {
  const channel = String(value || "email").trim().toLowerCase();
  if (!["email", "sms", "whatsapp"].includes(channel)) {
    throw new ApiError(400, "Preferred delivery channel must be email, sms, or whatsapp.");
  }
  return channel;
};

const getCustomerBalanceDue = async (client, customerId) => {
  const { rows } = await client.query(
    `SELECT
       COALESCE((
         SELECT SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount))
         FROM bills b
         WHERE b.customer_id = $1 AND b.status <> 'paid' AND b.bill_pay_status = 'payable'
       ), 0) -
       COALESCE((
         SELECT SUM(p.unallocated_amount)
         FROM payments p
         WHERE p.customer_id = $1 AND p.status = 'posted'
       ), 0) AS balance_due`,
    [customerId]
  );
  return toMoney(rows[0]?.balance_due || 0);
};

const createClosureBill = async (client, customer, settlementDate) => {
  if (customer.closure_bill_id) {
    const existing = await client.query("SELECT * FROM bills WHERE id = $1", [customer.closure_bill_id]);
    if (existing.rows[0]) return existing.rows[0];
  }

  const billNumber = await createBillNumber(client);
  const result = await client.query(
    `INSERT INTO bills (
       customer_id, bill_number, billing_month, previous_reading, current_reading,
       units_used, rate, amount, subtotal_amount, total_amount, balance_amount,
       paid_amount, status, due_date, issued_at
     )
     VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'paid', $3, NOW())
     RETURNING *`,
    [customer.id, billNumber, settlementDate]
  );
  return result.rows[0];
};

const recordDepositTransaction = async (client, req, payload) => {
  const result = await client.query(
    `INSERT INTO customer_deposit_transactions (
      customer_id, action, amount, transaction_date, target_customer_id, payment_id, expense_id, notes, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      payload.customer_id,
      payload.action,
      toMoney(payload.amount),
      payload.transaction_date,
      payload.target_customer_id || null,
      payload.payment_id || null,
      payload.expense_id || null,
      payload.notes || null,
      req.user.id
    ]
  );

  await recordAuditEvent(client, {
    req,
    action: `deposit.${payload.action}`,
    entityType: "customer_deposit_transaction",
    entityId: result.rows[0].id,
    afterData: result.rows[0],
    reason: payload.notes || null
  });

  return result.rows[0];
};

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
    throw new ApiError(400, "CSV must include a header row and at least one customer row.");
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

const parseBoolean = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  return ["true", "yes", "y", "1", "paid"].includes(raw);
};

const parseImportAmount = (value, fallback = 0) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const normalizeOpeningBalance = (amount, date) => {
  const balanceAmount = Number(amount || 0);
  const rawDate = date instanceof Date ? date.toISOString().slice(0, 10) : date;
  const balanceDate = rawDate || null;

  if (!Number.isFinite(balanceAmount)) {
    throw new ApiError(400, "Opening balance amount must be a valid number.");
  }

  if (balanceAmount !== 0 && !balanceDate) {
    throw new ApiError(400, "Opening balance date is required when opening balance is not zero.");
  }

  if (balanceDate && !isDateOnly(balanceDate)) {
    throw new ApiError(400, "Opening balance date must use YYYY-MM-DD format.");
  }

  return { balanceAmount, balanceDate };
};

const createMigrationBalanceBill = async (client, customer, amount, date) => {
  const balanceAmount = toMoney(amount);
  if (balanceAmount <= 0 || !date) return null;

  const existing = await client.query(
    "SELECT * FROM bills WHERE customer_id = $1 AND bill_number = $2",
    [customer.id, `MIG-${customer.id}`]
  );
  if (existing.rows[0]) return existing.rows[0];

  const result = await client.query(
    `INSERT INTO bills (
       customer_id, bill_number, billing_month, previous_reading, current_reading,
       units_used, rate, amount, subtotal_amount, total_amount, balance_amount,
       paid_amount, status, due_date, issued_at
     )
     VALUES ($1, $2, $3, 0, 0, 0, 0, $4, $4, $4, $4, 0, 'unpaid', $3, NOW())
     RETURNING *`,
    [customer.id, `MIG-${customer.id}`, date, balanceAmount]
  );
  return result.rows[0];
};

const upsertMigrationBalanceBill = async (client, customer, amount, date) => {
  const balanceAmount = toMoney(amount);
  const billNumber = `MIG-${customer.id}`;
  const existing = await client.query("SELECT * FROM bills WHERE customer_id = $1 AND bill_number = $2 FOR UPDATE", [
    customer.id,
    billNumber
  ]);
  const migrationBill = existing.rows[0];

  if (migrationBill) {
    const allocationResult = await client.query("SELECT COUNT(*)::integer AS count FROM payment_allocations WHERE bill_id = $1", [
      migrationBill.id
    ]);
    if (Number(migrationBill.paid_amount || 0) > 0 || Number(allocationResult.rows[0]?.count || 0) > 0) {
      throw new ApiError(
        400,
        `Opening balance for ${customer.acc_number} already has payments allocated. Reverse or edit those payments before overwriting it.`
      );
    }
  }

  if (balanceAmount <= 0 || !date) {
    if (migrationBill) {
      await client.query("DELETE FROM bills WHERE id = $1", [migrationBill.id]);
    }
    return null;
  }

  if (migrationBill) {
    const updated = await client.query(
      `UPDATE bills
       SET billing_month = $1,
           amount = $2,
           subtotal_amount = $2,
           total_amount = $2,
           balance_amount = $2,
           paid_amount = 0,
           status = 'unpaid',
           due_date = $1,
           issued_at = COALESCE(issued_at, NOW())
       WHERE id = $3
       RETURNING *`,
      [date, balanceAmount, migrationBill.id]
    );
    return updated.rows[0];
  }

  return createMigrationBalanceBill(client, customer, balanceAmount, date);
};

const prepareCustomerImport = async (csvText, client) => {
  const rateResult = await client.query("SELECT id, name FROM rates WHERE is_active = TRUE");
  const zoneResult = await client.query("SELECT id, name FROM zones WHERE is_active = TRUE");
  const customerResult = await client.query("SELECT id, acc_number FROM customers");

  const ratesById = new Map(rateResult.rows.map((rate) => [String(rate.id), rate]));
  const ratesByName = new Map(rateResult.rows.map((rate) => [rate.name.toLowerCase(), rate]));
  const zonesById = new Map(zoneResult.rows.map((zone) => [String(zone.id), zone]));
  const zonesByName = new Map(zoneResult.rows.map((zone) => [zone.name.toLowerCase(), zone]));
  const existingAccounts = new Set(customerResult.rows.map((customer) => customer.acc_number.toLowerCase()));
  const seenAccounts = new Set();

  const rows = parseCsv(csvText).map((row) => {
    const errors = [];
    const warnings = [];
    const name = readImportValue(row, ["name", "customer_name"]);
    const phone = readImportValue(row, ["phone", "mobile", "telephone"]) || "";
    const email = readImportValue(row, ["email", "customer_email", "billing_email"]) || "";
    const accNumber = readImportValue(row, ["acc_number", "account", "account_number"]);
    const rateKey = readImportValue(row, ["rate_id", "tariff_id"]);
    const rateName = readImportValue(row, ["rate_name", "tariff", "rate"]);
    const zoneKey = readImportValue(row, ["zone_id", "location_id"]);
    const zoneName = readImportValue(row, ["zone_name", "zone", "location"]);
    const depositAmount = parseImportAmount(readImportValue(row, ["deposit_amount", "deposit"]), 0);
    const depositPaid = parseBoolean(readImportValue(row, ["deposit_paid", "deposit_status"]));
    const depositPaidAt = readImportValue(row, ["deposit_paid_at", "deposit_date"]) || "";
    const openingBalanceAmount = parseImportAmount(readImportValue(row, ["opening_balance_amount", "opening_balance"]), 0);
    const openingBalanceDate = readImportValue(row, ["opening_balance_date", "balance_date"]) || "";
    const status = String(readImportValue(row, ["status"]) || "active").trim().toLowerCase();
    const preferredDeliveryChannel = String(readImportValue(row, ["preferred_delivery_channel", "delivery_channel"]) || "email")
      .trim()
      .toLowerCase();
    const emailDeliveryEnabled = readImportValue(row, ["email_delivery_enabled", "email_invoices"]);
    const smsDeliveryEnabled = readImportValue(row, ["sms_delivery_enabled", "sms_invoices"]);
    const whatsappDeliveryEnabled = readImportValue(row, ["whatsapp_delivery_enabled", "whatsapp_invoices"]);

    const rate = rateKey ? ratesById.get(String(rateKey)) : ratesByName.get(String(rateName || "").toLowerCase());
    const zone = zoneKey ? zonesById.get(String(zoneKey)) : zonesByName.get(String(zoneName || "").toLowerCase());

    if (!name) errors.push("Name is required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email must be a valid address.");
    if (!accNumber) errors.push("Account number is required.");
    if (accNumber && existingAccounts.has(accNumber.toLowerCase())) errors.push("Account number already exists.");
    if (accNumber && seenAccounts.has(accNumber.toLowerCase())) errors.push("Duplicate account number in CSV.");
    if (!rate) errors.push("Active rate not found. Use rate_id or rate_name.");
    if (!zone) errors.push("Active zone/location not found. Use zone_id or zone_name.");
    if (!Number.isFinite(depositAmount) || depositAmount < 0) errors.push("Deposit amount must be zero or more.");
    if (depositPaidAt && !isDateOnly(depositPaidAt)) errors.push("Deposit paid date must use YYYY-MM-DD format.");
    if (!Number.isFinite(openingBalanceAmount)) errors.push("Opening balance amount must be a valid number.");
    if (openingBalanceAmount !== 0 && !openingBalanceDate) errors.push("Opening balance date is required.");
    if (openingBalanceDate && !isDateOnly(openingBalanceDate)) errors.push("Opening balance date must use YYYY-MM-DD format.");
    if (!["active", "inactive"].includes(status)) errors.push("Status must be active or inactive.");
    if (!["email", "sms", "whatsapp"].includes(preferredDeliveryChannel)) {
      errors.push("Preferred delivery channel must be email, sms, or whatsapp.");
    }
    if (depositPaid && !depositPaidAt) warnings.push("Deposit marked paid; deposit date will default to today.");

    if (accNumber) seenAccounts.add(accNumber.toLowerCase());

    return {
      rowNumber: row.rowNumber,
      name,
      phone,
      email: email ? email.toLowerCase() : "",
      acc_number: accNumber,
      rate_id: rate?.id || null,
      rate_name: rate?.name || rateName || "",
      zone_id: zone?.id || null,
      zone_name: zone?.name || zoneName || "",
      deposit_amount: Number.isFinite(depositAmount) ? depositAmount : "",
      deposit_paid: depositPaid,
      deposit_paid_at: depositPaidAt,
      opening_balance_amount: Number.isFinite(openingBalanceAmount) ? openingBalanceAmount : "",
      opening_balance_date: openingBalanceDate,
      status,
      preferred_delivery_channel: preferredDeliveryChannel,
      email_delivery_enabled: emailDeliveryEnabled === undefined || emailDeliveryEnabled === "" ? true : parseBoolean(emailDeliveryEnabled),
      sms_delivery_enabled: parseBoolean(smsDeliveryEnabled),
      whatsapp_delivery_enabled: parseBoolean(whatsappDeliveryEnabled),
      errors,
      warnings,
      status_label: errors.length ? "invalid" : "valid"
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.status_label === "valid").length,
      invalid: rows.filter((row) => row.status_label === "invalid").length
    }
  };
};

const prepareOpeningBalanceImport = async (csvText, client) => {
  const customerResult = await client.query(
    `SELECT c.id, c.acc_number, c.name, c.opening_balance_amount, c.opening_balance_date,
       b.id AS migration_bill_id,
       b.paid_amount AS migration_paid_amount,
       COALESCE(pa.allocation_count, 0) AS migration_allocation_count
     FROM customers c
     LEFT JOIN bills b ON b.customer_id = c.id AND b.bill_number = 'MIG-' || c.id::text
     LEFT JOIN (
       SELECT bill_id, COUNT(*)::integer AS allocation_count
       FROM payment_allocations
       GROUP BY bill_id
     ) pa ON pa.bill_id = b.id`
  );
  const customersByAccount = new Map(
    customerResult.rows.map((customer) => [customer.acc_number.toLowerCase(), customer])
  );
  const seenAccounts = new Set();

  const rows = parseCsv(csvText).map((row) => {
    const errors = [];
    const warnings = [];
    const accNumber = readImportValue(row, ["acc_number", "account", "account_number"]);
    const openingBalanceAmount = parseImportAmount(readImportValue(row, ["opening_balance_amount", "opening_balance"]), 0);
    const openingBalanceDate = readImportValue(row, ["opening_balance_date", "balance_date"]) || "";
    const customer = accNumber ? customersByAccount.get(accNumber.toLowerCase()) : null;

    if (!accNumber) errors.push("Account number is required.");
    if (accNumber && seenAccounts.has(accNumber.toLowerCase())) errors.push("Duplicate account number in CSV.");
    if (accNumber && !customer) errors.push("Customer account not found.");
    if (!Number.isFinite(openingBalanceAmount)) errors.push("Opening balance amount must be a valid number.");
    if (openingBalanceAmount !== 0 && !openingBalanceDate) errors.push("Opening balance date is required.");
    if (openingBalanceDate && !isDateOnly(openingBalanceDate)) errors.push("Opening balance date must use YYYY-MM-DD format.");
    if (
      customer &&
      Number(customer.migration_bill_id || 0) > 0 &&
      (Number(customer.migration_paid_amount || 0) > 0 || Number(customer.migration_allocation_count || 0) > 0)
    ) {
      errors.push("Opening balance bill already has payments allocated. Reverse or edit those payments first.");
    }
    if (Number.isFinite(openingBalanceAmount) && openingBalanceAmount < 0) {
      warnings.push("Negative amount will be treated as customer credit.");
    }

    if (accNumber) seenAccounts.add(accNumber.toLowerCase());

    return {
      rowNumber: row.rowNumber,
      customer_id: customer?.id || null,
      name: customer?.name || "",
      acc_number: accNumber,
      previous_opening_balance_amount: customer?.opening_balance_amount || 0,
      previous_opening_balance_date: customer?.opening_balance_date || "",
      opening_balance_amount: Number.isFinite(openingBalanceAmount) ? openingBalanceAmount : "",
      opening_balance_date: openingBalanceDate,
      errors,
      warnings,
      status_label: errors.length ? "invalid" : "valid"
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.status_label === "valid").length,
      invalid: rows.filter((row) => row.status_label === "invalid").length
    }
  };
};

const listCustomers = asyncHandler(async (req, res) => {
  const search = req.query.search || "";
  const params = [`%${search}%`];
  const customerScopeIds = req.user.role === "customer" ? await getPortalCustomerIds(pool, req.user) : [];
  const customerScope =
    req.user.role === "customer" ? `AND c.id = ANY($${params.push(customerScopeIds)}::int[])` : "";
  const { rows } = await pool.query(
    `SELECT c.*,
      r.name AS rate_name,
      r.amount AS rate_amount,
      z.name AS zone_name,
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM bills mb
          WHERE mb.customer_id = c.id
            AND mb.bill_number = 'MIG-' || c.id::text
        )
        THEN COALESCE(c.opening_balance_amount, 0)
        ELSE 0
      END +
        COALESCE((
          SELECT SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount))
          FROM bills b
          WHERE b.customer_id = c.id AND b.status <> 'paid' AND b.bill_pay_status = 'payable'
        ), 0) -
        COALESCE((
          SELECT SUM(p.unallocated_amount)
          FROM payments p
          WHERE p.customer_id = c.id AND p.status = 'posted'
        ), 0) AS balance_due
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     WHERE (c.name ILIKE $1 OR c.acc_number ILIKE $1 OR c.phone ILIKE $1 OR c.email ILIKE $1)
     ${customerScope}
     ORDER BY c.created_at DESC`,
    params
  );
  res.json(rows);
});

const getCustomer = asyncHandler(async (req, res) => {
  if (req.user.role === "customer") {
    await assertPortalCustomerAccess(pool, req.user, req.params.id);
  }
  const { rows } = await pool.query(
    `SELECT c.*, r.name AS rate_name, r.amount AS rate_amount, z.name AS zone_name
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    throw new ApiError(404, "Customer not found.");
  }
  res.json(rows[0]);
});

const getCustomerStatement = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  const hasStart = Boolean(start_date);
  const hasEnd = Boolean(end_date);

  if ((hasStart && !isDateOnly(start_date)) || (hasEnd && !isDateOnly(end_date))) {
    throw new ApiError(400, "Statement dates must use YYYY-MM-DD format.");
  }

  if (hasStart && hasEnd && start_date > end_date) {
    throw new ApiError(400, "Statement start date cannot be after end date.");
  }

  const customerResult = await pool.query(
    `SELECT c.*, r.name AS rate_name, z.name AS zone_name
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     WHERE c.id = $1`,
    [req.params.id]
  );
  const customer = customerResult.rows[0];
  if (!customer) {
    throw new ApiError(404, "Customer not found.");
  }
  if (req.user.role === "customer") {
    await assertPortalCustomerAccess(pool, req.user, customer.id);
  }

  const openingResult = hasStart
    ? await pool.query(
        `SELECT
           COALESCE((
             SELECT SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount))
             FROM bills b
             LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
             WHERE b.customer_id = $1
               AND COALESCE(
                 bp.period_end,
                 (date_trunc('month', b.billing_month)::date + INTERVAL '1 month - 1 day')::date,
                 b.billing_month
               ) < $2::date
               AND b.bill_pay_status = 'payable'
           ), 0) +
           CASE
             WHEN COALESCE(c.opening_balance_amount, 0) > 0
              AND c.opening_balance_date < $2::date
              AND NOT EXISTS (
                SELECT 1 FROM bills mb
                WHERE mb.customer_id = c.id
                  AND mb.bill_number = 'MIG-' || c.id::text
              )
             THEN c.opening_balance_amount
             ELSE 0
           END AS opening_debits,
           COALESCE((
             SELECT SUM(p.amount)
             FROM payments p
             WHERE p.customer_id = $1
               AND p.status = 'posted'
               AND p.payment_date < $2::date
           ), 0) +
           CASE
             WHEN COALESCE(c.opening_balance_amount, 0) < 0
              AND c.opening_balance_date < $2::date
             THEN ABS(c.opening_balance_amount)
             ELSE 0
           END AS opening_credits
         FROM customers c
         WHERE c.id = $1`,
        [req.params.id, start_date]
      )
    : { rows: [{ opening_debits: 0, opening_credits: 0 }] };

  const transactionResult = await pool.query(
    `SELECT *
     FROM (
       SELECT
         'opening_balance' AS transaction_type,
         c.id,
         c.opening_balance_date AS transaction_date,
         'Opening Balance' AS reference,
         'Balance brought forward' AS description,
         CASE WHEN c.opening_balance_amount > 0 THEN c.opening_balance_amount ELSE 0 END AS debit,
         CASE WHEN c.opening_balance_amount < 0 THEN ABS(c.opening_balance_amount) ELSE 0 END AS credit,
         0 AS sort_order
       FROM customers c
       WHERE c.id = $1
         AND COALESCE(c.opening_balance_amount, 0) <> 0
         AND c.opening_balance_date IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM bills mb
           WHERE mb.customer_id = c.id
             AND mb.bill_number = 'MIG-' || c.id::text
         )
         AND ($2::date IS NULL OR c.opening_balance_date >= $2::date)
         AND ($3::date IS NULL OR c.opening_balance_date <= $3::date)

       UNION ALL

       SELECT
         'bill' AS transaction_type,
         b.id,
         COALESCE(
           bp.period_end,
           (date_trunc('month', b.billing_month)::date + INTERVAL '1 month - 1 day')::date,
           b.billing_month
         ) AS transaction_date,
         COALESCE(b.bill_number, 'Bill #' || b.id::text) AS reference,
         COALESCE(bp.name, to_char(b.billing_month, 'FMMonth YYYY')) AS description,
         COALESCE(NULLIF(b.total_amount, 0), b.amount) AS debit,
         0::numeric AS credit,
         2 AS sort_order
       FROM bills b
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.customer_id = $1
         AND b.bill_pay_status = 'payable'
         AND (
           $2::date IS NULL OR
           COALESCE(
             bp.period_end,
             (date_trunc('month', b.billing_month)::date + INTERVAL '1 month - 1 day')::date,
             b.billing_month
           ) >= $2::date
         )
         AND (
           $3::date IS NULL OR
           COALESCE(
             bp.period_end,
             (date_trunc('month', b.billing_month)::date + INTERVAL '1 month - 1 day')::date,
             b.billing_month
           ) <= $3::date
         )

       UNION ALL

       SELECT
         'payment' AS transaction_type,
         p.id,
         p.payment_date AS transaction_date,
         COALESCE(p.receipt_number, p.reference, 'Payment #' || p.id::text) AS reference,
         'Payment via ' || replace(p.payment_channel, '_', ' ') AS description,
         0::numeric AS debit,
         p.amount AS credit,
         1 AS sort_order
       FROM payments p
       WHERE p.customer_id = $1
         AND p.status = 'posted'
         AND ($2::date IS NULL OR p.payment_date >= $2::date)
         AND ($3::date IS NULL OR p.payment_date <= $3::date)
     ) ledger
     ORDER BY transaction_date ASC, sort_order ASC, id ASC`,
    [req.params.id, hasStart ? start_date : null, hasEnd ? end_date : null]
  );

  let runningBalance = toMoney(
    Number(openingResult.rows[0].opening_debits || 0) - Number(openingResult.rows[0].opening_credits || 0)
  );
  const transactions = transactionResult.rows.map((row) => {
    const debit = toMoney(row.debit);
    const credit = toMoney(row.credit);
    runningBalance = toMoney(runningBalance + debit - credit);
    return {
      ...row,
      debit,
      credit,
      running_balance: runningBalance
    };
  });

  const debitTotal = transactions.reduce((sum, row) => sum + row.debit, 0);
  const creditTotal = transactions.reduce((sum, row) => sum + row.credit, 0);
  const openingBalance = toMoney(
    Number(openingResult.rows[0].opening_debits || 0) - Number(openingResult.rows[0].opening_credits || 0)
  );

  res.json({
    customer,
    period: {
      start_date: hasStart ? start_date : null,
      end_date: hasEnd ? end_date : null,
      lifetime: !hasStart && !hasEnd
    },
    opening_balance: openingBalance,
    transactions,
    totals: {
      debit: toMoney(debitTotal),
      credit: toMoney(creditTotal),
      closing_balance: runningBalance
    }
  });
});

const previewCustomerImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    res.json(await prepareCustomerImport(req.body.csv, client));
  } finally {
    client.release();
  }
});

const commitCustomerImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const preview = await prepareCustomerImport(req.body.csv, client);
    if (preview.summary.invalid > 0) {
      throw new ApiError(400, "Import has invalid rows. Preview and fix the CSV before committing.");
    }

    const inserted = [];
    for (const row of preview.rows) {
      const futureOverrideReason = assertNoFutureDates(
        [
          { value: row.deposit_paid ? row.deposit_paid_at : null, label: `Deposit paid date on row ${row.rowNumber}` },
          { value: row.opening_balance_amount !== 0 ? row.opening_balance_date : null, label: `Opening balance date on row ${row.rowNumber}` }
        ],
        req
      );
      const result = await client.query(
        `INSERT INTO customers (
           name, phone, email, location, acc_number, rate, rate_id, zone_id,
           deposit_amount, deposit_paid, deposit_paid_at,
           opening_balance_amount, opening_balance_date, status,
           preferred_delivery_channel, email_delivery_enabled, sms_delivery_enabled, whatsapp_delivery_enabled
         )
         SELECT $1, $2, $3, z.name, $4, r.amount, r.id, z.id, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
         FROM rates r
         CROSS JOIN zones z
         WHERE r.id = $5 AND z.id = $6 AND r.is_active = TRUE AND z.is_active = TRUE
         RETURNING *`,
        [
          row.name,
          row.phone || null,
          row.email || null,
          row.acc_number,
          row.rate_id,
          row.zone_id,
          Number(row.deposit_amount || 0),
          Boolean(row.deposit_paid),
          row.deposit_paid ? row.deposit_paid_at || new Date().toISOString().slice(0, 10) : null,
          Number(row.opening_balance_amount || 0),
          row.opening_balance_amount !== 0 ? row.opening_balance_date : null,
          row.status,
          row.preferred_delivery_channel,
          Boolean(row.email_delivery_enabled),
          Boolean(row.sms_delivery_enabled),
          Boolean(row.whatsapp_delivery_enabled)
        ]
      );

      const customer = result.rows[0];
      const migrationBill = await createMigrationBalanceBill(
        client,
        customer,
        customer.opening_balance_amount,
        customer.opening_balance_date
      );

      inserted.push(customer);
      await recordAuditEvent(client, {
        req,
        action: "customer.imported",
        entityType: "customer",
        entityId: customer.id,
        afterData: customer,
        reason: futureOverrideReason || null
      });
      if (migrationBill) {
        await recordAuditEvent(client, {
          req,
          action: "bill.migration_balance_created",
          entityType: "bill",
          entityId: migrationBill.id,
          afterData: migrationBill,
          reason: futureOverrideReason || null
        });
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ inserted: inserted.length, customers: inserted });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const previewOpeningBalanceImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    res.json(await prepareOpeningBalanceImport(req.body.csv, client));
  } finally {
    client.release();
  }
});

const commitOpeningBalanceImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const preview = await prepareOpeningBalanceImport(req.body.csv, client);
    if (preview.summary.invalid > 0) {
      throw new ApiError(400, "Import has invalid rows. Preview and fix the CSV before committing.");
    }

    const updated = [];
    for (const row of preview.rows) {
      const beforeResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [row.customer_id]);
      const before = beforeResult.rows[0];
      if (!before) {
        throw new ApiError(404, `Customer account ${row.acc_number} was not found.`);
      }

      const openingBalance = normalizeOpeningBalance(row.opening_balance_amount, row.opening_balance_date);
      const futureOverrideReason = assertNotFutureDate(
        openingBalance.balanceDate,
        req,
        `Opening balance date on row ${row.rowNumber}`
      );
      const afterResult = await client.query(
        `UPDATE customers
         SET opening_balance_amount = $1,
             opening_balance_date = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [openingBalance.balanceAmount, openingBalance.balanceDate, before.id]
      );
      const after = afterResult.rows[0];
      const migrationBill = await upsertMigrationBalanceBill(
        client,
        after,
        after.opening_balance_amount,
        after.opening_balance_date
      );

      updated.push({ customer: after, migration_bill: migrationBill });
      await recordAuditEvent(client, {
        req,
        action: "customer.opening_balance_overwritten",
        entityType: "customer",
        entityId: after.id,
        beforeData: before,
        afterData: after,
        reason: futureOverrideReason || `Opening balance overwrite import row ${row.rowNumber}`
      });
      if (migrationBill) {
        await recordAuditEvent(client, {
          req,
          action: "bill.migration_balance_updated",
          entityType: "bill",
          entityId: migrationBill.id,
          afterData: migrationBill,
          reason: futureOverrideReason || `Opening balance overwrite import row ${row.rowNumber}`
        });
      }
    }

    await client.query("COMMIT");
    res.json({ updated: updated.length, rows: updated });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const createCustomer = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    acc_number,
    rate_id,
    zone_id,
    deposit_amount = 0,
    deposit_paid = false,
    deposit_paid_at,
    opening_balance_amount = 0,
    opening_balance_date,
    preferred_delivery_channel = "email",
    email_delivery_enabled = true,
    sms_delivery_enabled = false,
    whatsapp_delivery_enabled = false
  } = req.body;
  if (!name || !acc_number || !rate_id || !zone_id) {
    throw new ApiError(400, "Name, account number, rate, and zone/location are required.");
  }

  const openingBalance = normalizeOpeningBalance(opening_balance_amount, opening_balance_date);
  const nextEmail = normalizeEmail(email);
  const nextDeliveryChannel = normalizeDeliveryChannel(preferred_delivery_channel);
  const nextDepositPaidAt = deposit_paid ? deposit_paid_at || new Date().toISOString().slice(0, 10) : null;
  const futureOverrideReason = assertNoFutureDates(
    [
      { value: nextDepositPaidAt, label: "Deposit paid date" },
      { value: openingBalance.balanceDate, label: "Opening balance date" }
    ],
    req
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO customers (
         name, phone, email, location, acc_number, rate, rate_id, zone_id,
         deposit_amount, deposit_paid, deposit_paid_at,
         opening_balance_amount, opening_balance_date,
         preferred_delivery_channel, email_delivery_enabled, sms_delivery_enabled, whatsapp_delivery_enabled
       )
       SELECT $1, $2, $3, z.name, $4, r.amount, r.id, z.id, $7, $8, $9, $10, $11, $12, $13, $14, $15
       FROM rates r
       CROSS JOIN zones z
       WHERE r.id = $5 AND z.id = $6 AND r.is_active = TRUE AND z.is_active = TRUE
       RETURNING *`,
      [
        name,
        phone || null,
        nextEmail,
        acc_number,
        rate_id,
        zone_id,
        Number(deposit_amount) || 0,
        Boolean(deposit_paid),
        nextDepositPaidAt,
        openingBalance.balanceAmount,
        openingBalance.balanceDate,
        nextDeliveryChannel,
        Boolean(email_delivery_enabled),
        Boolean(sms_delivery_enabled),
        Boolean(whatsapp_delivery_enabled)
      ]
    );
    if (!rows[0]) {
      throw new ApiError(400, "Selected rate or zone/location is inactive or does not exist.");
    }
    const migrationBill = await createMigrationBalanceBill(
      client,
      rows[0],
      rows[0].opening_balance_amount,
      rows[0].opening_balance_date
    );
    await recordAuditEvent(client, {
      req,
      action: "customer.created",
      entityType: "customer",
      entityId: rows[0].id,
      afterData: rows[0],
      reason: futureOverrideReason || null
    });
    if (migrationBill) {
      await recordAuditEvent(client, {
        req,
        action: "bill.migration_balance_created",
        entityType: "bill",
        entityId: migrationBill.id,
        afterData: migrationBill,
        reason: futureOverrideReason || null
      });
    }
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateCustomer = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const {
    name,
    phone,
    email,
    acc_number,
    rate_id,
    zone_id,
    status,
    deposit_amount,
    deposit_paid,
    deposit_paid_at,
    opening_balance_amount,
    opening_balance_date,
    preferred_delivery_channel,
    email_delivery_enabled,
    sms_delivery_enabled,
    whatsapp_delivery_enabled
  } = payload;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Customer not found.");
    }
    const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);
    const openingBalance =
      !hasField("opening_balance_amount") && !hasField("opening_balance_date")
        ? null
        : normalizeOpeningBalance(
            hasField("opening_balance_amount") ? opening_balance_amount : before.opening_balance_amount,
            hasField("opening_balance_date") ? opening_balance_date : before.opening_balance_date
          );
    const selectedRate = hasField("rate_id")
      ? (await client.query("SELECT id, amount FROM rates WHERE id = $1 AND is_active = TRUE", [rate_id || null])).rows[0]
      : null;
    if (hasField("rate_id") && !selectedRate) {
      throw new ApiError(404, "Selected rate is inactive.");
    }
    const selectedZone = hasField("zone_id")
      ? (await client.query("SELECT id, name FROM zones WHERE id = $1 AND is_active = TRUE", [zone_id || null])).rows[0]
      : null;
    if (hasField("zone_id") && !selectedZone) {
      throw new ApiError(404, "Selected zone is inactive.");
    }
    const nextValues = {
      name: hasField("name") ? name : before.name,
      phone: hasField("phone") ? phone || null : before.phone,
      email: hasField("email") ? normalizeEmail(email) : before.email,
      acc_number: hasField("acc_number") ? acc_number : before.acc_number,
      rate_id: selectedRate ? selectedRate.id : before.rate_id,
      zone_id: selectedZone ? selectedZone.id : before.zone_id,
      rate: selectedRate ? selectedRate.amount : before.rate,
      location: selectedZone ? selectedZone.name : before.location,
      status: hasField("status") ? status : before.status,
      deposit_amount: hasField("deposit_amount") ? Number(deposit_amount || 0) : Number(before.deposit_amount || 0),
      deposit_paid: hasField("deposit_paid") ? Boolean(deposit_paid) : Boolean(before.deposit_paid),
      deposit_paid_at: hasField("deposit_paid_at") ? deposit_paid_at || null : before.deposit_paid_at,
      opening_balance_amount: openingBalance ? openingBalance.balanceAmount : Number(before.opening_balance_amount || 0),
      opening_balance_date: openingBalance ? openingBalance.balanceDate : before.opening_balance_date,
      preferred_delivery_channel: hasField("preferred_delivery_channel")
        ? normalizeDeliveryChannel(preferred_delivery_channel)
        : before.preferred_delivery_channel || "email",
      email_delivery_enabled: hasField("email_delivery_enabled")
        ? Boolean(email_delivery_enabled)
        : Boolean(before.email_delivery_enabled),
      sms_delivery_enabled: hasField("sms_delivery_enabled")
        ? Boolean(sms_delivery_enabled)
        : Boolean(before.sms_delivery_enabled),
      whatsapp_delivery_enabled: hasField("whatsapp_delivery_enabled")
        ? Boolean(whatsapp_delivery_enabled)
        : Boolean(before.whatsapp_delivery_enabled)
    };
    if (!nextValues.deposit_paid) {
      nextValues.deposit_paid_at = null;
    } else if (!before.deposit_paid && nextValues.deposit_paid && !nextValues.deposit_paid_at) {
      nextValues.deposit_paid_at = new Date().toISOString().slice(0, 10);
    }
    if (Number(nextValues.opening_balance_amount || 0) === 0) {
      nextValues.opening_balance_date = null;
    }
    const numericCustomerFields = new Set(["rate_id", "zone_id", "rate", "deposit_amount", "opening_balance_amount"]);
    const comparable = (field, value) => {
      if (numericCustomerFields.has(field)) return Number(value || 0).toFixed(2);
      if (["deposit_paid", "email_delivery_enabled", "sms_delivery_enabled", "whatsapp_delivery_enabled"].includes(field)) {
        return Boolean(value) ? "true" : "false";
      }
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (value === null || value === undefined) return "";
      return String(value);
    };
    const changedFields = Object.keys(nextValues).filter((field) => comparable(field, nextValues[field]) !== comparable(field, before[field]));
    if (!changedFields.length) {
      await client.query("COMMIT");
      return res.json({ ...before, unchanged: true });
    }
    const futureOverrideReason = assertNoFutureDates(
      [
        { value: changedFields.includes("deposit_paid_at") ? nextValues.deposit_paid_at : null, label: "Deposit paid date" },
        { value: changedFields.includes("opening_balance_date") ? nextValues.opening_balance_date : null, label: "Opening balance date" }
      ],
      req
    );
    const setClauses = changedFields.map((field, index) => `${field} = $${index + 1}`);
    const updateValues = changedFields.map((field) => nextValues[field]);
    const { rows } = await client.query(
      `UPDATE customers c
       SET ${setClauses.join(", ")},
           updated_at = NOW()
       WHERE c.id = $${updateValues.length + 1}
       RETURNING c.*`,
      [...updateValues, req.params.id]
    );

    if (!rows[0]) {
      throw new ApiError(404, "Customer not found, or selected rate/zone is inactive.");
    }
    const migrationBill = openingBalance
      ? await upsertMigrationBalanceBill(
          client,
          rows[0],
          rows[0].opening_balance_amount,
          rows[0].opening_balance_date
        )
      : null;
    await recordAuditEvent(client, {
      req,
      action: "customer.updated",
      entityType: "customer",
      entityId: rows[0].id,
      beforeData: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
      afterData: Object.fromEntries(changedFields.map((field) => [field, rows[0][field]])),
      reason: futureOverrideReason || null
    });
    if (migrationBill) {
      await recordAuditEvent(client, {
        req,
        action: "bill.migration_balance_updated",
        entityType: "bill",
        entityId: migrationBill.id,
        afterData: migrationBill,
        reason: futureOverrideReason || null
      });
    }
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Customer not found.");
    }
    await client.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
    await recordAuditEvent(client, {
      req,
      action: "customer.deleted",
      entityType: "customer",
      entityId: before.id,
      beforeData: before
    });
    await client.query("COMMIT");
    res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const closeCustomerAccount = asyncHandler(async (req, res) => {
  const {
    settlement_date = new Date().toISOString().slice(0, 10),
    apply_deposit = true,
    deposit_remainder_action = "refund",
    transfer_customer_id,
    notes = ""
  } = req.body;

  if (!isDateOnly(settlement_date)) {
    throw new ApiError(400, "Settlement date must use YYYY-MM-DD format.");
  }
  const futureOverrideReason = assertNotFutureDate(settlement_date, req, "Settlement date");
  if (!["refund", "transfer", "forfeit"].includes(deposit_remainder_action)) {
    throw new ApiError(400, "Deposit remainder action must be refund, transfer, or forfeit.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Customer not found.");
    }
    if (before.status === "inactive") {
      throw new ApiError(400, "Customer account is already inactive.");
    }

    const closureBill = await createClosureBill(client, before, settlement_date);
    await recordAuditEvent(client, {
      req,
      action: "bill.final_closure_created",
      entityType: "bill",
      entityId: closureBill.id,
      afterData: closureBill,
      reason: notes || futureOverrideReason || "Final bill generated before account closure"
    });

    const openingDebt = Math.max(await getCustomerBalanceDue(client, before.id), 0);
    const depositAvailable =
      apply_deposit && before.deposit_paid ? Math.max(toMoney(before.deposit_amount), 0) : 0;
    const depositAppliedAmount = Math.min(depositAvailable, openingDebt);
    const depositRemainder = toMoney(depositAvailable - depositAppliedAmount);
    let depositSettlement = null;
    const depositTransactions = [];

    if (depositAppliedAmount > 0) {
      depositSettlement = await createPaymentWithAllocations(
        client,
        req,
        {
          customer_id: before.id,
          amount: depositAppliedAmount,
          payment_date: settlement_date,
          payment_channel: "manual_adjustment",
          external_reference: `DEPOSIT-CLOSE-${before.acc_number}`,
          received_from: before.name,
          notes: notes || "Deposit applied to debt during account closure"
        },
        { auditReason: "Deposit settlement during account closure" }
      );
      depositTransactions.push(
        await recordDepositTransaction(client, req, {
          customer_id: before.id,
          action: "applied",
          amount: depositAppliedAmount,
          transaction_date: settlement_date,
          payment_id: depositSettlement.payment.id,
          notes: notes || "Deposit applied to debt during account closure"
        })
      );
    }

    let depositRefund = null;
    let depositTransfer = null;
    if (depositRemainder > 0) {
      if (deposit_remainder_action === "refund") {
        depositRefund = await createExpenseRecord(
          client,
          req,
          {
            expense_date: settlement_date,
            category: "Deposit Refund",
            vendor: before.name,
            description: `Deposit refund for ${before.acc_number}`,
            amount: depositRemainder,
            payment_channel: "manual_adjustment",
            reference: `DEPOSIT-REFUND-${before.acc_number}`,
            notes: notes || "Deposit refunded during account closure"
          },
          { auditReason: "Deposit refund during account closure" }
        );
        depositTransactions.push(
          await recordDepositTransaction(client, req, {
            customer_id: before.id,
            action: "refunded",
            amount: depositRemainder,
            transaction_date: settlement_date,
            expense_id: depositRefund.id,
            notes: notes || "Deposit refunded during account closure"
          })
        );
      } else if (deposit_remainder_action === "transfer") {
        const targetCustomerId = Number(transfer_customer_id);
        if (!targetCustomerId || targetCustomerId === Number(before.id)) {
          throw new ApiError(400, "Choose another customer account to receive the deposit transfer.");
        }
        const targetResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [
          targetCustomerId
        ]);
        const targetCustomer = targetResult.rows[0];
        if (!targetCustomer) throw new ApiError(404, "Transfer target customer not found.");
        depositTransfer = await createPaymentWithAllocations(
          client,
          req,
          {
            customer_id: targetCustomer.id,
            amount: depositRemainder,
            payment_date: settlement_date,
            payment_channel: "manual_adjustment",
            external_reference: `DEPOSIT-TRANSFER-${before.acc_number}`,
            received_from: before.name,
            notes: `Deposit transferred from ${before.acc_number}. ${notes}`.trim()
          },
          { auditReason: `Deposit transferred from closed account ${before.acc_number}` }
        );
        depositTransactions.push(
          await recordDepositTransaction(client, req, {
            customer_id: before.id,
            action: "transferred",
            amount: depositRemainder,
            transaction_date: settlement_date,
            target_customer_id: targetCustomer.id,
            payment_id: depositTransfer.payment.id,
            notes: `Deposit transferred to ${targetCustomer.acc_number}`
          })
        );
      } else {
        depositTransactions.push(
          await recordDepositTransaction(client, req, {
            customer_id: before.id,
            action: "forfeited",
            amount: depositRemainder,
            transaction_date: settlement_date,
            notes: notes || "Deposit forfeited during account closure"
          })
        );
      }
    }

    const closingBalance = await getCustomerBalanceDue(client, before.id);
    const updatedResult = await client.query(
      `UPDATE customers
       SET status = 'inactive',
           deposit_amount = CASE WHEN $5::numeric > 0 THEN 0 ELSE deposit_amount END,
           deposit_paid = CASE WHEN $5::numeric > 0 THEN FALSE ELSE deposit_paid END,
           deposit_paid_at = CASE WHEN $5::numeric > 0 THEN NULL ELSE deposit_paid_at END,
           closed_at = NOW(),
           closed_by = $2,
           closure_bill_id = $3,
           closure_reason = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [before.id, req.user.id, closureBill.id, notes || null, depositAvailable]
    );
    const after = updatedResult.rows[0];

    await recordAuditEvent(client, {
      req,
      action: "customer.account_closed",
      entityType: "customer",
      entityId: after.id,
      beforeData: before,
      afterData: {
        customer: after,
        final_bill: closureBill,
        opening_debt: openingDebt,
        closing_balance: closingBalance,
        deposit_settlement: depositSettlement?.payment || null,
        deposit_refund: depositRefund,
        deposit_transfer: depositTransfer?.payment || null,
        deposit_transactions: depositTransactions
      },
      reason: notes || futureOverrideReason || "Account closed"
    });

    await client.query("COMMIT");
    res.json({
      customer: after,
      final_bill: closureBill,
      opening_debt: openingDebt,
      closing_balance: closingBalance,
      deposit_settlement: depositSettlement,
      deposit_refund: depositRefund,
      deposit_transfer: depositTransfer,
      deposit_transactions: depositTransactions
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listCustomers,
  getCustomer,
  getCustomerStatement,
  previewCustomerImport,
  commitCustomerImport,
  previewOpeningBalanceImport,
  commitOpeningBalanceImport,
  closeCustomerAccount,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
