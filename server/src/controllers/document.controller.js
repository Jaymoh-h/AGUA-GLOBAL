const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const {
  openDocumentStream,
  parseDocumentUpload,
  removeDocumentFile,
  storeDocumentFile
} = require("../services/documentStorage.service");

const activeEntityTypes = ["maintenance_request", "expense", "contractor_invoice"];

const normalizeEntityType = (value) => String(value || "").trim().toLowerCase();

const normalizeEntityId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Entity ID must be a positive whole number.");
  return id;
};

const assertDocumentAccess = (req, entityType) => {
  if (!activeEntityTypes.includes(entityType)) {
    throw new ApiError(400, "Documents can currently be linked to maintenance requests, expenses, or contractor invoices.");
  }
  if (["expense", "contractor_invoice"].includes(entityType) && !["admin", "accountant"].includes(req.user.role)) {
    throw new ApiError(403, "Only admins and accountants can access this document.");
  }
  if (entityType === "maintenance_request" && !["admin", "accountant", "meter_reader"].includes(req.user.role)) {
    throw new ApiError(403, "You are not allowed to access maintenance documents.");
  }
};

const assertEntityExists = async (client, entityType, entityId) => {
  const table =
    entityType === "maintenance_request"
      ? "maintenance_requests"
      : entityType === "contractor_invoice"
        ? "contractor_invoices"
        : "expenses";
  const { rows } = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [entityId]);
  if (!rows[0]) throw new ApiError(404, "Linked record was not found.");
};

const getDocument = async (client, id) => {
  const { rows } = await client.query(
    `SELECT sd.*,
            uploaded.name AS uploaded_by_name,
            deleted.name AS deleted_by_name
     FROM supporting_documents sd
     LEFT JOIN users uploaded ON uploaded.id = sd.uploaded_by
     LEFT JOIN users deleted ON deleted.id = sd.deleted_by
     WHERE sd.id = $1`,
    [id]
  );
  return rows[0] || null;
};

const listDocuments = asyncHandler(async (req, res) => {
  const entityType = normalizeEntityType(req.query.entity_type);
  const entityId = normalizeEntityId(req.query.entity_id);
  assertDocumentAccess(req, entityType);

  const { rows } = await pool.query(
    `SELECT sd.id, sd.entity_type, sd.entity_id, sd.original_name, sd.mime_type, sd.file_size,
            sd.description, sd.created_at, sd.uploaded_by, uploaded.name AS uploaded_by_name
     FROM supporting_documents sd
     LEFT JOIN users uploaded ON uploaded.id = sd.uploaded_by
     WHERE sd.entity_type = $1
       AND sd.entity_id = $2
       AND sd.deleted_at IS NULL
     ORDER BY sd.created_at DESC, sd.id DESC`,
    [entityType, entityId]
  );
  res.json(rows);
});

const uploadDocument = asyncHandler(async (req, res) => {
  const entityType = normalizeEntityType(req.body.entity_type);
  const entityId = normalizeEntityId(req.body.entity_id);
  assertDocumentAccess(req, entityType);
  const parsed = parseDocumentUpload(req.body);
  const description = String(req.body.description || "").trim() || null;

  const client = await pool.connect();
  let stored = null;
  try {
    await client.query("BEGIN");
    await assertEntityExists(client, entityType, entityId);
    stored = await storeDocumentFile({
      buffer: parsed.buffer,
      extension: parsed.extension,
      entityType
    });

    const { rows } = await client.query(
      `INSERT INTO supporting_documents (
        entity_type, entity_id, original_name, stored_name, storage_path,
        mime_type, file_size, description, uploaded_by
      )
      VALUES ($1::varchar, $2, $3::varchar, $4::varchar, $5, $6::varchar, $7, $8, $9)
      RETURNING *`,
      [
        entityType,
        entityId,
        parsed.originalName,
        stored.storedName,
        stored.storagePath,
        parsed.mimeType,
        parsed.buffer.length,
        description,
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "supporting_document.uploaded",
      entityType,
      entityId,
      afterData: rows[0],
      reason: description
    });

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (stored?.storagePath) {
      await removeDocumentFile(stored.storagePath).catch((removeError) =>
        console.error("Failed to remove rolled-back supporting document.", removeError)
      );
    }
    throw error;
  } finally {
    client.release();
  }
});

const downloadDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const document = await getDocument(client, req.params.id);
    if (!document || document.deleted_at) throw new ApiError(404, "Document not found.");
    assertDocumentAccess(req, document.entity_type);

    const downloadName = String(document.original_name || "document").replace(/"/g, "");
    res.setHeader("Content-Type", document.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    openDocumentStream(document.storage_path)
      .on("error", (error) => {
        console.error("Document download failed.", error);
        if (!res.headersSent) res.status(404).json({ message: "Stored document file was not found." });
        else res.end();
      })
      .pipe(res);
  } finally {
    client.release();
  }
});

const deleteDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getDocument(client, req.params.id);
    if (!before || before.deleted_at) throw new ApiError(404, "Document not found.");
    assertDocumentAccess(req, before.entity_type);

    const { rows } = await client.query(
      `UPDATE supporting_documents
       SET deleted_at = NOW(),
           deleted_by = $1
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "supporting_document.deleted",
      entityType: before.entity_type,
      entityId: before.entity_id,
      beforeData: before,
      afterData: rows[0]
    });

    await client.query("COMMIT");
    res.json({ message: "Document removed." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  deleteDocument,
  downloadDocument,
  listDocuments,
  uploadDocument
};
