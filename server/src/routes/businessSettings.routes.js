const express = require("express");
const {
  getPublicBusinessSettings,
  getBusinessSettings,
  getIntegrationReadiness,
  listIntegrationCommissioningChecks,
  createIntegrationCommissioningCheck,
  updateBusinessSettings,
  uploadBusinessLogo
} = require("../controllers/businessSettings.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/public", getPublicBusinessSettings);

router.use(authenticate);
router.get("/integration-readiness", authorize("admin", "accountant", "business_viewer"), getIntegrationReadiness);
router.get("/commissioning-checks", authorize("admin", "accountant", "business_viewer"), listIntegrationCommissioningChecks);
router.post("/commissioning-checks", authorize("admin"), createIntegrationCommissioningCheck);
router.get("/", authorize("admin", "accountant", "business_viewer"), getBusinessSettings);
router.put("/", authorize("admin"), updateBusinessSettings);
router.post("/logo", authorize("admin"), uploadBusinessLogo);

module.exports = router;
