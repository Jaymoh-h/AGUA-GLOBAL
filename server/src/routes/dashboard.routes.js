const express = require("express");
const { getDashboard } = require("../controllers/dashboard.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "meter_reader"), getDashboard);

module.exports = router;
