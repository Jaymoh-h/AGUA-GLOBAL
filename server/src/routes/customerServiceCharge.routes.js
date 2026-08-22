const express = require("express");
const {
  cancelCustomerServiceCharge,
  createCustomerServiceCharge,
  getCustomerServiceCharge,
  listCustomerServiceCharges,
  waiveCustomerServiceCharge
} = require("../controllers/customerServiceCharge.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "business_viewer"), listCustomerServiceCharges);
router.get("/:id", authorize("admin", "accountant", "business_viewer"), getCustomerServiceCharge);
router.post("/", authorize("admin", "accountant"), createCustomerServiceCharge);
router.patch("/:id/waive", authorize("admin", "accountant"), waiveCustomerServiceCharge);
router.patch("/:id/cancel", authorize("admin"), cancelCustomerServiceCharge);

module.exports = router;
