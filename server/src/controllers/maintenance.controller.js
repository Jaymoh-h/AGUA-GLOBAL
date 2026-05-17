const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const categories = ["leak", "meter_fault", "no_water", "low_pressure", "water_quality", "connection", "billing_support", "other"];
const priorities = ["low", "normal", "high", "urgent"];
const statuses = ["open", "in_progress", "resolved", "cancelled"];
const sources = ["internal", "field", "customer_portal", "phone", "walk_in", "other"];

const nullableId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const dateOnlyOrNull = (value) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new ApiError(400, "Target date must use YYYY-MM-DD.");
  }
  return value;
};

const requireOneOf = (value, allowed, label) => {
  if (!allowed.includes(value)) {
    throw new ApiError(400, `${label} is invalid.`);
  }
  return value;
};

const selectMaintenanceRequestSql = `
  SELECT mr.*,
    c.name AS customer_name,
    c.acc_number,
    z.name AS zone_name,
    m.meter_number,
    assigned.name AS assigned_to_name,
    creator.name AS created_by_name,
    resolver.name AS resolved_by_name
  FROM maintenance_requests mr
  LEFT JOIN customers c ON c.id = mr.customer_id
  LEFT JOIN zones z ON z.id = mr.zone_id
  LEFT JOIN meters m ON m.id = mr.meter_id
  LEFT JOIN users assigned ON assigned.id = mr.assigned_to
  LEFT JOIN users creator ON creator.id = mr.created_by
  LEFT JOIN users resolver ON resolver.id = mr.resolved_by
`;

const getMaintenanceRequest = async (client, id, { lock = false } = {}) => {
  const { rows } = await client.query(
    `${selectMaintenanceRequestSql}
     WHERE mr.id = $1
     ${lock ? "FOR UPDATE OF mr" : ""}`,
    [id]
  );
  return rows[0] || null;
};

const listMaintenanceRequests = asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];

  if (req.query.status) {
    filters.push(`mr.status = $${params.push(requireOneOf(req.query.status, statuses, "Status"))}`);
  }

  if (req.query.customer_id) {
    filters.push(`mr.customer_id = $${params.push(nullableId(req.query.customer_id) || 0)}`);
  }

  const { rows } = await pool.query(
    `${selectMaintenanceRequestSql}
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY
       CASE mr.priority
         WHEN 'urgent' THEN 0
         WHEN 'high' THEN 1
         WHEN 'normal' THEN 2
         ELSE 3
       END,
       CASE mr.status
         WHEN 'open' THEN 0
         WHEN 'in_progress' THEN 1
         WHEN 'resolved' THEN 2
         ELSE 3
       END,
       mr.reported_at DESC
     LIMIT 300`,
    params
  );

  res.json(rows);
});

const listMaintenanceAssignees = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, role
     FROM users
     WHERE is_active = TRUE AND role IN ('admin', 'accountant', 'meter_reader')
     ORDER BY role ASC, name ASC`
  );
  res.json(rows);
});

const createMaintenanceRequest = asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) throw new ApiError(400, "Title is required.");

  const category = requireOneOf(req.body.category || "other", categories, "Category");
  const priority = requireOneOf(req.body.priority || "normal", priorities, "Priority");
  const source = requireOneOf(req.body.source || "internal", sources, "Source");
  const customerId = nullableId(req.body.customer_id);
  const suppliedZoneId = nullableId(req.body.zone_id);
  const meterId = nullableId(req.body.meter_id);
  const assignedTo = nullableId(req.body.assigned_to);
  const targetDate = dateOnlyOrNull(req.body.target_date);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let zoneId = suppliedZoneId;
    if (customerId && !zoneId) {
      const customerResult = await client.query("SELECT zone_id FROM customers WHERE id = $1", [customerId]);
      if (!customerResult.rows[0]) throw new ApiError(400, "Selected customer does not exist.");
      zoneId = customerResult.rows[0].zone_id;
    }

    const { rows } = await client.query(
      `INSERT INTO maintenance_requests (
        customer_id, zone_id, meter_id, title, category, priority, source,
        target_date, assigned_to, description, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        customerId,
        zoneId,
        meterId,
        title,
        category,
        priority,
        source,
        targetDate,
        assignedTo,
        req.body.description || null,
        req.user.id
      ]
    );

    const requestNumber = `MR-${String(rows[0].id).padStart(5, "0")}`;
    await client.query("UPDATE maintenance_requests SET request_number = $1 WHERE id = $2", [requestNumber, rows[0].id]);
    const created = await getMaintenanceRequest(client, rows[0].id);

    await recordAuditEvent(client, {
      req,
      action: "maintenance_request.created",
      entityType: "maintenance_request",
      entityId: created.id,
      afterData: created
    });

    await client.query("COMMIT");
    res.status(201).json(created);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateMaintenanceRequest = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getMaintenanceRequest(client, req.params.id, { lock: true });
    if (!before) throw new ApiError(404, "Maintenance request not found.");
    if (before.status === "resolved") throw new ApiError(400, "Resolved maintenance requests cannot be edited.");

    const nextStatus = req.body.status === undefined ? before.status : requireOneOf(req.body.status, statuses, "Status");
    if (nextStatus === "resolved") throw new ApiError(400, "Use the resolve action to resolve a maintenance request.");

    const customerId = req.body.customer_id === undefined ? before.customer_id : nullableId(req.body.customer_id);
    const suppliedZoneId = req.body.zone_id === undefined ? before.zone_id : nullableId(req.body.zone_id);
    let zoneId = suppliedZoneId;
    if (customerId && req.body.zone_id === undefined && before.customer_id !== customerId) {
      const customerResult = await client.query("SELECT zone_id FROM customers WHERE id = $1", [customerId]);
      if (!customerResult.rows[0]) throw new ApiError(400, "Selected customer does not exist.");
      zoneId = customerResult.rows[0].zone_id;
    }

    const { rows } = await client.query(
      `UPDATE maintenance_requests
       SET customer_id = $1,
           zone_id = $2,
           meter_id = $3,
           title = $4,
           category = $5,
           priority = $6,
           status = $7,
           source = $8,
           target_date = $9,
           assigned_to = $10,
           description = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        customerId,
        zoneId,
        req.body.meter_id === undefined ? before.meter_id : nullableId(req.body.meter_id),
        req.body.title === undefined ? before.title : String(req.body.title || "").trim(),
        req.body.category === undefined ? before.category : requireOneOf(req.body.category, categories, "Category"),
        req.body.priority === undefined ? before.priority : requireOneOf(req.body.priority, priorities, "Priority"),
        nextStatus,
        req.body.source === undefined ? before.source : requireOneOf(req.body.source, sources, "Source"),
        req.body.target_date === undefined ? before.target_date : dateOnlyOrNull(req.body.target_date),
        req.body.assigned_to === undefined ? before.assigned_to : nullableId(req.body.assigned_to),
        req.body.description === undefined ? before.description : req.body.description || null,
        req.params.id
      ]
    );

    if (!rows[0].title) throw new ApiError(400, "Title is required.");
    const updated = await getMaintenanceRequest(client, rows[0].id);
    await recordAuditEvent(client, {
      req,
      action: "maintenance_request.updated",
      entityType: "maintenance_request",
      entityId: updated.id,
      beforeData: before,
      afterData: updated
    });

    await client.query("COMMIT");
    res.json(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const resolveMaintenanceRequest = asyncHandler(async (req, res) => {
  const resolutionNotes = String(req.body.resolution_notes || "").trim();
  if (!resolutionNotes) throw new ApiError(400, "Resolution notes are required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getMaintenanceRequest(client, req.params.id, { lock: true });
    if (!before) throw new ApiError(404, "Maintenance request not found.");
    if (before.status === "resolved") throw new ApiError(400, "Maintenance request is already resolved.");
    if (before.status === "cancelled") throw new ApiError(400, "Cancelled maintenance requests cannot be resolved.");

    const { rows } = await client.query(
      `UPDATE maintenance_requests
       SET status = 'resolved',
           resolution_notes = $1,
           resolved_at = NOW(),
           resolved_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [resolutionNotes, req.user.id, req.params.id]
    );

    const resolved = await getMaintenanceRequest(client, rows[0].id);
    await recordAuditEvent(client, {
      req,
      action: "maintenance_request.resolved",
      entityType: "maintenance_request",
      entityId: resolved.id,
      beforeData: before,
      afterData: resolved
    });

    await client.query("COMMIT");
    res.json(resolved);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  createMaintenanceRequest,
  listMaintenanceAssignees,
  listMaintenanceRequests,
  resolveMaintenanceRequest,
  updateMaintenanceRequest
};
