const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const roles = ["admin", "meter_reader", "accountant", "customer"];

const publicColumns = `
  u.id, u.customer_id, u.name, u.email, u.phone, u.role, u.is_active,
  u.must_change_password, u.password_changed_at, u.last_login_at, u.created_at,
  c.acc_number AS customer_acc_number,
  c.name AS customer_name
`;

const normalizeCustomerId = (role, customerId) => {
  if (role !== "customer") return null;
  return customerId ? Number(customerId) : null;
};

const listUsers = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${publicColumns}
     FROM users u
     LEFT JOIN customers c ON c.id = u.customer_id
     ORDER BY u.created_at DESC`
  );
  res.json(rows);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, password, customer_id, is_active = true } = req.body;

  if (!name || !email || !role || !password) {
    throw new ApiError(400, "Name, email, role, and password are required.");
  }

  if (!roles.includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }

  const nextCustomerId = normalizeCustomerId(role, customer_id);
  if (role === "customer" && !nextCustomerId) {
    throw new ApiError(400, "Customer portal users must be linked to a customer account.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `WITH inserted AS (
         INSERT INTO users (
           name, email, phone, role, customer_id, password_hash,
           is_active, must_change_password
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING *
       )
       SELECT ${publicColumns.replaceAll("u.", "inserted.")}
       FROM inserted
       LEFT JOIN customers c ON c.id = inserted.customer_id`,
      [name, email.toLowerCase(), phone || null, role, nextCustomerId, passwordHash, Boolean(is_active)]
    );

    await recordAuditEvent(client, {
      req,
      action: "user.created",
      entityType: "user",
      entityId: rows[0].id,
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

const updateUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, is_active, customer_id, password } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "User not found.");
    }

    const nextRole = role || before.role;
    if (!roles.includes(nextRole)) {
      throw new ApiError(400, "Invalid role.");
    }

    const nextIsActive = is_active === undefined ? before.is_active : Boolean(is_active);
    if (Number(req.params.id) === Number(req.user.id) && !nextIsActive) {
      throw new ApiError(400, "You cannot deactivate your own account.");
    }

    const nextCustomerId =
      customer_id === undefined ? normalizeCustomerId(nextRole, before.customer_id) : normalizeCustomerId(nextRole, customer_id);
    if (nextRole === "customer" && !nextCustomerId) {
      throw new ApiError(400, "Customer portal users must be linked to a customer account.");
    }

    const nextPhone = phone === undefined ? before.phone : phone || null;
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await client.query(
      `WITH updated AS (
         UPDATE users
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = $3,
             role = $4,
             is_active = $5,
             customer_id = $6,
             password_hash = COALESCE($7, password_hash),
             must_change_password = CASE WHEN $7::text IS NULL THEN must_change_password ELSE TRUE END,
             password_changed_at = CASE WHEN $7::text IS NULL THEN password_changed_at ELSE NULL END,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *
       )
       SELECT ${publicColumns.replaceAll("u.", "updated.")}
       FROM updated
       LEFT JOIN customers c ON c.id = updated.customer_id`,
      [
        name || null,
        email ? email.toLowerCase() : null,
        nextPhone,
        nextRole,
        nextIsActive,
        nextCustomerId,
        passwordHash,
        req.params.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "user.updated",
      entityType: "user",
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

module.exports = {
  listUsers,
  createUser,
  updateUser
};
