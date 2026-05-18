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
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  logoStorageMode: process.env.LOGO_STORAGE_MODE || (process.env.VERCEL ? "data-url" : "filesystem")
};
