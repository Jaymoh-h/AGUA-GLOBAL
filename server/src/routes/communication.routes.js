const express = require("express");
const {
  listInvoicePreview,
  listArrearsFollowUp,
  listPaymentPlanFollowUp,
  listStandingOrderFollowUp,
  listDisconnectionWarningFollowUp,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendInvoiceAlert,
  sendPaymentPlanAlert,
  sendStandingOrderAlert,
  sendDisconnectionWarning,
  sendBulkInvoiceAlerts,
  listCampaigns,
  listDeliveryExceptions,
  getCampaign
} = require("../controllers/communication.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/invoice-preview", authorize("admin", "accountant"), listInvoicePreview);
router.get("/arrears-follow-up", authorize("admin", "accountant"), listArrearsFollowUp);
router.get("/payment-plan-follow-up", authorize("admin", "accountant"), listPaymentPlanFollowUp);
router.get("/standing-order-follow-up", authorize("admin", "accountant"), listStandingOrderFollowUp);
router.get("/disconnection-warning-follow-up", authorize("admin", "accountant"), listDisconnectionWarningFollowUp);
router.get("/templates", authorize("admin", "accountant"), listTemplates);
router.post("/templates", authorize("admin", "accountant"), createTemplate);
router.put("/templates/:id", authorize("admin", "accountant"), updateTemplate);
router.get("/campaigns", authorize("admin", "accountant"), listCampaigns);
router.get("/delivery-exceptions", authorize("admin", "accountant"), listDeliveryExceptions);
router.get("/campaigns/:id", authorize("admin", "accountant"), getCampaign);
router.post("/invoice-alerts/bulk-send", authorize("admin", "accountant"), sendBulkInvoiceAlerts);
router.post("/invoice-alerts/:customerId/send", authorize("admin", "accountant"), sendInvoiceAlert);
router.post("/payment-plan-alerts/:arrangementId/send", authorize("admin", "accountant"), sendPaymentPlanAlert);
router.post("/standing-order-alerts/:standingOrderId/send", authorize("admin", "accountant"), sendStandingOrderAlert);
router.post("/disconnection-warnings/:customerId/send", authorize("admin", "accountant"), sendDisconnectionWarning);

module.exports = router;
