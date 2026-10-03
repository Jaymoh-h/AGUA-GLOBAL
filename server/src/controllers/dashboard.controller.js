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

const emptyMonthlyBudget = {
  has_target: false,
  revenue_target: 0,
  collection_target: 0,
  operating_expense_budget: 0,
  revenue_actual: 0,
  collection_actual: 0,
  operating_expense_actual: 0
};

const getMonthlyBudgetSnapshot = async () => {
  const target = await optionalQuery(
    "monthly_budget_targets",
    emptyMonthlyBudget,
    `SELECT
       TRUE AS has_target,
       t.revenue_target,
       t.collection_target,
       t.operating_expense_budget,
       COALESCE((
         SELECT SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount))
         FROM bills b
         WHERE b.bill_pay_status = 'payable'
           AND b.billing_month >= date_trunc('month', CURRENT_DATE)::date
           AND b.billing_month < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
       ), 0) AS revenue_actual,
       COALESCE((
         SELECT SUM(p.amount)
         FROM payments p
         WHERE p.status = 'posted'
           AND p.payment_date >= date_trunc('month', CURRENT_DATE)::date
           AND p.payment_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
       ), 0) AS collection_actual,
       COALESCE((
         SELECT SUM(e.amount)
         FROM expenses e
         WHERE e.expense_date >= date_trunc('month', CURRENT_DATE)::date
           AND e.expense_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
       ), 0) AS operating_expense_actual
     FROM monthly_budget_targets t
     WHERE t.budget_month = date_trunc('month', CURRENT_DATE)::date`
  );

  const revenueTarget = toNumber(target.revenue_target);
  const collectionTarget = toNumber(target.collection_target);
  const operatingExpenseBudget = toNumber(target.operating_expense_budget);
  const revenueActual = toNumber(target.revenue_actual);
  const collectionActual = toNumber(target.collection_actual);
  const operatingExpenseActual = toNumber(target.operating_expense_actual);
  const revenueShortfall = Math.max(revenueTarget - revenueActual, 0);
  const collectionShortfall = Math.max(collectionTarget - collectionActual, 0);
  const operatingExpenseOverrun = Math.max(operatingExpenseActual - operatingExpenseBudget, 0);

  return {
    has_target: Boolean(target.has_target),
    revenue_target: revenueTarget,
    collection_target: collectionTarget,
    operating_expense_budget: operatingExpenseBudget,
    revenue_actual: revenueActual,
    collection_actual: collectionActual,
    operating_expense_actual: operatingExpenseActual,
    revenue_variance: revenueActual - revenueTarget,
    collection_variance: collectionActual - collectionTarget,
    operating_expense_variance: operatingExpenseBudget - operatingExpenseActual,
    revenue_shortfall: revenueShortfall,
    collection_shortfall: collectionShortfall,
    operating_expense_overrun: operatingExpenseOverrun,
    issue_count: [revenueShortfall, collectionShortfall, operatingExpenseOverrun].filter((amount) => amount > 0).length,
    risk_amount: revenueShortfall + collectionShortfall + operatingExpenseOverrun
  };
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

const buildActionCenter = async (role, monthlyBudget) => {
  const [
    overdueBills,
    contactGaps,
    missingReadings,
    heldBills,
    unbilledConsumption,
    sourceRequests,
    customerReadingSubmissions,
    credits,
    suspense,
    adjustments,
    maintenance,
    paymentPlanRequests,
    billingDisputes,
    connectionRequests,
    deliveries,
    campaigns,
    payroll,
    supplierPayables,
    production,
    duplicateOpenBills,
    futureDatedRecords,
    paymentPlansBehind,
    standingOrdersBehind
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
      `WITH overdue_accounts AS (
         SELECT
           b.customer_id,
           SUM(
             GREATEST(
               COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
                 GREATEST(COALESCE(b.paid_amount, 0), COALESCE(allocations.allocated_amount, 0)),
               0
             )
           ) AS amount
         FROM bills b
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
           FROM payment_allocations pa
           WHERE pa.bill_id = b.id
         ) allocations ON TRUE
         WHERE b.status <> 'paid'
           AND b.bill_pay_status = 'payable'
           AND b.due_date < CURRENT_DATE
         GROUP BY b.customer_id
         HAVING SUM(
           GREATEST(
             COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
               GREATEST(COALESCE(b.paid_amount, 0), COALESCE(allocations.allocated_amount, 0)),
             0
           )
         ) > 0
       )
       SELECT
         COUNT(*) AS count,
         COALESCE(SUM(overdue_accounts.amount), 0) AS amount
       FROM overdue_accounts
       JOIN customers c ON c.id = overdue_accounts.customer_id
       LEFT JOIN LATERAL (
         SELECT u.email
         FROM users u
         WHERE u.customer_id = c.id
           AND u.is_active = TRUE
           AND u.email IS NOT NULL
         ORDER BY u.role = 'customer' DESC, u.id ASC
         LIMIT 1
       ) portal_user ON TRUE
       WHERE NOT (
         (c.email_delivery_enabled = TRUE AND COALESCE(c.email, portal_user.email) IS NOT NULL)
         OR (c.sms_delivery_enabled = TRUE AND NULLIF(BTRIM(c.phone), '') IS NOT NULL)
         OR (c.whatsapp_delivery_enabled = TRUE AND NULLIF(BTRIM(c.phone), '') IS NOT NULL)
       )`
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
    queryOne(
      `SELECT COUNT(*) AS count
       FROM meter_readings mr
       JOIN meters m ON m.id = mr.meter_id
       WHERE m.meter_role = 'client_billing'
         AND mr.previous_reading_id IS NOT NULL
         AND mr.reading_date >= date_trunc('month', CURRENT_DATE)::date
         AND mr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
         AND NOT EXISTS (
           SELECT 1
           FROM bills b
           WHERE b.current_reading_id = mr.id
         )`
    ),
    optionalQuery(
      "source_billing_requests",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM source_billing_requests
       WHERE status = 'pending'`
    ),
    optionalQuery(
      "customer_reading_submissions",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM customer_reading_submissions
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
      "maintenance_requests",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM maintenance_requests
       WHERE category = 'payment_plan'
         AND status IN ('open', 'in_progress')`
    ),
    optionalQuery(
      "maintenance_requests",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM maintenance_requests
       WHERE category = 'billing_dispute'
         AND status IN ('open', 'in_progress')`
    ),
    optionalQuery(
      "maintenance_requests",
      { count: 0 },
      `SELECT COUNT(*) AS count
       FROM maintenance_requests
       WHERE category = 'connection'
         AND status IN ('open', 'in_progress')`
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
    ),
    optionalQuery(
      "payment_arrangements",
      { count: 0, amount: 0 },
      `WITH due_plans AS (
         SELECT pa.*,
                CASE
                  WHEN CURRENT_DATE < pa.first_due_date THEN 0
                  WHEN pa.frequency = 'weekly' THEN ((CURRENT_DATE - pa.first_due_date) / 7) + 1
                  ELSE (
                    (EXTRACT(YEAR FROM age(CURRENT_DATE, pa.first_due_date))::integer * 12) +
                    EXTRACT(MONTH FROM age(CURRENT_DATE, pa.first_due_date))::integer + 1
                  )
                END::integer AS installments_due
         FROM payment_arrangements pa
         WHERE pa.status = 'active'
       )
       SELECT COUNT(*) FILTER (
                WHERE received_amount < LEAST(agreed_amount, installment_amount * installments_due)
              ) AS count,
              COALESCE(SUM(
                GREATEST(LEAST(agreed_amount, installment_amount * installments_due) - received_amount, 0)
              ) FILTER (
                WHERE received_amount < LEAST(agreed_amount, installment_amount * installments_due)
              ), 0) AS amount
       FROM due_plans dp
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS received_amount
         FROM payments p
         WHERE p.customer_id = dp.customer_id
           AND p.status = 'posted'
           AND p.payment_date >= COALESCE(dp.approved_at::date, dp.created_at::date)
       ) receipts ON TRUE`
    ),
    optionalQuery(
      "standing_orders",
      { count: 0, amount: 0 },
      `WITH due_orders AS (
         SELECT so.*,
                CASE
                  WHEN CURRENT_DATE < so.first_due_date THEN 0
                  WHEN so.frequency = 'weekly' THEN ((CURRENT_DATE - so.first_due_date) / 7) + 1
                  ELSE (
                    (EXTRACT(YEAR FROM age(CURRENT_DATE, so.first_due_date))::integer * 12) +
                    EXTRACT(MONTH FROM age(CURRENT_DATE, so.first_due_date))::integer + 1
                  )
                END::integer AS installments_due
         FROM standing_orders so
         WHERE so.status = 'active'
       )
       SELECT COUNT(*) FILTER (
                WHERE matched_amount < expected_amount * installments_due
              ) AS count,
              COALESCE(SUM(
                GREATEST(expected_amount * installments_due - matched_amount, 0)
              ) FILTER (
                WHERE matched_amount < expected_amount * installments_due
              ), 0) AS amount
       FROM due_orders so
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS matched_amount
         FROM payments p
         WHERE p.customer_id = so.customer_id
           AND p.status = 'posted'
           AND p.payment_date >= so.first_due_date
           AND CONCAT_WS(' ', p.external_reference, p.receipt_number, p.received_from, p.notes)
             ILIKE '%' || so.mandate_reference || '%'
       ) receipts ON TRUE`
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
      key: "unbilled_consumption",
      group: "billing",
      label: "Unbilled consumption",
      count: toNumber(unbilledConsumption.count),
      severity: "high",
      detail: "Current-month client-meter readings with no linked bill.",
      page: "billing",
      roles: ["admin", "accountant"]
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
      key: "pending_customer_readings",
      group: "billing",
      label: "Customer meter readings",
      count: toNumber(customerReadingSubmissions.count),
      severity: "medium",
      detail: "Customer-submitted readings awaiting verification before billing.",
      page: "readings",
      roles: ["admin", "accountant", "meter_reader"]
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
      page: "collections",
      roles: ["admin", "accountant"]
    },
    {
      key: "contact_gaps",
      group: "payments",
      label: "Overdue accounts missing contact",
      count: toNumber(contactGaps.count),
      amount: toNumber(contactGaps.amount),
      severity: "high",
      detail: "Overdue accounts with no enabled email, SMS, or WhatsApp channel.",
      page: "collections",
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
      key: "payment_plans_behind",
      group: "payments",
      label: "Payment plans behind",
      count: toNumber(paymentPlansBehind.count),
      amount: toNumber(paymentPlansBehind.amount),
      severity: "high",
      detail: "Approved plans where posted receipts are below instalments due.",
      page: "collections",
      roles: ["admin", "accountant"]
    },
    {
      key: "payment_plan_requests",
      group: "payments",
      label: "Payment-plan proposals",
      count: toNumber(paymentPlanRequests.count),
      severity: "medium",
      detail: "Customer payment-plan requests awaiting staff review.",
      page: "collections",
      roles: ["admin", "accountant"]
    },
    {
      key: "billing_disputes",
      group: "payments",
      label: "Billing disputes",
      count: toNumber(billingDisputes.count),
      severity: "medium",
      detail: "Customer bill-review cases awaiting finance resolution.",
      page: "maintenance",
      roles: ["admin", "accountant"]
    },
    {
      key: "connection_requests",
      group: "operations",
      label: "Connection requests",
      count: toNumber(connectionRequests.count),
      severity: "medium",
      detail: "Customer connection and site-inspection requests awaiting field review.",
      page: "maintenance",
      focus: "connection_requests",
      roles: ["admin", "accountant", "meter_reader"]
    },
    {
      key: "standing_orders_behind",
      group: "payments",
      label: "Standing orders behind",
      count: toNumber(standingOrdersBehind.count),
      amount: toNumber(standingOrdersBehind.amount),
      severity: "high",
      detail: "Active bank mandates where confirmed receipts are below scheduled amounts.",
      page: "collections",
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
      key: "monthly_budget_variance",
      group: "finance",
      label: monthlyBudget.has_target ? "Monthly budget variance" : "Monthly budget target missing",
      count: monthlyBudget.has_target ? monthlyBudget.issue_count : 1,
      ...(monthlyBudget.has_target ? { amount: monthlyBudget.risk_amount } : {}),
      severity: monthlyBudget.has_target ? "high" : "medium",
      detail: monthlyBudget.has_target
        ? "Current-month revenue, collections, or operating cost is outside its recorded target."
        : "Record this month's targets before variance can be monitored.",
      page: "reports",
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

const buildPerformanceSnapshot = async (role, monthlyBudget) => {
  const [receivables, collections, readings, heldBills, unbilledConsumption, sourceBilling, deliveries, margin, production, maintenance, payrollLiability, contractorPayables] = await Promise.all([
    queryOne(
      `SELECT
         COALESCE(SUM(
           GREATEST(
             COALESCE(NULLIF(b.total_amount, 0), b.amount, 0) -
               GREATEST(COALESCE(b.paid_amount, 0), COALESCE(allocations.allocated_amount, 0)),
             0
           )
         ), 0) AS open_balance,
         COALESCE(SUM(COALESCE(NULLIF(b.total_amount, 0), b.amount, 0)) FILTER (
           WHERE b.billing_month >= CURRENT_DATE - INTERVAL '90 days'
         ), 0) AS trailing_billed_amount
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(pa.amount), 0) AS allocated_amount
         FROM payment_allocations pa
         WHERE pa.bill_id = b.id
       ) allocations ON TRUE
       WHERE b.bill_pay_status = 'payable'`
    ),
    queryOne(
      `SELECT
         COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount,
         COALESCE(SUM(LEAST(
           GREATEST(COALESCE(paid_amount, 0), 0),
           COALESCE(NULLIF(total_amount, 0), amount)
         )), 0) AS collected_amount
       FROM bills
       WHERE bill_pay_status = 'payable'
         AND billing_month >= date_trunc('month', CURRENT_DATE)::date
         AND billing_month < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')`
    ),
    queryOne(
      `SELECT
         COUNT(*)::integer AS required_count,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1
             FROM meter_readings mr
             WHERE mr.customer_id = c.id
               AND mr.reading_date >= date_trunc('month', CURRENT_DATE)::date
               AND mr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
           )
         )::integer AS completed_count
       FROM customers c
       WHERE c.status = 'active'
         AND EXISTS (
           SELECT 1
           FROM meters m
           WHERE m.customer_id = c.id
             AND m.status = 'active'
             AND m.meter_role = 'client_billing'
         )`
    ),
    queryOne(
      `SELECT COUNT(*)::integer AS count
       FROM bills
       WHERE bill_pay_status = 'held'`
    ),
    queryOne(
      `SELECT COUNT(*)::integer AS count
       FROM meter_readings mr
       JOIN meters m ON m.id = mr.meter_id
       WHERE m.meter_role = 'client_billing'
         AND mr.previous_reading_id IS NOT NULL
         AND mr.reading_date >= date_trunc('month', CURRENT_DATE)::date
         AND mr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
         AND NOT EXISTS (
           SELECT 1
           FROM bills b
           WHERE b.current_reading_id = mr.id
         )`
    ),
    optionalQuery(
      "source_billing_requests",
      { count: 0 },
      `SELECT COUNT(*)::integer AS count
       FROM source_billing_requests
       WHERE status = 'pending'`
    ),
    optionalQuery(
      "document_delivery_logs",
      { attempted_count: 0, successful_count: 0, exception_count: 0 },
      `SELECT
         COUNT(*)::integer AS attempted_count,
         COUNT(*) FILTER (WHERE status = 'sent')::integer AS successful_count,
         COUNT(*) FILTER (WHERE status IN ('failed', 'skipped'))::integer AS exception_count
       FROM document_delivery_logs
       WHERE created_at >= NOW() - INTERVAL '14 days'`
    ),
    queryOne(
      `SELECT
         COALESCE((
           SELECT SUM(COALESCE(NULLIF(total_amount, 0), amount))
           FROM bills
           WHERE bill_pay_status = 'payable'
             AND billing_month >= date_trunc('month', CURRENT_DATE)::date
             AND billing_month < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
         ), 0) AS revenue,
         COALESCE((
           SELECT SUM(amount)
           FROM expenses
           WHERE expense_date >= date_trunc('month', CURRENT_DATE)::date
             AND expense_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
         ), 0) AS expenses`
    ),
    optionalQuery(
      "production_weekly_readings",
      { completed_week_count: 0, output_units: 0 },
      `SELECT
         COUNT(DISTINCT pwr.id)::integer AS completed_week_count,
         COALESCE(SUM(pmr.consumption), 0) AS output_units
       FROM production_weekly_readings pwr
       LEFT JOIN production_meter_readings pmr ON pmr.weekly_reading_id = pwr.id
       WHERE pwr.reading_date >= date_trunc('month', CURRENT_DATE)::date
         AND pwr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')`
    ),
    optionalQuery(
      "maintenance_requests",
      { active_count: 0, overdue_count: 0, avg_resolution_days: 0 },
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::integer AS active_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND target_date < CURRENT_DATE)::integer AS overdue_count,
         COALESCE(
           AVG(EXTRACT(EPOCH FROM (resolved_at - reported_at)) / 86400.0)
             FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL),
           0
         ) AS avg_resolution_days
       FROM maintenance_requests`
    ),
    optionalQuery(
      "payroll_runs",
      { approved_run_count: 0, approved_amount: 0 },
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved')::integer AS approved_run_count,
         COALESCE(SUM(total_net) FILTER (WHERE status = 'approved'), 0) AS approved_amount
       FROM payroll_runs
       WHERE period_start <= (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month - 1 day')::date
         AND period_end >= date_trunc('month', CURRENT_DATE)::date`
    ),
    optionalQuery(
      "contractor_invoices",
      { open_invoice_count: 0, open_amount: 0, overdue_invoice_count: 0, overdue_amount: 0 },
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved'))::integer AS open_invoice_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft', 'submitted', 'approved')), 0) AS open_amount,
         COUNT(*) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE)::integer AS overdue_invoice_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft', 'submitted', 'approved') AND due_date < CURRENT_DATE), 0) AS overdue_amount
       FROM contractor_invoices`
    )
  ]);

  const billedAmount = toNumber(collections.billed_amount);
  const collectedAmount = toNumber(collections.collected_amount);
  const openReceivables = toNumber(receivables.open_balance);
  const trailingBilledAmount = toNumber(receivables.trailing_billed_amount);
  const requiredReadings = toNumber(readings.required_count);
  const completedReadings = toNumber(readings.completed_count);
  const deliveryAttempts = toNumber(deliveries.attempted_count);
  const deliveredCount = toNumber(deliveries.successful_count);
  const revenue = toNumber(margin.revenue);
  const expenses = toNumber(margin.expenses);
  const productionOutput = toNumber(production.output_units);
  const billedUnits = toNumber(
    (await queryOne(
      `SELECT COALESCE(SUM(units_used), 0) AS billed_units
       FROM bills
       WHERE bill_pay_status = 'payable'
         AND billing_month >= date_trunc('month', CURRENT_DATE)::date
         AND billing_month < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')`
    )).billed_units
  );

  return {
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    readings: {
      required_count: requiredReadings,
      completed_count: completedReadings,
      completion_rate: requiredReadings ? completedReadings / requiredReadings : null
    },
    billing: {
      blocker_count: toNumber(heldBills.count) + toNumber(unbilledConsumption.count) + toNumber(sourceBilling.count),
      held_bill_count: toNumber(heldBills.count),
      unbilled_consumption_count: toNumber(unbilledConsumption.count),
      pending_source_billing_count: toNumber(sourceBilling.count)
    },
    ...(role === "meter_reader"
      ? {}
      : {
          collections: {
            billed_amount: billedAmount,
            collected_amount: collectedAmount,
            collection_rate: billedAmount ? collectedAmount / billedAmount : null,
            open_receivables: openReceivables,
            trailing_billed_amount: trailingBilledAmount,
            days_sales_outstanding: trailingBilledAmount ? (openReceivables / trailingBilledAmount) * 90 : null
          },
          deliveries: {
            attempted_count: deliveryAttempts,
            successful_count: deliveredCount,
            exception_count: toNumber(deliveries.exception_count),
            success_rate: deliveryAttempts ? deliveredCount / deliveryAttempts : null
          },
          margin: {
            revenue,
            expenses,
            net_amount: revenue - expenses,
            margin_rate: revenue ? (revenue - expenses) / revenue : null
          },
          budget: monthlyBudget,
          operations: {
            production: {
              completed_week_count: toNumber(production.completed_week_count),
              output_units: productionOutput,
              billed_units: billedUnits,
              variance_units: productionOutput - billedUnits
            },
            maintenance: {
              active_count: toNumber(maintenance.active_count),
              overdue_count: toNumber(maintenance.overdue_count),
              avg_resolution_days: toNumber(maintenance.avg_resolution_days)
            },
            payroll_liability: {
              approved_run_count: toNumber(payrollLiability.approved_run_count),
              approved_amount: toNumber(payrollLiability.approved_amount)
            },
            contractor_payables: {
              open_invoice_count: toNumber(contractorPayables.open_invoice_count),
              open_amount: toNumber(contractorPayables.open_amount),
              overdue_invoice_count: toNumber(contractorPayables.overdue_invoice_count),
              overdue_amount: toNumber(contractorPayables.overdue_amount)
            }
          }
        })
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

  const monthlyBudgetPromise = getMonthlyBudgetSnapshot();
  const [actionCenter, charts, performance] = await Promise.all([
    monthlyBudgetPromise.then((monthlyBudget) => buildActionCenter(req.user.role, monthlyBudget)),
    buildDashboardCharts(),
    req.user.role === "customer"
      ? Promise.resolve(null)
      : monthlyBudgetPromise.then((monthlyBudget) => buildPerformanceSnapshot(req.user.role, monthlyBudget))
  ]);

  res.json({
    summary: summaryResult.rows[0],
    actionCenter,
    charts,
    performance
  });
});

module.exports = {
  getDashboard
};
