const express = require("express");
const {
  commitReadingImport,
  getReadingContext,
  listEligibleReadingCustomers,
  listReadings,
  createReading,
  previewReadingImport,
  updateReading
} = require("../controllers/reading.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/eligible-customers", authorize("admin", "meter_reader", "accountant"), listEligibleReadingCustomers);
router.get("/context", authorize("admin", "meter_reader", "accountant"), getReadingContext);
router.post("/imports/preview", authorize("admin", "meter_reader", "accountant"), previewReadingImport);
router.post("/imports/commit", authorize("admin", "meter_reader", "accountant"), commitReadingImport);
router.get("/", authorize("admin", "meter_reader", "accountant"), listReadings);
router.post("/", authorize("admin", "meter_reader", "accountant"), createReading);
router.put("/:id", authorize("admin", "meter_reader", "accountant"), updateReading);

module.exports = router;
