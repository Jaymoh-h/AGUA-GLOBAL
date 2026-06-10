const express = require("express");
const {
  deleteKnowledgeDocument,
  downloadKnowledgeDocument,
  listKnowledgeDocuments,
  updateKnowledgeDocument,
  uploadKnowledgeDocument
} = require("../controllers/knowledgeDocument.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.get("/", authorize("admin", "accountant", "meter_reader", "business_viewer"), listKnowledgeDocuments);
router.post("/", authorize("admin", "accountant"), uploadKnowledgeDocument);
router.put("/:id", authorize("admin", "accountant"), updateKnowledgeDocument);
router.get("/:id/download", authorize("admin", "accountant", "meter_reader", "business_viewer"), downloadKnowledgeDocument);
router.delete("/:id", authorize("admin", "accountant"), deleteKnowledgeDocument);

module.exports = router;
