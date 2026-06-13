const fs = require("fs/promises");
const path = require("path");
const { createReadStream } = require("fs");
const crypto = require("crypto");
const ApiError = require("../utils/apiError");
const { matchesFileSignature } = require("../utils/fileSignature");

const storageRoot = path.join(__dirname, "..", "..", "storage", "documents");
const maxDocumentBytes = 5 * 1024 * 1024;
const allowedMimeTypes = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};
const extensionMimeTypes = Object.fromEntries(Object.entries(allowedMimeTypes).map(([mimeType, extension]) => [extension, mimeType]));

const sanitizeFileName = (value) => {
  const name = path.basename(String(value || "document").trim() || "document");
  return name.replace(/[^\w. -]+/g, "_").replace(/\s+/g, " ").slice(0, 255) || "document";
};

const parseDocumentUpload = ({ data, mime_type, original_name }) => {
  const match = String(data || "").match(/^data:([^;]+);base64,(.+)$/);
  const originalName = sanitizeFileName(original_name);
  const originalExtension = path.extname(originalName).replace(".", "").toLowerCase();
  const inferredMimeType = extensionMimeTypes[originalExtension] || "";
  const suppliedMimeType = String(mime_type || match?.[1] || "").trim().toLowerCase();
  const mimeType = allowedMimeTypes[suppliedMimeType] ? suppliedMimeType : inferredMimeType;
  const base64 = match?.[2] || data;
  const extension = allowedMimeTypes[mimeType];
  if (!extension) {
    throw new ApiError(400, "Document must be a PDF, image, DOCX, or XLSX file.");
  }

  const buffer = Buffer.from(String(base64 || ""), "base64");
  if (!buffer.length) throw new ApiError(400, "Document file data is required.");
  if (buffer.length > maxDocumentBytes) throw new ApiError(400, "Document file must be 5MB or smaller.");
  if (!matchesFileSignature(buffer, mimeType)) {
    throw new ApiError(400, "Document content does not match the selected file type.");
  }

  return {
    buffer,
    extension,
    mimeType,
    originalName
  };
};

const storeDocumentFile = async ({ buffer, extension, entityType }) => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const storedName = `${crypto.randomUUID()}.${extension}`;
  const relativePath = path.join(entityType, year, month, storedName);
  const absolutePath = path.join(storageRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: "wx" });
  return {
    storedName,
    storagePath: relativePath.replace(/\\/g, "/")
  };
};

const resolveStoredDocumentPath = (storagePath) => {
  const absolutePath = path.resolve(storageRoot, String(storagePath || ""));
  const root = path.resolve(storageRoot);
  if (!absolutePath.startsWith(root + path.sep)) {
    throw new ApiError(400, "Stored document path is invalid.");
  }
  return absolutePath;
};

const openDocumentStream = (storagePath) => createReadStream(resolveStoredDocumentPath(storagePath));

const removeDocumentFile = async (storagePath) => {
  try {
    await fs.unlink(resolveStoredDocumentPath(storagePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

module.exports = {
  openDocumentStream,
  parseDocumentUpload,
  removeDocumentFile,
  storeDocumentFile
};
