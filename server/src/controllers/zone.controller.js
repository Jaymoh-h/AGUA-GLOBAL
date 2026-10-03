const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const listZones = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM zones ORDER BY name ASC");
  res.json(rows);
});

const createZone = asyncHandler(async (req, res) => {
  const { name, description, is_active, review_notes } = req.body;
  if (!name) {
    throw new ApiError(400, "Zone/location name is required.");
  }
  const reviewNotes = String(review_notes || "").trim();
  if (!reviewNotes) throw new ApiError(400, "Location approval notes are required before saving a zone/location.");

  const { rows } = await pool.query(
    `INSERT INTO zones (name, description, is_active)
     VALUES ($1, $2, COALESCE($3, TRUE))
     RETURNING *`,
    [name, description || null, is_active]
  );
  await recordAuditEvent(pool, { req, action: "zone.created", entityType: "zone", entityId: rows[0].id, afterData: rows[0], reason: reviewNotes });
  res.status(201).json(rows[0]);
});

const updateZone = asyncHandler(async (req, res) => {
  const { name, description, is_active, review_notes } = req.body;
  const reviewNotes = String(review_notes || "").trim();
  if (!reviewNotes) throw new ApiError(400, "Location approval notes are required before saving a zone/location.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = (await client.query("SELECT * FROM zones WHERE id = $1 FOR UPDATE", [req.params.id])).rows[0];
    if (!before) throw new ApiError(404, "Zone/location not found.");
    const { rows } = await client.query(
      `UPDATE zones
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, description, is_active, req.params.id]
    );
    await client.query(
      `UPDATE customers
       SET location = $1, updated_at = NOW()
       WHERE zone_id = $2`,
      [rows[0].name, rows[0].id]
    );
    await recordAuditEvent(client, { req, action: "zone.updated", entityType: "zone", entityId: rows[0].id, beforeData: before, afterData: rows[0], reason: reviewNotes });
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
  listZones,
  createZone,
  updateZone
};
