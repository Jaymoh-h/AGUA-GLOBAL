const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const getDefaultStartDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const getDefaultEndDate = () => new Date().toISOString().slice(0, 10);

const getDateRange = (query) => {
  const startDate = isoDatePattern.test(query.start_date || "") ? query.start_date : getDefaultStartDate();
  const endDate = isoDatePattern.test(query.end_date || "") ? query.end_date : getDefaultEndDate();
  return { startDate, endDate };
};

const toNumber = (value) => Number(value || 0);
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const backupSensitiveKeys = new Set([
  "password",
  "password_hash",
  "password_reset_token",
  "reset_token",
  "reset_token_hash",
  "token_hash",
  "jwt_secret",
  "current_password",
  "new_password"
]);

const sanitizeBackupValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeBackupValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !backupSensitiveKeys.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, sanitizeBackupValue(child)])
  );
};

const relationExists = async (name) => {
  const { rows } = await pool.query("SELECT to_regclass($1) AS relation_name", [`public.${name}`]);
  return Boolean(rows[0]?.relation_name);
};

const line = (label, amount, detail = "") => ({
  label,
  amount: roundMoney(amount),
  detail
});

const buildStatement = ({ basis, revenueLines, expenseLines, notes = [] }) => {
  const revenue = roundMoney(revenueLines.reduce((sum, row) => sum + toNumber(row.amount), 0));
  const expenses = roundMoney(expenseLines.reduce((sum, row) => sum + toNumber(row.amount), 0));
  const netProfit = roundMoney(revenue - expenses);
  return {
    basis,
    revenue_lines: revenueLines,
    expense_lines: expenseLines,
    totals: {
      revenue,
      expenses,
      net_profit: netProfit,
      margin: revenue > 0 ? netProfit / revenue : 0
    },
    notes
  };
};

const backupQueries = [
  ["schema_migrations", "SELECT * FROM schema_migrations ORDER BY version"],
  ["customers", "SELECT * FROM customers ORDER BY id"],
  ["meters", "SELECT * FROM meters ORDER BY id"],
  ["meter_readings", "SELECT * FROM meter_readings ORDER BY id"],
  ["meter_events", "SELECT * FROM meter_events ORDER BY id"],
  ["billing_periods", "SELECT * FROM billing_periods ORDER BY period_start, id"],
  ["billing_settings", "SELECT * FROM billing_settings ORDER BY id"],
  ["rates", "SELECT * FROM rates ORDER BY id"],
  ["tariff_blocks", "SELECT * FROM tariff_blocks ORDER BY rate_id, sort_order, id"],
  ["rate_versions", "SELECT * FROM rate_versions ORDER BY rate_id, effective_from, id"],
  ["rate_version_blocks", "SELECT * FROM rate_version_blocks ORDER BY rate_version_id, sort_order, id"],
  ["zones", "SELECT * FROM zones ORDER BY id"],
  ["bills", "SELECT * FROM bills ORDER BY id"],
  ["payments", "SELECT * FROM payments ORDER BY id"],
  ["payment_allocations", "SELECT * FROM payment_allocations ORDER BY id"],
  ["payment_suspense_items", "SELECT * FROM payment_suspense_items ORDER BY id"],
  ["bill_penalty_applications", "SELECT * FROM bill_penalty_applications ORDER BY id"],
  ["source_billing_requests", "SELECT * FROM source_billing_requests ORDER BY id"],
  ["expenses", "SELECT * FROM expenses ORDER BY id"],
  ["customer_deposit_transactions", "SELECT * FROM customer_deposit_transactions ORDER BY id"],
  ["customer_adjustments", "SELECT * FROM customer_adjustments ORDER BY id"],
  ["maintenance_requests", "SELECT * FROM maintenance_requests ORDER BY id"],
  ["production_source_meters", "SELECT * FROM production_source_meters ORDER BY id"],
  ["production_meter_events", "SELECT * FROM production_meter_events ORDER BY id"],
  ["production_electricity_topups", "SELECT * FROM production_electricity_topups ORDER BY id"],
  ["production_weekly_readings", "SELECT * FROM production_weekly_readings ORDER BY id"],
  ["production_meter_readings", "SELECT * FROM production_meter_readings ORDER BY id"],
  ["payroll_payees", "SELECT * FROM payroll_payees ORDER BY id"],
  ["payroll_runs", "SELECT * FROM payroll_runs ORDER BY id"],
  ["payroll_line_items", "SELECT * FROM payroll_line_items ORDER BY id"],
  ["contractors", "SELECT * FROM contractors ORDER BY id"],
  ["contractor_invoices", "SELECT * FROM contractor_invoices ORDER BY id"],
  ["supporting_documents", "SELECT * FROM supporting_documents ORDER BY id"],
  ["business_settings", "SELECT * FROM business_settings ORDER BY id"],
  ["portal_user_customers", "SELECT * FROM portal_user_customers ORDER BY id"],
  ["user_access_profiles", "SELECT * FROM user_access_profiles ORDER BY id"],
  ["document_delivery_logs", "SELECT * FROM document_delivery_logs ORDER BY id"],
  ["operational_reminder_logs", "SELECT * FROM operational_reminder_logs ORDER BY id"],
  ["system_event_logs", "SELECT * FROM system_event_logs ORDER BY id"],
  ["monitoring_alert_logs", "SELECT * FROM monitoring_alert_logs ORDER BY id"],
  ["backup_restore_drills", "SELECT * FROM backup_restore_drills ORDER BY id"],
  ["communication_templates", "SELECT * FROM communication_templates ORDER BY id"],
  ["communication_campaigns", "SELECT * FROM communication_campaigns ORDER BY id"],
  ["communication_campaign_recipients", "SELECT * FROM communication_campaign_recipients ORDER BY id"],
  [
    "knowledge_documents",
    `SELECT id, title, category, sensitivity, allowed_roles, version_label, summary,
            original_name, stored_name, storage_path, mime_type, file_size,
            encode(file_data, 'base64') AS file_data_base64,
            status, uploaded_by, updated_by, deleted_at, deleted_by, created_at, updated_at
     FROM knowledge_documents
     ORDER BY id`
  ],
  [
    "users",
    `SELECT id, customer_id, name, email, phone, role, is_active,
            must_change_password, password_changed_at, last_login_at, created_at, updated_at
     FROM users
     ORDER BY id`
  ],
  ["audit_events", "SELECT * FROM audit_events ORDER BY id"]
];

const buildOperationalBackup = async () => {
  const datasets = {};
  const counts = {};
  const skipped = [];

  for (const [key, sql] of backupQueries) {
    if (!(await relationExists(key))) {
      skipped.push(key);
      continue;
    }
    const { rows } = await pool.query(sql);
    datasets[key] = rows.map(sanitizeBackupValue);
    counts[key] = rows.length;
  }

  return { datasets, counts, skipped };
};

const getBackupManifest = async () => {
  const lastExportResult = await pool.query(
    `SELECT created_at, actor_user_id, after_data
     FROM audit_events
     WHERE action = 'reports.operational_backup_exported'
     ORDER BY created_at DESC
     LIMIT 1`
  );
  const installed = [];
  const missing = [];
  for (const [key] of backupQueries) {
    if (await relationExists(key)) installed.push(key);
    else missing.push(key);
  }
  const latestDrillResult = await pool.query(
    `SELECT brd.*, u.name AS performed_by_name
     FROM backup_restore_drills brd
     LEFT JOIN users u ON u.id = brd.performed_by
     ORDER BY brd.drill_date DESC, brd.id DESC
     LIMIT 1`
  ).catch(() => ({ rows: [] }));
  const latestDrill = latestDrillResult.rows[0] || null;
  const nextRestoreDrillDue = latestDrill?.drill_date
    ? new Date(new Date(latestDrill.drill_date).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return {
    generated_at: new Date().toISOString(),
    export_endpoint: "/api/reports/backup",
    status: missing.length ? "review" : "ready",
    installed_datasets: installed,
    missing_optional_datasets: missing,
    dataset_count: installed.length,
    last_export: lastExportResult.rows[0] || null,
    last_restore_drill: latestDrill,
    next_restore_drill_due: nextRestoreDrillDue,
    restore_drill_status: !latestDrill
      ? "missing"
      : nextRestoreDrillDue && nextRestoreDrillDue < new Date().toISOString().slice(0, 10)
        ? "due"
        : latestDrill.status,
    retention_policy: {
      daily: "30 days",
      weekly: "12 weeks",
      monthly: "24 months",
      before_migration: "Keep until the next successful month-end close",
      restore_drill: "At least quarterly"
    },
    notes: [
      "Operational backup exports exclude password hashes, reset tokens, and environment secrets.",
      "Knowledge documents are included as base64 file data and should be stored securely.",
      "Use managed PostgreSQL provider backups for point-in-time disaster recovery."
    ]
  };
};

const nullableText = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

const normalizeDate = (value, fallback = new Date().toISOString().slice(0, 10)) =>
  isoDatePattern.test(String(value || "")) ? value : fallback;

const listBackupRestoreDrills = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT brd.*, u.name AS performed_by_name
     FROM backup_restore_drills brd
     LEFT JOIN users u ON u.id = brd.performed_by
     ORDER BY brd.drill_date DESC, brd.id DESC
     LIMIT 50`
  );
  res.json(rows);
});

const createBackupRestoreDrill = asyncHandler(async (req, res) => {
  const environment = ["local", "staging", "production"].includes(req.body.environment) ? req.body.environment : "staging";
  const status = ["planned", "passed", "partial", "failed"].includes(req.body.status) ? req.body.status : "planned";
  const backupReference = nullableText(req.body.backup_reference);
  if (!backupReference) {
    res.status(400).json({ message: "Backup reference is required." });
    return;
  }

  const durationMinutes = req.body.duration_minutes === "" || req.body.duration_minutes === undefined ? null : Number(req.body.duration_minutes);
  const datasetCount = req.body.dataset_count === "" || req.body.dataset_count === undefined ? null : Number(req.body.dataset_count);

  const { rows } = await pool.query(
    `INSERT INTO backup_restore_drills (
       drill_date, environment, backup_reference, restore_target, status,
       started_at, completed_at, duration_minutes, dataset_count,
       findings, follow_up_actions, performed_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      normalizeDate(req.body.drill_date),
      environment,
      backupReference,
      nullableText(req.body.restore_target),
      status,
      nullableText(req.body.started_at),
      nullableText(req.body.completed_at),
      Number.isFinite(durationMinutes) ? durationMinutes : null,
      Number.isFinite(datasetCount) ? datasetCount : null,
      nullableText(req.body.findings),
      nullableText(req.body.follow_up_actions),
      req.user.id
    ]
  );

  await recordAuditEvent(pool, {
    req,
    action: "reports.restore_drill_recorded",
    entityType: "backup_restore_drill",
    entityId: rows[0].id,
    afterData: rows[0],
    reason: "Admin recorded backup restore drill"
  });

  res.status(201).json(rows[0]);
});

const getPayrollProfitAndLossLines = async (startDate, endDate) => {
  if (!(await relationExists("payroll_runs"))) {
    return {
      cash: line("Payroll paid", 0, "Payroll module is not installed."),
      accrual: line("Payroll accrued", 0, "Payroll module is not installed.")
    };
  }

  const [cashResult, accrualResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total_net), 0) AS amount
       FROM payroll_runs
       WHERE status IN ('paid', 'locked')
         AND paid_at::date BETWEEN $1 AND $2`,
      [startDate, endDate]
    ),
    pool.query(
      `SELECT COALESCE(SUM(total_net), 0) AS amount
       FROM payroll_runs
       WHERE status IN ('approved', 'paid', 'locked')
         AND period_start <= $2::date
         AND period_end >= $1::date`,
      [startDate, endDate]
    )
  ]);

  return {
    cash: line("Payroll paid", cashResult.rows[0]?.amount, "Paid or locked payroll runs paid in the period."),
    accrual: line("Payroll accrued", accrualResult.rows[0]?.amount, "Approved, paid, or locked payroll runs overlapping the period.")
  };
};

const getProductionElectricityAccrualLine = async (startDate, endDate) => {
  if (!(await relationExists("production_weekly_readings"))) {
    return line("Electricity consumed", 0, "Production monitoring is not installed.");
  }

  const weeklyResult = await pool.query(
    `SELECT *
     FROM production_weekly_readings
     WHERE reading_date BETWEEN $1 AND $2
     ORDER BY reading_date ASC`,
    [startDate, endDate]
  );

  let totalCost = 0;
  for (const week of weeklyResult.rows) {
    const previousWeekResult = await pool.query(
      `SELECT *
       FROM production_weekly_readings
       WHERE reading_date < $1
       ORDER BY reading_date DESC
       LIMIT 1`,
      [week.reading_date]
    );
    const previousWeek = previousWeekResult.rows[0] || null;
    const periodStart = previousWeek?.reading_date || week.reading_date;

    const topupsResult = await pool.query(
      `SELECT COALESCE(SUM(kwh_units), 0) AS kwh_units,
              COALESCE(SUM(total_cost), 0) AS total_cost
       FROM production_electricity_topups
       WHERE topup_date > $1 AND topup_date <= $2`,
      [periodStart, week.reading_date]
    );
    const topupUnits = toNumber(topupsResult.rows[0]?.kwh_units);
    const topupCost = toNumber(topupsResult.rows[0]?.total_cost);

    const lastTopupResult = await pool.query(
      `SELECT cost_per_unit
       FROM production_electricity_topups
       WHERE topup_date <= $1
       ORDER BY topup_date DESC, id DESC
       LIMIT 1`,
      [week.reading_date]
    );
    const costPerUnit = topupUnits > 0 ? topupCost / topupUnits : toNumber(lastTopupResult.rows[0]?.cost_per_unit);
    const electricityUsed = Math.max(
      toNumber(previousWeek?.prepaid_kwh_balance) + topupUnits - toNumber(week.prepaid_kwh_balance),
      0
    );
    totalCost += electricityUsed * costPerUnit;
  }

  return line("Electricity consumed", totalCost, "Production electricity cost based on usage and latest top-up cost basis.");
};

const buildProfitAndLoss = async (startDate, endDate) => {
  const dateParams = [startDate, endDate];
  const [cashRevenueResult, accrualRevenueResult, cashExpensesResult, accrualExpensesResult, payrollLines, electricityAccrualLine] =
    await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(total_allocated_amount) FILTER (WHERE payment_channel <> 'manual_adjustment'), 0) AS allocated_cash,
           COALESCE(SUM(amount) FILTER (WHERE payment_channel <> 'manual_adjustment'), 0) AS received_cash,
           COALESCE(SUM(unallocated_amount) FILTER (WHERE payment_channel <> 'manual_adjustment'), 0) AS unallocated_cash,
           COALESCE(SUM(total_allocated_amount) FILTER (WHERE payment_channel = 'manual_adjustment'), 0) AS non_cash_allocated
         FROM payments
         WHERE status = 'posted'
           AND payment_date BETWEEN $1 AND $2`,
        dateParams
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(
             CASE
               WHEN COALESCE(subtotal_amount, 0) = 0
                AND COALESCE(fixed_charge_amount, 0) = 0
                AND COALESCE(penalty_amount, 0) = 0
                AND COALESCE(reconnection_fee_amount, 0) = 0
                AND COALESCE(adjustment_amount, 0) = 0
               THEN GREATEST(COALESCE(NULLIF(total_amount, 0), amount) - COALESCE(vat_amount, 0), 0)
               ELSE COALESCE(subtotal_amount, 0)
             END
           ), 0) AS water_usage,
           COALESCE(SUM(fixed_charge_amount), 0) AS fixed_charges,
           COALESCE(SUM(penalty_amount), 0) AS penalties,
           COALESCE(SUM(reconnection_fee_amount), 0) AS reconnection_fees,
           COALESCE(SUM(adjustment_amount), 0) AS adjustments,
           COALESCE(SUM(vat_amount), 0) AS vat_amount
         FROM bills
         WHERE bill_pay_status = 'payable'
           AND billing_month BETWEEN $1 AND $2`,
        dateParams
      ),
      pool.query(
        `SELECT category,
                COALESCE(SUM(amount), 0) AS amount
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
         GROUP BY category
         ORDER BY amount DESC, category ASC`,
        dateParams
      ),
      pool.query(
        `SELECT category,
                COALESCE(SUM(amount), 0) AS amount
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND category <> 'Production - Electricity'
         GROUP BY category
         ORDER BY amount DESC, category ASC`,
        dateParams
      ),
      getPayrollProfitAndLossLines(startDate, endDate),
      getProductionElectricityAccrualLine(startDate, endDate)
    ]);

  const cashRevenue = cashRevenueResult.rows[0] || {};
  const accrualRevenue = accrualRevenueResult.rows[0] || {};
  const cashExpenseLines = cashExpensesResult.rows.map((row) => line(row.category, row.amount));
  const accrualExpenseLines = [
    ...accrualExpensesResult.rows.map((row) => line(row.category, row.amount)),
    electricityAccrualLine
  ];
  if (toNumber(payrollLines.cash.amount) > 0) cashExpenseLines.push(payrollLines.cash);
  if (toNumber(payrollLines.accrual.amount) > 0) accrualExpenseLines.push(payrollLines.accrual);

  return {
    cash: buildStatement({
      basis: "cash",
      revenueLines: [
        line("Customer receipts applied to bills", cashRevenue.allocated_cash, "Posted cash, bank, and M-Pesa receipts allocated to bills.")
      ],
      expenseLines: cashExpenseLines,
      notes: [
        line("Cash received", cashRevenue.received_cash, "Total posted non-adjustment receipts in the period."),
        line("Customer credit not yet revenue", cashRevenue.unallocated_cash, "Unallocated customer credit is excluded from cash revenue."),
        line("Manual payment adjustments excluded", cashRevenue.non_cash_allocated, "Manual adjustment allocations are non-cash.")
      ]
    }),
    accrual: buildStatement({
      basis: "accrual",
      revenueLines: [
        line("Water usage revenue", accrualRevenue.water_usage),
        line("Fixed charges", accrualRevenue.fixed_charges),
        line("Penalties", accrualRevenue.penalties),
        line("Reconnection fees", accrualRevenue.reconnection_fees),
        line("Billing adjustments", accrualRevenue.adjustments)
      ],
      expenseLines: accrualExpenseLines,
      notes: [
        line("VAT billed outside operating revenue", accrualRevenue.vat_amount, "VAT is shown separately from operating revenue.")
      ]
    })
  };
};

const getReportsSummary = asyncHandler(async (_req, res) => {
  const billingSummary = await pool.query(
    `SELECT
       COALESCE(bp.name, to_char(b.billing_month, 'FMMonth YYYY')) AS period_name,
       COALESCE(bp.period_start, b.billing_month) AS period_start,
       COUNT(*) AS bill_count,
       COALESCE(SUM(b.units_used), 0) AS units_billed,
       COALESCE(SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount)), 0) AS billed_amount,
       COALESCE(SUM(b.paid_amount), 0) AS paid_amount,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid'), 0) AS balance_amount
     FROM bills b
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.bill_pay_status = 'payable'
     GROUP BY COALESCE(bp.name, to_char(b.billing_month, 'FMMonth YYYY')), COALESCE(bp.period_start, b.billing_month)
     ORDER BY COALESCE(bp.period_start, b.billing_month) DESC
     LIMIT 12`
  );

  const collectionsSummary = await pool.query(
    `SELECT
       p.payment_date,
       p.payment_channel,
       COUNT(*) AS receipt_count,
       COALESCE(SUM(p.amount), 0) AS received_amount,
       COALESCE(SUM(p.total_allocated_amount), 0) AS allocated_amount
     FROM payments p
     WHERE p.status = 'posted'
     GROUP BY p.payment_date, p.payment_channel
     ORDER BY p.payment_date DESC, p.payment_channel ASC
     LIMIT 60`
  );

  const agingSummary = await pool.query(
    `SELECT bucket, bill_count, balance_amount
     FROM (
       SELECT
         CASE
           WHEN CURRENT_DATE <= COALESCE(due_date, billing_month) THEN 'current'
           WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 30 THEN '1-30'
           WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 60 THEN '31-60'
           WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 90 THEN '61-90'
           ELSE '90+'
         END AS bucket,
         COUNT(*) AS bill_count,
         COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS balance_amount
       FROM bills
       WHERE status <> 'paid' AND bill_pay_status = 'payable'
       GROUP BY 1
     ) aging
     ORDER BY CASE bucket
       WHEN 'current' THEN 0
       WHEN '1-30' THEN 1
       WHEN '31-60' THEN 2
       WHEN '61-90' THEN 3
       ELSE 4
     END`
  );

  const customerBalances = await pool.query(
    `SELECT
       c.id,
       c.name,
       c.acc_number,
       z.name AS zone_name,
       COUNT(b.id) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable') AS open_bills,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable'), 0) -
         COALESCE((SELECT SUM(p.unallocated_amount) FROM payments p WHERE p.customer_id = c.id AND p.status = 'posted'), 0) AS balance_due,
       MIN(b.due_date) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable') AS oldest_due_date
     FROM customers c
     JOIN zones z ON z.id = c.zone_id
     LEFT JOIN bills b ON b.customer_id = c.id
     GROUP BY c.id, z.name
     HAVING COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable'), 0) -
       COALESCE((SELECT SUM(p.unallocated_amount) FROM payments p WHERE p.customer_id = c.id AND p.status = 'posted'), 0) <> 0
     ORDER BY balance_due DESC, oldest_due_date ASC NULLS LAST
     LIMIT 100`
  );

  const zoneReadingSummary = await pool.query(
    `WITH latest_readings AS (
       SELECT DISTINCT ON (mr.customer_id)
         mr.customer_id,
         mr.reading_date,
         mr.reading_value
       FROM meter_readings mr
       ORDER BY mr.customer_id, mr.reading_date DESC, mr.id DESC
     )
     SELECT
       z.id AS zone_id,
       z.name AS zone_name,
       COUNT(DISTINCT c.id) AS customer_count,
       COUNT(DISTINCT lr.customer_id) AS customers_with_readings,
       COUNT(DISTINCT c.id) - COUNT(DISTINCT lr.customer_id) AS customers_without_readings,
       MAX(lr.reading_date) AS latest_reading_date,
       COALESCE(SUM(b.units_used) FILTER (WHERE b.billing_month = date_trunc('month', CURRENT_DATE)::date), 0) AS current_month_units
     FROM zones z
     LEFT JOIN customers c ON c.zone_id = z.id
     LEFT JOIN latest_readings lr ON lr.customer_id = c.id
     LEFT JOIN bills b ON b.customer_id = c.id
     GROUP BY z.id, z.name
     ORDER BY z.name ASC`
  );

  const maintenanceTotals = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) AS active_count,
       COUNT(*) FILTER (WHERE status = 'open') AS open_count,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
       COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'urgent') AS urgent_count,
       COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND target_date < CURRENT_DATE) AS overdue_count,
       COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days') AS resolved_30d,
       COALESCE(
         ROUND(
           (AVG(EXTRACT(EPOCH FROM (resolved_at - reported_at)) / 86400)
             FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL))::numeric,
           1
         ),
         0
       ) AS avg_resolution_days
     FROM maintenance_requests`
  );

  const maintenanceByStatus = await pool.query(
    `SELECT
       status,
       COUNT(*) AS request_count,
       COUNT(*) FILTER (WHERE priority = 'urgent') AS urgent_count,
       COUNT(*) FILTER (WHERE target_date < CURRENT_DATE AND status IN ('open', 'in_progress')) AS overdue_count
     FROM maintenance_requests
     GROUP BY status
     ORDER BY CASE status
       WHEN 'open' THEN 0
       WHEN 'in_progress' THEN 1
       WHEN 'resolved' THEN 2
       ELSE 3
     END`
  );

  const maintenanceByCategory = await pool.query(
    `SELECT
       category,
       COUNT(*) AS request_count,
       COUNT(*) FILTER (WHERE priority = 'urgent') AS urgent_count,
       COUNT(*) FILTER (WHERE target_date < CURRENT_DATE) AS overdue_count
     FROM maintenance_requests
     WHERE status IN ('open', 'in_progress')
     GROUP BY category
     ORDER BY request_count DESC, category ASC`
  );

  const maintenanceByZone = await pool.query(
    `SELECT
       COALESCE(z.name, 'Unassigned') AS zone_name,
       COUNT(*) AS request_count,
       COUNT(*) FILTER (WHERE mr.priority = 'urgent') AS urgent_count,
       COUNT(*) FILTER (WHERE mr.target_date < CURRENT_DATE) AS overdue_count
     FROM maintenance_requests mr
     LEFT JOIN zones z ON z.id = mr.zone_id
     WHERE mr.status IN ('open', 'in_progress')
     GROUP BY COALESCE(z.name, 'Unassigned')
     ORDER BY request_count DESC, zone_name ASC`
  );

  const maintenanceByAssignee = await pool.query(
    `SELECT
       COALESCE(u.name, 'Unassigned') AS assigned_to_name,
       COUNT(*) AS request_count,
       COUNT(*) FILTER (WHERE mr.status = 'open') AS open_count,
       COUNT(*) FILTER (WHERE mr.status = 'in_progress') AS in_progress_count,
       COUNT(*) FILTER (WHERE mr.target_date < CURRENT_DATE) AS overdue_count
     FROM maintenance_requests mr
     LEFT JOIN users u ON u.id = mr.assigned_to
     WHERE mr.status IN ('open', 'in_progress')
     GROUP BY COALESCE(u.name, 'Unassigned')
     ORDER BY request_count DESC, assigned_to_name ASC`
  );

  const maintenanceRegister = await pool.query(
    `SELECT
       mr.id,
       mr.request_number,
       mr.title,
       mr.category,
       mr.priority,
       mr.status,
       mr.reported_at,
       mr.target_date,
       mr.resolved_at,
       c.name AS customer_name,
       c.acc_number,
       COALESCE(z.name, 'Unassigned') AS zone_name,
       COALESCE(u.name, 'Unassigned') AS assigned_to_name
     FROM maintenance_requests mr
     LEFT JOIN customers c ON c.id = mr.customer_id
     LEFT JOIN zones z ON z.id = mr.zone_id
     LEFT JOIN users u ON u.id = mr.assigned_to
     WHERE mr.status IN ('open', 'in_progress')
        OR mr.reported_at >= NOW() - INTERVAL '30 days'
        OR mr.resolved_at >= NOW() - INTERVAL '30 days'
     ORDER BY
       CASE mr.status
         WHEN 'open' THEN 0
         WHEN 'in_progress' THEN 1
         WHEN 'resolved' THEN 2
         ELSE 3
       END,
       mr.reported_at DESC
     LIMIT 150`
  );

  res.json({
    billingSummary: billingSummary.rows,
    collectionsSummary: collectionsSummary.rows,
    agingSummary: agingSummary.rows,
    customerBalances: customerBalances.rows,
    zoneReadingSummary: zoneReadingSummary.rows,
    maintenanceTotals: maintenanceTotals.rows[0],
    maintenanceByStatus: maintenanceByStatus.rows,
    maintenanceByCategory: maintenanceByCategory.rows,
    maintenanceByZone: maintenanceByZone.rows,
    maintenanceByAssignee: maintenanceByAssignee.rows,
    maintenanceRegister: maintenanceRegister.rows
  });
});

const getAccountantReports = asyncHandler(async (req, res) => {
  const { startDate, endDate } = getDateRange(req.query);
  const dateParams = [startDate, endDate];

  const billingTotals = await pool.query(
    `SELECT
       COUNT(*) AS bill_count,
       COALESCE(SUM(units_used), 0) AS units_billed,
       COALESCE(SUM(subtotal_amount), 0) AS subtotal_amount,
       COALESCE(SUM(penalty_amount), 0) AS penalty_amount,
       COALESCE(SUM(adjustment_amount), 0) AS adjustment_amount,
       COALESCE(SUM(deposit_applied_amount), 0) AS deposit_applied_amount,
       COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount,
       COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS balance_amount
     FROM bills
     WHERE billing_month BETWEEN $1 AND $2`,
    dateParams
  );

  const billingByStatus = await pool.query(
    `SELECT
       status,
       COUNT(*) AS bill_count,
       COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount,
       COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS balance_amount
     FROM bills
     WHERE billing_month BETWEEN $1 AND $2
     GROUP BY status
     ORDER BY status ASC`,
    dateParams
  );

  const billingByZone = await pool.query(
    `SELECT
       z.id AS zone_id,
       z.name AS zone_name,
       COUNT(b.id) AS bill_count,
       COALESCE(SUM(b.units_used), 0) AS units_billed,
       COALESCE(SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount)), 0) AS billed_amount,
       COALESCE(SUM(b.paid_amount), 0) AS paid_amount,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)), 0) AS balance_amount
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     JOIN zones z ON z.id = c.zone_id
     WHERE b.billing_month BETWEEN $1 AND $2
     GROUP BY z.id, z.name
     ORDER BY z.name ASC`,
    dateParams
  );

  const billingRegister = await pool.query(
    `SELECT
       b.id,
       b.bill_number,
       b.billing_month,
       bp.name AS billing_period_name,
       b.due_date,
       c.name AS customer_name,
       c.acc_number,
       z.name AS zone_name,
       b.previous_reading,
       b.current_reading,
       b.units_used,
       b.rate,
       b.subtotal_amount,
       b.fixed_charge_amount,
       b.penalty_amount,
       b.vat_amount,
       b.reconnection_fee_amount,
       b.adjustment_amount,
       b.deposit_applied_amount,
       COALESCE(NULLIF(b.total_amount, 0), b.amount) AS billed_amount,
       b.paid_amount,
       COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) AS balance_amount,
       b.status
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     JOIN zones z ON z.id = c.zone_id
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.billing_month BETWEEN $1 AND $2
     ORDER BY b.billing_month DESC, c.acc_number ASC
     LIMIT 500`,
    dateParams
  );

  const collectionsByChannel = await pool.query(
    `SELECT
       payment_channel,
       COUNT(*) AS receipt_count,
       COALESCE(SUM(amount), 0) AS received_amount,
       COALESCE(SUM(total_allocated_amount), 0) AS allocated_amount,
       COALESCE(SUM(unallocated_amount), 0) AS unallocated_amount
     FROM payments
     WHERE status = 'posted'
       AND payment_date BETWEEN $1 AND $2
     GROUP BY payment_channel
     ORDER BY payment_channel ASC`,
    dateParams
  );

  const receiptRegister = await pool.query(
    `SELECT
       p.id,
       p.receipt_number,
       p.payment_date,
       p.payment_channel,
       p.external_reference,
       p.received_from,
       p.amount,
       p.total_allocated_amount,
       p.unallocated_amount,
       c.name AS customer_name,
       c.acc_number,
       u.name AS recorded_by_name
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.recorded_by
     WHERE p.status = 'posted'
       AND p.payment_date BETWEEN $1 AND $2
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 500`,
    dateParams
  );

  const allocationLedger = await pool.query(
    `SELECT
       pa.id,
       p.receipt_number,
       p.payment_date,
       p.payment_channel,
       c.name AS customer_name,
       c.acc_number,
       b.bill_number,
       b.billing_month,
       pa.amount AS allocated_amount
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     JOIN bills b ON b.id = pa.bill_id
     JOIN customers c ON c.id = p.customer_id
     WHERE p.status = 'posted'
       AND p.payment_date BETWEEN $1 AND $2
     ORDER BY p.payment_date DESC, p.receipt_number ASC, b.billing_month ASC
     LIMIT 500`,
    dateParams
  );

  const receivablesAging = await pool.query(
    `SELECT
       c.id AS customer_id,
       c.name AS customer_name,
       c.acc_number,
       z.name AS zone_name,
       MIN(COALESCE(b.due_date, b.billing_month)) AS oldest_due_date,
       COUNT(b.id) AS open_bill_count,
       COALESCE(SUM(balance) FILTER (WHERE age_days <= 0), 0) AS current_amount,
       COALESCE(SUM(balance) FILTER (WHERE age_days BETWEEN 1 AND 30), 0) AS days_1_30_amount,
       COALESCE(SUM(balance) FILTER (WHERE age_days BETWEEN 31 AND 60), 0) AS days_31_60_amount,
       COALESCE(SUM(balance) FILTER (WHERE age_days BETWEEN 61 AND 90), 0) AS days_61_90_amount,
       COALESCE(SUM(balance) FILTER (WHERE age_days >= 91), 0) AS days_91_over_amount,
       COALESCE(SUM(balance), 0) AS total_amount
     FROM (
       SELECT b.*,
              COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) AS balance,
              CURRENT_DATE - COALESCE(b.due_date, b.billing_month) AS age_days
       FROM bills b
       WHERE b.status <> 'paid'
         AND b.bill_pay_status = 'payable'
         AND COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) > 0
     ) b
     JOIN customers c ON c.id = b.customer_id
     JOIN zones z ON z.id = c.zone_id
     GROUP BY c.id, c.name, c.acc_number, z.name
     ORDER BY total_amount DESC, oldest_due_date ASC NULLS LAST, c.acc_number ASC
     LIMIT 500`
  );

  const depositRegister = await pool.query(
    `SELECT
       c.id,
       c.name AS customer_name,
       c.acc_number,
       z.name AS zone_name,
       c.deposit_amount,
       c.deposit_paid,
       c.deposit_paid_at
     FROM customers c
     JOIN zones z ON z.id = c.zone_id
     WHERE c.deposit_amount > 0 OR c.deposit_paid = TRUE
     ORDER BY c.deposit_paid ASC, c.acc_number ASC
     LIMIT 500`
  );

  const expenseTotals = await pool.query(
    `SELECT
       COUNT(*) AS expense_count,
       COALESCE(SUM(amount), 0) AS expense_amount
     FROM expenses
     WHERE expense_date BETWEEN $1 AND $2`,
    dateParams
  );

  const expensesByCategory = await pool.query(
    `SELECT
       category,
       COUNT(*) AS expense_count,
       COALESCE(SUM(amount), 0) AS expense_amount
     FROM expenses
     WHERE expense_date BETWEEN $1 AND $2
     GROUP BY category
     ORDER BY expense_amount DESC, category ASC`,
    dateParams
  );

  const expenseRegister = await pool.query(
    `SELECT
       e.id,
       e.expense_date,
       e.category,
       e.vendor,
       e.description,
       e.amount,
       e.payment_channel,
       e.reference,
       e.receipt_number,
       u.name AS recorded_by_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.recorded_by
     WHERE e.expense_date BETWEEN $1 AND $2
     ORDER BY e.expense_date DESC, e.created_at DESC
     LIMIT 500`,
    dateParams
  );

  const contractorPayablesTotals = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved')) AS open_invoice_count,
       COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft', 'submitted', 'approved')), 0) AS open_amount,
       COUNT(*) FILTER (WHERE status = 'approved') AS approved_invoice_count,
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved'), 0) AS approved_amount,
       COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE) AS overdue_invoice_count,
       COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE), 0) AS overdue_amount,
       COUNT(*) FILTER (WHERE status = 'posted_to_expense' AND posted_at::date BETWEEN $1 AND $2) AS posted_invoice_count,
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'posted_to_expense' AND posted_at::date BETWEEN $1 AND $2), 0) AS posted_amount
     FROM contractor_invoices`,
    dateParams
  );

  const contractorPayablesByStatus = await pool.query(
    `SELECT
       status,
       COUNT(*) AS invoice_count,
       COALESCE(SUM(total_amount), 0) AS invoice_amount,
       COALESCE(SUM(total_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS overdue_amount
     FROM contractor_invoices
     WHERE invoice_date BETWEEN $1 AND $2
     GROUP BY status
     ORDER BY CASE status
       WHEN 'draft' THEN 0
       WHEN 'submitted' THEN 1
       WHEN 'approved' THEN 2
       WHEN 'rejected' THEN 3
       WHEN 'posted_to_expense' THEN 4
       WHEN 'paid' THEN 5
       ELSE 6
     END`,
    dateParams
  );

  const contractorPayablesAging = await pool.query(
    `SELECT bucket,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(total_amount), 0) AS invoice_amount
     FROM (
       SELECT CASE
                WHEN CURRENT_DATE <= due_date THEN 'current'
                WHEN CURRENT_DATE - due_date <= 30 THEN '1-30'
                WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
                WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
                ELSE '90+'
              END AS bucket,
              total_amount
       FROM contractor_invoices
       WHERE status IN ('draft', 'submitted', 'approved')
     ) aged
     GROUP BY bucket
     ORDER BY CASE bucket WHEN 'current' THEN 0 WHEN '1-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END`
  );

  const contractorBalances = await pool.query(
    `SELECT c.id,
            c.name AS contractor_name,
            c.phone,
            c.email,
            c.tax_pin,
            COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved')) AS open_invoice_count,
            COALESCE(SUM(ci.total_amount) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved')), 0) AS open_amount,
            MIN(ci.due_date) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved')) AS oldest_due_date,
            COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved') AND ci.due_date < CURRENT_DATE) AS overdue_invoice_count,
            COALESCE(SUM(ci.total_amount) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved') AND ci.due_date < CURRENT_DATE), 0) AS overdue_amount
     FROM contractors c
     LEFT JOIN contractor_invoices ci ON ci.contractor_id = c.id
     GROUP BY c.id
     HAVING COUNT(ci.id) FILTER (WHERE ci.status IN ('draft', 'submitted', 'approved')) > 0
     ORDER BY overdue_amount DESC, open_amount DESC, c.name ASC
     LIMIT 500`
  );

  const contractorInvoiceRegister = await pool.query(
    `SELECT ci.id,
            ci.invoice_number,
            ci.invoice_date,
            ci.due_date,
            ci.category,
            ci.description,
            ci.subtotal_amount,
            ci.vat_amount,
            ci.total_amount,
            ci.status,
            ci.reviewed_at,
            ci.posted_at,
            ci.expense_id,
            c.name AS contractor_name,
            c.tax_pin AS contractor_tax_pin,
            creator.name AS created_by_name,
            reviewer.name AS reviewed_by_name,
            poster.name AS posted_by_name,
            COALESCE(document_summary.document_count, 0) AS document_count
     FROM contractor_invoices ci
     JOIN contractors c ON c.id = ci.contractor_id
     LEFT JOIN users creator ON creator.id = ci.created_by
     LEFT JOIN users reviewer ON reviewer.id = ci.reviewed_by
     LEFT JOIN users poster ON poster.id = ci.posted_by
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS document_count
       FROM supporting_documents sd
       WHERE sd.entity_type = 'contractor_invoice'
         AND sd.entity_id = ci.id
         AND sd.deleted_at IS NULL
     ) document_summary ON TRUE
     WHERE ci.invoice_date BETWEEN $1 AND $2
     ORDER BY ci.invoice_date DESC, ci.created_at DESC
     LIMIT 500`,
    dateParams
  );

  const profitAndLoss = await buildProfitAndLoss(startDate, endDate);

  res.json({
    reportPeriod: {
      start_date: startDate,
      end_date: endDate
    },
    billingTotals: billingTotals.rows[0],
    billingByStatus: billingByStatus.rows,
    billingByZone: billingByZone.rows,
    billingRegister: billingRegister.rows,
    collectionsByChannel: collectionsByChannel.rows,
    receiptRegister: receiptRegister.rows,
    allocationLedger: allocationLedger.rows,
    receivablesAging: receivablesAging.rows,
    depositRegister: depositRegister.rows,
    expenseTotals: expenseTotals.rows[0],
    expensesByCategory: expensesByCategory.rows,
    expenseRegister: expenseRegister.rows,
    contractorPayablesTotals: contractorPayablesTotals.rows[0],
    contractorPayablesByStatus: contractorPayablesByStatus.rows,
    contractorPayablesAging: contractorPayablesAging.rows,
    contractorBalances: contractorBalances.rows,
    contractorInvoiceRegister: contractorInvoiceRegister.rows,
    profitAndLoss
  });
});

const getDataQualityChecks = asyncHandler(async (_req, res) => {
  const checks = await pool.query(
    `SELECT *
     FROM (
       SELECT
         'customers_without_active_meter' AS key,
         'Customers without active meter' AS label,
         COUNT(*)::integer AS count,
         'Active customers should have one active meter before readings are imported.' AS detail,
         'high' AS severity
       FROM customers c
       WHERE c.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM meters m WHERE m.customer_id = c.id AND m.status = 'active'
         )
       UNION ALL
       SELECT
         'duplicate_active_meter_numbers',
         'Duplicate active meter numbers',
         COUNT(*)::integer,
         'Meter numbers should be unique among active meters.',
         'high'
       FROM (
         SELECT meter_number
         FROM meters
         WHERE status = 'active' AND meter_number IS NOT NULL
         GROUP BY meter_number
         HAVING COUNT(*) > 1
       ) duplicates
       UNION ALL
       SELECT
         'bills_without_current_reading',
         'Bills without current reading link',
         COUNT(*)::integer,
         'Every generated bill should point back to the reading that created it.',
         'medium'
       FROM bills
       WHERE current_reading_id IS NULL
       UNION ALL
       SELECT
         'payments_with_unallocated_credit',
         'Payments with unallocated credit',
         COUNT(*)::integer,
         'Unallocated amounts are valid credits, but should be reviewed regularly.',
         'low'
       FROM payments
       WHERE status = 'posted' AND unallocated_amount > 0
       UNION ALL
       SELECT
         'duplicate_open_payable_bills',
         'Duplicate open payable bills',
         COUNT(*)::integer,
         'Only one unpaid payable bill should remain active for a customer in the same billing period. Use bill promotion or supersede the duplicate before collections.',
         'high'
       FROM (
         SELECT customer_id, billing_period_id
         FROM bills
         WHERE billing_period_id IS NOT NULL
           AND bill_pay_status = 'payable'
           AND status <> 'paid'
         GROUP BY customer_id, billing_period_id
         HAVING COUNT(*) > 1
       ) duplicates
       UNION ALL
       SELECT
         'future_dated_operational_records',
         'Future-dated operational records',
         (
           (SELECT COUNT(*) FROM meter_readings WHERE reading_date > CURRENT_DATE) +
           (SELECT COUNT(*) FROM payments WHERE payment_date > CURRENT_DATE) +
           (SELECT COUNT(*) FROM expenses WHERE expense_date > CURRENT_DATE) +
           (SELECT COUNT(*) FROM meter_events WHERE event_date > CURRENT_DATE) +
           (SELECT COUNT(*) FROM production_electricity_topups WHERE topup_date > CURRENT_DATE) +
           (SELECT COUNT(*) FROM production_weekly_readings WHERE reading_date > CURRENT_DATE)
         )::integer,
         'Future-dated records require an admin override reason and should be reviewed before close.',
         'medium'
       UNION ALL
       SELECT
         'inactive_accounts_with_debt',
         'Inactive accounts with debt',
         COUNT(DISTINCT c.id)::integer,
         'Closed accounts with debt can still accept payment, but should be tracked.',
         'medium'
       FROM customers c
       JOIN bills b ON b.customer_id = c.id
       WHERE c.status = 'inactive'
         AND b.status <> 'paid'
         AND COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) > 0
       UNION ALL
       SELECT
         'readings_without_bill',
         'Readings that expected a bill but have none',
         COUNT(*)::integer,
         'A reading with a previous reading normally creates a bill.',
         'medium'
       FROM meter_readings mr
       LEFT JOIN bills b ON b.current_reading_id = mr.id
       WHERE mr.previous_reading_id IS NOT NULL AND b.id IS NULL
     ) checks
     ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, count DESC, label ASC`
  );

  const [duplicateOpenBills, futureDatedRecords] = await Promise.all([
    pool.query(
      `SELECT
         c.acc_number,
         c.name AS customer_name,
         COALESCE(bp.name, b.billing_month::text) AS billing_period,
         COUNT(*)::integer AS bill_count,
         COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)), 0) AS balance_amount,
         STRING_AGG(
           CONCAT(COALESCE(b.bill_number, 'Bill ' || b.id::text), ' / ', b.status, ' / ', b.billing_source, ' / ', b.balance_amount),
           ' | '
           ORDER BY b.id
         ) AS affected_bills
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
       WHERE b.billing_period_id IS NOT NULL
         AND b.bill_pay_status = 'payable'
         AND b.status <> 'paid'
       GROUP BY c.acc_number, c.name, b.customer_id, b.billing_period_id, COALESCE(bp.name, b.billing_month::text)
       HAVING COUNT(*) > 1
       ORDER BY c.acc_number, COALESCE(bp.name, b.billing_month::text)
       LIMIT 50`
    ),
    pool.query(
      `SELECT *
       FROM (
         SELECT 'meter_readings' AS record_type, id, reading_date AS record_date, customer_id::text AS owner, notes
         FROM meter_readings
         WHERE reading_date > CURRENT_DATE
         UNION ALL
         SELECT 'payments', id, payment_date, customer_id::text, notes
         FROM payments
         WHERE payment_date > CURRENT_DATE
         UNION ALL
         SELECT 'expenses', id, expense_date, category, description
         FROM expenses
         WHERE expense_date > CURRENT_DATE
         UNION ALL
         SELECT 'meter_events', id, event_date, customer_id::text, reason
         FROM meter_events
         WHERE event_date > CURRENT_DATE
         UNION ALL
         SELECT 'production_electricity_topups', id, topup_date, reference, notes
         FROM production_electricity_topups
         WHERE topup_date > CURRENT_DATE
         UNION ALL
         SELECT 'production_weekly_readings', id, reading_date, NULL::text, notes
         FROM production_weekly_readings
         WHERE reading_date > CURRENT_DATE
       ) future_records
       ORDER BY record_date ASC, record_type ASC, id ASC
       LIMIT 50`
    )
  ]);

  const detailRecords = {
    duplicate_open_payable_bills: duplicateOpenBills.rows,
    future_dated_operational_records: futureDatedRecords.rows
  };

  res.json(
    checks.rows.map((check) => ({
      ...check,
      records: detailRecords[check.key] || []
    }))
  );
});

const getOperationalBackup = asyncHandler(async (req, res) => {
  const backup = await buildOperationalBackup();
  const manifest = await getBackupManifest();
  const payload = {
    export_type: "operational_backup",
    exported_at: new Date().toISOString(),
    exported_by: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    },
    notes: [
      "This export includes operational business records for review and continuity.",
      "Password hashes, reset tokens, and environment secrets are intentionally excluded.",
      "Knowledge document files are included as base64 and must be stored securely."
    ],
    retention_policy: manifest.retention_policy,
    dataset_counts: backup.counts,
    skipped_datasets: backup.skipped,
    datasets: backup.datasets
  };

  await recordAuditEvent(pool, {
    req,
    action: "reports.operational_backup_exported",
    entityType: "report",
    afterData: {
      exported_at: payload.exported_at,
      dataset_counts: payload.dataset_counts,
      skipped_datasets: payload.skipped_datasets
    },
    reason: "Admin generated operational backup pack"
  });

  res.json(payload);
});

const getBackupStatus = asyncHandler(async (_req, res) => {
  res.json(await getBackupManifest());
});

module.exports = {
  buildOperationalBackup,
  createBackupRestoreDrill,
  getReportsSummary,
  getAccountantReports,
  getDataQualityChecks,
  listBackupRestoreDrills,
  getBackupStatus,
  getOperationalBackup
};
