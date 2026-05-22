const express = require("express");
const {
  applyPenaltyApplications,
  createBillingPeriod,
  getBillingSettings,
  listPenaltyApplications,
  listBillingPeriods,
  previewPenaltyApplications,
  reapplyPenaltyApplication,
  waivePenaltyApplication,
  updateBillingPeriodStatus,
  updateBillingSettings
} = require("../controllers/billing.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/periods", authorize("admin", "accountant"), listBillingPeriods);
router.post("/periods", authorize("admin", "accountant"), createBillingPeriod);
router.patch("/periods/:id/status", authorize("admin", "accountant"), updateBillingPeriodStatus);
router.get("/settings", authorize("admin", "accountant"), getBillingSettings);
router.put("/settings", authorize("admin", "accountant"), updateBillingSettings);
router.get("/penalties", authorize("admin", "accountant"), listPenaltyApplications);
router.get("/penalties/preview", authorize("admin", "accountant"), previewPenaltyApplications);
router.post("/penalties/apply", authorize("admin", "accountant"), applyPenaltyApplications);
router.patch("/penalties/:id/waive", authorize("admin", "accountant"), waivePenaltyApplication);
router.patch("/penalties/:id/reapply", authorize("admin", "accountant"), reapplyPenaltyApplication);

module.exports = router;
