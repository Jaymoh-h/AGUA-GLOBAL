const express = require("express");
const { listInvoicePreview, sendInvoiceAlert, sendBulkInvoiceAlerts } = require("../controllers/communication.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/invoice-preview", authorize("admin", "accountant"), listInvoicePreview);
router.post("/invoice-alerts/bulk-send", authorize("admin", "accountant"), sendBulkInvoiceAlerts);
router.post("/invoice-alerts/:customerId/send", authorize("admin", "accountant"), sendInvoiceAlert);

module.exports = router;
