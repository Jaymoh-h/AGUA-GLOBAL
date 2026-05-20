const express = require("express");
const {
  createAdjustment,
  listAdjustments,
  reviewAdjustment
} = require("../controllers/adjustment.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant"), listAdjustments);
router.post("/", authorize("admin", "accountant"), createAdjustment);
router.patch("/:id/review", authorize("admin"), reviewAdjustment);

module.exports = router;
