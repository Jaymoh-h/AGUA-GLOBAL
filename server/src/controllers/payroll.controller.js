const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { assertNoFutureDates } = require("../services/dateGuard.service");
const { createExpenseRecord } = require("./expense.controller");

const payeeTypes = ["employee", "casual", "contractor", "subscription"];
const recurringPayeeTypes = ["employee", "subscription"];
const periodOnlyPayeeTypes = ["casual", "contractor"];
const rateBases = ["monthly", "daily", "hourly", "invoice", "subscription"];
const paymentChannels = ["cash", "bank", "mpesa_paybill", "manual_adjustment"];
const runStatuses = ["draft", "pending_approval", "approved", "paid", "locked", "cancelled"];
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const normalizeMoney = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ApiError(400, "Amounts must be zero or greater.");
  return parsed;
};

const readMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    throw new ApiError(400, "Metadata must be a valid JSON object.");
  }
};

const parseDateOnly = (value, fieldName) => {
  if (!value) return null;
  if (!isDateOnly(value)) throw new ApiError(400, `${fieldName} must use YYYY-MM-DD format.`);
  return value;
};

const defaultRateBasisForType = (payeeType) =>
  ({
    employee: "monthly",
    casual: "daily",
    contractor: "invoice",
    subscription: "subscription"
  })[payeeType] || "monthly";

const buildPayeePayload = (payload, { recurrenceType, startDate = null, endDate = null }) => {
  const payeeType = payload.payee_type;
  const rateBasis = payload.rate_basis || defaultRateBasisForType(payeeType);
  if (!payeeTypes.includes(payeeType)) throw new ApiError(400, "Payee type is invalid.");
  if (!String(payload.name || "").trim()) throw new ApiError(400, "Payee name is required.");
  if (!rateBases.includes(rateBasis)) throw new ApiError(400, "Rate basis is invalid.");
  if (!paymentChannels.includes(payload.payment_channel || "bank")) throw new ApiError(400, "Payment channel is invalid.");

  return {
    payee_type: payeeType,
    name: String(payload.name || "").trim(),
    code: String(payload.code || "").trim(),
    title: String(payload.title || "").trim(),
    rate_amount: normalizeMoney(payload.rate_amount),
    rate_basis: rateBasis,
    default_additions: normalizeMoney(payload.default_additions),
    default_deductions: normalizeMoney(payload.default_deductions),
    payment_channel: payload.payment_channel || "bank",
    recurrence_type: recurrenceType,
    start_date: startDate,
    end_date: endDate,
    metadata: readMetadata(payload.metadata)
  };
};

const createPayeeRecord = async (client, req, payload) => {
  const result = await client.query(
    `INSERT INTO payroll_payees (
      payee_type, name, code, title, rate_amount, rate_basis,
      default_additions, default_deductions, payment_channel, metadata,
      recurrence_type, start_date, end_date, created_by
    )
    VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_DATE), $13, $14)
    RETURNING *`,
    [
      payload.payee_type,
      payload.name,
      payload.code,
      payload.title,
      payload.rate_amount,
      payload.rate_basis,
      payload.default_additions,
      payload.default_deductions,
      payload.payment_channel,
      payload.metadata,
      payload.recurrence_type,
      payload.start_date,
      payload.end_date,
      req.user.id
    ]
  );

  await recordAuditEvent(client, {
    req,
    action: "payroll_payee.created",
    entityType: "payroll_payee",
    entityId: result.rows[0].id,
    afterData: result.rows[0]
  });

  return result.rows[0];
};

const defaultUnitsForPayee = (payee) => {
  const metadata = readMetadata(payee.metadata);
  const configuredUnits = Number(metadata.default_units);
  if (Number.isFinite(configuredUnits) && configuredUnits >= 0) return configuredUnits;
  if (payee.rate_basis === "daily" || payee.rate_basis === "hourly") return 0;
  return 1;
};

const calculateLine = (payee) => {
  const sourceUnits = defaultUnitsForPayee(payee);
  const baseAmount = Number(payee.rate_amount || 0) * sourceUnits;
  const additions = Number(payee.default_additions || 0);
  const deductions = Number(payee.default_deductions || 0);
  const netAmount = Math.max(baseAmount + additions - deductions, 0);
  return {
    sourceUnits,
    grossAmount: baseAmount,
    additions,
    deductions,
    netAmount
  };
};

const payrollExpenseCategory = (payeeType) =>
  ({
    employee: "Payroll - Employees",
    casual: "Payroll - Casuals",
    contractor: "Payroll - Contractors",
    subscription: "Payroll - Subscriptions"
  })[payeeType] || "Payroll";

const payrollExpenseDescription = (run, line) =>
  `${payrollExpenseCategory(line.payee_type)}: ${line.name} (${run.name}, ${run.period_start} to ${run.period_end})`;

const postPayrollExpenses = async (client, req, run) => {
  const { rows: lines } = await client.query(
    `SELECT pli.*,
            pp.name,
            pp.code,
            pp.payment_channel
     FROM payroll_line_items pli
     JOIN payroll_payees pp ON pp.id = pli.payee_id
     WHERE pli.payroll_run_id = $1
       AND pli.status NOT IN ('held', 'cancelled')
       AND pli.expense_id IS NULL
       AND pli.net_amount > 0
     ORDER BY pli.id ASC
     FOR UPDATE OF pli`,
    [run.id]
  );

  const posted = [];
  for (const line of lines) {
    const expense = await createExpenseRecord(
      client,
      req,
      {
        expense_date: run.period_end,
        category: payrollExpenseCategory(line.payee_type),
        vendor: line.name,
        description: payrollExpenseDescription(run, line),
        amount: line.net_amount,
        payment_channel: line.payment_channel,
        reference: `PAYRUN-${run.id}-LINE-${line.id}`,
        notes: line.notes || `Posted from payroll run ${run.name}.`
      },
      { auditReason: `Payroll run #${run.id} paid` }
    );

    const updatedLine = await client.query(
      `UPDATE payroll_line_items
       SET expense_id = $1,
           paid_by = $2,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, expense_id, paid_by, paid_at`,
      [expense.id, req.user.id, line.id]
    );
    posted.push({ line: updatedLine.rows[0], expense });
  }

  return posted;
};

const recalculateRunTotals = async (client, runId) => {
  const { rows } = await client.query(
    `UPDATE payroll_runs
     SET total_gross = totals.total_gross,
         total_deductions = totals.total_deductions,
         total_net = totals.total_net,
         updated_at = NOW()
     FROM (
       SELECT
         COALESCE(SUM(gross_amount + additions), 0) AS total_gross,
         COALESCE(SUM(deductions), 0) AS total_deductions,
         COALESCE(SUM(net_amount), 0) AS total_net
       FROM payroll_line_items
       WHERE payroll_run_id = $1
         AND status <> 'cancelled'
     ) totals
     WHERE payroll_runs.id = $1
     RETURNING payroll_runs.*`,
    [runId]
  );
  return rows[0];
};

const fetchRun = async (client, runId) => {
  const runResult = await client.query(
    `SELECT pr.*,
            creator.name AS created_by_name,
            approver.name AS approved_by_name,
            payer.name AS paid_by_name
     FROM payroll_runs pr
     LEFT JOIN users creator ON creator.id = pr.created_by
     LEFT JOIN users approver ON approver.id = pr.approved_by
     LEFT JOIN users payer ON payer.id = pr.paid_by
     WHERE pr.id = $1`,
    [runId]
  );
  const run = runResult.rows[0];
  if (!run) throw new ApiError(404, "Payroll run not found.");

  const lineResult = await client.query(
    `SELECT pli.*,
            pp.name,
            pp.code,
            pp.title,
            pp.rate_amount,
            pp.rate_basis,
            pp.payment_channel,
            pp.recurrence_type,
            pp.start_date AS payee_start_date,
            pp.end_date AS payee_end_date,
            pp.status AS payee_status,
            e.expense_date,
            e.category AS expense_category,
            e.reference AS expense_reference
     FROM payroll_line_items pli
     JOIN payroll_payees pp ON pp.id = pli.payee_id
     LEFT JOIN expenses e ON e.id = pli.expense_id
     WHERE pli.payroll_run_id = $1
     ORDER BY
       CASE pli.payee_type
         WHEN 'employee' THEN 1
         WHEN 'casual' THEN 2
         WHEN 'contractor' THEN 3
         ELSE 4
       END,
       pp.name ASC`,
    [runId]
  );

  return { ...run, lines: lineResult.rows };
};

const listPayees = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT pp.*, creator.name AS created_by_name
     FROM payroll_payees pp
     LEFT JOIN users creator ON creator.id = pp.created_by
     ORDER BY
       CASE pp.payee_type
         WHEN 'employee' THEN 1
         WHEN 'casual' THEN 2
         WHEN 'contractor' THEN 3
         ELSE 4
       END,
       pp.name ASC`
  );
  res.json(rows);
});

const createPayee = asyncHandler(async (req, res) => {
  if (!recurringPayeeTypes.includes(req.body.payee_type)) {
    throw new ApiError(400, "Only employees and subscriptions can be created as recurring payroll payees.");
  }
  const startDate = parseDateOnly(req.body.start_date, "Start date");
  const payeePayload = buildPayeePayload(req.body, { recurrenceType: "recurring", startDate });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payee = await createPayeeRecord(client, req, payeePayload);

    await client.query("COMMIT");
    res.status(201).json(payee);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listRuns = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT pr.*,
            creator.name AS created_by_name,
            COUNT(pli.id) AS line_count
     FROM payroll_runs pr
     LEFT JOIN users creator ON creator.id = pr.created_by
     LEFT JOIN payroll_line_items pli ON pli.payroll_run_id = pr.id
     GROUP BY pr.id, creator.name
     ORDER BY pr.period_start DESC, pr.created_at DESC
     LIMIT 80`
  );
  res.json(rows);
});

const getRun = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    res.json(await fetchRun(client, req.params.id));
  } finally {
    client.release();
  }
});

const createRun = asyncHandler(async (req, res) => {
  const { name, period_start, period_end, payee_type = "", notes = "" } = req.body;
  if (!isDateOnly(period_start) || !isDateOnly(period_end)) {
    throw new ApiError(400, "Payroll period dates must use YYYY-MM-DD format.");
  }
  const futureOverrideReason = assertNoFutureDates(
    [
      { value: period_start, label: "Payroll period start" },
      { value: period_end, label: "Payroll period end" }
    ],
    req
  );
  if (period_end < period_start) throw new ApiError(400, "Period end cannot be before period start.");
  if (payee_type && !recurringPayeeTypes.includes(payee_type)) {
    throw new ApiError(400, "Pay runs can auto-include employees, subscriptions, or all recurring payees.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payeeResult = await client.query(
      `SELECT *
       FROM payroll_payees
       WHERE recurrence_type = 'recurring'
         AND status IN ('active', 'terminated')
         AND COALESCE(start_date, CURRENT_DATE) <= $3
         AND (end_date IS NULL OR end_date >= $2)
         AND ($1::text = '' OR payee_type = $1)
       ORDER BY name ASC
       FOR SHARE`,
      [payee_type, period_start, period_end]
    );

    const runResult = await client.query(
      `INSERT INTO payroll_runs (name, period_start, period_end, notes, created_by)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5)
       RETURNING *`,
      [
        String(name || "").trim() || `Payroll ${period_start} to ${period_end}`,
        period_start,
        period_end,
        String(notes || "").trim(),
        req.user.id
      ]
    );
    const run = runResult.rows[0];

    for (const payee of payeeResult.rows) {
      const line = calculateLine(payee);
      await client.query(
        `INSERT INTO payroll_line_items (
          payroll_run_id, payee_id, payee_type, source_units, gross_amount,
          additions, deductions, net_amount, metadata, source_type, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'auto_recurring', $10)`,
        [
          run.id,
          payee.id,
          payee.payee_type,
          line.sourceUnits,
          line.grossAmount,
          line.additions,
          line.deductions,
          line.netAmount,
          readMetadata(payee.metadata),
          req.user.id
        ]
      );
    }

    const updatedRun = await recalculateRunTotals(client, run.id);
    await recordAuditEvent(client, {
      req,
      action: "payroll_run.created",
      entityType: "payroll_run",
      entityId: run.id,
      afterData: {
        run: updatedRun,
        recurringPayeesGenerated: payeeResult.rows.length
      },
      reason: futureOverrideReason
    });

    await client.query("COMMIT");
    res.status(201).json(await fetchRun(client, run.id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const addRunLineItem = asyncHandler(async (req, res) => {
  if (!periodOnlyPayeeTypes.includes(req.body.payee_type)) {
    throw new ApiError(400, "Only casuals and contractors can be added directly to a payroll period.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const runResult = await client.query("SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE", [req.params.id]);
    const run = runResult.rows[0];
    if (!run) throw new ApiError(404, "Payroll run not found.");
    if (!["draft", "pending_approval"].includes(run.status)) {
      throw new ApiError(400, "Period payees can only be added to draft or pending payroll runs.");
    }

    const metadata = readMetadata(req.body.metadata);
    const sourceUnits = normalizeMoney(req.body.source_units, Number(metadata.default_units || 1));
    const payeePayload = buildPayeePayload(
      {
        ...req.body,
        metadata: {
          ...metadata,
          default_units: sourceUnits
        }
      },
      {
        recurrenceType: "period_only",
        startDate: run.period_start,
        endDate: run.period_end
      }
    );
    const payee = await createPayeeRecord(client, req, payeePayload);
    const line = calculateLine(payee);
    const grossAmount = req.body.gross_amount === undefined || req.body.gross_amount === ""
      ? line.grossAmount
      : normalizeMoney(req.body.gross_amount);
    const additions = req.body.additions === undefined || req.body.additions === ""
      ? line.additions
      : normalizeMoney(req.body.additions);
    const deductions = req.body.deductions === undefined || req.body.deductions === ""
      ? line.deductions
      : normalizeMoney(req.body.deductions);
    const netAmount = Math.max(grossAmount + additions - deductions, 0);

    const lineResult = await client.query(
      `INSERT INTO payroll_line_items (
        payroll_run_id, payee_id, payee_type, source_units, gross_amount,
        additions, deductions, net_amount, status, notes, metadata, source_type, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), $11, 'manual_period', $12)
      RETURNING *`,
      [
        run.id,
        payee.id,
        payee.payee_type,
        sourceUnits,
        grossAmount,
        additions,
        deductions,
        netAmount,
        run.status === "pending_approval" ? "pending_approval" : "draft",
        String(req.body.notes || "").trim(),
        readMetadata(payee.metadata),
        req.user.id
      ]
    );

    const updatedRun = await recalculateRunTotals(client, run.id);
    await recordAuditEvent(client, {
      req,
      action: "payroll_line_item.added_manually",
      entityType: "payroll_line_item",
      entityId: lineResult.rows[0].id,
      afterData: {
        payee,
        line: lineResult.rows[0],
        run: updatedRun
      }
    });

    await client.query("COMMIT");
    res.status(201).json(await fetchRun(client, run.id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const terminatePayee = asyncHandler(async (req, res) => {
  const endDate = parseDateOnly(req.body.end_date || new Date().toISOString().slice(0, 10), "End date");
  const reason = String(req.body.termination_reason || req.body.reason || "").trim();
  if (!reason) throw new ApiError(400, "Termination reason is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM payroll_payees WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Payroll payee not found.");
    if (before.recurrence_type !== "recurring") {
      throw new ApiError(400, "Only recurring payees can be terminated. Period-only payees belong to their payroll run.");
    }
    if (!recurringPayeeTypes.includes(before.payee_type)) {
      throw new ApiError(400, "Only employees and subscriptions can be terminated from the recurring register.");
    }
    if (before.status === "terminated") throw new ApiError(400, "Payroll payee is already terminated.");
    if (before.start_date && endDate < before.start_date) {
      throw new ApiError(400, "Termination date cannot be before the payee start date.");
    }

    const result = await client.query(
      `UPDATE payroll_payees
       SET status = 'terminated',
           end_date = $1,
           terminated_by = $2,
           terminated_at = NOW(),
           termination_reason = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [endDate, req.user.id, reason, before.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "payroll_payee.terminated",
      entityType: "payroll_payee",
      entityId: before.id,
      beforeData: before,
      afterData: result.rows[0],
      reason
    });

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateLineItem = asyncHandler(async (req, res) => {
  const lineId = Number(req.params.lineId);
  const { source_units, gross_amount, additions, deductions, notes = "" } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const beforeResult = await client.query(
      `SELECT pli.*, pr.status AS run_status
       FROM payroll_line_items pli
       JOIN payroll_runs pr ON pr.id = pli.payroll_run_id
       WHERE pli.id = $1
       FOR UPDATE`,
      [lineId]
    );
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Payroll line item not found.");
    if (!["draft", "pending_approval"].includes(before.run_status)) {
      throw new ApiError(400, "Only draft or pending payroll runs can be adjusted.");
    }

    const nextGross = normalizeMoney(gross_amount, Number(before.gross_amount));
    const nextAdditions = normalizeMoney(additions, Number(before.additions));
    const nextDeductions = normalizeMoney(deductions, Number(before.deductions));
    const nextUnits = normalizeMoney(source_units, Number(before.source_units));
    const nextNet = Math.max(nextGross + nextAdditions - nextDeductions, 0);

    const result = await client.query(
      `UPDATE payroll_line_items
       SET source_units = $1,
           gross_amount = $2,
           additions = $3,
           deductions = $4,
           net_amount = $5,
           notes = NULLIF($6, ''),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [nextUnits, nextGross, nextAdditions, nextDeductions, nextNet, String(notes || "").trim(), lineId]
    );

    const updatedRun = await recalculateRunTotals(client, before.payroll_run_id);
    await recordAuditEvent(client, {
      req,
      action: "payroll_line_item.updated",
      entityType: "payroll_line_item",
      entityId: lineId,
      beforeData: before,
      afterData: result.rows[0]
    });

    await client.query("COMMIT");
    res.json({ line: result.rows[0], run: updatedRun });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateRunStatus = asyncHandler(async (req, res) => {
  const { status, notes = "" } = req.body;
  if (!runStatuses.includes(status)) throw new ApiError(400, "Payroll status is invalid.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Payroll run not found.");
    if (before.status === "locked") throw new ApiError(400, "Locked payroll runs cannot be changed.");
    if (before.status === "paid" && status !== "locked") {
      throw new ApiError(400, "Paid payroll runs can only be locked.");
    }
    if (status === "approved" && req.user.role !== "admin") {
      throw new ApiError(403, "Only admins can approve payroll runs.");
    }
    if (status === "paid" && before.status !== "approved") {
      throw new ApiError(400, "Only approved payroll runs can be marked as paid.");
    }

    const statusPatch = {
      approved_by: before.approved_by,
      approved_at: before.approved_at,
      paid_by: before.paid_by,
      paid_at: before.paid_at
    };
    if (status === "approved") {
      statusPatch.approved_by = req.user.id;
      statusPatch.approved_at = new Date();
    }
    let postedExpenses = [];
    if (status === "paid") {
      postedExpenses = await postPayrollExpenses(client, req, before);
      statusPatch.paid_by = req.user.id;
      statusPatch.paid_at = new Date();
    }

    const result = await client.query(
      `UPDATE payroll_runs
       SET status = $1,
           notes = COALESCE(NULLIF($2, ''), notes),
           approved_by = $3,
           approved_at = $4,
           paid_by = $5,
           paid_at = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        status,
        String(notes || "").trim(),
        statusPatch.approved_by,
        statusPatch.approved_at,
        statusPatch.paid_by,
        statusPatch.paid_at,
        before.id
      ]
    );

    const lineStatus = status === "pending_approval" ? "pending_approval" : status === "approved" ? "approved" : status === "paid" ? "paid" : null;
    if (lineStatus) {
      await client.query(
        `UPDATE payroll_line_items
         SET status = $1::varchar,
             paid_by = CASE WHEN $1::varchar = 'paid' THEN COALESCE(paid_by, $3) ELSE paid_by END,
             paid_at = CASE WHEN $1::varchar = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             updated_at = NOW()
         WHERE payroll_run_id = $2
           AND status NOT IN ('held', 'cancelled')`,
        [lineStatus, before.id, req.user.id]
      );
    }

    await recordAuditEvent(client, {
      req,
      action: `payroll_run.${status}`,
      entityType: "payroll_run",
      entityId: before.id,
      beforeData: before,
      afterData: {
        run: result.rows[0],
        postedExpenses
      },
      reason: notes || null
    });

    await client.query("COMMIT");
    res.json(await fetchRun(client, before.id));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  addRunLineItem,
  createPayee,
  createRun,
  getRun,
  listPayees,
  listRuns,
  terminatePayee,
  updateLineItem,
  updateRunStatus
};
