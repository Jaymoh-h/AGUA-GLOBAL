const express = require("express");
const { listPayments, createPayment, updatePayment } = require("../controllers/payment.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), listPayments);
router.post("/", authorize("admin", "accountant"), createPayment);
router.put("/:id", authorize("admin", "accountant"), updatePayment);

module.exports = router;
