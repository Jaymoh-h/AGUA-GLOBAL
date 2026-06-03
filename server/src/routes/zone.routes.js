const express = require("express");
const { listZones, createZone, updateZone } = require("../controllers/zone.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "meter_reader"), listZones);
router.post("/", authorize("admin", "accountant"), createZone);
router.put("/:id", authorize("admin", "accountant"), updateZone);

module.exports = router;
