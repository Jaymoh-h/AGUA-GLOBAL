const express = require("express");
const { getAccountantReports, getDataQualityChecks, getReportsSummary } = require("../controllers/report.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/summary", authorize("admin", "accountant"), getReportsSummary);
router.get("/accountant", authorize("admin", "accountant"), getAccountantReports);
router.get("/data-quality", authorize("admin", "accountant"), getDataQualityChecks);

module.exports = router;
