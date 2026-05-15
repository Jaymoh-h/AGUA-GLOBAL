const express = require("express");
const { listReadings, createReading, updateReading } = require("../controllers/reading.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listReadings);
router.post("/", authorize("admin", "meter_reader"), createReading);
router.put("/:id", authorize("admin", "meter_reader"), updateReading);

module.exports = router;
