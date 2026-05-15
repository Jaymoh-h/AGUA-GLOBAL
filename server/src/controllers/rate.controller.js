const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listRates = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM rates ORDER BY name ASC");
  res.json(rows);
});

const createRate = asyncHandler(async (req, res) => {
  const { name, amount, description, is_active } = req.body;
  if (!name || amount === undefined) {
    throw new ApiError(400, "Rate name and amount are required.");
  }

  const { rows } = await pool.query(
    `INSERT INTO rates (name, amount, description, is_active)
     VALUES ($1, $2, $3, COALESCE($4, TRUE))
     RETURNING *`,
    [name, amount, description || null, is_active]
  );
  res.status(201).json(rows[0]);
});

const updateRate = asyncHandler(async (req, res) => {
  const { name, amount, description, is_active } = req.body;
  const { rows } = await pool.query(
    `UPDATE rates
     SET name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         description = COALESCE($3, description),
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [name, amount, description, is_active, req.params.id]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Rate not found.");
  }

  await pool.query(
    `UPDATE customers
     SET rate = $1, updated_at = NOW()
     WHERE rate_id = $2`,
    [rows[0].amount, rows[0].id]
  );

  res.json(rows[0]);
});

module.exports = {
  listRates,
  createRate,
  updateRate
};

