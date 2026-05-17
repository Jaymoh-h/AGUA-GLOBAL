const express = require("express");
const { listRates, createRate, replaceTariffBlocks, updateRate } = require("../controllers/rate.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listRates);
router.post("/", authorize("admin", "accountant"), createRate);
router.put("/:id", authorize("admin", "accountant"), updateRate);
router.put("/:id/blocks", authorize("admin", "accountant"), replaceTariffBlocks);

module.exports = router;
