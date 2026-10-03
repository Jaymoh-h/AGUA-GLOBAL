const fs = require("fs/promises");
const path = require("path");
const pool = require("../db/pool");
const { logoStorageMode, mpesaCallbackToken, publicStatusUrl, sms, smtp } = require("../config/env");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { matchesFileSignature } = require("../utils/fileSignature");
const { getWhatsAppStatus } = require("../services/whatsapp.service");

const uploadDir = path.join(__dirname, "..", "..", "public", "uploads");
const logoMimeTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};
const maxLogoBytes = 2 * 1024 * 1024;
const printPageSizes = new Set(["A4", "A5", "Letter", "Legal"]);
const printOrientations = new Set(["portrait", "landscape"]);

const nullableText = (value) => {
  if (value === undefined) return undefined;
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const normalizePrintPageSize = (value) => {
  const raw = String(value || "A4").trim().toLowerCase();
  const match = [...printPageSizes].find((item) => item.toLowerCase() === raw);
  if (!match) throw new ApiError(400, "Print page size must be A4, A5, Letter, or Legal.");
  return match;
};

const normalizePrintOrientation = (value) => {
  const orientation = String(value || "portrait").trim().toLowerCase();
  if (!printOrientations.has(orientation)) {
    throw new ApiError(400, "Print orientation must be portrait or landscape.");
  }
  return orientation;
};

const normalizePrintMargin = (value) => {
  const margin = Number(value ?? 14);
  if (!Number.isFinite(margin) || margin < 5 || margin > 30) {
    throw new ApiError(400, "Print margin must be between 5mm and 30mm.");
  }
  return margin;
};

const normalizePrintScale = (value) => {
  const scale = Number(value ?? 100);
  if (!Number.isInteger(scale) || scale < 75 || scale > 120) {
    throw new ApiError(400, "Print scale must be a whole number between 75 and 120.");
  }
  return scale;
};

const normalizedProvider = (value) => String(value || "none").toLowerCase().replace(/[\s_-]+/g, "");
const commissioningCheckKeys = new Set([
  "messaging_email",
  "messaging_sms",
  "messaging_whatsapp",
  "mpesa_settlement",
  "bank_feed",
  "database_resilience",
  "external_uptime"
]);
const commissioningStatuses = new Set(["planned", "passed", "partial", "failed"]);

const getIntegrationReadiness = asyncHandler(async (_req, res) => {
  const business = await getBusinessSettingsRow(pool);
  const smsProvider = normalizedProvider(sms.provider);
  const smsConfigured =
    (smsProvider === "africastalking" && Boolean(sms.africasTalking.username && sms.africasTalking.apiKey)) ||
    (smsProvider === "twilio" && Boolean(sms.twilio.accountSid && sms.twilio.authToken && (sms.twilio.from || sms.twilio.messagingServiceSid)));
  const whatsapp = getWhatsAppStatus();
  const paybillConfigured = Boolean(business?.paybill_number);
  const callbackTokenConfigured = Boolean(mpesaCallbackToken);

  res.json({
    generated_at: new Date().toISOString(),
    messaging: {
      email: { configured: Boolean(smtp.host && smtp.user && smtp.pass), provider: smtp.host ? "SMTP" : "none" },
      sms: { configured: smsConfigured, provider: sms.provider || "none" },
      whatsapp: { configured: whatsapp.configured, provider: whatsapp.provider || "none" }
    },
    payments: {
      mpesa: {
        mode: callbackTokenConfigured && paybillConfigured ? "guarded_callback" : "statement_reconciliation",
        callback_token_configured: callbackTokenConfigured,
        paybill_configured: paybillConfigured,
        direct_posting_ready: callbackTokenConfigured && paybillConfigured
      },
      bank_feed: { mode: "statement_reconciliation", direct_feed_configured: false }
    },
    operations: {
      public_status_url_configured: Boolean(publicStatusUrl),
      external_uptime_monitor: "not_observable_from_application",
      provider_native_database_resilience: "not_observable_from_application"
    }
  });
});

const listIntegrationCommissioningChecks = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT icc.*, u.name AS recorded_by_name
     FROM integration_commissioning_checks icc
     LEFT JOIN users u ON u.id = icc.recorded_by
     ORDER BY icc.verification_date DESC, icc.id DESC
     LIMIT 80`
  );
  res.json(rows);
});

const createIntegrationCommissioningCheck = asyncHandler(async (req, res) => {
  const checkKey = String(req.body?.check_key || "").trim();
  const status = String(req.body?.status || "planned").trim().toLowerCase();
  const verificationDate = String(req.body?.verification_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const evidenceReference = nullableText(req.body?.evidence_reference);
  const findings = nullableText(req.body?.findings);
  const followUpActions = nullableText(req.body?.follow_up_actions);

  if (!commissioningCheckKeys.has(checkKey)) throw new ApiError(400, "Unsupported commissioning check.");
  if (!commissioningStatuses.has(status)) throw new ApiError(400, "Commissioning status must be planned, passed, partial, or failed.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verificationDate)) throw new ApiError(400, "Verification date must use YYYY-MM-DD.");
  if (evidenceReference && evidenceReference.length > 240) throw new ApiError(400, "Evidence reference must be 240 characters or fewer.");
  if (status === "passed" && !evidenceReference) {
    throw new ApiError(400, "A passed commissioning check requires an evidence reference.");
  }

  const { rows } = await pool.query(
    `INSERT INTO integration_commissioning_checks (
       check_key, status, verification_date, evidence_reference, findings, follow_up_actions, recorded_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [checkKey, status, verificationDate, evidenceReference, findings, followUpActions, req.user.id]
  );
  const created = rows[0];
  await recordAuditEvent(pool, {
    req,
    action: "integration_commissioning_check.recorded",
    entityType: "integration_commissioning_check",
    entityId: created.id,
    afterData: created,
    reason: `Recorded ${checkKey} commissioning evidence`
  });
  res.status(201).json(created);
});

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
  if (!matchesFileSignature(buffer, mimeType)) {
    throw new ApiError(400, "Logo content does not match the selected image type.");
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
    res.json({
      business_name: settings.business_name,
      email: settings.email
    });
  } finally {
    client.release();
  }
});

const updateBusinessSettings = asyncHandler(async (req, res) => {
  const businessName = nullableText(req.body.business_name);
  const defaultCurrency = nullableText(req.body.default_currency) || "KES";
  const printPageSize = normalizePrintPageSize(req.body.print_page_size);
  const printOrientation = normalizePrintOrientation(req.body.print_orientation);
  const printMarginMm = normalizePrintMargin(req.body.print_margin_mm);
  const printScalePercent = normalizePrintScale(req.body.print_scale_percent);
  const printFitToPage = Boolean(req.body.print_fit_to_page);

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
           print_page_size = $15,
           print_orientation = $16,
           print_margin_mm = $17,
           print_scale_percent = $18,
           print_fit_to_page = $19,
           updated_by = $20,
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
        printPageSize,
        printOrientation,
        printMarginMm,
        printScalePercent,
        printFitToPage,
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
  getIntegrationReadiness,
  listIntegrationCommissioningChecks,
  createIntegrationCommissioningCheck,
  updateBusinessSettings,
  uploadBusinessLogo
};
