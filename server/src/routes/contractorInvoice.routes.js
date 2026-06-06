const express = require("express");
const {
  createContractor,
  createInvoice,
  listContractors,
  listInvoices,
  postInvoiceToExpense,
  updateContractor,
  updateInvoice,
  updateInvoiceStatus
} = require("../controllers/contractorInvoice.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/contractors", authorize("admin", "accountant"), listContractors);
router.post("/contractors", authorize("admin", "accountant"), createContractor);
router.put("/contractors/:id", authorize("admin", "accountant"), updateContractor);
router.get("/invoices", authorize("admin", "accountant"), listInvoices);
router.post("/invoices", authorize("admin", "accountant"), createInvoice);
router.put("/invoices/:id", authorize("admin", "accountant"), updateInvoice);
router.patch("/invoices/:id/status", authorize("admin", "accountant"), updateInvoiceStatus);
router.post("/invoices/:id/post-expense", authorize("admin", "accountant"), postInvoiceToExpense);

module.exports = router;
