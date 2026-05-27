require("dotenv").config();

const required = ["DATABASE_URL", "JWT_SECRET"];

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
  passwordResetMinutes: Number(process.env.PASSWORD_RESET_MINUTES || 60),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
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
    }
  }
};
