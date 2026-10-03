const pool = require("../db/pool");
const { monitoringCronSecret } = require("../config/env");
const { getMonitoringSnapshot, sendMonitoringAlerts } = require("../services/monitoringAlert.service");
const { recordSystemEvent } = require("../services/systemEvent.service");
const { recordAuditEvent } = require("../services/audit.service");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const assertMonitoringCronSecret = (req) => {
  if (!monitoringCronSecret) {
    throw new ApiError(503, "MONITORING_CRON_SECRET or CRON_SECRET is not configured.");
  }
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const headerSecret = req.headers["x-monitoring-cron-secret"];
  if (![bearer, headerSecret].includes(monitoringCronSecret)) {
    throw new ApiError(401, "Invalid monitoring cron secret.");
  }
};

const getMonitoringSummary = asyncHandler(async (_req, res) => {
  const startedAt = Date.now();
  let database = "ok";
  let databaseError = null;
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    database = "error";
    databaseError = error.message;
  }

  const [summary, recent, unresolved] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::integer AS events_24h,
         COUNT(*) FILTER (WHERE severity IN ('error', 'critical') AND created_at >= NOW() - INTERVAL '24 hours')::integer AS errors_24h,
         COUNT(*) FILTER (WHERE event_type = 'auth.login_failed' AND created_at >= NOW() - INTERVAL '24 hours')::integer AS login_failures_24h,
         COUNT(*) FILTER (WHERE event_type = 'server.error' AND created_at >= NOW() - INTERVAL '24 hours')::integer AS api_errors_24h,
         COUNT(*) FILTER (WHERE event_type = 'client.error' AND created_at >= NOW() - INTERVAL '24 hours')::integer AS client_errors_24h,
         COUNT(*) FILTER (WHERE source = 'database' AND created_at >= NOW() - INTERVAL '24 hours')::integer AS db_errors_24h,
         COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity IN ('error', 'critical'))::integer AS unresolved_errors
       FROM system_event_logs`
    ),
    pool.query(
      `SELECT sel.*, u.name AS actor_name, resolver.name AS resolved_by_name
       FROM system_event_logs sel
       LEFT JOIN users u ON u.id = sel.actor_user_id
       LEFT JOIN users resolver ON resolver.id = sel.resolved_by
       ORDER BY sel.created_at DESC
       LIMIT 80`
    ),
    pool.query(
      `SELECT event_type, severity, source, COUNT(*)::integer AS count, MAX(created_at) AS latest_at
       FROM system_event_logs
       WHERE resolved_at IS NULL
         AND severity IN ('warning', 'error', 'critical')
       GROUP BY event_type, severity, source
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 ELSE 2 END, latest_at DESC
       LIMIT 20`
    )
  ]);

  res.json({
    status: database === "ok" && Number(summary.rows[0]?.unresolved_errors || 0) === 0 ? "ok" : "review",
    checked_at: new Date().toISOString(),
    response_ms: Date.now() - startedAt,
    api: "ok",
    database,
    database_error: databaseError,
    summary: summary.rows[0],
    unresolved: unresolved.rows,
    recent_events: recent.rows
  });
});

const listMonitoringEvents = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const { rows } = await pool.query(
    `SELECT sel.*, u.name AS actor_name, resolver.name AS resolved_by_name
     FROM system_event_logs sel
     LEFT JOIN users u ON u.id = sel.actor_user_id
     LEFT JOIN users resolver ON resolver.id = sel.resolved_by
     ORDER BY sel.created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

const createClientEvent = asyncHandler(async (req, res) => {
  await recordSystemEvent({
    eventType: "client.error",
    severity: "error",
    source: "client",
    message: req.body?.message || "Client error",
    details: {
      stack: req.body?.stack || null,
      component_stack: req.body?.component_stack || null,
      url: req.body?.url || null,
      user_agent: req.body?.user_agent || null
    },
    req
  });
  res.status(204).send();
});

const resolveMonitoringEvent = asyncHandler(async (req, res) => {
  const eventId = Number(req.params.id);
  const resolutionNotes = String(req.body?.resolution_notes || "").trim();
  if (!Number.isInteger(eventId) || eventId < 1) throw new ApiError(400, "Monitoring event id is invalid.");
  if (resolutionNotes.length < 4 || resolutionNotes.length > 1000) {
    throw new ApiError(400, "Resolution notes must be between 4 and 1000 characters.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query("SELECT * FROM system_event_logs WHERE id = $1 FOR UPDATE", [eventId]);
    const before = existingRows[0];
    if (!before) throw new ApiError(404, "Monitoring event was not found.");
    if (before.resolved_at) throw new ApiError(400, "Monitoring event is already resolved.");
    if (!['warning', 'error', 'critical'].includes(before.severity)) {
      throw new ApiError(400, "Only warning, error, or critical monitoring events can be resolved.");
    }

    const { rows } = await client.query(
      `UPDATE system_event_logs
       SET resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE id = $3
       RETURNING *`,
      [req.user.id, resolutionNotes, eventId]
    );
    const resolved = rows[0];
    await recordAuditEvent(client, {
      req,
      action: "system_event.resolved",
      entityType: "system_event",
      entityId: eventId,
      beforeData: before,
      afterData: resolved,
      reason: resolutionNotes
    });
    await client.query("COMMIT");
    res.json({ ...resolved, resolved_by_name: req.user.name || req.user.email || null });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const runMonitoringCron = asyncHandler(async (req, res) => {
  assertMonitoringCronSecret(req);
  const result = await sendMonitoringAlerts({ req });
  res.json(result);
});

const getMonitoringAlertSnapshot = asyncHandler(async (_req, res) => {
  res.json(await getMonitoringSnapshot());
});

const sendMonitoringTestAlert = asyncHandler(async (req, res) => {
  const result = await sendMonitoringAlerts({ req, force: true });
  res.json(result);
});

module.exports = {
  createClientEvent,
  getMonitoringAlertSnapshot,
  getMonitoringSummary,
  listMonitoringEvents,
  resolveMonitoringEvent,
  runMonitoringCron,
  sendMonitoringTestAlert
};
