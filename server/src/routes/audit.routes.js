const express = require("express");
const { listAuditEvents } = require("../controllers/audit.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), listAuditEvents);

module.exports = router;
