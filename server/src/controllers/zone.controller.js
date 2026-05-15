const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const listZones = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM zones ORDER BY name ASC");
  res.json(rows);
});

const createZone = asyncHandler(async (req, res) => {
  const { name, description, is_active } = req.body;
  if (!name) {
    throw new ApiError(400, "Zone/location name is required.");
  }

  const { rows } = await pool.query(
    `INSERT INTO zones (name, description, is_active)
     VALUES ($1, $2, COALESCE($3, TRUE))
     RETURNING *`,
    [name, description || null, is_active]
  );
  res.status(201).json(rows[0]);
});

const updateZone = asyncHandler(async (req, res) => {
  const { name, description, is_active } = req.body;
  const { rows } = await pool.query(
    `UPDATE zones
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [name, description, is_active, req.params.id]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Zone/location not found.");
  }

  await pool.query(
    `UPDATE customers
     SET location = $1, updated_at = NOW()
     WHERE zone_id = $2`,
    [rows[0].name, rows[0].id]
  );

  res.json(rows[0]);
});

module.exports = {
  listZones,
  createZone,
  updateZone
};

