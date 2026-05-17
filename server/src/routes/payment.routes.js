const express = require("express");
const {
  commitPaymentImport,
  getPayment,
  listPayments,
  createPayment,
  previewPaymentImport,
  updatePayment
} = require("../controllers/payment.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), listPayments);
router.post("/imports/preview", authorize("admin", "accountant"), previewPaymentImport);
router.post("/imports/commit", authorize("admin", "accountant"), commitPaymentImport);
router.get("/:id", authorize("admin", "accountant"), getPayment);
router.post("/", authorize("admin", "accountant"), createPayment);
router.put("/:id", authorize("admin", "accountant"), updatePayment);

module.exports = router;
