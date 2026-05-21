const express = require("express");
const { listMeterEvents, listMeters, replaceMeter } = require("../controllers/meter.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "meter_reader", "accountant"), listMeters);
router.get("/events", authorize("admin", "meter_reader", "accountant"), listMeterEvents);
router.post("/replace", authorize("admin", "meter_reader", "accountant"), replaceMeter);

module.exports = router;
