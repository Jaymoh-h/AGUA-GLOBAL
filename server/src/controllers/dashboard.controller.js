const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

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

  const monthlyResult = await pool.query(
    `SELECT
       to_char(billing_month, 'YYYY-MM') AS month,
       COALESCE(SUM(units_used), 0) AS water_units,
       COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed,
       COALESCE(SUM(paid_amount), 0) AS collected,
       COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)) FILTER (WHERE status <> 'paid'), 0) AS arrears
     FROM bills
     ${clause}
     GROUP BY billing_month
     ORDER BY billing_month DESC
     LIMIT 12`,
    params
  );

  const latestBillsResult = await pool.query(
    `SELECT b.id, b.billing_month, b.amount, b.total_amount, b.balance_amount, b.paid_amount, b.status, c.name AS customer_name, c.acc_number
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     WHERE b.bill_pay_status = 'payable'
       ${req.user.role === "customer" ? "AND b.customer_id = $1" : ""}
     ORDER BY b.created_at DESC
     LIMIT 8`,
    req.user.role === "customer" ? [req.user.customer_id || 0] : []
  );

  const operationsResult = await pool.query(
    `SELECT
       COALESCE(COUNT(*) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable' AND b.due_date < CURRENT_DATE), 0) AS overdue_bills,
       COALESCE(SUM(COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount)) FILTER (WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable' AND b.due_date < CURRENT_DATE), 0) AS overdue_amount,
       (
         SELECT COUNT(*)
         FROM customers c
         WHERE c.status = 'active'
           AND NOT EXISTS (
             SELECT 1
             FROM meter_readings mr
             WHERE mr.customer_id = c.id
               AND mr.reading_date >= date_trunc('month', CURRENT_DATE)::date
               AND mr.reading_date < (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month')
           )
       ) AS missing_current_readings,
       (
         SELECT COUNT(*)
         FROM customers c
         WHERE c.status = 'inactive'
           AND EXISTS (
             SELECT 1
             FROM bills ib
             WHERE ib.customer_id = c.id
               AND ib.status <> 'paid'
               AND ib.bill_pay_status = 'payable'
               AND COALESCE(NULLIF(ib.balance_amount, 0), ib.amount - ib.paid_amount) > 0
           )
       ) AS inactive_accounts_with_debt,
       (
         SELECT COUNT(*)
         FROM maintenance_requests mr
         WHERE mr.status IN ('open', 'in_progress')
       ) AS open_maintenance
     FROM bills b`
  );

  const highConsumptionResult = await pool.query(
    `SELECT b.id, b.bill_number, b.billing_month, b.units_used, c.name AS customer_name, c.acc_number
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     WHERE b.units_used > 0 AND b.bill_pay_status = 'payable'
     ORDER BY b.billing_month DESC, b.units_used DESC
     LIMIT 5`
  );

  res.json({
    summary: summaryResult.rows[0],
    monthly: monthlyResult.rows.reverse(),
    latestBills: latestBillsResult.rows,
    operations: operationsResult.rows[0],
    highConsumption: highConsumptionResult.rows
  });
});

module.exports = {
  getDashboard
};
