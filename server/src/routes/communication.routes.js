const express = require("express");
const {
  listInvoicePreview,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendInvoiceAlert,
  sendBulkInvoiceAlerts,
  listCampaigns,
  getCampaign
} = require("../controllers/communication.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/invoice-preview", authorize("admin", "accountant"), listInvoicePreview);
router.get("/templates", authorize("admin", "accountant"), listTemplates);
router.post("/templates", authorize("admin", "accountant"), createTemplate);
router.put("/templates/:id", authorize("admin", "accountant"), updateTemplate);
router.get("/campaigns", authorize("admin", "accountant"), listCampaigns);
router.get("/campaigns/:id", authorize("admin", "accountant"), getCampaign);
router.post("/invoice-alerts/bulk-send", authorize("admin", "accountant"), sendBulkInvoiceAlerts);
router.post("/invoice-alerts/:customerId/send", authorize("admin", "accountant"), sendInvoiceAlert);

module.exports = router;
