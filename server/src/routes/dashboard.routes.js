const express = require("express");
const { getDashboard } = require("../controllers/dashboard.controller");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", getDashboard);

module.exports = router;

