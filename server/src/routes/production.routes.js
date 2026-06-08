const express = require("express");
const {
  createElectricityTopup,
  createProductionMeter,
  createWeeklyReading,
  deleteWeeklyReading,
  getProductionReadingContext,
  getProductionReport,
  getWeeklyReading,
  listElectricityTopups,
  listProductionMeters,
  listWeeklyReadings,
  replaceProductionMeter,
  updateWeeklyReading
} = require("../controllers/production.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/meters", authorize("admin", "accountant", "meter_reader", "business_viewer"), listProductionMeters);
router.post("/meters", authorize("admin", "accountant"), createProductionMeter);
router.post("/meters/:id/replace", authorize("admin", "accountant"), replaceProductionMeter);
router.get("/electricity-topups", authorize("admin", "accountant", "meter_reader", "business_viewer"), listElectricityTopups);
router.post("/electricity-topups", authorize("admin", "accountant"), createElectricityTopup);
router.get("/weekly-readings", authorize("admin", "accountant", "meter_reader", "business_viewer"), listWeeklyReadings);
router.get("/reading-context", authorize("admin", "accountant", "meter_reader", "business_viewer"), getProductionReadingContext);
router.post("/weekly-readings", authorize("admin", "accountant", "meter_reader"), createWeeklyReading);
router.get("/weekly-readings/:id", authorize("admin", "accountant", "meter_reader", "business_viewer"), getWeeklyReading);
router.put("/weekly-readings/:id", authorize("admin", "accountant", "meter_reader"), updateWeeklyReading);
router.delete("/weekly-readings/:id", authorize("admin", "accountant"), deleteWeeklyReading);
router.get("/report", authorize("admin", "accountant", "meter_reader", "business_viewer"), getProductionReport);

module.exports = router;
