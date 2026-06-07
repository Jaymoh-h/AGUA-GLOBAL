const express = require("express");
const {
  applyPenaltyApplications,
  createBillingPeriod,
  getBillingPeriodReadiness,
  getBillingSettings,
  listPenaltyApplications,
  listBillingPeriods,
  listSourceBillingRequests,
  listSourceBillingWorkspace,
  previewPenaltyApplications,
  reapplyPenaltyApplication,
  reviewSourceBillingRequest,
  waivePenaltyApplication,
  updateBillingPeriodStatus,
  updateBillingSettings
} = require("../controllers/billing.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/periods", authorize("admin", "accountant"), listBillingPeriods);
router.post("/periods", authorize("admin", "accountant"), createBillingPeriod);
router.get("/periods/:id/readiness", authorize("admin", "accountant"), getBillingPeriodReadiness);
router.patch("/periods/:id/status", authorize("admin", "accountant"), updateBillingPeriodStatus);
router.get("/settings", authorize("admin", "accountant"), getBillingSettings);
router.put("/settings", authorize("admin", "accountant"), updateBillingSettings);
router.get("/penalties", authorize("admin", "accountant"), listPenaltyApplications);
router.get("/source-billing-requests", authorize("admin", "accountant"), listSourceBillingRequests);
router.get("/source-billing-workspace", authorize("admin", "accountant"), listSourceBillingWorkspace);
router.patch("/source-billing-requests/:id/review", authorize("admin"), reviewSourceBillingRequest);
router.get("/penalties/preview", authorize("admin", "accountant"), previewPenaltyApplications);
router.post("/penalties/apply", authorize("admin", "accountant"), applyPenaltyApplications);
router.patch("/penalties/:id/waive", authorize("admin", "accountant"), waivePenaltyApplication);
router.patch("/penalties/:id/reapply", authorize("admin", "accountant"), reapplyPenaltyApplication);

module.exports = router;
