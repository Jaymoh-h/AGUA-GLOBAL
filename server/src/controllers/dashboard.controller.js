const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const getDashboard = asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    where.push(`customer_id = $${params.length}`);
  }
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
     ${req.user.role === "customer" ? "WHERE b.customer_id = $1" : ""}
     ORDER BY b.created_at DESC
     LIMIT 8`,
    req.user.role === "customer" ? [req.user.customer_id || 0] : []
  );

  res.json({
    summary: summaryResult.rows[0],
    monthly: monthlyResult.rows.reverse(),
    latestBills: latestBillsResult.rows
  });
});

module.exports = {
  getDashboard
};
