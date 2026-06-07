const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const tableCache = new Map();

const toNumber = (value) => Number(value || 0);

const getTableExists = async (tableName) => {
  if (tableCache.has(tableName)) return tableCache.get(tableName);
  const { rows } = await pool.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${tableName}`]);
  const exists = Boolean(rows[0]?.exists);
  tableCache.set(tableName, exists);
  return exists;
};

const optionalQuery = async (tableName, fallback, sql, params = []) => {
  if (!(await getTableExists(tableName))) return fallback;
  const { rows } = await pool.query(sql, params);
  return rows[0] || fallback;
};

const queryOne = async (sql, params = []) => {
  const { rows } = await pool.query(sql, params);
  return rows[0] || {};
};

const queryRows = async (sql, params = []) => {
  const { rows } = await pool.query(sql, params);
  return rows;
};

const getRoleAllowedItems = (role, items) =>
  items.filter((item) => !item.roles || item.roles.includes(role));

const buildDashboardCharts = async () => {
  const billingTrend = await queryRows(
     `WITH months AS (
       SELECT generate_series(
         date_trunc('month', CURRENT_DATE)::date - INTERVAL '11 months',
         date_trunc('month', CURRENT_DATE)::date,
         INTERVAL '1 month'
       )::date AS month_start
     ),
     billing AS (
       SELECT date_trunc('month', billing_month)::date AS month_start,
              COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount
       FROM bills
       WHERE bill_pay_status = 'payable'
       GROUP BY date_trunc('month', billing_month)::date
     ),
     collections AS (
       SELECT date_trunc('month', payment_date)::date AS month_start,
              COALESCE(SUM(amount), 0) AS collected_amount
       FROM payments
       WHERE status = 'posted'
       GROUP BY date_trunc('month', payment_date)::date
     )
     SELECT to_char(months.month_start, 'Mon YYYY') AS label,
            months.month_start,
            COALESCE(billing.billed_amount, 0) AS billed_amount,
            COALESCE(collections.collected_amount, 0) AS collected_amount
     FROM months
     LEFT JOIN billing ON billing.month_start = months.month_start
     LEFT JOIN collections ON collections.month_start = months.month_start
     ORDER BY months.month_start ASC`
  );

  const receivablesAging = await queryRows(
    `SELECT bucket AS label,
            COUNT(*)::integer AS bill_count,
            COALESCE(SUM(balance_amount), 0) AS balance_amount
     FROM (
       SELECT CASE
                WHEN CURRENT_DATE <= COALESCE(due_date, billing_month) THEN 'Current'
                WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 30 THEN '1-30'
                WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 60 THEN '31-60'
                WHEN CURRENT_DATE - COALESCE(due_date, billing_month) <= 90 THEN '61-90'
                ELSE '90+'
              END AS bucket,
              COALESCE(NULLIF(balance_amount, 0), amount - paid_amount) AS balance_amount
       FROM bills
       WHERE status <> 'paid'
         AND bill_pay_status = 'payable'
     ) aged
     GROUP BY bucket
     ORDER BY CASE bucket WHEN 'Current' THEN 0 WHEN '1-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END`
  );

  const maintenanceStatus = (await getTableExists("maintenance_requests"))
    ? await queryRows(
        `SELECT status AS label,
                COUNT(*)::integer AS count
         FROM maintenance_requests
         GROUP BY status
         ORDER BY CASE status
                    WHEN 'open' THEN 0
                    WHEN 'in_progress' THEN 1
                    WHEN 'resolved' THEN 2
                    WHEN 'cancelled' THEN 3
                    ELSE 4
                  END`
      )
    : [];

  const productionTrend = (await getTableExists("production_weekly_readings"))
    ? await queryRows(
        `WITH recent_weeks AS (
           SELECT *
           FROM production_weekly_readings
           ORDER BY reading_date DESC
           LIMIT 13
         )
         SELECT to_char(pwr.reading_date, 'DD Mon') AS label,
                pwr.reading_date,
                COALESCE(revenue.revenue_amount, 0) AS revenue_amount,
                ROUND(
                  GREATEST(
                    COALESCE(previous_week.prepaid_kwh_balance, 0) +
                    COALESCE(topups.kwh_units, 0) -
                    COALESCE(pwr.prepaid_kwh_balance, 0),
                    0
                  ) *
                  CASE
                    WHEN COALESCE(topups.kwh_units, 0) > 0
                      THEN COALESCE(topups.total_cost, 0) / NULLIF(topups.kwh_units, 0)
                    ELSE COALESCE(last_topup.cost_per_unit, 0)
                  END,
                  2
                ) AS electricity_cost
         FROM recent_weeks pwr
         LEFT JOIN LATERAL (
           SELECT previous.prepaid_kwh_balance, previous.reading_date
           FROM production_weekly_readings previous
           WHERE previous.reading_date < pwr.reading_date
           ORDER BY previous.reading_date DESC
           LIMIT 1
         ) previous_week ON TRUE
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(kwh_units), 0) AS kwh_units,
                  COALESCE(SUM(total_cost), 0) AS total_cost
           FROM production_electricity_topups
           WHERE topup_date > COALESCE(previous_week.reading_date, pwr.reading_date)
             AND topup_date <= pwr.reading_date
         ) topups ON TRUE
         LEFT JOIN LATERAL (
           SELECT cost_per_unit
           FROM production_electricity_topups
           WHERE topup_date <= pwr.reading_date
           ORDER BY topup_date DESC, id DESC
           LIMIT 1
         ) last_topup ON TRUE
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(revenue_amount), 0) AS revenue_amount
           FROM production_meter_readings
           WHERE weekly_reading_id = pwr.id
         ) revenue ON TRUE
         ORDER BY pwr.reading_date DESC`
      )
    : [];

  return {
    billingTrend,
    receivablesAging,
    maintenanceStatus,
    productionTrend: productionTrend.reverse()
  };
};

const buildActionCenter = async (role) => {
  const [
    overdueBills,
    missingReadings,
    heldBills,
    sourceRequests,
    credits,
    suspense,
    adjustments,
    maintenance,
    deliveries,
    campaigns,
    payroll,
    supplierPayables,
    production,
    duplicateOpenBills,
    futureDatedRecords
  ] = await Promise.all([
    queryOne(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS amount,
         MIN(due_date) AS oldest_date
       FROM bills
       WHERE status <> 'paid'
         AND bill_pay_status = 'payable'
         AND due_date < CURRENT_DATE`
    ),
    queryOne(
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
             AND mr.reading_date >= date_trunc('month', CURRENT_DATE)::date
             AND mr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
         )`
    ),
    queryOne(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS amount
       FROM bills
       WHERE bill_pay_status = 'held'`
    ),
    optionalQuery(
      "source_billing_requests",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM source_billing_requests
       WHERE status = 'pending'`
    ),
    queryOne(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(unallocated_amount), 0) AS amount
       FROM payments
       WHERE status = 'posted'
         AND unallocated_amount > 0`
    ),
    optionalQuery(
      "payment_suspense_items",
      { count: 0, amount: 0 },
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(amount), 0) AS amount
       FROM payment_suspense_items
       WHERE status = 'held'`
    ),
    optionalQuery(
      "customer_adjustments",
      { count: 0, amount: 0 },
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(amount), 0) AS amount
       FROM customer_adjustments
       WHERE status = 'pending'`
    ),
    optionalQuery(
      "maintenance_requests",
      { active_count: 0, urgent_count: 0, overdue_count: 0 },
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')) AS active_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'urgent') AS urgent_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND target_date < CURRENT_DATE) AS overdue_count
       FROM maintenance_requests`
    ),
    optionalQuery(
      "document_delivery_logs",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM document_delivery_logs
       WHERE status IN ('failed', 'skipped')
         AND created_at >= NOW() - INTERVAL '14 days'`
    ),
    optionalQuery(
      "communication_campaigns",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM communication_campaigns
       WHERE status IN ('running', 'completed_with_errors', 'failed')`
    ),
    optionalQuery(
      "payroll_runs",
      { count: 0, amount: 0 },
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(total_net), 0) AS amount
       FROM payroll_runs
       WHERE status IN ('pending_approval', 'approved')`
    ),
    optionalQuery(
      "contractor_invoices",
      { approved_count: 0, approved_amount: 0, overdue_count: 0, overdue_amount: 0 },
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved'), 0) AS approved_amount,
         COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE) AS overdue_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE), 0) AS overdue_amount
       FROM contractor_invoices`
    ),
    optionalQuery(
      "production_weekly_readings",
      { count: 0 },
      `SELECT CASE
         WHEN EXISTS (SELECT 1 FROM production_source_meters WHERE status = 'active')
          AND NOT EXISTS (
            SELECT 1
            FROM production_weekly_readings
            WHERE reading_date >= CURRENT_DATE - INTERVAL '10 days'
         )
         THEN 1 ELSE 0 END AS count`
    ),
    queryOne(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT customer_id, billing_period_id
         FROM bills
         WHERE billing_period_id IS NOT NULL
           AND bill_pay_status = 'payable'
           AND status <> 'paid'
         GROUP BY customer_id, billing_period_id
         HAVING COUNT(*) > 1
       ) duplicate_periods`
    ),
    queryOne(
      `SELECT (
         (SELECT COUNT(*) FROM meter_readings WHERE reading_date > CURRENT_DATE) +
         (SELECT COUNT(*) FROM payments WHERE payment_date > CURRENT_DATE) +
         (SELECT COUNT(*) FROM expenses WHERE expense_date > CURRENT_DATE) +
         (SELECT COUNT(*) FROM meter_events WHERE event_date > CURRENT_DATE) +
         (SELECT COUNT(*) FROM production_electricity_topups WHERE topup_date > CURRENT_DATE) +
         (SELECT COUNT(*) FROM production_weekly_readings WHERE reading_date > CURRENT_DATE)
       ) AS count`
    )
  ]);

  const items = getRoleAllowedItems(role, [
    {
      key: "missing_readings",
      group: "billing",
      label: "Missing current readings",
      count: toNumber(missingReadings.count),
      severity: "high",
      detail: "Active metered customers without a current-month reading.",
      page: "readings",
      roles: ["admin", "accountant", "meter_reader"]
    },
    {
      key: "pending_source_billing",
      group: "billing",
      label: "Source billing reviews",
      count: toNumber(sourceRequests.count),
      severity: "medium",
      detail: "Source-side bills awaiting approval or rejection.",
      page: "readings",
      roles: ["admin", "accountant"]
    },
    {
      key: "held_bills",
      group: "billing",
      label: "Held bills",
      count: toNumber(heldBills.count),
      amount: toNumber(heldBills.amount),
      severity: "high",
      detail: "Bills generated but not yet payable.",
      page: "bills",
      roles: ["admin", "accountant"]
    },
    {
      key: "overdue_bills",
      group: "payments",
      label: "Overdue receivables",
      count: toNumber(overdueBills.count),
      amount: toNumber(overdueBills.amount),
      severity: "high",
      detail: "Payable bills past due date.",
      page: "bills",
      roles: ["admin", "accountant"]
    },
    {
      key: "suspense_payments",
      group: "payments",
      label: "Suspense payments",
      count: toNumber(suspense.count),
      amount: toNumber(suspense.amount),
      severity: "high",
      detail: "Voided receipts awaiting reapplication or discard.",
      page: "payments",
      roles: ["admin", "accountant"]
    },
    {
      key: "customer_credits",
      group: "payments",
      label: "Customer credits",
      count: toNumber(credits.count),
      amount: toNumber(credits.amount),
      severity: "low",
      detail: "Unallocated overpayments available for future bills.",
      page: "payments",
      roles: ["admin", "accountant"]
    },
    {
      key: "pending_adjustments",
      group: "payments",
      label: "Pending adjustments",
      count: toNumber(adjustments.count),
      amount: toNumber(adjustments.amount),
      severity: "medium",
      detail: "Credit or debit adjustments awaiting review.",
      page: "payments",
      roles: ["admin", "accountant"]
    },
    {
      key: "urgent_maintenance",
      group: "operations",
      label: "Urgent maintenance",
      count: toNumber(maintenance.urgent_count),
      severity: "high",
      detail: "Open or in-progress urgent requests.",
      page: "maintenance",
      roles: ["admin", "accountant", "meter_reader"]
    },
    {
      key: "overdue_maintenance",
      group: "operations",
      label: "Overdue maintenance",
      count: toNumber(maintenance.overdue_count),
      severity: "medium",
      detail: "Requests past their target date.",
      page: "maintenance",
      roles: ["admin", "accountant", "meter_reader"]
    },
    {
      key: "production_gap",
      group: "operations",
      label: "Production reading gap",
      count: toNumber(production.count),
      severity: "medium",
      detail: "Active production meters have no recent weekly reading.",
      page: "production",
      roles: ["admin", "accountant", "meter_reader"]
    },
    {
      key: "document_delivery",
      group: "communications",
      label: "Delivery exceptions",
      count: toNumber(deliveries.count),
      severity: "medium",
      detail: "Failed or skipped bill/receipt messages in the last 14 days.",
      page: "communications",
      roles: ["admin", "accountant"]
    },
    {
      key: "campaign_attention",
      group: "communications",
      label: "Campaigns needing review",
      count: toNumber(campaigns.count),
      severity: "medium",
      detail: "Running, failed, or error-bearing communication campaigns.",
      page: "communications",
      roles: ["admin", "accountant"]
    },
    {
      key: "payroll_attention",
      group: "finance",
      label: "Payroll awaiting action",
      count: toNumber(payroll.count),
      amount: toNumber(payroll.amount),
      severity: "medium",
      detail: "Payroll runs pending approval or payment.",
      page: "payroll",
      roles: ["admin", "accountant"]
    },
    {
      key: "approved_supplier_invoices",
      group: "finance",
      label: "Supplier invoices ready to post",
      count: toNumber(supplierPayables.approved_count),
      amount: toNumber(supplierPayables.approved_amount),
      severity: "medium",
      detail: "Approved contractor or supplier invoices not yet posted to expenses.",
      page: "contractors",
      roles: ["admin", "accountant", "business_viewer"]
    },
    {
      key: "overdue_supplier_invoices",
      group: "finance",
      label: "Overdue supplier invoices",
      count: toNumber(supplierPayables.overdue_count),
      amount: toNumber(supplierPayables.overdue_amount),
      severity: "high",
      detail: "Open contractor or supplier invoices past their due date.",
      page: "contractors",
      roles: ["admin", "accountant", "business_viewer"]
    },
    {
      key: "duplicate_open_payable_bills",
      group: "finance",
      label: "Duplicate open payable bills",
      count: toNumber(duplicateOpenBills.count),
      severity: "high",
      detail: "More than one unpaid payable bill exists for a customer in the same period.",
      page: "reports",
      roles: ["admin", "accountant"]
    },
    {
      key: "future_dated_operational_records",
      group: "finance",
      label: "Future-dated records",
      count: toNumber(futureDatedRecords.count),
      severity: "medium",
      detail: "Operational records dated later than today need admin review.",
      page: "reports",
      roles: ["admin", "accountant"]
    },
  ]);

  const groupDefinitions = [
    { key: "billing", title: "Billing Readiness", detail: "Readings, held bills, and source-side billing choices." },
    { key: "payments", title: "Collections Control", detail: "Overdue balances, credits, suspense, and adjustments." },
    { key: "operations", title: "Field Operations", detail: "Maintenance and production items that affect service continuity." },
    { key: "communications", title: "Customer Communication", detail: "Delivery and campaign issues for bills and receipts." },
    { key: "finance", title: "Close Support", detail: "Payroll and data-quality checks needed for month-end confidence." }
  ];

  const activeItems = items.filter((item) => item.count > 0);
  return {
    generated_at: new Date().toISOString(),
    summary: {
      total: activeItems.length,
      high: activeItems.filter((item) => item.severity === "high").length,
      medium: activeItems.filter((item) => item.severity === "medium").length,
      low: activeItems.filter((item) => item.severity === "low").length
    },
    groups: groupDefinitions
      .map((group) => ({
        ...group,
        items: items.filter((item) => item.group === group.key)
      }))
      .filter((group) => group.items.length)
  };
};

const getDashboard = asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    where.push(`customer_id = $${params.length}`);
  }
  where.push("bill_pay_status = 'payable'");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const summaryResult = await pool.query(
    `SELECT
       COALESCE(SUM(units_used), 0) AS water_units_billed,
       COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount,
       COALESCE(SUM(paid_amount), 0) AS cash_collected,
       COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)) FILTER (WHERE status <> 'paid'), 0) AS arrears,
       COUNT(*) FILTER (WHERE status <> 'paid') AS bills_due
     FROM bills
     ${clause}`,
    params
  );

  const actionCenter = await buildActionCenter(req.user.role);
  const charts = await buildDashboardCharts();

  res.json({
    summary: summaryResult.rows[0],
    actionCenter,
    charts
  });
});

module.exports = {
  getDashboard
};
