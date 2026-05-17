const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

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
       WHERE status <> 'paid'
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
       COUNT(b.id) FILTER (WHERE b.status <> 'paid') AS open_bills,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid'), 0) -
         COALESCE((SELECT SUM(p.unallocated_amount) FROM payments p WHERE p.customer_id = c.id AND p.status = 'posted'), 0) AS balance_due,
       MIN(b.due_date) FILTER (WHERE b.status <> 'paid') AS oldest_due_date
     FROM customers c
     JOIN zones z ON z.id = c.zone_id
     LEFT JOIN bills b ON b.customer_id = c.id
     GROUP BY c.id, z.name
     HAVING COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid'), 0) -
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
       b.id,
       b.bill_number,
       b.billing_month,
       b.due_date,
       c.name AS customer_name,
       c.acc_number,
       z.name AS zone_name,
       COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) AS balance_amount,
       CASE
         WHEN CURRENT_DATE <= COALESCE(b.due_date, b.billing_month) THEN 'current'
         WHEN CURRENT_DATE - COALESCE(b.due_date, b.billing_month) <= 30 THEN '1-30'
         WHEN CURRENT_DATE - COALESCE(b.due_date, b.billing_month) <= 60 THEN '31-60'
         WHEN CURRENT_DATE - COALESCE(b.due_date, b.billing_month) <= 90 THEN '61-90'
         ELSE '90+'
       END AS aging_bucket
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     JOIN zones z ON z.id = c.zone_id
     WHERE b.status <> 'paid'
       AND COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) > 0
     ORDER BY COALESCE(b.due_date, b.billing_month) ASC, c.acc_number ASC
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
    expenseRegister: expenseRegister.rows
  });
});

module.exports = {
  getReportsSummary,
  getAccountantReports
};
