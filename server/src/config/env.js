require("dotenv").config();

const required = ["DATABASE_URL", "JWT_SECRET"];
const defaultClientOrigin = "http://localhost:5173";
const clientOrigins = String(process.env.CLIENT_ORIGIN || defaultClientOrigin)
  .split(",")
  .map((origin) => origin.trim())
  .map((origin) => origin.replace(/\/+$/, ""))
  .filter(Boolean);

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl:
    process.env.DATABASE_SSL === "true" ||
    process.env.PGSSLMODE === "require" ||
    /[?&]sslmode=require\b/i.test(process.env.DATABASE_URL || ""),
  databaseSslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  reminderCronSecret: process.env.REMINDER_CRON_SECRET || process.env.CRON_SECRET,
  monitoringCronSecret: process.env.MONITORING_CRON_SECRET || process.env.CRON_SECRET,
  monitoringAlertEmails: String(process.env.MONITORING_ALERT_EMAILS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  monitoringAlertPhones: String(process.env.MONITORING_ALERT_PHONES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  monitoringAlertWindowMinutes: Number(process.env.MONITORING_ALERT_WINDOW_MINUTES || 15),
  monitoringAlertCooldownMinutes: Number(process.env.MONITORING_ALERT_COOLDOWN_MINUTES || 60),
  publicStatusUrl: process.env.PUBLIC_STATUS_URL || process.env.MONITORING_STATUS_URL || "",
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 600),
  apiRateLimitStore: process.env.API_RATE_LIMIT_STORE || "memory",
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  authRateLimitStore: process.env.AUTH_RATE_LIMIT_STORE || (process.env.VERCEL ? "database" : "memory"),
  rateLimitHashSecret: process.env.RATE_LIMIT_HASH_SECRET || process.env.JWT_SECRET,
  passwordResetMinutes: Number(process.env.PASSWORD_RESET_MINUTES || 60),
  clientOrigin: clientOrigins[0] || defaultClientOrigin,
  clientOrigins: clientOrigins.length ? clientOrigins : [defaultClientOrigin],
  logoStorageMode: process.env.LOGO_STORAGE_MODE || (process.env.VERCEL ? "data-url" : "filesystem"),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || "no-reply@agua-global.local"
  },
  sms: {
    provider: process.env.SMS_PROVIDER || "none",
    defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE || "254",
    africasTalking: {
      username: process.env.AT_USERNAME || process.env.AFRICASTALKING_USERNAME,
      apiKey: process.env.AT_API_KEY || process.env.AFRICASTALKING_API_KEY,
      from: process.env.AT_SENDER_ID || process.env.AFRICASTALKING_SENDER_ID || ""
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID
    }
  },
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || "none",
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || process.env.SMS_DEFAULT_COUNTRY_CODE || "254",
    twilio: {
      accountSid: process.env.WHATSAPP_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.WHATSAPP_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_TWILIO_FROM
    },
    meta: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      apiVersion: process.env.WHATSAPP_API_VERSION || "v20.0"
    }
  }
};
