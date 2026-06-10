const crypto = require("crypto");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { parseDocumentUpload } = require("../services/documentStorage.service");

const staffRoles = ["admin", "accountant", "meter_reader", "business_viewer"];
const sensitivities = ["internal", "confidential", "restricted"];
const statuses = ["active", "archived"];

const normalizeText = (value, fallback = "") => String(value ?? fallback).trim();

const normalizeAllowedRoles = (value) => {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const roles = [...new Set(source.map((role) => String(role).trim()).filter(Boolean))];
  if (!roles.length) return ["admin"];
  const invalid = roles.find((role) => !staffRoles.includes(role));
  if (invalid) throw new ApiError(400, `Role ${invalid} is not allowed for knowledge documents.`);
  if (!roles.includes("admin")) roles.unshift("admin");
  return roles;
};

const normalizeSensitivity = (value) => {
  const sensitivity = normalizeText(value, "internal").toLowerCase();
  if (!sensitivities.includes(sensitivity)) throw new ApiError(400, "Sensitivity is invalid.");
  return sensitivity;
};

const normalizeStatus = (value) => {
  const status = normalizeText(value, "active").toLowerCase();
  if (!statuses.includes(status)) throw new ApiError(400, "Status is invalid.");
  return status;
};

const assertKnowledgeAccess = (req, document) => {
  if (!document || document.deleted_at) throw new ApiError(404, "Knowledge document not found.");
  if (req.user.role === "admin") return;
  if (!Array.isArray(document.allowed_roles) || !document.allowed_roles.includes(req.user.role)) {
    throw new ApiError(403, "You are not allowed to access this knowledge document.");
  }
  if (document.status !== "active") {
    throw new ApiError(404, "Knowledge document not found.");
  }
};

const assertCanManageDocument = (req, { sensitivity, allowedRoles }) => {
  if (req.user.role === "admin") return;
  if (req.user.role !== "accountant") {
    throw new ApiError(403, "Only admins and accountants can manage knowledge documents.");
  }
  if (sensitivity === "restricted") {
    throw new ApiError(403, "Only admins can manage restricted knowledge documents.");
  }
  if (!allowedRoles.includes("accountant")) {
    throw new ApiError(403, "Accountants can only create documents visible to accountants.");
  }
};

const knowledgeDocumentColumns = (alias = "kd", { includeData = false } = {}) => `
  ${alias}.id, ${alias}.title, ${alias}.category, ${alias}.sensitivity, ${alias}.allowed_roles,
  ${alias}.version_label, ${alias}.summary, ${alias}.original_name, ${alias}.stored_name,
  ${alias}.storage_path, ${alias}.mime_type, ${alias}.file_size, ${includeData ? `${alias}.file_data,` : ""}
  ${alias}.status, ${alias}.uploaded_by, ${alias}.updated_by, ${alias}.deleted_at, ${alias}.deleted_by,
  ${alias}.created_at, ${alias}.updated_at
`;

const getKnowledgeDocument = async (client, id, { lock = false, includeData = false } = {}) => {
  const { rows } = await client.query(
    `SELECT ${knowledgeDocumentColumns("kd", { includeData })},
            uploaded.name AS uploaded_by_name,
            updated.name AS updated_by_name,
            deleted.name AS deleted_by_name
     FROM knowledge_documents kd
     LEFT JOIN users uploaded ON uploaded.id = kd.uploaded_by
     LEFT JOIN users updated ON updated.id = kd.updated_by
     LEFT JOIN users deleted ON deleted.id = kd.deleted_by
     WHERE kd.id = $1
     ${lock ? "FOR UPDATE OF kd" : ""}`,
    [id]
  );
  return rows[0] || null;
};

const listKnowledgeDocuments = asyncHandler(async (req, res) => {
  const params = [];
  const filters = ["kd.deleted_at IS NULL"];

  if (req.user.role !== "admin") {
    filters.push(`kd.status = 'active'`);
    filters.push(`$${params.push(req.user.role)} = ANY(kd.allowed_roles)`);
  } else if (req.query.status) {
    filters.push(`kd.status = $${params.push(normalizeStatus(req.query.status))}`);
  }

  if (req.query.category) {
    filters.push(`LOWER(kd.category) = LOWER($${params.push(normalizeText(req.query.category))})`);
  }
  if (req.query.sensitivity) {
    filters.push(`kd.sensitivity = $${params.push(normalizeSensitivity(req.query.sensitivity))}`);
  }
  if (req.query.search) {
    const search = `%${normalizeText(req.query.search).toLowerCase()}%`;
    filters.push(`(
      LOWER(kd.title) LIKE $${params.push(search)}
      OR LOWER(kd.category) LIKE $${params.length}
      OR LOWER(COALESCE(kd.summary, '')) LIKE $${params.length}
      OR LOWER(kd.original_name) LIKE $${params.length}
    )`);
  }

  const { rows } = await pool.query(
    `SELECT kd.id, kd.title, kd.category, kd.sensitivity, kd.allowed_roles, kd.version_label,
            kd.summary, kd.original_name, kd.mime_type, kd.file_size, kd.status,
            kd.created_at, kd.updated_at, kd.uploaded_by, kd.updated_by,
            uploaded.name AS uploaded_by_name,
            updated.name AS updated_by_name
     FROM knowledge_documents kd
     LEFT JOIN users uploaded ON uploaded.id = kd.uploaded_by
     LEFT JOIN users updated ON updated.id = kd.updated_by
     WHERE ${filters.join(" AND ")}
     ORDER BY
       CASE kd.sensitivity WHEN 'restricted' THEN 0 WHEN 'confidential' THEN 1 ELSE 2 END,
       kd.updated_at DESC,
       kd.id DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

const uploadKnowledgeDocument = asyncHandler(async (req, res) => {
  const title = normalizeText(req.body.title);
  if (!title) throw new ApiError(400, "Title is required.");
  if (title.length > 180) throw new ApiError(400, "Title must be 180 characters or fewer.");

  const category = normalizeText(req.body.category, "General").slice(0, 80) || "General";
  const sensitivity = normalizeSensitivity(req.body.sensitivity);
  const allowedRoles = normalizeAllowedRoles(req.body.allowed_roles);
  assertCanManageDocument(req, { sensitivity, allowedRoles });

  const parsed = parseDocumentUpload(req.body);
  const summary = normalizeText(req.body.summary) || null;
  const versionLabel = normalizeText(req.body.version_label, "v1").slice(0, 40) || "v1";
  const status = normalizeStatus(req.body.status || "active");
  const storedName = `${crypto.randomUUID()}.${parsed.extension}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO knowledge_documents (
        title, category, sensitivity, allowed_roles, version_label, summary,
        original_name, stored_name, storage_path, mime_type, file_size,
        file_data, status, uploaded_by, updated_by
      )
      VALUES (
        $1::varchar, $2::varchar, $3::varchar, $4::text[], $5::varchar, $6,
        $7::varchar, $8::varchar, $9, $10::varchar, $11,
        $12, $13::varchar, $14, $14
      )
      RETURNING ${knowledgeDocumentColumns("knowledge_documents")}`,
      [
        title,
        category,
        sensitivity,
        allowedRoles,
        versionLabel,
        summary,
        parsed.originalName,
        storedName,
        `db/knowledge_base/${storedName}`,
        parsed.mimeType,
        parsed.buffer.length,
        parsed.buffer,
        status,
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "knowledge_document.uploaded",
      entityType: "knowledge_document",
      entityId: rows[0].id,
      afterData: rows[0],
      reason: summary
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

const updateKnowledgeDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getKnowledgeDocument(client, req.params.id, { lock: true });
    assertKnowledgeAccess(req, before);

    const nextSensitivity = req.body.sensitivity === undefined ? before.sensitivity : normalizeSensitivity(req.body.sensitivity);
    const nextAllowedRoles = req.body.allowed_roles === undefined ? before.allowed_roles : normalizeAllowedRoles(req.body.allowed_roles);
    assertCanManageDocument(req, { sensitivity: nextSensitivity, allowedRoles: nextAllowedRoles });

    const nextTitle = req.body.title === undefined ? before.title : normalizeText(req.body.title);
    if (!nextTitle) throw new ApiError(400, "Title is required.");
    if (nextTitle.length > 180) throw new ApiError(400, "Title must be 180 characters or fewer.");

    const { rows } = await client.query(
      `UPDATE knowledge_documents
       SET title = $1::varchar,
           category = $2::varchar,
           sensitivity = $3::varchar,
           allowed_roles = $4::text[],
           version_label = $5::varchar,
           summary = $6,
           status = $7::varchar,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING ${knowledgeDocumentColumns("knowledge_documents")}`,
      [
        nextTitle,
        req.body.category === undefined ? before.category : normalizeText(req.body.category, "General").slice(0, 80) || "General",
        nextSensitivity,
        nextAllowedRoles,
        req.body.version_label === undefined ? before.version_label : normalizeText(req.body.version_label, "v1").slice(0, 40) || "v1",
        req.body.summary === undefined ? before.summary : normalizeText(req.body.summary) || null,
        req.body.status === undefined ? before.status : normalizeStatus(req.body.status),
        req.user.id,
        before.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "knowledge_document.updated",
      entityType: "knowledge_document",
      entityId: before.id,
      beforeData: before,
      afterData: rows[0],
      reason: normalizeText(req.body.reason) || null
    });

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const downloadKnowledgeDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const document = await getKnowledgeDocument(client, req.params.id, { includeData: true });
    assertKnowledgeAccess(req, document);

    await recordAuditEvent(client, {
      req,
      action: "knowledge_document.downloaded",
      entityType: "knowledge_document",
      entityId: document.id,
      afterData: {
        id: document.id,
        title: document.title,
        category: document.category,
        sensitivity: document.sensitivity,
        original_name: document.original_name
      }
    });

    const downloadName = String(document.original_name || "knowledge-document").replace(/"/g, "");
    res.setHeader("Content-Type", document.mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.send(document.file_data);
  } finally {
    client.release();
  }
});

const deleteKnowledgeDocument = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getKnowledgeDocument(client, req.params.id, { lock: true });
    assertKnowledgeAccess(req, before);
    assertCanManageDocument(req, { sensitivity: before.sensitivity, allowedRoles: before.allowed_roles });

    const { rows } = await client.query(
      `UPDATE knowledge_documents
       SET deleted_at = NOW(),
           deleted_by = $1,
           status = 'archived',
           updated_by = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING ${knowledgeDocumentColumns("knowledge_documents")}`,
      [req.user.id, before.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "knowledge_document.deleted",
      entityType: "knowledge_document",
      entityId: before.id,
      beforeData: before,
      afterData: rows[0],
      reason: normalizeText(req.body?.reason) || null
    });

    await client.query("COMMIT");
    res.json({ message: "Knowledge document removed." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  deleteKnowledgeDocument,
  downloadKnowledgeDocument,
  listKnowledgeDocuments,
  updateKnowledgeDocument,
  uploadKnowledgeDocument
};
