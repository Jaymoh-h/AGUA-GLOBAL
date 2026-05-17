const express = require("express");
const {
  createPortalServiceRequest,
  getPortalDashboard,
  getPortalPayment
} = require("../controllers/portal.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate, authorize("customer"));
router.get("/dashboard", getPortalDashboard);
router.get("/payments/:id", getPortalPayment);
router.post("/service-requests", createPortalServiceRequest);

module.exports = router;
