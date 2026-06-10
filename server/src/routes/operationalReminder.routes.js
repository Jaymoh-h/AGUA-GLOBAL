const express = require("express");
const {
  listOperationalReminderLogs,
  previewOperationalReminders,
  runOperationalReminderOperationsCron,
  runOperationalReminderReadingsCron,
  runOperationalReminderCron,
  sendDueOperationalReminders
} = require("../controllers/operationalReminder.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/operational/cron", runOperationalReminderCron);
router.get("/operational/cron/operations", runOperationalReminderOperationsCron);
router.get("/operational/cron/readings", runOperationalReminderReadingsCron);

router.use(authenticate);
router.get("/operational/preview", authorize("admin", "accountant"), previewOperationalReminders);
router.post("/operational/send", authorize("admin", "accountant"), sendDueOperationalReminders);
router.get("/operational/logs", authorize("admin", "accountant"), listOperationalReminderLogs);

module.exports = router;
