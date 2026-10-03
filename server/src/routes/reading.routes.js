const express = require("express");
const {
  commitReadingImport,
  getReadingContext,
  listEligibleReadingCustomers,
  listEstimatedReadingCandidates,
  listReadingAnomalies,
  listCustomerReadingSubmissions,
  listReadingRegister,
  listReadings,
  createReading,
  previewReadingImport,
  reviewCustomerReadingSubmission,
  updateReading
} = require("../controllers/reading.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/anomalies", authorize("admin", "meter_reader", "accountant"), listReadingAnomalies);
router.get("/estimation-candidates", authorize("admin", "meter_reader", "accountant"), listEstimatedReadingCandidates);
router.get("/customer-submissions", authorize("admin", "meter_reader", "accountant"), listCustomerReadingSubmissions);
router.get("/eligible-customers", authorize("admin", "meter_reader", "accountant"), listEligibleReadingCustomers);
router.get("/context", authorize("admin", "meter_reader", "accountant"), getReadingContext);
router.get("/register", authorize("admin", "meter_reader", "accountant"), listReadingRegister);
router.post("/imports/preview", authorize("admin", "meter_reader", "accountant"), previewReadingImport);
router.post("/imports/commit", authorize("admin", "meter_reader", "accountant"), commitReadingImport);
router.post("/customer-submissions/:id/review", authorize("admin", "meter_reader", "accountant"), reviewCustomerReadingSubmission);
router.get("/", authorize("admin", "meter_reader", "accountant"), listReadings);
router.post("/", authorize("admin", "meter_reader", "accountant"), createReading);
router.put("/:id", authorize("admin", "meter_reader", "accountant"), updateReading);

module.exports = router;
