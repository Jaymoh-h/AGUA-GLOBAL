const express = require("express");
const {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
} = require("../controllers/customer.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listCustomers);
router.get("/:id", getCustomer);
router.post("/", authorize("admin", "accountant"), createCustomer);
router.put("/:id", authorize("admin", "accountant"), updateCustomer);
router.delete("/:id", authorize("admin"), deleteCustomer);

module.exports = router;

