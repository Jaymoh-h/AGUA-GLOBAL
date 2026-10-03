const express = require("express");
const {
  createMaintenanceExpense,
  createMaintenanceRequest,
  dispatchMaintenanceRequests,
  listMaintenanceAssignees,
  listMaintenanceRequests,
  resolveMaintenanceRequest,
  updateMaintenanceRequest
} = require("../controllers/maintenance.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "meter_reader"), listMaintenanceRequests);
router.get("/assignees", authorize("admin", "accountant", "meter_reader"), listMaintenanceAssignees);
router.post("/", authorize("admin", "accountant", "meter_reader"), createMaintenanceRequest);
router.put("/dispatch", authorize("admin", "accountant", "meter_reader"), dispatchMaintenanceRequests);
router.post("/:id/expenses", authorize("admin", "accountant", "meter_reader"), createMaintenanceExpense);
router.put("/:id", authorize("admin", "accountant", "meter_reader"), updateMaintenanceRequest);
router.patch("/:id/resolve", authorize("admin", "accountant", "meter_reader"), resolveMaintenanceRequest);

module.exports = router;
