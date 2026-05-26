const express = require("express");
const { listBills, getBill, markBillStatus, promoteBillForPayment, sendBillEmail } = require("../controllers/bill.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listBills);
router.get("/:id", getBill);
router.post("/:id/email", authorize("admin", "accountant"), sendBillEmail);
router.patch("/:id/promote", authorize("admin"), promoteBillForPayment);
router.patch("/:id/status", authorize("admin", "accountant"), markBillStatus);

module.exports = router;
