const pool = require("../db/pool");
const { reminderCronSecret } = require("../config/env");
const { buildReminderDigest, sendOperationalReminders } = require("../services/operationalReminder.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");

const getBearerToken = (header = "") => (header.startsWith("Bearer ") ? header.slice(7) : "");
const parseTypes = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const requireCronSecret = (req) => {
  if (!reminderCronSecret) {
    throw new ApiError(503, "REMINDER_CRON_SECRET or CRON_SECRET is not configured.");
  }
  const supplied =
    req.get("x-reminder-cron-secret") ||
    getBearerToken(req.get("authorization") || "") ||
    "";
  if (supplied !== reminderCronSecret) {
    throw new ApiError(401, "Invalid reminder cron secret.");
  }
};

const listOperationalReminderLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const { rows } = await pool.query(
    `SELECT orl.*, u.name AS recipient_name, u.role AS recipient_role
     FROM operational_reminder_logs orl
     LEFT JOIN users u ON u.id = orl.recipient_user_id
     ORDER BY orl.sent_at DESC, orl.id DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

const previewOperationalReminders = asyncHandler(async (_req, res) => {
  const reminders = await buildReminderDigest();
  res.json({
    generated_at: new Date().toISOString(),
    reminders
  });
});

const sendDueOperationalReminders = asyncHandler(async (req, res) => {
  const result = await sendOperationalReminders({
    includeNoWork: Boolean(req.body?.include_no_work),
    dryRun: Boolean(req.body?.dry_run),
    includeOutOfSchedule: Boolean(req.body?.include_out_of_schedule),
    onlyTypes: Array.isArray(req.body?.types) ? req.body.types : parseTypes(req.body?.types)
  });
  res.json(result);
});

const runOperationalReminderCron = asyncHandler(async (req, res) => {
  requireCronSecret(req);
  const result = await sendOperationalReminders({
    includeNoWork: req.query.include_no_work === "true",
    dryRun: req.query.dry_run === "true",
    includeOutOfSchedule: req.query.include_out_of_schedule === "true",
    onlyTypes: parseTypes(req.query.types)
  });
  res.json(result);
});

const runOperationalReminderOperationsCron = asyncHandler(async (req, res) => {
  requireCronSecret(req);
  const result = await sendOperationalReminders({
    onlyTypes: ["pending_work", "bill_preparation", "contractor_invoices", "payroll_preparation"]
  });
  res.json(result);
});

const runOperationalReminderReadingsCron = asyncHandler(async (req, res) => {
  requireCronSecret(req);
  const result = await sendOperationalReminders({
    onlyTypes: ["meter_readings", "weekly_production_readings"]
  });
  res.json(result);
});

module.exports = {
  listOperationalReminderLogs,
  previewOperationalReminders,
  runOperationalReminderOperationsCron,
  runOperationalReminderReadingsCron,
  runOperationalReminderCron,
  sendDueOperationalReminders
};
