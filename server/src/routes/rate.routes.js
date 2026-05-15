const express = require("express");
const { listRates, createRate, updateRate } = require("../controllers/rate.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listRates);
router.post("/", authorize("admin", "accountant"), createRate);
router.put("/:id", authorize("admin", "accountant"), updateRate);

module.exports = router;

