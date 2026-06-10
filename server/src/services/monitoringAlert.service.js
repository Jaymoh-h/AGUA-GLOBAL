const pool = require("../db/pool");
const {
  monitoringAlertCooldownMinutes,
  monitoringAlertEmails,
  monitoringAlertPhones,
  monitoringAlertWindowMinutes,
  publicStatusUrl
} = require("../config/env");
const { sendEmail } = require("./email.service");
const { sendSms } = require("./sms.service");
const { recordSystemEvent } = require("./systemEvent.service");

const clampMinutes = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, 24 * 60);
};

const relationExists = async (name) => {
  try {
    const { rows } = await pool.query("SELECT to_regclass($1) AS relation_name", [`public.${name}`]);
    return Boolean(rows[0]?.relation_name);
  } catch {
    return false;
  }
};

const insertAlertLog = async ({ alertKey, channel, recipient, status, subject, message, errorMessage, eventCount }) => {
  if (!(await relationExists("monitoring_alert_logs"))) return null;
  const { rows } = await pool.query(
    `INSERT INTO monitoring_alert_logs (
       alert_key, channel, recipient, status, subject, message, error_message, event_count
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [alertKey, channel, recipient, status, subject, message, errorMessage || null, Number(eventCount || 0)]
  );
  return rows[0];
};

const recentlyAlerted = async ({ alertKey, channel, recipient, cooldownMinutes }) => {
  if (!(await relationExists("monitoring_alert_logs"))) return false;
  const { rows } = await pool.query(
    `SELECT id
     FROM monitoring_alert_logs
     WHERE alert_key = $1
       AND channel = $2
       AND recipient = $3
       AND status IN ('sent', 'skipped')
       AND sent_at >= NOW() - ($4::integer * INTERVAL '1 minute')
     LIMIT 1`,
    [alertKey, channel, recipient, cooldownMinutes]
  );
  return Boolean(rows[0]);
};

const getMonitoringSnapshot = async () => {
  const windowMinutes = clampMinutes(monitoringAlertWindowMinutes, 15);
  const startedAt = Date.now();
  let database = "ok";
  let databaseError = null;

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    database = "error";
    databaseError = error.message;
  }

  if (database !== "ok") {
    return {
      status: "alert",
      database,
      database_error: databaseError,
      response_ms: Date.now() - startedAt,
      window_minutes: windowMinutes,
      event_count: 0,
      critical_count: 1,
      events: []
    };
  }

  const hasEvents = await relationExists("system_event_logs");
  if (!hasEvents) {
    return {
      status: database === "ok" ? "ok" : "alert",
      database,
      database_error: databaseError,
      response_ms: Date.now() - startedAt,
      window_minutes: windowMinutes,
      event_count: 0,
      critical_count: database === "ok" ? 0 : 1,
      events: []
    };
  }

  const { rows } = await pool.query(
    `SELECT id, event_type, severity, source, message, path, status_code, created_at
     FROM system_event_logs
     WHERE severity IN ('error', 'critical')
       AND resolved_at IS NULL
       AND created_at >= NOW() - ($1::integer * INTERVAL '1 minute')
     ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 20`,
    [windowMinutes]
  );

  const criticalCount = rows.filter((row) => row.severity === "critical").length;
  return {
    status: database === "ok" && rows.length === 0 ? "ok" : "alert",
    database,
    database_error: databaseError,
    response_ms: Date.now() - startedAt,
    window_minutes: windowMinutes,
    event_count: rows.length,
    critical_count: criticalCount + (database === "ok" ? 0 : 1),
    events: rows
  };
};

const buildAlertMessage = (snapshot) => {
  const title = snapshot.database === "ok" ? "AGUA Global monitoring alert" : "AGUA Global database alert";
  const lines = [
    title,
    "",
    `Status: ${snapshot.status}`,
    `Database: ${snapshot.database}`,
    `Window: ${snapshot.window_minutes} minute(s)`,
    `Errors: ${snapshot.event_count}`,
    `Critical: ${snapshot.critical_count}`,
    `Response: ${snapshot.response_ms} ms`
  ];
  if (snapshot.database_error) lines.push(`Database error: ${snapshot.database_error}`);
  if (publicStatusUrl) lines.push(`Status URL: ${publicStatusUrl}`);
  if (snapshot.events.length) {
    lines.push("", "Recent events:");
    snapshot.events.slice(0, 5).forEach((event) => {
      lines.push(`- ${event.severity} ${event.event_type} ${event.path || ""}: ${event.message}`);
    });
  }
  return {
    subject: title,
    text: lines.join("\n")
  };
};

const sendMonitoringAlerts = async ({ req = null, force = false } = {}) => {
  const snapshot = await getMonitoringSnapshot();
  const cooldownMinutes = clampMinutes(monitoringAlertCooldownMinutes, 60);
  const alertKey = snapshot.database === "ok" ? `monitoring-errors-${snapshot.window_minutes}` : "database-status-error";
  const recipients = [
    ...monitoringAlertEmails.map((recipient) => ({ channel: "email", recipient })),
    ...monitoringAlertPhones.map((recipient) => ({ channel: "sms", recipient }))
  ];
  const results = [];

  if (snapshot.status === "ok" && !force) {
    return { snapshot, results, skipped: true, message: "No alert condition found." };
  }

  if (!recipients.length) {
    await recordSystemEvent({
      eventType: "monitoring.alert_recipients_missing",
      severity: snapshot.status === "ok" ? "info" : "warning",
      source: "scheduler",
      message: "Monitoring alert condition found, but no alert recipients are configured.",
      details: snapshot,
      req
    });
    return { snapshot, results, skipped: true, message: "No monitoring alert recipients configured." };
  }

  const message = buildAlertMessage(snapshot);
  for (const item of recipients) {
    const alreadySent = !force && (await recentlyAlerted({ alertKey, ...item, cooldownMinutes }));
    if (alreadySent) {
      results.push({ ...item, status: "skipped", reason: "cooldown" });
      continue;
    }

    try {
      const sendResult =
        item.channel === "email"
          ? await sendEmail({ to: item.recipient, subject: message.subject, text: message.text })
          : await sendSms({ to: item.recipient, message: message.text.slice(0, 1500) });
      const status = sendResult.skipped ? "skipped" : "sent";
      await insertAlertLog({
        alertKey,
        channel: item.channel,
        recipient: item.recipient,
        status,
        subject: message.subject,
        message: message.text,
        errorMessage: sendResult.error,
        eventCount: snapshot.event_count
      });
      results.push({ ...item, status, provider: sendResult.providerStatus || sendResult.messageId || null });
    } catch (error) {
      await insertAlertLog({
        alertKey,
        channel: item.channel,
        recipient: item.recipient,
        status: "failed",
        subject: message.subject,
        message: message.text,
        errorMessage: error.message,
        eventCount: snapshot.event_count
      });
      results.push({ ...item, status: "failed", error: error.message });
    }
  }

  await recordSystemEvent({
    eventType: "monitoring.alert_run",
    severity: snapshot.status === "ok" ? "info" : "warning",
    source: "scheduler",
    message: `Monitoring alert run completed with ${results.length} recipient(s).`,
    details: { snapshot, results },
    req
  });

  return { snapshot, results, skipped: false };
};

module.exports = {
  getMonitoringSnapshot,
  sendMonitoringAlerts
};
