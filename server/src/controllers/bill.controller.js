const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listBills = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }

  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    clauses.push(`b.customer_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY b.billing_month DESC, b.created_at DESC`,
    params
  );
  res.json(rows);
});

const getBill = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     WHERE b.id = $1
       AND ($2::text <> 'customer' OR b.customer_id = $3)`,
    [req.params.id, req.user.role, req.user.customer_id || 0]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Bill not found.");
  }
  res.json(rows[0]);
});

const markBillStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["unpaid", "partial", "paid"].includes(status)) {
    throw new ApiError(400, "Status must be unpaid, partial, or paid.");
  }

  const { rows } = await pool.query(
    `UPDATE bills
     SET status = $1,
         paid_amount = CASE WHEN $1 = 'paid' THEN amount ELSE paid_amount END,
         paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE NULL END
     WHERE id = $2
     RETURNING *`,
    [status, req.params.id]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Bill not found.");
  }
  res.json(rows[0]);
});

module.exports = {
  listBills,
  getBill,
  markBillStatus
};
