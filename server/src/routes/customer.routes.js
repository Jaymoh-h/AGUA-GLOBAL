const express = require("express");
const {
  listCustomers,
  getCustomer,
  getCustomerStatement,
  previewCustomerImport,
  commitCustomerImport,
  previewOpeningBalanceImport,
  commitOpeningBalanceImport,
  closeCustomerAccount,
  createCustomer,
  updateCustomer,
  deleteCustomer
} = require("../controllers/customer.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", listCustomers);
router.post("/imports/preview", authorize("admin", "accountant"), previewCustomerImport);
router.post("/imports/commit", authorize("admin", "accountant"), commitCustomerImport);
router.post("/opening-balances/imports/preview", authorize("admin", "accountant"), previewOpeningBalanceImport);
router.post("/opening-balances/imports/commit", authorize("admin", "accountant"), commitOpeningBalanceImport);
router.get("/:id/statement", authorize("admin", "accountant"), getCustomerStatement);
router.get("/:id", getCustomer);
router.post("/", authorize("admin", "accountant"), createCustomer);
router.post("/:id/close", authorize("admin", "accountant"), closeCustomerAccount);
router.put("/:id", authorize("admin", "accountant"), updateCustomer);
router.delete("/:id", authorize("admin"), deleteCustomer);

module.exports = router;
