const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listCustomers = asyncHandler(async (req, res) => {
  const search = req.query.search || "";
  const params = [`%${search}%`];
  const customerScope =
    req.user.role === "customer" ? `AND c.id = $${params.push(req.user.customer_id || 0)}` : "";
  const { rows } = await pool.query(
    `SELECT c.*,
      r.name AS rate_name,
      r.amount AS rate_amount,
      z.name AS zone_name,
      COALESCE(SUM(b.amount - b.paid_amount) FILTER (WHERE b.status <> 'paid'), 0) AS balance_due
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     LEFT JOIN bills b ON b.customer_id = c.id
     WHERE (c.name ILIKE $1 OR c.acc_number ILIKE $1 OR c.phone ILIKE $1)
     ${customerScope}
     GROUP BY c.id, r.name, r.amount, z.name
     ORDER BY c.created_at DESC`,
    params
  );
  res.json(rows);
});

const getCustomer = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, r.name AS rate_name, r.amount AS rate_amount, z.name AS zone_name
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     WHERE c.id = $1 AND ($2::text <> 'customer' OR c.id = $3)`,
    [req.params.id, req.user.role, req.user.customer_id || 0]
  );
  if (!rows[0]) {
    throw new ApiError(404, "Customer not found.");
  }
  res.json(rows[0]);
});

const createCustomer = asyncHandler(async (req, res) => {
  const { name, phone, acc_number, rate_id, zone_id } = req.body;
  if (!name || !acc_number || !rate_id || !zone_id) {
    throw new ApiError(400, "Name, account number, rate, and zone/location are required.");
  }

  const { rows } = await pool.query(
    `INSERT INTO customers (name, phone, location, acc_number, rate, rate_id, zone_id)
     SELECT $1, $2, z.name, $3, r.amount, r.id, z.id
     FROM rates r
     CROSS JOIN zones z
     WHERE r.id = $4 AND z.id = $5 AND r.is_active = TRUE AND z.is_active = TRUE
     RETURNING *`,
    [name, phone || null, acc_number, rate_id, zone_id]
  );
  if (!rows[0]) {
    throw new ApiError(400, "Selected rate or zone/location is inactive or does not exist.");
  }
  res.status(201).json(rows[0]);
});

const updateCustomer = asyncHandler(async (req, res) => {
  const { name, phone, acc_number, rate_id, zone_id, status } = req.body;
  const { rows } = await pool.query(
    `WITH selected AS (
       SELECT
         COALESCE($4::integer, c.rate_id) AS next_rate_id,
         COALESCE($5::integer, c.zone_id) AS next_zone_id
       FROM customers c
       WHERE c.id = $7
     )
     UPDATE customers c
     SET name = COALESCE($1, c.name),
         phone = COALESCE($2, c.phone),
         acc_number = COALESCE($3, c.acc_number),
         rate_id = r.id,
         zone_id = z.id,
         rate = r.amount,
         location = z.name,
         status = COALESCE($6, c.status),
         updated_at = NOW()
     FROM selected s
     JOIN rates r ON r.id = s.next_rate_id AND r.is_active = TRUE
     JOIN zones z ON z.id = s.next_zone_id AND z.is_active = TRUE
     WHERE c.id = $7
     RETURNING c.*`,
    [name, phone, acc_number, rate_id || null, zone_id || null, status, req.params.id]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Customer not found, or selected rate/zone is inactive.");
  }
  res.json(rows[0]);
});

const deleteCustomer = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
  if (!rowCount) {
    throw new ApiError(404, "Customer not found.");
  }
  res.status(204).send();
});

module.exports = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
