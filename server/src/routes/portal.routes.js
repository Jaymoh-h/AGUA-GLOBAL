const express = require("express");
const {
  createPortalReadingSubmission,
  createPortalServiceRequest,
  getPortalDashboard,
  getPortalPayment,
  updatePortalDeliveryPreferences
} = require("../controllers/portal.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, authorize("customer"));
router.get("/dashboard", getPortalDashboard);
router.get("/payments/:id", getPortalPayment);
router.put("/delivery-preferences", updatePortalDeliveryPreferences);
router.post("/reading-submissions", createPortalReadingSubmission);
router.post("/service-requests", createPortalServiceRequest);

module.exports = router;
