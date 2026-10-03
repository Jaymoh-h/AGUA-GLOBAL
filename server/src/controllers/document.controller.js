const pool = require("../db/pool");
const crypto = require("crypto");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { resolvePortalCustomer } = require("../services/portalAccount.service");
const {
  openDocumentStream,
  parseDocumentUpload
} = require("../services/documentStorage.service");

const activeEntityTypes = ["maintenance_request", "expense", "contractor_invoice", "customer_reading_submission"];

const documentAuditData = (document) => ({
  id: document.id,
  entity_type: document.entity_type,
  entity_id: document.entity_id,
  original_name: document.original_name,
  stored_name: document.stored_name,
  storage_path: document.storage_path,
  mime_type: document.mime_type,
  file_size: document.file_size,
  description: document.description,
  evidence_metadata: document.evidence_metadata,
  location_retention_until: document.location_retention_until,
  uploaded_by: document.uploaded_by,
  deleted_at: document.deleted_at,
  deleted_by: document.deleted_by,
  created_at: document.created_at
});

const normalizeEntityType = (value) => String(value || "").trim().toLowerCase();

const normalizeEntityId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Entity ID must be a positive whole number.");
  return id;
};

const assertDocumentAccess = async (client, req, entityType, entityId, document = null) => {
  if (!activeEntityTypes.includes(entityType)) {
    throw new ApiError(400, "Documents can currently be linked to maintenance requests, customer reading submissions, expenses, or contractor invoices.");
  }
  if (req.user.role === "customer") {
    if (!["maintenance_request", "customer_reading_submission"].includes(entityType)) {
      throw new ApiError(403, "Customers can only access files attached to their service requests or meter reading submissions.");
    }
    const { customerId } = await resolvePortalCustomer(client, req);
    const { rows } = entityType === "maintenance_request"
      ? await client.query(
          `SELECT id
           FROM maintenance_requests
           WHERE id = $1 AND customer_id = $2 AND source = 'customer_portal'`,
          [entityId, customerId]
        )
      : await client.query(
          `SELECT id
           FROM customer_reading_submissions
           WHERE id = $1 AND customer_id = $2`,
          [entityId, customerId]
        );
    if (!rows[0]) throw new ApiError(403, "You do not have permission to access this record.");
    if (document && Number(document.uploaded_by) !== Number(req.user.id)) {
      throw new ApiError(403, "Customers can only access files they uploaded.");
    }
    return;
  }
  if (["expense", "contractor_invoice"].includes(entityType) && !["admin", "accountant"].includes(req.user.role)) {
    throw new ApiError(403, "Only admins and accountants can access this document.");
  }
  if (entityType === "maintenance_request" && !["admin", "accountant", "meter_reader"].includes(req.user.role)) {
    throw new ApiError(403, "You are not allowed to access maintenance documents.");
  }
  if (entityType === "customer_reading_submission" && !["admin", "accountant", "meter_reader"].includes(req.user.role)) {
    throw new ApiError(403, "You are not allowed to access customer reading documents.");
  }
};

const normalizeEvidenceMetadata = (value, mimeType) => {
  if (value === undefined || value === null || value === "") return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Field evidence metadata must be an object.");
  }
  if (!String(mimeType || "").startsWith("image/")) {
    throw new ApiError(400, "Location evidence can only be attached to an image.");
  }
  if (value.type !== "field_photo" || value.location_consent !== true) {
    throw new ApiError(400, "Location evidence requires explicit consent for a field photo.");
  }

  const latitude = Number(value.location?.latitude);
  const longitude = Number(value.location?.longitude);
  const accuracy = Number(value.location?.accuracy_m);
  const capturedAt = new Date(value.captured_at);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(400, "Field evidence must include valid latitude and longitude values.");
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) {
    throw new ApiError(400, "Field evidence must include a valid location accuracy.");
  }
  if (Number.isNaN(capturedAt.getTime())) {
    throw new ApiError(400, "Field evidence must include a valid capture time.");
  }

  return {
    type: "field_photo",
    location: {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      accuracy_m: Number(accuracy.toFixed(1))
    },
    captured_at: capturedAt.toISOString()
  };
};

const purgeExpiredEvidenceLocations = (client) =>
  client.query(
    `UPDATE supporting_documents
     SET evidence_metadata = evidence_metadata - 'location',
         location_retention_until = NULL
     WHERE location_retention_until IS NOT NULL
       AND location_retention_until <= NOW()
       AND evidence_metadata ? 'location'`
  );

const assertEntityExists = async (client, entityType, entityId) => {
  const table =
    entityType === "maintenance_request"
      ? "maintenance_requests"
      : entityType === "customer_reading_submission"
        ? "customer_reading_submissions"
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
  const client = await pool.connect();
  try {
    await purgeExpiredEvidenceLocations(client);
    await assertDocumentAccess(client, req, entityType, entityId);
    const { rows } = await client.query(
      `SELECT sd.id, sd.entity_type, sd.entity_id, sd.original_name, sd.mime_type, sd.file_size,
              sd.description, sd.evidence_metadata, sd.location_retention_until,
              sd.created_at, sd.uploaded_by, uploaded.name AS uploaded_by_name
       FROM supporting_documents sd
       LEFT JOIN users uploaded ON uploaded.id = sd.uploaded_by
       WHERE sd.entity_type = $1
         AND sd.entity_id = $2
         AND sd.deleted_at IS NULL
         AND ($3::integer IS NULL OR sd.uploaded_by = $3)
       ORDER BY sd.created_at DESC, sd.id DESC`,
      [entityType, entityId, req.user.role === "customer" ? req.user.id : null]
    );
    res.json(rows);
  } finally {
    client.release();
  }
});

const uploadDocument = asyncHandler(async (req, res) => {
  const entityType = normalizeEntityType(req.body.entity_type);
  const entityId = normalizeEntityId(req.body.entity_id);
  const parsed = parseDocumentUpload(req.body);
  const description = String(req.body.description || "").trim() || null;
  const evidenceMetadata = normalizeEvidenceMetadata(req.body.evidence_metadata, parsed.mimeType);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertDocumentAccess(client, req, entityType, entityId);
    await assertEntityExists(client, entityType, entityId);
    const storedName = `${crypto.randomUUID()}.${parsed.extension}`;

    const { rows } = await client.query(
      `INSERT INTO supporting_documents (
        entity_type, entity_id, original_name, stored_name, storage_path,
        mime_type, file_size, file_data, description, evidence_metadata, location_retention_until, uploaded_by
      )
      VALUES ($1::varchar, $2, $3::varchar, $4::varchar, $5, $6::varchar, $7, $8, $9, $10::jsonb,
              CASE WHEN $10::jsonb IS NULL THEN NULL ELSE NOW() + INTERVAL '90 days' END, $11)
      RETURNING id, entity_type, entity_id, original_name, stored_name, storage_path, mime_type,
                file_size, description, evidence_metadata, location_retention_until,
                uploaded_by, deleted_at, deleted_by, created_at`,
      [
        entityType,
        entityId,
        parsed.originalName,
        storedName,
        `db/supporting_documents/${storedName}`,
        parsed.mimeType,
        parsed.buffer.length,
        parsed.buffer,
        description,
        evidenceMetadata ? JSON.stringify(evidenceMetadata) : null,
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "supporting_document.uploaded",
      entityType,
      entityId,
      afterData: documentAuditData(rows[0]),
      reason: description
    });

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const downloadDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await purgeExpiredEvidenceLocations(client);
    const document = await getDocument(client, req.params.id);
    if (!document || document.deleted_at) throw new ApiError(404, "Document not found.");
    await assertDocumentAccess(client, req, document.entity_type, document.entity_id, document);

    const downloadName = String(document.original_name || "document").replace(/"/g, "");
    res.setHeader("Content-Type", document.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    if (document.file_data?.length) {
      res.send(document.file_data);
      return;
    }

    // Retain read access to documents uploaded before database-backed storage.
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
    await assertDocumentAccess(client, req, before.entity_type, before.entity_id, before);

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
      beforeData: documentAuditData(before),
      afterData: documentAuditData(rows[0])
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
