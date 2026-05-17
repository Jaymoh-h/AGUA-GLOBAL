const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const listAuditEvents = asyncHandler(async (req, res) => {
  const { entity_type, entity_id, action } = req.query;
  const params = [];
  const clauses = [];

  if (entity_type) {
    params.push(entity_type);
    clauses.push(`ae.entity_type = $${params.length}`);
  }

  if (entity_id) {
    params.push(Number(entity_id));
    clauses.push(`ae.entity_id = $${params.length}`);
  }

  if (action) {
    params.push(action);
    clauses.push(`ae.action = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT ae.*, u.name AS actor_name, u.email AS actor_email
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY ae.created_at DESC
     LIMIT 300`,
    params
  );

  res.json(rows);
});

module.exports = {
  listAuditEvents
};
