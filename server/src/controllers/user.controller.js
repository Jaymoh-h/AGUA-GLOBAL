const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listUsers = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.customer_id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
            c.acc_number AS customer_acc_number
     FROM users u
     LEFT JOIN customers c ON c.id = u.customer_id
     ORDER BY u.created_at DESC`
  );
  res.json(rows);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, password, customer_id } = req.body;

  if (!name || !email || !role || !password) {
    throw new ApiError(400, "Name, email, role, and password are required.");
  }

  if (!["admin", "meter_reader", "accountant", "customer"].includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, phone, role, customer_id, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, customer_id, name, email, phone, role, is_active, created_at`,
    [name, email.toLowerCase(), phone || null, role, customer_id || null, passwordHash]
  );

  res.status(201).json(rows[0]);
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role, is_active, customer_id } = req.body;

  const { rows } = await pool.query(
    `UPDATE users
     SET name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         role = COALESCE($3, role),
         is_active = COALESCE($4, is_active),
         customer_id = COALESCE($5, customer_id),
         updated_at = NOW()
     WHERE id = $6
     RETURNING id, customer_id, name, email, phone, role, is_active, created_at`,
    [name, phone, role, is_active, customer_id, req.params.id]
  );

  if (!rows[0]) {
    throw new ApiError(404, "User not found.");
  }
  res.json(rows[0]);
});

module.exports = {
  listUsers,
  createUser,
  updateUser
};
