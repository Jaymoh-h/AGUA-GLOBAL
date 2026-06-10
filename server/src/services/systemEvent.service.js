const pool = require("../db/pool");

const safeDetails = (details) => {
  if (!details || typeof details !== "object") return details || null;
  const json = JSON.stringify(details, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    if (typeof value === "function") return undefined;
    return value;
  });
  return JSON.parse(json);
};

const eventFromRequest = (req) => ({
  actorUserId: req?.user?.id || null,
  method: req?.method || null,
  path: req?.originalUrl || req?.url || null,
  ipAddress: req?.ip || null,
  userAgent: req?.headers?.["user-agent"] || null
});

const recordSystemEvent = async ({
  eventType,
  severity = "info",
  source = "server",
  message,
  details = null,
  req = null,
  actorUserId,
  method,
  path,
  statusCode,
  ipAddress,
  userAgent
}) => {
  const requestData = eventFromRequest(req);
  try {
    await pool.query(
      `INSERT INTO system_event_logs (
        event_type, severity, source, message, details, actor_user_id,
        method, path, status_code, ip_address, user_agent
      )
      VALUES ($1::varchar, $2::varchar, $3::varchar, $4, $5::jsonb, $6, $7::varchar, $8, $9, $10::varchar, $11)`,
      [
        eventType,
        severity,
        source,
        String(message || eventType || "System event").slice(0, 1000),
        JSON.stringify(safeDetails(details)),
        actorUserId ?? requestData.actorUserId,
        method ?? requestData.method,
        path ?? requestData.path,
        statusCode ?? null,
        ipAddress ?? requestData.ipAddress,
        userAgent ?? requestData.userAgent
      ]
    );
  } catch (error) {
    if (error.code !== "42P01") {
      console.error("System event could not be recorded.", error);
    }
  }
};

module.exports = {
  recordSystemEvent
};
