const express = require("express");
const { listBills, getBill, markBillStatus } = require("../controllers/bill.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listBills);
router.get("/:id", getBill);
router.patch("/:id/status", authorize("admin", "accountant"), markBillStatus);

module.exports = router;

