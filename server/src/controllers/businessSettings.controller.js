const fs = require("fs/promises");
const path = require("path");
const pool = require("../db/pool");
const { logoStorageMode } = require("../config/env");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const uploadDir = path.join(__dirname, "..", "..", "public", "uploads");
const logoMimeTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};
const maxLogoBytes = 2 * 1024 * 1024;

const nullableText = (value) => {
  if (value === undefined) return undefined;
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const parseLogoUpload = ({ data, mime_type }) => {
  const match = String(data || "").match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = mime_type || match?.[1];
  const base64 = match?.[2] || data;
  const extension = logoMimeTypes[mimeType];

  if (!extension) {
    throw new ApiError(400, "Logo must be a PNG, JPG, WEBP, or GIF image.");
  }

  const buffer = Buffer.from(String(base64 || ""), "base64");
  if (!buffer.length) {
    throw new ApiError(400, "Logo image data is required.");
  }
  if (buffer.length > maxLogoBytes) {
    throw new ApiError(400, "Logo image must be 2MB or smaller.");
  }

  return { buffer, extension, mimeType };
};

const persistLogo = async ({ buffer, extension, mimeType }) => {
  if (logoStorageMode === "data-url") {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  if (logoStorageMode !== "filesystem") {
    throw new ApiError(500, "Unsupported logo storage mode.");
  }

  const fileName = `business-logo-${Date.now()}.${extension}`;
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, fileName), buffer);
  return `/uploads/${fileName}`;
};

const getBusinessSettingsRow = async (client) => {
  const { rows } = await client.query("SELECT * FROM business_settings WHERE id = 1");
  if (rows[0]) return rows[0];

  const inserted = await client.query(
    `INSERT INTO business_settings (id)
     VALUES (1)
     ON CONFLICT (id) DO UPDATE SET updated_at = business_settings.updated_at
     RETURNING *`
  );
  return inserted.rows[0];
};

const getBusinessSettings = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    res.json(await getBusinessSettingsRow(client));
  } finally {
    client.release();
  }
});

const getPublicBusinessSettings = asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const settings = await getBusinessSettingsRow(client);
    res.json({ business_name: settings.business_name });
  } finally {
    client.release();
  }
});

const updateBusinessSettings = asyncHandler(async (req, res) => {
  const businessName = nullableText(req.body.business_name);
  const defaultCurrency = nullableText(req.body.default_currency) || "KES";

  if (!businessName) {
    throw new ApiError(400, "Business name is required.");
  }

  if (defaultCurrency.length > 10) {
    throw new ApiError(400, "Default currency must be 10 characters or fewer.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getBusinessSettingsRow(client);
    await client.query("SELECT * FROM business_settings WHERE id = 1 FOR UPDATE");

    const { rows } = await client.query(
      `UPDATE business_settings
       SET business_name = $1,
           legal_name = $2,
           logo_url = $3,
           phone = $4,
           email = $5,
           physical_address = $6,
           postal_address = $7,
           tax_pin = $8,
           paybill_number = $9,
           till_number = $10,
           bank_details = $11,
           receipt_footer_note = $12,
           report_footer_note = $13,
           default_currency = $14,
           updated_by = $15,
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        businessName,
        nullableText(req.body.legal_name),
        nullableText(req.body.logo_url),
        nullableText(req.body.phone),
        nullableText(req.body.email),
        nullableText(req.body.physical_address),
        nullableText(req.body.postal_address),
        nullableText(req.body.tax_pin),
        nullableText(req.body.paybill_number),
        nullableText(req.body.till_number),
        nullableText(req.body.bank_details),
        nullableText(req.body.receipt_footer_note),
        nullableText(req.body.report_footer_note),
        defaultCurrency.toUpperCase(),
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "business_settings.updated",
      entityType: "business_settings",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0]
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

const uploadBusinessLogo = asyncHandler(async (req, res) => {
  const logoUrl = await persistLogo(parseLogoUpload(req.body));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await getBusinessSettingsRow(client);
    await client.query("SELECT * FROM business_settings WHERE id = 1 FOR UPDATE");

    const { rows } = await client.query(
      `UPDATE business_settings
       SET logo_url = $1,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [logoUrl, req.user.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "business_settings.logo_uploaded",
      entityType: "business_settings",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0]
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

module.exports = {
  getPublicBusinessSettings,
  getBusinessSettings,
  updateBusinessSettings,
  uploadBusinessLogo
};
