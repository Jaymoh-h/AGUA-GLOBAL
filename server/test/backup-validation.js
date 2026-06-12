require("dotenv").config();

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backupDir = path.join(os.tmpdir(), "agua-global-backup-validation");

const forbiddenKeys = new Set([
  "password",
  "password_hash",
  "password_reset_token",
  "reset_token",
  "token_hash",
  "jwt_secret"
]);

const walk = (value, visitor, trail = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...trail, String(index)]));
    return;
  }

  if (!value || typeof value !== "object") return;

  Object.entries(value).forEach(([key, child]) => {
    visitor(key, child, [...trail, key]);
    walk(child, visitor, [...trail, key]);
  });
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from server/.env");
  }

  await fs.mkdir(backupDir, { recursive: true });

  const result = spawnSync(process.execPath, ["src/db/backup.js", "create", `--dir=${backupDir}`], {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Backup command failed.").trim());
  }

  const filePath = result.stdout.match(/Backup created:\s*(.+)/)?.[1]?.trim();
  assert(filePath, "Backup command did not print a backup path.");

  const raw = await fs.readFile(filePath, "utf8");
  const backup = JSON.parse(raw);

  assert(backup.export_type === "operational_backup", "Unexpected backup export type.");
  assert(backup.exported_at, "Backup is missing exported_at.");
  assert(backup.dataset_counts && typeof backup.dataset_counts === "object", "Backup is missing dataset counts.");
  assert(backup.datasets && typeof backup.datasets === "object", "Backup is missing datasets.");

  for (const [datasetName, rows] of Object.entries(backup.datasets)) {
    assert(Array.isArray(rows), `${datasetName} dataset is not an array.`);
    assert(Number(backup.dataset_counts[datasetName] || 0) === rows.length, `${datasetName} count does not match row length.`);
  }

  const sensitivePaths = [];
  walk(backup, (key, _value, trail) => {
    if (forbiddenKeys.has(String(key).toLowerCase())) sensitivePaths.push(trail.join("."));
  });

  assert(!sensitivePaths.length, `Backup contains forbidden sensitive field(s): ${sensitivePaths.join(", ")}`);

  console.log(`Backup validation passed: ${filePath}`);
  console.log(`Datasets validated: ${Object.keys(backup.datasets).length}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
