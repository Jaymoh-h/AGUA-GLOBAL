const express = require("express");
const {
  commitExpenseImport,
  createExpense,
  listExpenses,
  previewExpenseImport
} = require("../controllers/expense.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "business_viewer"), listExpenses);
router.post("/imports/preview", authorize("admin", "accountant"), previewExpenseImport);
router.post("/imports/commit", authorize("admin", "accountant"), commitExpenseImport);
router.post("/", authorize("admin", "accountant"), createExpense);

module.exports = router;
