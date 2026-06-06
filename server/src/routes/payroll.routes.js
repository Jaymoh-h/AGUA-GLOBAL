const express = require("express");
const {
  addRunLineItem,
  createPayee,
  createRun,
  getRun,
  listPayees,
  listRuns,
  terminatePayee,
  updatePayee,
  updateLineItem,
  updateRunStatus
} = require("../controllers/payroll.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/payees", authorize("admin", "accountant"), listPayees);
router.post("/payees", authorize("admin", "accountant"), createPayee);
router.patch("/payees/:id", authorize("admin", "accountant"), updatePayee);
router.patch("/payees/:id/terminate", authorize("admin"), terminatePayee);
router.get("/runs", authorize("admin", "accountant"), listRuns);
router.post("/runs", authorize("admin", "accountant"), createRun);
router.get("/runs/:id", authorize("admin", "accountant"), getRun);
router.post("/runs/:id/line-items", authorize("admin", "accountant"), addRunLineItem);
router.patch("/runs/:id/status", authorize("admin", "accountant"), updateRunStatus);
router.patch("/line-items/:lineId", authorize("admin", "accountant"), updateLineItem);

module.exports = router;
