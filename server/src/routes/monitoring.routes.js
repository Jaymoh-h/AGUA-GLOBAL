const express = require("express");
const {
  createClientEvent,
  getMonitoringAlertSnapshot,
  getMonitoringSummary,
  listMonitoringEvents,
  runMonitoringCron,
  sendMonitoringTestAlert
} = require("../controllers/monitoring.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/cron", runMonitoringCron);

router.use(authenticate);
router.post("/client-events", createClientEvent);
router.get("/summary", authorize("admin", "accountant", "business_viewer"), getMonitoringSummary);
router.get("/events", authorize("admin", "accountant", "business_viewer"), listMonitoringEvents);
router.get("/alert-snapshot", authorize("admin"), getMonitoringAlertSnapshot);
router.post("/test-alert", authorize("admin"), sendMonitoringTestAlert);

module.exports = router;
