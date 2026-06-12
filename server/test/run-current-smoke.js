require("dotenv").config();

const { spawnSync } = require("node:child_process");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing from server/.env");
  process.exit(1);
}

process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;

const result = spawnSync(process.execPath, ["--test", "test/smoke.test.js"], {
  env: process.env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
