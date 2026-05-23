const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { createBillNumber, getMonthlyPeriodDates, getOrCreateBillingPeriod } = require("../services/billingPeriod.service");
const {
  assertBillingPeriodEditableById,
  normalizeCorrectionReason
} = require("../services/billingPeriodGuard.service");
const { recordAuditEvent } = require("../services/audit.service");
const { applyCustomerCreditToBill } = require("../services/credit.service");
const { calculateTariffCharge, getTariffWithBlocks } = require("../services/tariff.service");
const {
  assertMeterBelongsToCustomer,
  assertMeterRole,
  ensureActiveMeter,
  getActiveMeter,
  getPreviousReadingForMeter
} = require("../services/meter.service");

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
    throw new ApiError(400, "CSV must include a header row and at least one reading row.");
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

const normalizeOptionalReadingValue = (value, label) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ApiError(400, `${label} must be zero or greater.`);
  }
  return number;
};

const billingSourceForMeter = (meter) => (meter?.meter_role === "source_backup" ? "source_backup" : "client_meter");

const requireSourceFallbackReason = (meter, reason) => {
  if (meter?.meter_role === "source_backup" && !String(reason || "").trim()) {
    throw new ApiError(400, "A fallback reason is required when billing from a source-side meter.");
  }
};

const resolveReadingImportRows = async (client, csvText, { commitMode = false } = {}) => {
  const parsedRows = parseCsv(csvText);
  const importKeys = new Set();

  const resolvedRows = [];
  for (const row of parsedRows) {
    const errors = [];
    const warnings = [];
    const customerId = readImportValue(row, ["customer_id", "id"]);
    const accountNumber = readImportValue(row, ["acc_number", "account_number", "account", "customer_account"]);
    const meterNumber = readImportValue(row, ["meter_number", "meter"]);
    const readingDate = readImportValue(row, ["reading_date", "date"]);
    const readingValue = readImportValue(row, ["reading_value", "reading", "current_reading"]);
    const notes = readImportValue(row, ["notes", "note"]);
    const numericReading = Number(readingValue);
    const numericCustomerId = customerId ? Number(customerId) : null;

    if (!customerId && !accountNumber) errors.push("Customer ID or account number is required.");
    if (customerId && (!Number.isInteger(numericCustomerId) || numericCustomerId <= 0)) {
      errors.push("Customer ID must be a valid number.");
    }
    if (!readingDate || !isDateOnly(readingDate)) errors.push("Reading date must use YYYY-MM-DD.");
    if (readingValue === undefined || readingValue === "") {
      errors.push("Reading value is required.");
    } else if (!Number.isFinite(numericReading) || numericReading < 0) {
      errors.push("Reading value must be zero or greater.");
    }

    let customer = null;
    if (!errors.some((error) => error.includes("Customer"))) {
      const customerResult = await client.query(
        `SELECT c.*, r.amount AS rate
         FROM customers c
         JOIN rates r ON r.id = c.rate_id
         WHERE ($1::integer IS NOT NULL AND c.id = $1)
            OR ($2::text IS NOT NULL AND c.acc_number = $2)
         ORDER BY CASE WHEN $1::integer IS NOT NULL AND c.id = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [numericCustomerId, accountNumber || null]
      );
      customer = customerResult.rows[0] || null;
      if (!customer) errors.push("Customer was not found.");
    }

    let meter = null;
    if (customer && meterNumber) {
      const meterResult = await client.query("SELECT * FROM meters WHERE meter_number = $1", [meterNumber]);
      meter = meterResult.rows[0] || null;
      if (!meter) {
        errors.push("Meter number was not found.");
      } else if (Number(meter.customer_id) !== Number(customer.id)) {
        errors.push("Meter number does not belong to this customer.");
      }
    } else if (customer) {
      meter = await getActiveMeter(client, customer.id);
      if (!meter) warnings.push("No active meter found; one will be generated during import.");
    }

    const importKey = `${meter?.id || customer?.id || accountNumber || customerId}:${readingDate}`;
    if (readingDate && importKeys.has(importKey)) {
      errors.push("Duplicate reading for the same customer or meter and date in this CSV.");
    }
    importKeys.add(importKey);

    let previous = null;
    if (meter && readingDate && isDateOnly(readingDate)) {
      const existingResult = await client.query(
        "SELECT id FROM meter_readings WHERE meter_id = $1 AND reading_date = $2",
        [meter.id, readingDate]
      );
      if (existingResult.rows[0]) {
        errors.push("A reading already exists for this meter and date.");
      }

      previous = await getPreviousReadingForMeter(client, meter.id, readingDate);
      if (previous && Number.isFinite(numericReading) && numericReading < Number(previous.reading_value)) {
        errors.push("Reading value is lower than the previous reading.");
      }
    }

    resolvedRows.push({
      rowNumber: row.rowNumber,
      customer_id: customer?.id || numericCustomerId,
      customer_name: customer?.name || "",
      acc_number: customer?.acc_number || accountNumber || "",
      meter_id: meter?.id || null,
      meter_number: meter?.meter_number || meterNumber || "",
      reading_date: readingDate || "",
      reading_value: readingValue === undefined || readingValue === "" ? "" : numericReading,
      previous_reading_value: previous?.reading_value || null,
      notes: notes || null,
      bill_expected: Boolean(previous),
      errors,
      warnings,
      status: errors.length ? "invalid" : commitMode ? "ready" : "valid"
    });
  }

  const rowsByMeterOrCustomer = new Map();
  for (const row of resolvedRows.filter((resolved) => !resolved.errors.length)) {
    const key = row.meter_id ? `meter:${row.meter_id}` : `customer:${row.customer_id}`;
    const groupedRows = rowsByMeterOrCustomer.get(key) || [];
    groupedRows.push(row);
    rowsByMeterOrCustomer.set(key, groupedRows);
  }

  for (const groupedRows of rowsByMeterOrCustomer.values()) {
    groupedRows.sort(
      (left, right) =>
        String(left.reading_date).localeCompare(String(right.reading_date)) || left.rowNumber - right.rowNumber
    );

    let previousValue = null;
    for (const row of groupedRows) {
      if (previousValue !== null) {
        row.previous_reading_value = previousValue;
        row.bill_expected = true;
        if (Number(row.reading_value) < Number(previousValue)) {
          row.errors.push("Reading value is lower than another earlier reading in this CSV.");
        }
      } else if (row.previous_reading_value !== null && row.previous_reading_value !== undefined) {
        previousValue = Number(row.previous_reading_value);
      }

      if (!row.errors.length) {
        previousValue = Number(row.reading_value);
      }
      row.status = row.errors.length ? "invalid" : commitMode ? "ready" : "valid";
    }
  }

  return resolvedRows;
};

const createReadingWithBill = async (
  client,
  req,
  payload,
  { source = "field", auditReason = null, correctionReason = null } = {}
) => {
  const { customer_id, meter_id, reading_value, reading_date, notes, fallback_reason } = payload;

  const customerResult = await client.query(
    `SELECT c.*, r.amount AS rate
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     WHERE c.id = $1`,
    [customer_id]
  );
  const customer = customerResult.rows[0];
  if (!customer) {
    throw new ApiError(404, "Customer not found.");
  }

  let activeMeter = await ensureActiveMeter(client, customer);
  if (meter_id) {
    const meterResult = await client.query("SELECT * FROM meters WHERE id = $1", [meter_id]);
    activeMeter = meterResult.rows[0];
    assertMeterBelongsToCustomer(activeMeter, customer_id);
  }
  assertMeterRole(activeMeter, ["client_billing", "source_backup"]);
  requireSourceFallbackReason(activeMeter, fallback_reason || notes);

  const duplicateResult = await client.query(
    "SELECT id FROM meter_readings WHERE meter_id = $1 AND reading_date = $2",
    [activeMeter.id, reading_date]
  );
  if (duplicateResult.rows[0]) {
    throw new ApiError(400, "A reading already exists for this meter and date.");
  }

  const billingPeriod = await getOrCreateBillingPeriod(client, reading_date, req.user.id);
  const periodReason = await assertBillingPeriodEditableById(
    client,
    billingPeriod.id,
    req,
    correctionReason || auditReason,
    "create a reading"
  );
  const previous = await getPreviousReadingForMeter(client, activeMeter.id, reading_date);

  if (previous && Number(reading_value) < Number(previous.reading_value)) {
    throw new ApiError(400, "Current reading cannot be lower than previous reading.");
  }

  const readingResult = await client.query(
    `INSERT INTO meter_readings (
      customer_id, meter_id, billing_period_id, previous_reading_id, previous_reading_value,
      reading_value, reading_date, source, notes, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      customer_id,
      activeMeter.id,
      billingPeriod.id,
      previous?.id || null,
      previous?.reading_value || null,
      reading_value,
      reading_date,
      source,
      notes || null,
      req.user.id
    ]
  );
  const reading = readingResult.rows[0];
  await recordAuditEvent(client, {
    req,
    action: "reading.created",
    entityType: "meter_reading",
    entityId: reading.id,
    afterData: reading,
    reason: periodReason || auditReason
  });

  let bill = null;
  let sourceBillingRequest = null;
  if (previous) {
    const unitsUsed = Number(reading_value) - Number(previous.reading_value);
    const tariff = await getTariffWithBlocks(client, customer.rate_id, reading_date);
    const charge = calculateTariffCharge(tariff || customer, unitsUsed);
    const fallbackReason = String(fallback_reason || notes || "").trim();
    if (activeMeter.meter_role === "source_backup" && req.user.role !== "admin") {
      const requestResult = await client.query(
        `INSERT INTO source_billing_requests (
          customer_id, meter_id, billing_period_id, previous_reading_id, current_reading_id,
          previous_reading, current_reading, units_used, rate, amount, subtotal_amount,
          fixed_charge_amount, vat_amount, reconnection_fee_amount, tariff_snapshot, due_date,
          reason, requested_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15::jsonb, $16, $17, $18
        )
        ON CONFLICT (current_reading_id) DO UPDATE
        SET billing_period_id = EXCLUDED.billing_period_id,
            previous_reading_id = EXCLUDED.previous_reading_id,
            previous_reading = EXCLUDED.previous_reading,
            current_reading = EXCLUDED.current_reading,
            units_used = EXCLUDED.units_used,
            rate = EXCLUDED.rate,
            amount = EXCLUDED.amount,
            subtotal_amount = EXCLUDED.subtotal_amount,
            fixed_charge_amount = EXCLUDED.fixed_charge_amount,
            vat_amount = EXCLUDED.vat_amount,
            reconnection_fee_amount = EXCLUDED.reconnection_fee_amount,
            tariff_snapshot = EXCLUDED.tariff_snapshot,
            due_date = EXCLUDED.due_date,
            reason = EXCLUDED.reason,
            status = 'pending',
            updated_at = NOW()
        WHERE source_billing_requests.status = 'pending'
        RETURNING *`,
        [
          customer_id,
          activeMeter.id,
          billingPeriod.id,
          previous.id,
          reading.id,
          previous.reading_value,
          reading_value,
          unitsUsed,
          charge.rateAmount,
          charge.totalAmount,
          charge.subtotalAmount,
          charge.fixedChargeAmount,
          charge.vatAmount,
          charge.reconnectionFeeAmount,
          JSON.stringify(charge.tariffSnapshot),
          billingPeriod.due_date,
          fallbackReason,
          req.user.id
        ]
      );
      if (!requestResult.rows[0]) {
        throw new ApiError(400, "This source reading has already been reviewed and cannot be submitted again.");
      }
      await recordAuditEvent(client, {
        req,
        action: "source_billing_request.created",
        entityType: "source_billing_request",
        entityId: requestResult.rows[0].id,
        afterData: requestResult.rows[0],
        reason: fallbackReason
      });
      return { reading, bill: null, sourceBillingRequest: requestResult.rows[0] };
    }

    const competingPayableResult = activeMeter.meter_role === "source_backup"
      ? await client.query(
          `SELECT id
           FROM bills
           WHERE customer_id = $1
             AND billing_period_id = $2
             AND bill_pay_status = 'payable'
             AND billing_source <> 'source_backup'
           FOR UPDATE`,
          [customer_id, billingPeriod.id]
        )
      : { rows: [] };
    const hasClientBillConflict = competingPayableResult.rows.length > 0;
    const billNumber = await createBillNumber(client);
    const billResult = await client.query(
      `INSERT INTO bills (
        customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id,
        billing_month, previous_reading, current_reading, units_used, rate, amount,
        subtotal_amount, fixed_charge_amount, penalty_amount, vat_amount, reconnection_fee_amount,
        deposit_applied_amount, adjustment_amount, total_amount, balance_amount, tariff_snapshot, due_date,
        issued_at, billing_meter_id, billing_meter_role, billing_source, source_fallback_reason,
        bill_pay_status, payability_reason, promoted_by, promoted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, 0, $14, $15, 0, 0, $11, $11, $16::jsonb, $17,
        NOW(), $18, $19::varchar, $20::varchar, $21, $22::varchar, $23, $24, CASE WHEN $22::varchar = 'payable' THEN NOW() ELSE NULL END
      )
      RETURNING *`,
      [
        customer_id,
        billingPeriod.id,
        billNumber,
        previous.id,
        reading.id,
        billingPeriod.period_start,
        previous.reading_value,
        reading_value,
        unitsUsed,
        charge.rateAmount,
        charge.totalAmount,
        charge.subtotalAmount,
        charge.fixedChargeAmount,
        charge.vatAmount,
        charge.reconnectionFeeAmount,
        JSON.stringify(charge.tariffSnapshot),
        billingPeriod.due_date,
        activeMeter.id,
        activeMeter.meter_role,
        billingSourceForMeter(activeMeter),
        activeMeter.meter_role === "source_backup" ? fallbackReason : null,
        hasClientBillConflict ? "held" : "payable",
        hasClientBillConflict ? "Held pending source/client bill promotion choice" : null,
        hasClientBillConflict ? null : req.user.id
      ]
    );
    bill = billResult.rows[0];
    if (activeMeter.meter_role === "source_backup") {
      const requestResult = await client.query(
        `INSERT INTO source_billing_requests (
          customer_id, meter_id, billing_period_id, previous_reading_id, current_reading_id,
          previous_reading, current_reading, units_used, rate, amount, subtotal_amount,
          fixed_charge_amount, vat_amount, reconnection_fee_amount, tariff_snapshot, due_date,
          reason, status, bill_id, requested_by, reviewed_by, reviewed_at, review_notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15::jsonb, $16, $17, 'approved', $18, $19, $19, NOW(), $20
        )
        ON CONFLICT (current_reading_id) DO UPDATE
        SET billing_period_id = EXCLUDED.billing_period_id,
            previous_reading_id = EXCLUDED.previous_reading_id,
            previous_reading = EXCLUDED.previous_reading,
            current_reading = EXCLUDED.current_reading,
            units_used = EXCLUDED.units_used,
            rate = EXCLUDED.rate,
            amount = EXCLUDED.amount,
            subtotal_amount = EXCLUDED.subtotal_amount,
            fixed_charge_amount = EXCLUDED.fixed_charge_amount,
            vat_amount = EXCLUDED.vat_amount,
            reconnection_fee_amount = EXCLUDED.reconnection_fee_amount,
            tariff_snapshot = EXCLUDED.tariff_snapshot,
            due_date = EXCLUDED.due_date,
            reason = EXCLUDED.reason,
            status = 'approved',
            bill_id = EXCLUDED.bill_id,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_at = NOW(),
            review_notes = EXCLUDED.review_notes,
            updated_at = NOW()
        RETURNING *`,
        [
          customer_id,
          activeMeter.id,
          billingPeriod.id,
          previous.id,
          reading.id,
          previous.reading_value,
          reading_value,
          unitsUsed,
          charge.rateAmount,
          charge.totalAmount,
          charge.subtotalAmount,
          charge.fixedChargeAmount,
          charge.vatAmount,
          charge.reconnectionFeeAmount,
          JSON.stringify(charge.tariffSnapshot),
          billingPeriod.due_date,
          fallbackReason,
          bill.id,
          req.user.id,
          hasClientBillConflict ? "Approved by admin; held pending source/client bill promotion choice" : "Approved by admin"
        ]
      );
      sourceBillingRequest = requestResult.rows[0];
      if (!bill.source_billing_request_id) {
        const linkedBill = await client.query(
          `UPDATE bills
           SET source_billing_request_id = $1
           WHERE id = $2
           RETURNING *`,
          [sourceBillingRequest.id, bill.id]
        );
        bill = linkedBill.rows[0];
      }
      await recordAuditEvent(client, {
        req,
        action: "source_billing_request.approved",
        entityType: "source_billing_request",
        entityId: sourceBillingRequest.id,
        afterData: {
          request: sourceBillingRequest,
          bill
        },
        reason: fallbackReason
      });
    }
    if (bill.bill_pay_status === "payable") {
      const creditApplication = await applyCustomerCreditToBill(client, {
        customerId: bill.customer_id,
        billId: bill.id
      });
      if (creditApplication.appliedAmount > 0) {
        bill = creditApplication.bill;
        await recordAuditEvent(client, {
          req,
          action: "bill.credit_applied",
          entityType: "bill",
          entityId: bill.id,
          afterData: {
            bill,
            allocations: creditApplication.allocations,
            appliedAmount: creditApplication.appliedAmount
          },
          reason: periodReason || auditReason || "Customer credit auto-applied to new bill"
        });
      }
    }
    await recordAuditEvent(client, {
      req,
      action: "bill.created",
      entityType: "bill",
      entityId: bill.id,
      afterData: bill,
      reason: periodReason || auditReason || (activeMeter.meter_role === "source_backup" ? fallbackReason : null)
    });
  }

  return { reading, bill, sourceBillingRequest };
};

const listReadings = asyncHandler(async (req, res) => {
  const params = [];
  const scope =
    req.user.role === "customer" ? `WHERE mr.customer_id = $${params.push(req.user.customer_id || 0)}` : "";
  const { rows } = await pool.query(
    `SELECT mr.*,
            c.name AS customer_name,
            c.acc_number,
            m.meter_number,
            m.meter_role,
            sbr.id AS source_billing_request_id,
            sbr.status AS source_billing_request_status,
            prev.reading_date AS previous_reading_date,
            bp.name AS billing_period_name,
            bp.status AS billing_period_status,
            u.name AS created_by_name
     FROM meter_readings mr
     JOIN customers c ON c.id = mr.customer_id
     LEFT JOIN meters m ON m.id = mr.meter_id
     LEFT JOIN source_billing_requests sbr ON sbr.current_reading_id = mr.id
     LEFT JOIN meter_readings prev ON prev.id = mr.previous_reading_id
     LEFT JOIN billing_periods bp ON bp.id = mr.billing_period_id
     LEFT JOIN users u ON u.id = mr.created_by
     ${scope}
     ORDER BY mr.reading_date DESC, mr.created_at DESC
     LIMIT 200`,
    params
  );
  res.json(rows);
});

const getReadingContext = asyncHandler(async (req, res) => {
  const customerId = Number(req.query.customer_id);
  const readingDate = req.query.reading_date || new Date().toISOString().slice(0, 10);
  const selectedMeterId = Number(req.query.meter_id || 0);

  if (!customerId) {
    throw new ApiError(400, "Customer is required.");
  }

  if (req.user.role === "customer" && Number(req.user.customer_id) !== customerId) {
    throw new ApiError(403, "You do not have permission to view this reading context.");
  }

  const client = await pool.connect();
  try {
    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    const availableMetersResult = await client.query(
      `SELECT *
       FROM meters
       WHERE customer_id = $1
         AND status = 'active'
         AND meter_role IN ('client_billing', 'source_backup')
       ORDER BY
         CASE meter_role WHEN 'client_billing' THEN 0 WHEN 'source_backup' THEN 1 ELSE 2 END,
         installed_at DESC,
         id DESC`,
      [customerId]
    );
    const activeMeter = selectedMeterId
      ? availableMetersResult.rows.find((meter) => Number(meter.id) === selectedMeterId)
      : await ensureActiveMeter(client, customer);
    if (!activeMeter) {
      throw new ApiError(404, "Selected meter was not found for this customer.");
    }
    const availableMeters = availableMetersResult.rows.some((meter) => Number(meter.id) === Number(activeMeter.id))
      ? availableMetersResult.rows
      : [activeMeter, ...availableMetersResult.rows];
    const previousReading = await getPreviousReadingForMeter(client, activeMeter.id, readingDate);
    const period = getMonthlyPeriodDates(readingDate);
    const periodResult = await client.query("SELECT id, status FROM billing_periods WHERE period_start = $1", [
      period.periodStart
    ]);
    const savedPeriod = periodResult.rows[0] || null;

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        acc_number: customer.acc_number
      },
      activeMeter,
      availableMeters,
      previousReading,
      billingPeriod: {
        ...period,
        id: savedPeriod?.id || null,
        status: savedPeriod?.status || "open"
      }
    });
  } finally {
    client.release();
  }
});

const createReading = asyncHandler(async (req, res) => {
  const { customer_id, meter_id, reading_value, reading_date, notes, fallback_reason } = req.body;

  if (!customer_id || reading_value === undefined || !reading_date) {
    throw new ApiError(400, "Customer, reading value, and reading date are required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { reading, bill, sourceBillingRequest } = await createReadingWithBill(
      client,
      req,
      { customer_id, meter_id, reading_value, reading_date, notes, fallback_reason },
      { source: "field", correctionReason: normalizeCorrectionReason(req.body) }
    );

    await client.query("COMMIT");
    res.status(201).json({ reading, bill, sourceBillingRequest });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const previewReadingImport = asyncHandler(async (req, res) => {
  const rows = await resolveReadingImportRows(pool, req.body.csv);
  res.json({
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => !row.errors.length).length,
      invalid: rows.filter((row) => row.errors.length).length,
      billsExpected: rows.filter((row) => row.bill_expected && !row.errors.length).length
    }
  });
});

const commitReadingImport = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const correctionReason = normalizeCorrectionReason(req.body);
    const rows = await resolveReadingImportRows(client, req.body.csv, { commitMode: true });
    const invalidRows = rows.filter((row) => row.errors.length);

    if (invalidRows.length) {
      throw new ApiError(400, "CSV still has invalid rows. Preview and fix the errors before import.");
    }

    const orderedRows = [...rows].sort((left, right) => {
      if (left.customer_id !== right.customer_id) return left.customer_id - right.customer_id;
      return String(left.reading_date).localeCompare(String(right.reading_date)) || left.rowNumber - right.rowNumber;
    });

    const imported = [];
    for (const row of orderedRows) {
      const result = await createReadingWithBill(
        client,
        req,
        {
          customer_id: row.customer_id,
          meter_id: row.meter_id,
          reading_value: row.reading_value,
          reading_date: row.reading_date,
          notes: row.notes
        },
        {
          source: "csv_import",
          auditReason: `CSV reading import row ${row.rowNumber}`,
          correctionReason
        }
      );

      imported.push({
        rowNumber: row.rowNumber,
        reading_id: result.reading.id,
        bill_id: result.bill?.id || null,
        customer_name: row.customer_name,
        acc_number: row.acc_number,
        reading_date: row.reading_date,
        reading_value: row.reading_value
      });
    }

    await recordAuditEvent(client, {
      req,
      action: "reading_import.committed",
      entityType: "reading_import",
      afterData: {
        totalRows: rows.length,
        importedRows: imported.length,
        billCount: imported.filter((row) => row.bill_id).length
      }
    });

    await client.query("COMMIT");
    res.status(201).json({
      imported,
      summary: {
        total: rows.length,
        imported: imported.length,
        billsCreated: imported.filter((row) => row.bill_id).length
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const recalculateBillForReading = async (
  client,
  readingId,
  { req = null, correctionReason = null, action = "recalculate a bill", baseReadingValue = null } = {}
) => {
  const readingResult = await client.query(
    `SELECT mr.*, c.rate, c.rate_id, c.acc_number, c.name AS customer_name,
            m.meter_role
     FROM meter_readings mr
     JOIN customers c ON c.id = mr.customer_id
     LEFT JOIN meters m ON m.id = mr.meter_id
     WHERE mr.id = $1`,
    [readingId]
  );
  const reading = readingResult.rows[0];
  if (!reading) return null;

  const customer = {
    id: reading.customer_id,
    acc_number: reading.acc_number
  };
  const activeMeter = reading.meter_id
    ? { id: reading.meter_id, customer_id: reading.customer_id, meter_role: reading.meter_role || "client_billing" }
    : await ensureActiveMeter(client, customer);
  assertMeterRole(activeMeter, ["client_billing", "source_backup"]);
  const billingPeriod = await getOrCreateBillingPeriod(client, reading.reading_date, req?.user?.id || null);
  if (req) {
    await assertBillingPeriodEditableById(client, billingPeriod.id, req, correctionReason, action);
  }
  const previous =
    (await getPreviousReadingForMeter(client, activeMeter.id, reading.reading_date, reading.id)) ||
    (baseReadingValue !== null || reading.previous_reading_value !== null
      ? {
          id: null,
          reading_value: baseReadingValue !== null ? baseReadingValue : reading.previous_reading_value
        }
      : null);

  await client.query(
    `UPDATE meter_readings
     SET meter_id = $1,
         billing_period_id = $2,
         previous_reading_id = $3,
         previous_reading_value = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [activeMeter.id, billingPeriod.id, previous?.id || null, previous?.reading_value ?? null, reading.id]
  );

  const existingBillResult = await client.query(
    "SELECT * FROM bills WHERE current_reading_id = $1 FOR UPDATE",
    [reading.id]
  );
  const existingBill = existingBillResult.rows[0];

  if (!previous) {
    if (existingBill && Number(existingBill.paid_amount) > 0) {
      throw new ApiError(400, "Cannot make a paid/partial billed reading the baseline reading.");
    }

    if (existingBill) {
      await client.query("DELETE FROM bills WHERE id = $1", [existingBill.id]);
    }
    return null;
  }

  if (Number(reading.reading_value) < Number(previous.reading_value)) {
    throw new ApiError(400, "Reading cannot be lower than the previous reading.");
  }

  const unitsUsed = Number(reading.reading_value) - Number(previous.reading_value);
  const tariff = await getTariffWithBlocks(client, reading.rate_id, reading.reading_date);
  const charge = calculateTariffCharge(tariff || reading, unitsUsed);
  const totalAmount = charge.totalAmount;
  const sourceRequestResult = await client.query(
    "SELECT * FROM source_billing_requests WHERE current_reading_id = $1 FOR UPDATE",
    [reading.id]
  );
  const sourceRequest = sourceRequestResult.rows[0] || null;
  const sourceFallbackReason = sourceRequest?.reason || reading.notes || correctionReason || null;
  requireSourceFallbackReason(activeMeter, sourceFallbackReason);

  if (activeMeter.meter_role === "source_backup" && !existingBill && req?.user?.role !== "admin") {
    const requestResult = await client.query(
      `INSERT INTO source_billing_requests (
        customer_id, meter_id, billing_period_id, previous_reading_id, current_reading_id,
        previous_reading, current_reading, units_used, rate, amount, subtotal_amount,
        fixed_charge_amount, vat_amount, reconnection_fee_amount, tariff_snapshot, due_date,
        reason, requested_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15::jsonb, $16, $17, $18
      )
      ON CONFLICT (current_reading_id) DO UPDATE
      SET billing_period_id = EXCLUDED.billing_period_id,
          previous_reading_id = EXCLUDED.previous_reading_id,
          previous_reading = EXCLUDED.previous_reading,
          current_reading = EXCLUDED.current_reading,
          units_used = EXCLUDED.units_used,
          rate = EXCLUDED.rate,
          amount = EXCLUDED.amount,
          subtotal_amount = EXCLUDED.subtotal_amount,
          fixed_charge_amount = EXCLUDED.fixed_charge_amount,
          vat_amount = EXCLUDED.vat_amount,
          reconnection_fee_amount = EXCLUDED.reconnection_fee_amount,
          tariff_snapshot = EXCLUDED.tariff_snapshot,
          due_date = EXCLUDED.due_date,
          reason = EXCLUDED.reason,
          status = 'pending',
          updated_at = NOW()
      WHERE source_billing_requests.status = 'pending'
      RETURNING *`,
      [
        reading.customer_id,
        activeMeter.id,
        billingPeriod.id,
        previous.id,
        reading.id,
        previous.reading_value,
        reading.reading_value,
        unitsUsed,
        charge.rateAmount,
        totalAmount,
        charge.subtotalAmount,
        charge.fixedChargeAmount,
        charge.vatAmount,
        charge.reconnectionFeeAmount,
        JSON.stringify(charge.tariffSnapshot),
        billingPeriod.due_date,
        sourceFallbackReason,
        req.user.id
      ]
    );
    if (!requestResult.rows[0]) {
      throw new ApiError(400, "This source reading has already been reviewed and cannot be submitted again.");
    }
    if (req) {
      await recordAuditEvent(client, {
        req,
        action: "source_billing_request.updated",
        entityType: "source_billing_request",
        entityId: requestResult.rows[0].id,
        afterData: requestResult.rows[0],
        reason: sourceFallbackReason
      });
    }
    return null;
  }

  if (existingBill) {
    const nextPaidAmount = Math.min(Number(existingBill.paid_amount), totalAmount);
    const nextStatus = nextPaidAmount <= 0 ? "unpaid" : nextPaidAmount >= totalAmount ? "paid" : "partial";
    const nextBalanceAmount = Math.max(totalAmount - nextPaidAmount, 0);
    const billResult = await client.query(
      `UPDATE bills
       SET previous_reading_id = $1,
           billing_period_id = $2,
           billing_month = $3,
           previous_reading = $4,
           current_reading = $5,
           units_used = $6,
           rate = $7,
           amount = $8,
           subtotal_amount = $9,
           fixed_charge_amount = $10,
           penalty_amount = 0,
           vat_amount = $11,
           reconnection_fee_amount = $12,
           deposit_applied_amount = 0,
           adjustment_amount = 0,
           total_amount = $8,
           balance_amount = $13,
           paid_amount = $14,
           status = $15::varchar,
           tariff_snapshot = $16::jsonb,
           due_date = $17,
           billing_meter_id = $18,
           billing_meter_role = $19,
           billing_source = $20,
           source_fallback_reason = $21,
           paid_at = CASE WHEN $15::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END,
           issued_at = COALESCE(issued_at, NOW())
       WHERE id = $22
       RETURNING *`,
      [
        previous.id,
        billingPeriod.id,
        billingPeriod.period_start,
        previous.reading_value,
        reading.reading_value,
        unitsUsed,
        charge.rateAmount,
        totalAmount,
        charge.subtotalAmount,
        charge.fixedChargeAmount,
        charge.vatAmount,
        charge.reconnectionFeeAmount,
        nextBalanceAmount,
        nextPaidAmount,
        nextStatus,
        JSON.stringify(charge.tariffSnapshot),
        billingPeriod.due_date,
        activeMeter.id,
        activeMeter.meter_role,
        billingSourceForMeter(activeMeter),
        activeMeter.meter_role === "source_backup" ? sourceFallbackReason : null,
        existingBill.id
      ]
    );
    const bill = billResult.rows[0];
    if (bill.bill_pay_status !== "payable") return bill;
    const creditApplication = await applyCustomerCreditToBill(client, {
      customerId: bill.customer_id,
      billId: bill.id
    });
    return creditApplication.appliedAmount > 0 ? creditApplication.bill : bill;
  }

  const recalcCompetingPayableResult = activeMeter.meter_role === "source_backup"
    ? await client.query(
        `SELECT id
         FROM bills
         WHERE customer_id = $1
           AND billing_period_id = $2
           AND bill_pay_status = 'payable'
           AND billing_source <> 'source_backup'
         FOR UPDATE`,
        [reading.customer_id, billingPeriod.id]
      )
    : { rows: [] };
  const recalcHasClientBillConflict = recalcCompetingPayableResult.rows.length > 0;
  const billNumber = await createBillNumber(client);
  const billResult = await client.query(
    `INSERT INTO bills (
      customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id,
      billing_month, previous_reading, current_reading, units_used, rate, amount,
      subtotal_amount, fixed_charge_amount, penalty_amount, vat_amount, reconnection_fee_amount,
      deposit_applied_amount, adjustment_amount, total_amount, balance_amount, tariff_snapshot, due_date,
      issued_at, billing_meter_id, billing_meter_role, billing_source, source_fallback_reason,
      bill_pay_status, payability_reason, promoted_by, promoted_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, 0, $14, $15, 0, 0, $11, $11, $16::jsonb, $17,
      NOW(), $18, $19::varchar, $20::varchar, $21, $22::varchar, $23, $24, CASE WHEN $22::varchar = 'payable' THEN NOW() ELSE NULL END
    )
    RETURNING *`,
    [
      reading.customer_id,
      billingPeriod.id,
      billNumber,
      previous.id,
      reading.id,
      billingPeriod.period_start,
      previous.reading_value,
      reading.reading_value,
      unitsUsed,
      charge.rateAmount,
      charge.totalAmount,
      charge.subtotalAmount,
      charge.fixedChargeAmount,
      charge.vatAmount,
      charge.reconnectionFeeAmount,
      JSON.stringify(charge.tariffSnapshot),
      billingPeriod.due_date,
      activeMeter.id,
      activeMeter.meter_role,
      billingSourceForMeter(activeMeter),
      activeMeter.meter_role === "source_backup" ? sourceFallbackReason : null,
      recalcHasClientBillConflict ? "held" : "payable",
      recalcHasClientBillConflict ? "Held pending source/client bill promotion choice" : null,
      recalcHasClientBillConflict ? null : req?.user?.id || null
    ]
  );
  const bill = billResult.rows[0];
  if (bill.bill_pay_status !== "payable") return bill;
  const creditApplication = await applyCustomerCreditToBill(client, {
    customerId: bill.customer_id,
    billId: bill.id
  });
  return creditApplication.appliedAmount > 0 ? creditApplication.bill : bill;
};

const updateReading = asyncHandler(async (req, res) => {
  const { customer_id, reading_value, reading_date } = req.body;
  const correctionReason = normalizeCorrectionReason(req.body);
  const baseReadingValue = normalizeOptionalReadingValue(req.body.previous_reading_value, "Base reading");

  if (!customer_id || reading_value === undefined || !reading_date) {
    throw new ApiError(400, "Customer, reading value, and reading date are required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingResult = await client.query("SELECT * FROM meter_readings WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new ApiError(404, "Reading not found.");
    }
    await assertBillingPeriodEditableById(
      client,
      existing.billing_period_id,
      req,
      correctionReason,
      "edit an existing reading"
    );

    const oldNextResult = await client.query(
      `SELECT id FROM meter_readings
       WHERE (($1::integer IS NOT NULL AND meter_id = $1) OR ($1::integer IS NULL AND customer_id = $2))
         AND reading_date > $3
       ORDER BY reading_date ASC, id ASC
       LIMIT 1`,
      [existing.meter_id || null, existing.customer_id, existing.reading_date]
    );

    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customer_id]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    let activeMeter = null;
    if (Number(existing.customer_id) === Number(customer_id) && existing.meter_id) {
      const meterResult = await client.query("SELECT * FROM meters WHERE id = $1", [existing.meter_id]);
      activeMeter = meterResult.rows[0];
    }
    if (!activeMeter) {
      activeMeter = await ensureActiveMeter(client, customer);
    }

    assertMeterBelongsToCustomer(activeMeter, customer_id);
    const billingPeriod = await getOrCreateBillingPeriod(client, reading_date, req.user.id);
    await assertBillingPeriodEditableById(
      client,
      billingPeriod.id,
      req,
      correctionReason,
      "move a reading into this period"
    );
    const actualPrevious = await getPreviousReadingForMeter(client, activeMeter.id, reading_date, req.params.id);
    const previous = actualPrevious || (baseReadingValue !== null ? { id: null, reading_value: baseReadingValue } : null);

    if (previous && Number(reading_value) < Number(previous.reading_value)) {
      throw new ApiError(400, "Reading cannot be lower than the previous reading.");
    }

    const updatedResult = await client.query(
      `UPDATE meter_readings
       SET customer_id = $1,
           meter_id = $2,
           billing_period_id = $3,
           previous_reading_id = $4,
           previous_reading_value = $5,
           reading_value = $6,
           reading_date = $7,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        customer_id,
        activeMeter.id,
        billingPeriod.id,
        previous?.id || null,
        previous?.reading_value ?? null,
        reading_value,
        reading_date,
        req.user.id,
        req.params.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "reading.updated",
      entityType: "meter_reading",
      entityId: updatedResult.rows[0].id,
      beforeData: existing,
      afterData: updatedResult.rows[0],
      reason: correctionReason || null
    });

    const bill = await recalculateBillForReading(client, updatedResult.rows[0].id, {
      req,
      correctionReason,
      baseReadingValue: actualPrevious ? null : baseReadingValue,
      action: "recalculate a bill after editing a reading"
    });
    if (bill) {
      await recordAuditEvent(client, {
        req,
        action: "bill.recalculated",
        entityType: "bill",
        entityId: bill.id,
        afterData: bill,
        reason: correctionReason || "Reading update recalculated bill"
      });
    }

    const nextResult = await client.query(
      `SELECT id FROM meter_readings
       WHERE meter_id = $1 AND reading_date > $2
       ORDER BY reading_date ASC, id ASC
       LIMIT 1`,
      [activeMeter.id, reading_date]
    );

    let nextBill = null;
    if (nextResult.rows[0]) {
      nextBill = await recalculateBillForReading(client, nextResult.rows[0].id, {
        req,
        correctionReason,
        action: "recalculate an adjacent bill after editing a reading"
      });
      if (nextBill) {
        await recordAuditEvent(client, {
          req,
          action: "bill.recalculated",
          entityType: "bill",
          entityId: nextBill.id,
          afterData: nextBill,
          reason: correctionReason || "Adjacent reading update recalculated bill"
        });
      }
    }

    let oldNextBill = null;
    if (
      oldNextResult.rows[0] &&
      oldNextResult.rows[0].id !== updatedResult.rows[0].id &&
      oldNextResult.rows[0].id !== nextResult.rows[0]?.id
    ) {
      oldNextBill = await recalculateBillForReading(client, oldNextResult.rows[0].id, {
        req,
        correctionReason,
        action: "recalculate a previous sequence bill after editing a reading"
      });
      if (oldNextBill) {
        await recordAuditEvent(client, {
          req,
          action: "bill.recalculated",
          entityType: "bill",
          entityId: oldNextBill.id,
          afterData: oldNextBill,
          reason: correctionReason || "Previous meter sequence recalculated bill"
        });
      }
    }

    await client.query("COMMIT");
    res.json({ reading: updatedResult.rows[0], bill, nextBill, oldNextBill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  commitReadingImport,
  getReadingContext,
  listReadings,
  createReading,
  previewReadingImport,
  recalculateBillForReading,
  updateReading
};
