const express = require("express");
const {
  createBackupRestoreDrill,
  getAccountantReports,
  getBackupStatus,
  getDataQualityChecks,
  listBackupRestoreDrills,
  getOperationalBackup,
  getReportsSummary
} = require("../controllers/report.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/summary", authorize("admin", "accountant", "business_viewer"), getReportsSummary);
router.get("/accountant", authorize("admin", "accountant", "business_viewer"), getAccountantReports);
router.get("/data-quality", authorize("admin", "accountant", "business_viewer"), getDataQualityChecks);
router.get("/backup-status", authorize("admin"), getBackupStatus);
router.get("/backup-restore-drills", authorize("admin"), listBackupRestoreDrills);
router.post("/backup-restore-drills", authorize("admin"), createBackupRestoreDrill);
router.get("/backup", authorize("admin"), getOperationalBackup);

module.exports = router;
