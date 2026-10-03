const express = require("express");
const {
  closePaymentArrangement,
  createPaymentArrangement,
  declinePaymentPlanRequest,
  listPaymentArrangements
} = require("../controllers/paymentArrangement.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "business_viewer"), listPaymentArrangements);
router.post("/", authorize("admin", "accountant"), createPaymentArrangement);
router.patch("/requests/:id/decline", authorize("admin", "accountant"), declinePaymentPlanRequest);
router.patch("/:id/close", authorize("admin", "accountant"), closePaymentArrangement);

module.exports = router;
