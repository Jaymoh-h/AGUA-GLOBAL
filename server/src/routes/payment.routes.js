const express = require("express");
const {
  commitPaymentImport,
  discardPaymentSuspense,
  getPayment,
  getMpesaIntegrationStatus,
  listMpesaCallbackEvents,
  listPaymentImportBatches,
  listPaymentImportMappingProfiles,
  listPaymentCorrections,
  listPaymentRegister,
  listPaymentSuspense,
  listPayments,
  createPayment,
  previewPaymentImport,
  receiveMpesaConfirmation,
  savePaymentImportMappingProfile,
  reapplyPaymentSuspense,
  sendReceiptEmail,
  sendReceiptSms,
  voidPaymentToSuspense,
  updatePayment
} = require("../controllers/payment.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.post("/mpesa/confirmation", receiveMpesaConfirmation);
router.use(authenticate);
router.get("/", authorize("admin", "accountant", "business_viewer"), listPayments);
router.get("/register", authorize("admin", "accountant", "business_viewer"), listPaymentRegister);
router.get("/corrections", authorize("admin", "accountant", "business_viewer"), listPaymentCorrections);
router.get("/imports/recent", authorize("admin", "accountant", "business_viewer"), listPaymentImportBatches);
router.get("/mpesa/status", authorize("admin", "accountant", "business_viewer"), getMpesaIntegrationStatus);
router.get("/mpesa/callback-events", authorize("admin", "accountant", "business_viewer"), listMpesaCallbackEvents);
router.get("/import-mapping-profiles", authorize("admin", "accountant", "business_viewer"), listPaymentImportMappingProfiles);
router.get("/suspense", authorize("admin", "accountant", "business_viewer"), listPaymentSuspense);
router.post("/imports/preview", authorize("admin", "accountant"), previewPaymentImport);
router.post("/imports/commit", authorize("admin", "accountant"), commitPaymentImport);
router.post("/import-mapping-profiles", authorize("admin", "accountant"), savePaymentImportMappingProfile);
router.post("/suspense/:id/reapply", authorize("admin", "accountant"), reapplyPaymentSuspense);
router.post("/suspense/:id/discard", authorize("admin"), discardPaymentSuspense);
router.get("/:id", authorize("admin", "accountant", "business_viewer"), getPayment);
router.post("/", authorize("admin", "accountant"), createPayment);
router.put("/:id", authorize("admin", "accountant"), updatePayment);
router.post("/:id/email", authorize("admin", "accountant"), sendReceiptEmail);
router.post("/:id/sms", authorize("admin", "accountant"), sendReceiptSms);
router.post("/:id/void", authorize("admin", "accountant"), voidPaymentToSuspense);

module.exports = router;
