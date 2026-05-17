const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { getMonthlyPeriodDates } = require("../services/billingPeriod.service");
const { recordAuditEvent } = require("../services/audit.service");

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
    b.paid_amount,
    COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) AS balance_amount,
    settings.penalty_value AS penalty_to_apply,
    settings.application_month,
    settings.application_date,
    b.due_date + (settings.penalty_grace_days || ' days')::interval AS penalty_eligible_at
  FROM bills b
  JOIN customers c ON c.id = b.customer_id
  JOIN zones z ON z.id = c.zone_id
  LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
  CROSS JOIN settings
  LEFT JOIN bill_penalty_applications bpa
    ON bpa.bill_id = b.id
   AND bpa.application_month = settings.application_month
  WHERE settings.penalty_type = 'fixed'
    AND settings.penalty_value > 0
    AND b.status <> 'paid'
    AND COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) > 0
    AND b.due_date IS NOT NULL
    AND settings.application_date > (b.due_date + (settings.penalty_grace_days || ' days')::interval)::date
    AND bpa.id IS NULL
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

const createBillingPeriod = asyncHandler(async (req, res) => {
  const { period_start, status = "open" } = req.body;
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
      afterData: rows[0]
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
    default_deposit_amount = 0
  } = req.body;

  if (!["none", "fixed"].includes(penalty_type)) {
    throw new ApiError(400, "Penalty type must be none or fixed.");
  }

  const penaltyGraceDays = Number(penalty_grace_days);
  const penaltyValue = Number(penalty_value);
  const defaultDepositAmount = Number(default_deposit_amount);

  if (penaltyGraceDays < 0 || penaltyValue < 0 || defaultDepositAmount < 0) {
    throw new ApiError(400, "Settings amounts and grace days cannot be negative.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM billing_settings WHERE id = 1 FOR UPDATE");
    const before = beforeResult.rows[0] || null;
    const { rows } = await client.query(
      `INSERT INTO billing_settings (
        id, due_rule, penalty_grace_days, penalty_type, penalty_value,
        deposit_required, default_deposit_amount, updated_by, updated_at
      )
      VALUES (1, 'next_month_end', $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE
      SET due_rule = 'next_month_end',
          penalty_grace_days = EXCLUDED.penalty_grace_days,
          penalty_type = EXCLUDED.penalty_type,
          penalty_value = EXCLUDED.penalty_value,
          deposit_required = EXCLUDED.deposit_required,
          default_deposit_amount = EXCLUDED.default_deposit_amount,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING *`,
      [
        penaltyGraceDays,
        penalty_type,
        penaltyValue,
        Boolean(deposit_required),
        defaultDepositAmount,
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
      total_penalties: rows.reduce((sum, row) => sum + Number(row.penalty_to_apply || 0), 0),
      enabled: settings.penalty_type === "fixed" && Number(settings.penalty_value || 0) > 0
    }
  });
});

const applyPenaltyApplications = asyncHandler(async (req, res) => {
  const applicationDate = resolveApplicationDate(req.body.application_date);
  const reason = req.body.reason || `Penalty application for ${applicationDate.slice(0, 7)}`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const settingsResult = await client.query("SELECT * FROM billing_settings WHERE id = 1 FOR UPDATE");
    const settings = settingsResult.rows[0];
    if (!settings || settings.penalty_type !== "fixed" || Number(settings.penalty_value || 0) <= 0) {
      throw new ApiError(400, "Fixed penalties are disabled or have no amount configured.");
    }

    const eligibleResult = await client.query(buildPenaltyEligibilityQuery(), [applicationDate]);
    const applied = [];

    for (const row of eligibleResult.rows) {
      const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [row.id]);
      const before = beforeResult.rows[0];
      if (!before || before.status === "paid") continue;

      const penaltyAmount = Number(row.penalty_to_apply || 0);
      const insertResult = await client.query(
        `INSERT INTO bill_penalty_applications (
          bill_id, billing_period_id, application_month, applied_on, amount, applied_by, reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (bill_id, application_month) DO NOTHING
        RETURNING *`,
        [row.id, row.billing_period_id, row.application_month, applicationDate, penaltyAmount, req.user.id, reason]
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
        reason
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
      reason
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

module.exports = {
  applyPenaltyApplications,
  createBillingPeriod,
  getBillingSettings,
  listBillingPeriods,
  previewPenaltyApplications,
  updateBillingPeriodStatus,
  updateBillingSettings
};
