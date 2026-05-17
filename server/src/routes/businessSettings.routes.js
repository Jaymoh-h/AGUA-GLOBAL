const express = require("express");
const {
  getBusinessSettings,
  updateBusinessSettings,
  uploadBusinessLogo
} = require("../controllers/businessSettings.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), getBusinessSettings);
router.put("/", authorize("admin"), updateBusinessSettings);
router.post("/logo", authorize("admin"), uploadBusinessLogo);

module.exports = router;
