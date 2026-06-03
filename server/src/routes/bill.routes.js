const express = require("express");
const {
  listBills,
  getBill,
  markBillStatus,
  promoteBillForPayment,
  sendBillEmail,
  sendBillSms
} = require("../controllers/bill.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), listBills);
router.get("/:id", authorize("admin", "accountant"), getBill);
router.post("/:id/email", authorize("admin", "accountant"), sendBillEmail);
router.post("/:id/sms", authorize("admin", "accountant"), sendBillSms);
router.patch("/:id/promote", authorize("admin"), promoteBillForPayment);
router.patch("/:id/status", authorize("admin", "accountant"), markBillStatus);

module.exports = router;
