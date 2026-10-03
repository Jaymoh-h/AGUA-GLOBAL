require("dotenv").config();

const { spawnSync } = require("node:child_process");

const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL or DATABASE_URL is missing from server/.env");
  process.exit(1);
}

// Smoke tests create and update records; keep that activity in the configured test database.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.TEST_DATABASE_URL = testDatabaseUrl;
// Keep callback tests self-contained when a development token has not been configured.
process.env.MPESA_CALLBACK_TOKEN = process.env.MPESA_CALLBACK_TOKEN || "smoke-test-mpesa-callback-token";

const result = spawnSync(process.execPath, ["--test", "test/smoke.test.js", "test/rateLimit.test.js", "test/styledPdf.test.js"], {
  env: process.env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
