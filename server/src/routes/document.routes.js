const express = require("express");
const {
  deleteDocument,
  downloadDocument,
  listDocuments,
  uploadDocument
} = require("../controllers/document.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "meter_reader"), listDocuments);
router.post("/", authorize("admin", "accountant", "meter_reader"), uploadDocument);
router.get("/:id/download", authorize("admin", "accountant", "meter_reader"), downloadDocument);
router.delete("/:id", authorize("admin", "accountant", "meter_reader"), deleteDocument);

module.exports = router;
