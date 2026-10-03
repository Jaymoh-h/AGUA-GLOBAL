const nodemailer = require("nodemailer");
const { smtp } = require("../config/env");

const MAX_EMAIL_BODY_LENGTH = 50_000;
const MAX_EMAIL_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024;
const EMAIL_ADDRESS_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const hasSmtpConfig = () => Boolean(smtp.host && smtp.user && smtp.pass);

const validationError = (message) => new Error(`Invalid email delivery input: ${message}`);

const normalizeEmailAddress = (value, label, allowedDomains = []) => {
  const address = String(value || "").trim().toLowerCase();
  if (address.length > 254 || !EMAIL_ADDRESS_PATTERN.test(address)) {
    throw validationError(`${label} must be a single email address.`);
  }

  const domain = address.split("@")[1];
  if (allowedDomains.length && !allowedDomains.includes(domain)) {
    throw validationError(`${label} is not in an approved recipient domain.`);
  }
  return address;
};

const normalizeHeader = (value, label) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 220 || /[\r\n]/.test(normalized)) {
    throw validationError(`${label} contains an invalid header value.`);
  }
  return normalized;
};

const normalizeBody = (value, label) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > MAX_EMAIL_BODY_LENGTH) {
    throw validationError(`${label} is too large or not text.`);
  }
  return value;
};

const normalizeAttachments = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length > 12) {
    throw validationError("attachments must be a short list of documents.");
  }

  let totalBytes = 0;
  return attachments.map((attachment) => {
    const filename = String(attachment?.filename || "").trim();
    const content = attachment?.content;
    const contentType = attachment?.contentType || "application/pdf";
    if (!filename || filename.length > 120 || /[\\/:*?\"<>|\r\n]/.test(filename) || !filename.toLowerCase().endsWith(".pdf")) {
      throw validationError("attachments must have safe PDF filenames.");
    }
    if (!Buffer.isBuffer(content) || content.length === 0 || content.length > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw validationError("attachments must be in-memory PDF files within the size limit.");
    }
    if (contentType !== "application/pdf") {
      throw validationError("attachments must be PDF documents.");
    }

    totalBytes += content.length;
    if (totalBytes > MAX_EMAIL_ATTACHMENT_TOTAL_BYTES) {
      throw validationError("attachment total exceeds the size limit.");
    }
    return { filename, content, contentType };
  });
};

const createTransporter = () =>
  nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    },
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    }
  });

const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  if (!hasSmtpConfig()) {
    return { skipped: true, error: "SMTP is not configured." };
  }

  const message = {
    from: normalizeEmailAddress(smtp.from, "SMTP_FROM"),
    to: normalizeEmailAddress(to, "recipient", smtp.allowedRecipientDomains),
    subject: normalizeHeader(subject, "subject"),
    text: normalizeBody(text, "text body"),
    html: normalizeBody(html, "HTML body"),
    attachments: normalizeAttachments(attachments)
  };
  const transporter = createTransporter();
  const info = await transporter.sendMail(message);
  return { skipped: false, messageId: info.messageId };
};

const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes }) => {
  const subject = "Reset your AGUA Global password";
  const text = [
    `Hello ${name || "there"},`,
    "",
    "Use the link below to reset your password.",
    resetUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes. If you did not request it, you can ignore this email.`
  ].join("\n");

  const result = await sendEmail({
    to,
    subject,
    text
  });
  return result;
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  __private: {
    normalizeEmailAddress,
    normalizeHeader,
    normalizeAttachments
  }
};
