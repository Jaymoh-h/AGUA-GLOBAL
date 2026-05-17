const express = require("express");
const {
  commitReadingImport,
  getReadingContext,
  listReadings,
  createReading,
  previewReadingImport,
  updateReading
} = require("../controllers/reading.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/context", authorize("admin", "meter_reader"), getReadingContext);
router.post("/imports/preview", authorize("admin", "meter_reader"), previewReadingImport);
router.post("/imports/commit", authorize("admin", "meter_reader"), commitReadingImport);
router.get("/", listReadings);
router.post("/", authorize("admin", "meter_reader"), createReading);
router.put("/:id", authorize("admin", "meter_reader"), updateReading);

module.exports = router;
