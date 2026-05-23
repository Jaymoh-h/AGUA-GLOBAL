const express = require("express");
const { createMeter, listMeterEvents, listMeters, replaceMeter, updateMeterEvent } = require("../controllers/meter.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "meter_reader", "accountant"), listMeters);
router.get("/events", authorize("admin", "meter_reader", "accountant"), listMeterEvents);
router.post("/", authorize("admin", "accountant"), createMeter);
router.post("/replace", authorize("admin", "meter_reader", "accountant"), replaceMeter);
router.put("/events/:id", authorize("admin", "meter_reader", "accountant"), updateMeterEvent);

module.exports = router;
