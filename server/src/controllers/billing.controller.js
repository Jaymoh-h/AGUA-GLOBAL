const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { createBillNumber, getMonthlyPeriodDates } = require("../services/billingPeriod.service");
const { recordAuditEvent } = require("../services/audit.service");
const { applyCustomerCreditToBill } = require("../services/credit.service");
const { assertNotFutureDate } = require("../services/dateGuard.service");
const {
  assertBillEditable,
  assertBillingPeriodEditable,
  normalizeCorrectionReason
} = require("../services/billingPeriodGuard.service");

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const resolveApplicationDate = (value) => {
  const date = value || new Date().toISOString().slice(0, 10);
  if (!isoDatePattern.test(date)) throw new ApiError(400, "Application date must use YYYY-MM-DD.");
  return date;
};

const getPenaltyApplicationMonthSql = "date_trunc('month', $1::date)::date";

const buildPenaltyEligibilityQuery = () => `
  WITH settings AS (
    SELECT
      penalty_grace_days,
      penalty_type,
      penalty_value,
      ${getPenaltyApplicationMonthSql} AS application_month,
      $1::date AS application_date
    FROM billing_settings
    WHERE id = 1
  ),
  bill_base AS (
    SELECT
      b.*,
      GREATEST(COALESCE(NULLIF(b.total_amount, 0), b.amount) - COALESCE(b.penalty_amount, 0), 0) AS principal_total,
      GREATEST(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) - COALESCE(b.penalty_amount, 0), 0) AS unpaid_principal
    FROM bills b
    WHERE b.bill_pay_status = 'payable'
  )
  SELECT
    b.id,
    b.bill_number,
    b.billing_period_id,
    COALESCE(bp.name, to_char(b.billing_month, 'FMMonth YYYY')) AS billing_period_name,
    b.billing_month,
    b.due_date,
    c.name AS customer_name,
    c.acc_number,
    z.name AS zone_name,
    b.status,
    b.penalty_amount,
    COALESCE(NULLIF(b.total_amount, 0), b.amount) AS total_amount,
    b.principal_total,
    b.unpaid_principal,
    b.paid_amount,
    COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) AS balance_amount,
    settings.penalty_type,
    settings.penalty_value,
    CASE
      WHEN settings.penalty_type = 'fixed' THEN settings.penalty_value
      WHEN settings.penalty_type = 'percentage' THEN ROUND((b.unpaid_principal * settings.penalty_value / 100.0)::numeric, 2)
      ELSE 0
    END AS penalty_to_apply,
    settings.application_month,
    settings.application_date,
    b.due_date + (settings.penalty_grace_days || ' days')::interval AS penalty_eligible_at
  FROM bill_base b
  JOIN customers c ON c.id = b.customer_id
  JOIN zones z ON z.id = c.zone_id
  LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
  CROSS JOIN settings
  LEFT JOIN bill_penalty_applications bpa
    ON bpa.bill_id = b.id
   AND bpa.application_month = settings.application_month
  WHERE settings.penalty_type IN ('fixed', 'percentage')
    AND settings.penalty_value > 0
    AND b.status <> 'paid'
    AND b.unpaid_principal > 0
    AND b.due_date IS NOT NULL
    AND settings.application_date > (b.due_date + (settings.penalty_grace_days || ' days')::interval)::date
    AND bpa.id IS NULL
    AND CASE
      WHEN settings.penalty_type = 'fixed' THEN settings.penalty_value
      WHEN settings.penalty_type = 'percentage' THEN ROUND((b.unpaid_principal * settings.penalty_value / 100.0)::numeric, 2)
      ELSE 0
    END > 0
  ORDER BY b.due_date ASC, c.acc_number ASC
`;

const listBillingPeriods = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT bp.*,
            u.name AS created_by_name,
            COUNT(b.id) AS bill_count,
            COALESCE(SUM(b.total_amount), 0) AS billed_total,
            COALESCE(SUM(b.balance_amount), 0) AS balance_total
     FROM billing_periods bp
     LEFT JOIN users u ON u.id = bp.created_by
     LEFT JOIN bills b ON b.billing_period_id = bp.id
     GROUP BY bp.id, u.name
     ORDER BY bp.period_start DESC`
  );
  res.json(rows);
});

const toNumber = (value) => Number(value || 0);

const readinessCheck = ({ key, label, level, count, detail, page, focus, amount = null }) => ({
  key,
  label,
  level,
  count: toNumber(count),
  amount: amount === null || amount === undefined ? null : toNumber(amount),
  detail,
  page,
  focus,
  passed: toNumber(count) === 0
});

const getBillingPeriodReadiness = asyncHandler(async (req, res) => {
  const periodResult = await pool.query("SELECT * FROM billing_periods WHERE id = $1", [req.params.id]);
  const period = periodResult.rows[0];
  if (!period) {
    throw new ApiError(404, "Billing period not found.");
  }

  const periodIdParams = [period.id];
  const periodDateParams = [period.period_start, period.period_end];
  const [
    activeMeteredCustomers,
    missingReadings,
    readingsWithoutBills,
    pendingSourceBilling,
    heldBills,
    periodBalances,
    customerCredits,
    suspensePayments,
    pendingAdjustments,
    deliveryExceptions,
    urgentMaintenance,
    overdueMaintenance,
    payrollAttention,
    productionGap
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS count
       FROM customers c
       WHERE c.status = 'active'
         AND EXISTS (
           SELECT 1 FROM meters m
           WHERE m.customer_id = c.id AND m.status = 'active'
         )`
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM customers c
       WHERE c.status = 'active'
         AND EXISTS (
           SELECT 1 FROM meters m
           WHERE m.customer_id = c.id AND m.status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM meter_readings mr
           WHERE mr.customer_id = c.id
             AND mr.reading_date >= $1::date
             AND mr.reading_date <= $2::date
         )`,
      periodDateParams
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM meter_readings mr
       LEFT JOIN bills b ON b.current_reading_id = mr.id
       WHERE mr.billing_period_id = $1
         AND mr.previous_reading_id IS NOT NULL
         AND b.id IS NULL`,
      periodIdParams
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM source_billing_requests
       WHERE billing_period_id = $1
         AND status = 'pending'`,
      periodIdParams
    ),
    pool.query(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS amount
       FROM bills
       WHERE billing_period_id = $1
         AND bill_pay_status = 'held'`,
      periodIdParams
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE bill_pay_status = 'payable') AS bill_count,
         COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)) FILTER (WHERE bill_pay_status = 'payable'), 0) AS billed_amount,
         COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)) FILTER (WHERE bill_pay_status = 'payable' AND status <> 'paid'), 0) AS balance_amount,
         COUNT(*) FILTER (WHERE bill_pay_status = 'payable' AND status <> 'paid') AS unpaid_count
       FROM bills
       WHERE billing_period_id = $1`,
      periodIdParams
    ),
    pool.query(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(unallocated_amount), 0) AS amount
       FROM payments
       WHERE status = 'posted'
         AND unallocated_amount > 0`
    ),
    pool.query(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(amount), 0) AS amount
       FROM payment_suspense_items
       WHERE status = 'held'`
    ),
    pool.query(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(amount), 0) AS amount
       FROM customer_adjustments
       WHERE status = 'pending'
         AND adjustment_date >= $1::date
         AND adjustment_date <= $2::date`,
      periodDateParams
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM document_delivery_logs ddl
       JOIN bills b ON b.id = ddl.document_id AND ddl.document_type = 'bill'
       WHERE b.billing_period_id = $1
         AND ddl.status IN ('failed', 'skipped')`,
      periodIdParams
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM maintenance_requests
       WHERE status IN ('open', 'in_progress')
         AND priority = 'urgent'`
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM maintenance_requests
       WHERE status IN ('open', 'in_progress')
         AND target_date < CURRENT_DATE`
    ),
    pool.query(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(total_net), 0) AS amount
       FROM payroll_runs
       WHERE status IN ('pending_approval', 'approved')
         AND period_start <= $2::date
         AND period_end >= $1::date`,
      periodDateParams
    ),
    pool.query(
      `SELECT CASE
         WHEN EXISTS (SELECT 1 FROM production_source_meters WHERE status = 'active')
          AND NOT EXISTS (
            SELECT 1
            FROM production_weekly_readings
            WHERE reading_date >= $1::date
              AND reading_date <= $2::date
          )
         THEN 1 ELSE 0 END AS count`,
      periodDateParams
    )
  ]);

  const activeCustomerCount = toNumber(activeMeteredCustomers.rows[0]?.count);
  const billingTotals = periodBalances.rows[0] || {};
  const checks = [
    readinessCheck({
      key: "no_period_bills",
      label: "No payable bills generated",
      level: "block",
      count: activeCustomerCount > 0 && toNumber(billingTotals.bill_count) === 0 ? activeCustomerCount : 0,
      detail: "A billing period with active metered customers should have payable bills before it is closed.",
      page: "readings",
      focus: "missing_readings"
    }),
    readinessCheck({
      key: "missing_readings",
      label: "Missing period readings",
      level: "block",
      count: missingReadings.rows[0]?.count,
      detail: "Active metered customers should have a reading before the period is closed.",
      page: "readings",
      focus: "missing_readings"
    }),
    readinessCheck({
      key: "readings_without_bills",
      label: "Readings without bills",
      level: "block",
      count: readingsWithoutBills.rows[0]?.count,
      detail: "Readings with previous readings should normally have generated bills.",
      page: "readings",
      focus: "missing_readings"
    }),
    readinessCheck({
      key: "pending_source_billing",
      label: "Pending source billing reviews",
      level: "block",
      count: pendingSourceBilling.rows[0]?.count,
      detail: "Source-side bills need approval or rejection before close.",
      page: "readings",
      focus: "pending_source_billing"
    }),
    readinessCheck({
      key: "held_bills",
      label: "Held bills",
      level: "block",
      count: heldBills.rows[0]?.count,
      amount: heldBills.rows[0]?.amount,
      detail: "Held bills are generated but not payable, so balances are not final.",
      page: "bills",
      focus: "held_bills"
    }),
    readinessCheck({
      key: "suspense_payments",
      label: "Held suspense payments",
      level: "block",
      count: suspensePayments.rows[0]?.count,
      amount: suspensePayments.rows[0]?.amount,
      detail: "Held suspense should be reapplied or discarded before final close reporting.",
      page: "payments",
      focus: "suspense_payments"
    }),
    readinessCheck({
      key: "pending_adjustments",
      label: "Pending adjustments",
      level: "block",
      count: pendingAdjustments.rows[0]?.count,
      amount: pendingAdjustments.rows[0]?.amount,
      detail: "Pending credits or debits can change customer balances.",
      page: "payments",
      focus: "pending_adjustments"
    }),
    readinessCheck({
      key: "customer_credits",
      label: "Customer credit balances",
      level: "warn",
      count: customerCredits.rows[0]?.count,
      amount: customerCredits.rows[0]?.amount,
      detail: "Customer credits are valid, but finance should know what will auto-apply to later bills.",
      page: "payments",
      focus: "customer_credits"
    }),
    readinessCheck({
      key: "delivery_exceptions",
      label: "Bill delivery exceptions",
      level: "warn",
      count: deliveryExceptions.rows[0]?.count,
      detail: "Failed or skipped bill messages do not stop close, but customers may not have received bills.",
      page: "communications",
      focus: "document_delivery"
    }),
    readinessCheck({
      key: "unpaid_period_bills",
      label: "Unpaid period bills",
      level: "warn",
      count: billingTotals.unpaid_count,
      amount: billingTotals.balance_amount,
      detail: "Outstanding bills are expected in normal operations, but should be reviewed for collection planning.",
      page: "bills",
      focus: "overdue_bills"
    }),
    readinessCheck({
      key: "urgent_maintenance",
      label: "Urgent maintenance",
      level: "warn",
      count: urgentMaintenance.rows[0]?.count,
      detail: "Urgent service issues should be visible before month-end reporting.",
      page: "maintenance",
      focus: "urgent_maintenance"
    }),
    readinessCheck({
      key: "overdue_maintenance",
      label: "Overdue maintenance",
      level: "warn",
      count: overdueMaintenance.rows[0]?.count,
      detail: "Overdue work should be reviewed before operational close.",
      page: "maintenance",
      focus: "overdue_maintenance"
    }),
    readinessCheck({
      key: "payroll_attention",
      label: "Payroll awaiting action",
      level: "warn",
      count: payrollAttention.rows[0]?.count,
      amount: payrollAttention.rows[0]?.amount,
      detail: "Payroll awaiting approval or payment may affect accountant reports.",
      page: "payroll",
      focus: "payroll_attention"
    }),
    readinessCheck({
      key: "production_gap",
      label: "Production reading gap",
      level: "warn",
      count: productionGap.rows[0]?.count,
      detail: "Production monitoring has no weekly reading inside this period.",
      page: "production",
      focus: "production_gap"
    })
  ];

  const blockers = checks.filter((check) => check.level === "block" && !check.passed);
  const warnings = checks.filter((check) => check.level === "warn" && !check.passed);

  res.json({
    period,
    summary: {
      active_metered_customers: activeCustomerCount,
      bill_count: toNumber(billingTotals.bill_count),
      billed_amount: toNumber(billingTotals.billed_amount),
      balance_amount: toNumber(billingTotals.balance_amount),
      blockers: blockers.length,
      warnings: warnings.length,
      ready_to_close: blockers.length === 0
    },
    checks
  });
});

const createBillingPeriod = asyncHandler(async (req, res) => {
  const { period_start, status = "open" } = req.body;
  const reason = normalizeCorrectionReason(req.body);
  if (!period_start) {
    throw new ApiError(400, "Period start date is required.");
  }

  if (!["draft", "open", "closed", "locked"].includes(status)) {
    throw new ApiError(400, "Status must be draft, open, closed, or locked.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dates = getMonthlyPeriodDates(period_start);
    const beforeResult = await client.query("SELECT * FROM billing_periods WHERE period_start = $1", [
      dates.periodStart
    ]);
    const before = beforeResult.rows[0] || null;
    assertBillingPeriodEditable(before, req, reason, "update this billing period");
    const { rows } = await client.query(
      `INSERT INTO billing_periods (
        name, period_start, period_end, closing_date, bill_date, due_date, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (period_start) DO UPDATE
      SET name = EXCLUDED.name,
          period_end = EXCLUDED.period_end,
          closing_date = EXCLUDED.closing_date,
          bill_date = EXCLUDED.bill_date,
          due_date = EXCLUDED.due_date,
          status = EXCLUDED.status,
          updated_at = NOW()
      RETURNING *`,
      [
        dates.name,
        dates.periodStart,
        dates.periodEnd,
        dates.closingDate,
        dates.billDate,
        dates.dueDate,
        status,
        req.user.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: before ? "billing_period.updated" : "billing_period.created",
      entityType: "billing_period",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0],
      reason: reason || null
    });
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateBillingPeriodStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const reason = normalizeCorrectionReason(req.body);
  if (!["draft", "open", "closed", "locked"].includes(status)) {
    throw new ApiError(400, "Status must be draft, open, closed, or locked.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM billing_periods WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Billing period not found.");
    }
    assertBillingPeriodEditable(before, req, reason, "change this billing period status");
    const { rows } = await client.query(
      `UPDATE billing_periods
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "billing_period.status_updated",
      entityType: "billing_period",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0],
      reason: reason || null
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const getBillingSettings = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM billing_settings WHERE id = 1");
  if (!rows[0]) {
    const inserted = await pool.query("INSERT INTO billing_settings (id) VALUES (1) RETURNING *");
    return res.json(inserted.rows[0]);
  }
  return res.json(rows[0]);
});

const updateBillingSettings = asyncHandler(async (req, res) => {
  const {
    penalty_grace_days = 0,
    penalty_type = "none",
    penalty_value = 0,
    deposit_required = false,
    default_deposit_amount = 0,
    bill_number_prefix = "BILL",
    bill_number_next = 1,
    receipt_number_prefix = "RCPT",
    receipt_number_next = 1,
    number_padding = 6
  } = req.body;

  if (!["none", "fixed", "percentage"].includes(penalty_type)) {
    throw new ApiError(400, "Penalty type must be none, fixed, or percentage.");
  }

  const penaltyGraceDays = Number(penalty_grace_days);
  const penaltyValue = Number(penalty_value);
  const defaultDepositAmount = Number(default_deposit_amount);
  const nextBillNumber = Number(bill_number_next);
  const nextReceiptNumber = Number(receipt_number_next);
  const nextNumberPadding = Number(number_padding);

  if (penaltyGraceDays < 0 || penaltyValue < 0 || defaultDepositAmount < 0) {
    throw new ApiError(400, "Settings amounts and grace days cannot be negative.");
  }
  if (penalty_type === "percentage" && penaltyValue > 100) {
    throw new ApiError(400, "Percentage penalty cannot exceed 100%.");
  }
  if (!Number.isInteger(nextBillNumber) || nextBillNumber <= 0 || !Number.isInteger(nextReceiptNumber) || nextReceiptNumber <= 0) {
    throw new ApiError(400, "Next bill and receipt numbers must be positive whole numbers.");
  }
  if (!Number.isInteger(nextNumberPadding) || nextNumberPadding < 3 || nextNumberPadding > 12) {
    throw new ApiError(400, "Number padding must be between 3 and 12.");
  }
  if (!String(bill_number_prefix).trim() || !String(receipt_number_prefix).trim()) {
    throw new ApiError(400, "Bill and receipt prefixes are required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM billing_settings WHERE id = 1 FOR UPDATE");
    const before = beforeResult.rows[0] || null;
    const { rows } = await client.query(
      `INSERT INTO billing_settings (
        id, due_rule, penalty_grace_days, penalty_type, penalty_value,
        deposit_required, default_deposit_amount, bill_number_prefix, bill_number_next,
        receipt_number_prefix, receipt_number_next, number_padding, updated_by, updated_at
      )
      VALUES (1, 'next_month_end', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE
      SET due_rule = 'next_month_end',
          penalty_grace_days = EXCLUDED.penalty_grace_days,
          penalty_type = EXCLUDED.penalty_type,
          penalty_value = EXCLUDED.penalty_value,
          deposit_required = EXCLUDED.deposit_required,
          default_deposit_amount = EXCLUDED.default_deposit_amount,
          bill_number_prefix = EXCLUDED.bill_number_prefix,
          bill_number_next = EXCLUDED.bill_number_next,
          receipt_number_prefix = EXCLUDED.receipt_number_prefix,
          receipt_number_next = EXCLUDED.receipt_number_next,
          number_padding = EXCLUDED.number_padding,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING *`,
      [
        penaltyGraceDays,
        penalty_type,
        penaltyValue,
        Boolean(deposit_required),
        defaultDepositAmount,
        String(bill_number_prefix).trim().toUpperCase(),
        nextBillNumber,
        String(receipt_number_prefix).trim().toUpperCase(),
        nextReceiptNumber,
        nextNumberPadding,
        req.user.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "billing_settings.updated",
      entityType: "billing_settings",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const previewPenaltyApplications = asyncHandler(async (req, res) => {
  const applicationDate = resolveApplicationDate(req.query.application_date);
  const settingsResult = await pool.query("SELECT * FROM billing_settings WHERE id = 1");
  const settings = settingsResult.rows[0] || {
    penalty_grace_days: 0,
    penalty_type: "none",
    penalty_value: 0
  };

  const { rows } = await pool.query(buildPenaltyEligibilityQuery(), [applicationDate]);
  res.json({
    settings,
    application_date: applicationDate,
    application_month: rows[0]?.application_month || applicationDate.slice(0, 7) + "-01",
    rows,
    summary: {
      eligible_bills: rows.length,
      penalty_amount: Number(settings.penalty_value || 0),
      penalty_type: settings.penalty_type,
      total_penalties: rows.reduce((sum, row) => sum + Number(row.penalty_to_apply || 0), 0),
      enabled: ["fixed", "percentage"].includes(settings.penalty_type) && Number(settings.penalty_value || 0) > 0
    }
  });
});

const listPenaltyApplications = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT bpa.*,
            b.bill_number,
            b.status AS bill_status,
            COALESCE(bp.name, to_char(b.billing_month, 'FMMonth YYYY')) AS billing_period_name,
            c.name AS customer_name,
            c.acc_number,
            applied.name AS applied_by_name,
            waived.name AS waived_by_name
     FROM bill_penalty_applications bpa
     JOIN bills b ON b.id = bpa.bill_id
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN billing_periods bp ON bp.id = bpa.billing_period_id
     LEFT JOIN users applied ON applied.id = bpa.applied_by
     LEFT JOIN users waived ON waived.id = bpa.waived_by
     ORDER BY bpa.application_month DESC, bpa.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const listSourceBillingRequests = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT sbr.*,
            c.name AS customer_name,
            c.acc_number,
            m.meter_number,
            m.meter_role,
            bp.name AS billing_period_name,
            requested.name AS requested_by_name,
            reviewed.name AS reviewed_by_name,
            b.bill_number,
            b.bill_pay_status,
            COALESCE(competing.bills, '[]'::json) AS competing_bills
     FROM source_billing_requests sbr
     JOIN customers c ON c.id = sbr.customer_id
     JOIN meters m ON m.id = sbr.meter_id
     LEFT JOIN billing_periods bp ON bp.id = sbr.billing_period_id
     LEFT JOIN users requested ON requested.id = sbr.requested_by
     LEFT JOIN users reviewed ON reviewed.id = sbr.reviewed_by
     LEFT JOIN bills b ON b.id = sbr.bill_id
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object(
           'id', cb.id,
           'bill_number', cb.bill_number,
           'billing_source', cb.billing_source,
           'bill_pay_status', cb.bill_pay_status,
           'total_amount', COALESCE(NULLIF(cb.total_amount, 0), cb.amount),
           'paid_amount', cb.paid_amount,
           'balance_amount', cb.balance_amount,
           'units_used', cb.units_used
         )
         ORDER BY cb.bill_pay_status = 'payable' DESC, cb.id ASC
       ) AS bills
       FROM bills cb
       WHERE cb.customer_id = sbr.customer_id
         AND cb.billing_period_id = sbr.billing_period_id
         AND (cb.id <> sbr.bill_id OR sbr.bill_id IS NULL)
         AND (cb.source_billing_request_id IS NOT NULL OR cb.billing_source <> 'source_backup')
     ) competing ON TRUE
     ORDER BY
       CASE sbr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       sbr.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

const reviewSourceBillingRequest = asyncHandler(async (req, res) => {
  const { action, review_notes } = req.body;
  const reviewAction = String(action || "").trim();
  const notes = String(review_notes || "").trim();
  if (!["approve", "reject"].includes(reviewAction)) {
    throw new ApiError(400, "Review action must be approve or reject.");
  }
  if (reviewAction === "reject" && !notes) {
    throw new ApiError(400, "Review notes are required when rejecting source billing.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT sbr.*, c.rate_id
       FROM source_billing_requests sbr
       JOIN customers c ON c.id = sbr.customer_id
       WHERE sbr.id = $1
       FOR UPDATE`,
      [req.params.id]
    );
    const request = requestResult.rows[0];
    if (!request) throw new ApiError(404, "Source billing request not found.");
    if (request.status !== "pending") throw new ApiError(400, "Only pending source billing requests can be reviewed.");

    if (reviewAction === "reject") {
      const rejected = await client.query(
        `UPDATE source_billing_requests
         SET status = 'rejected',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_notes = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [req.user.id, notes, request.id]
      );
      await recordAuditEvent(client, {
        req,
        action: "source_billing_request.rejected",
        entityType: "source_billing_request",
        entityId: request.id,
        beforeData: request,
        afterData: rejected.rows[0],
        reason: notes
      });
      await client.query("COMMIT");
      return res.json({ request: rejected.rows[0], bill: null });
    }

    const existingBill = await client.query("SELECT id FROM bills WHERE current_reading_id = $1", [
      request.current_reading_id
    ]);
    if (existingBill.rows[0]) {
      throw new ApiError(400, "A bill already exists for this source reading.");
    }
    const competingPayableResult = await client.query(
      `SELECT id, bill_number, paid_amount
       FROM bills
       WHERE customer_id = $1
         AND billing_period_id = $2
         AND bill_pay_status = 'payable'
         AND billing_source <> 'source_backup'
       FOR UPDATE`,
      [request.customer_id, request.billing_period_id]
    );
    const hasClientBillConflict = competingPayableResult.rows.length > 0;

    const billNumber = await createBillNumber(client);
    const billResult = await client.query(
      `INSERT INTO bills (
        customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id,
        billing_month, previous_reading, current_reading, units_used, rate, amount,
        subtotal_amount, fixed_charge_amount, penalty_amount, vat_amount, reconnection_fee_amount,
        deposit_applied_amount, adjustment_amount, total_amount, balance_amount, tariff_snapshot, due_date,
        issued_at, billing_meter_id, billing_meter_role, billing_source, source_fallback_reason, source_billing_request_id,
        bill_pay_status, payability_reason, promoted_by, promoted_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        COALESCE((SELECT period_start FROM billing_periods WHERE id = $2), date_trunc('month', CURRENT_DATE)::date),
        $6, $7, $8, $9, $10,
        $11, $12, 0, $13, $14, 0, 0, $10, $10, $15::jsonb, $16,
        NOW(), $17, 'source_backup'::varchar, 'source_backup'::varchar, $18, $19,
        $20::varchar, $21, $22, CASE WHEN $20::varchar = 'payable' THEN NOW() ELSE NULL END
      )
      RETURNING *`,
      [
        request.customer_id,
        request.billing_period_id,
        billNumber,
        request.previous_reading_id,
        request.current_reading_id,
        request.previous_reading,
        request.current_reading,
        request.units_used,
        request.rate,
        request.amount,
        request.subtotal_amount,
        request.fixed_charge_amount,
        request.vat_amount,
        request.reconnection_fee_amount,
        JSON.stringify(request.tariff_snapshot || {}),
        request.due_date,
        request.meter_id,
        request.reason,
        request.id,
        hasClientBillConflict ? "held" : "payable",
        hasClientBillConflict ? "Held pending source/client bill promotion choice" : notes || request.reason,
        hasClientBillConflict ? null : req.user.id
      ]
    );
    let bill = billResult.rows[0];
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
          reason: notes || request.reason
        });
      }
    }

    const approved = await client.query(
      `UPDATE source_billing_requests
       SET status = 'approved',
           bill_id = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_notes = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [bill.id, req.user.id, notes || null, request.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "source_billing_request.approved",
      entityType: "source_billing_request",
      entityId: request.id,
      beforeData: request,
      afterData: {
        request: approved.rows[0],
        bill
      },
      reason: notes || request.reason
    });

    await recordAuditEvent(client, {
      req,
      action: "bill.created_from_source_backup",
      entityType: "bill",
      entityId: bill.id,
      afterData: bill,
      reason: notes || request.reason
    });

    await client.query("COMMIT");
    res.json({ request: approved.rows[0], bill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const applyPenaltyApplications = asyncHandler(async (req, res) => {
  const applicationDate = resolveApplicationDate(req.body.application_date);
  const futureOverrideReason = assertNotFutureDate(applicationDate, req, "Penalty application date");
  const reason = req.body.reason || `Penalty application for ${applicationDate.slice(0, 7)}`;
  const auditReason = futureOverrideReason ? `${reason} | Future-date override: ${futureOverrideReason}` : reason;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const settingsResult = await client.query("SELECT * FROM billing_settings WHERE id = 1 FOR UPDATE");
    const settings = settingsResult.rows[0];
    if (!settings || !["fixed", "percentage"].includes(settings.penalty_type) || Number(settings.penalty_value || 0) <= 0) {
      throw new ApiError(400, "Penalties are disabled or have no value configured.");
    }

    const eligibleResult = await client.query(buildPenaltyEligibilityQuery(), [applicationDate]);
    const applied = [];

    for (const row of eligibleResult.rows) {
      const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [row.id]);
      const before = beforeResult.rows[0];
      if (!before || before.status === "paid") continue;

      const penaltyAmount = Number(row.penalty_to_apply || 0);
      await assertBillEditable(client, before.id, req, reason, "apply a penalty");
      const insertResult = await client.query(
        `INSERT INTO bill_penalty_applications (
          bill_id, billing_period_id, application_month, applied_on, amount,
          penalty_type, penalty_value, principal_amount, applied_by, reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (bill_id, application_month) DO NOTHING
        RETURNING *`,
        [
          row.id,
          row.billing_period_id,
          row.application_month,
          applicationDate,
          penaltyAmount,
          row.penalty_type,
          Number(row.penalty_value || 0),
          Number(row.unpaid_principal || 0),
          req.user.id,
          reason
        ]
      );

      if (!insertResult.rows[0]) continue;

      const updatedResult = await client.query(
        `UPDATE bills
         SET amount = amount + $1,
             penalty_amount = penalty_amount + $1,
             total_amount = COALESCE(NULLIF(total_amount, 0), amount) + $1,
             balance_amount = COALESCE(NULLIF(balance_amount, 0), amount - paid_amount) + $1,
             status = CASE
               WHEN paid_amount <= 0 THEN 'unpaid'
               WHEN paid_amount >= COALESCE(NULLIF(total_amount, 0), amount) + $1 THEN 'paid'
               ELSE 'partial'
             END
         WHERE id = $2
         RETURNING *`,
        [penaltyAmount, row.id]
      );
      const updated = updatedResult.rows[0];

      await recordAuditEvent(client, {
        req,
        action: "bill.penalty_applied",
        entityType: "bill",
        entityId: updated.id,
        beforeData: before,
        afterData: {
          bill: updated,
          penalty_application: insertResult.rows[0]
        },
        reason: auditReason
      });

      applied.push({
        bill_id: updated.id,
        bill_number: updated.bill_number,
        customer_name: row.customer_name,
        acc_number: row.acc_number,
        penalty_amount: penaltyAmount,
        balance_amount: updated.balance_amount
      });
    }

    await recordAuditEvent(client, {
      req,
      action: "penalty_run.applied",
      entityType: "penalty_run",
      afterData: {
        application_date: applicationDate,
        application_month: eligibleResult.rows[0]?.application_month || applicationDate.slice(0, 7) + "-01",
        eligible_bills: eligibleResult.rows.length,
        applied_bills: applied.length,
        total_penalties: applied.reduce((sum, row) => sum + Number(row.penalty_amount || 0), 0)
      },
      reason: auditReason
    });

    await client.query("COMMIT");
    res.status(201).json({
      applied,
      summary: {
        eligible_bills: eligibleResult.rows.length,
        applied_bills: applied.length,
        total_penalties: applied.reduce((sum, row) => sum + Number(row.penalty_amount || 0), 0)
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const waivePenaltyApplication = asyncHandler(async (req, res) => {
  const reason = normalizeCorrectionReason(req.body);
  if (!reason) {
    throw new ApiError(400, "Waiver reason is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const applicationResult = await client.query(
      "SELECT * FROM bill_penalty_applications WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    const application = applicationResult.rows[0];
    if (!application) throw new ApiError(404, "Penalty application not found.");
    if (application.waived_at) throw new ApiError(400, "Penalty has already been waived.");

    const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [
      application.bill_id
    ]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Bill not found.");
    await assertBillEditable(client, before.id, req, reason, "waive a penalty");

    const penaltyAmount = Number(application.amount || 0);
    const nextTotal = Math.max(Number(before.total_amount || before.amount || 0) - penaltyAmount, 0);
    const nextPenalty = Math.max(Number(before.penalty_amount || 0) - penaltyAmount, 0);
    let nextPaidAmount = Number(before.paid_amount || 0);
    let releasedCredit = 0;

    if (nextPaidAmount > nextTotal) {
      let remainingRelease = nextPaidAmount - nextTotal;
      const allocationResult = await client.query(
        `SELECT pa.*, p.customer_id
         FROM payment_allocations pa
         JOIN payments p ON p.id = pa.payment_id
         WHERE pa.bill_id = $1
         ORDER BY pa.created_at DESC, pa.id DESC
         FOR UPDATE`,
        [before.id]
      );

      for (const allocation of allocationResult.rows) {
        if (remainingRelease <= 0) break;
        const releaseAmount = Math.min(Number(allocation.amount || 0), remainingRelease);
        if (releaseAmount <= 0) continue;

        if (releaseAmount >= Number(allocation.amount || 0)) {
          await client.query("DELETE FROM payment_allocations WHERE id = $1", [allocation.id]);
        } else {
          await client.query("UPDATE payment_allocations SET amount = amount - $1 WHERE id = $2", [
            releaseAmount,
            allocation.id
          ]);
        }

        await client.query(
          `UPDATE payments
           SET total_allocated_amount = GREATEST(total_allocated_amount - $1, 0),
               unallocated_amount = unallocated_amount + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [releaseAmount, allocation.payment_id]
        );

        remainingRelease -= releaseAmount;
        releasedCredit += releaseAmount;
      }

      nextPaidAmount = Math.max(nextPaidAmount - releasedCredit, 0);
    }

    const nextBalance = Math.max(nextTotal - nextPaidAmount, 0);
    const nextStatus = nextBalance <= 0 ? "paid" : nextPaidAmount > 0 ? "partial" : "unpaid";

    const updatedBill = await client.query(
      `UPDATE bills
       SET amount = GREATEST(amount - $1, 0),
           penalty_amount = $2,
           total_amount = $3,
           balance_amount = $4,
           paid_amount = $5,
           status = $6::varchar,
           paid_at = CASE WHEN $6::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
       WHERE id = $7
       RETURNING *`,
      [penaltyAmount, nextPenalty, nextTotal, nextBalance, nextPaidAmount, nextStatus, before.id]
    );

    const updatedApplication = await client.query(
      `UPDATE bill_penalty_applications
       SET waived_by = $1,
           waived_at = NOW(),
           waiver_reason = $2
       WHERE id = $3
       RETURNING *`,
      [req.user.id, reason, application.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "bill.penalty_waived",
      entityType: "bill",
      entityId: before.id,
      beforeData: {
        bill: before,
        penalty_application: application
      },
      afterData: {
        bill: updatedBill.rows[0],
        penalty_application: updatedApplication.rows[0],
        released_credit: releasedCredit
      },
      reason
    });

    await client.query("COMMIT");
    res.json({ bill: updatedBill.rows[0], penalty_application: updatedApplication.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const reapplyPenaltyApplication = asyncHandler(async (req, res) => {
  const reason = normalizeCorrectionReason(req.body);
  if (!reason) {
    throw new ApiError(400, "Re-application reason is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const applicationResult = await client.query(
      "SELECT * FROM bill_penalty_applications WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    const application = applicationResult.rows[0];
    if (!application) throw new ApiError(404, "Penalty application not found.");
    if (!application.waived_at) throw new ApiError(400, "Penalty is already applied.");

    const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [
      application.bill_id
    ]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Bill not found.");
    await assertBillEditable(client, before.id, req, reason, "re-apply a waived penalty");

    const penaltyAmount = Number(application.amount || 0);
    const nextTotal = Number(before.total_amount || before.amount || 0) + penaltyAmount;
    const nextPenalty = Number(before.penalty_amount || 0) + penaltyAmount;
    const nextPaidAmount = Number(before.paid_amount || 0);
    const nextBalance = Math.max(nextTotal - nextPaidAmount, 0);
    const nextStatus = nextBalance <= 0 ? "paid" : nextPaidAmount > 0 ? "partial" : "unpaid";

    const updatedBill = await client.query(
      `UPDATE bills
       SET amount = amount + $1,
           penalty_amount = $2,
           total_amount = $3,
           balance_amount = $4,
           status = $5::varchar,
           paid_at = CASE WHEN $5::text = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
       WHERE id = $6
       RETURNING *`,
      [penaltyAmount, nextPenalty, nextTotal, nextBalance, nextStatus, before.id]
    );

    const updatedApplication = await client.query(
      `UPDATE bill_penalty_applications
       SET waived_by = NULL,
           waived_at = NULL,
           waiver_reason = NULL,
           reason = $1,
           applied_by = $2,
           applied_on = CURRENT_DATE
       WHERE id = $3
       RETURNING *`,
      [reason, req.user.id, application.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "bill.penalty_reapplied",
      entityType: "bill",
      entityId: before.id,
      beforeData: {
        bill: before,
        penalty_application: application
      },
      afterData: {
        bill: updatedBill.rows[0],
        penalty_application: updatedApplication.rows[0]
      },
      reason
    });

    await client.query("COMMIT");
    res.json({ bill: updatedBill.rows[0], penalty_application: updatedApplication.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  applyPenaltyApplications,
  createBillingPeriod,
  getBillingPeriodReadiness,
  getBillingSettings,
  listPenaltyApplications,
  listBillingPeriods,
  listSourceBillingRequests,
  previewPenaltyApplications,
  reapplyPenaltyApplication,
  reviewSourceBillingRequest,
  waivePenaltyApplication,
  updateBillingPeriodStatus,
  updateBillingSettings
};
