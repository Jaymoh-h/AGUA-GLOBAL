const express = require("express");
const {
  createStandingOrder,
  listStandingOrders,
  updateStandingOrderStatus
} = require("../controllers/standingOrder.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "business_viewer"), listStandingOrders);
router.post("/", authorize("admin", "accountant"), createStandingOrder);
router.patch("/:id/status", authorize("admin", "accountant"), updateStandingOrderStatus);

module.exports = router;
