require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");

const migrationsDir = path.resolve(process.cwd(), "database", "migrations");

const createPool = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from server/.env");
  }

  const databaseSsl =
    process.env.DATABASE_SSL === "true" ||
    process.env.PGSSLMODE === "require" ||
    /[?&]sslmode=require\b/i.test(process.env.DATABASE_URL || "");

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } : undefined
  });
};

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_by VARCHAR(120)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
      ON schema_migrations(applied_at DESC)
  `);
};

const checksum = (content) => crypto.createHash("sha256").update(content).digest("hex");

const parseMigrationFile = (filename) => {
  const match = filename.match(/^(\d{3})_.+\.sql$/);
  if (!match) return null;
  return {
    version: match[1],
    filename
  };
};

const loadMigrations = async () => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = parseMigrationFile(entry.name);
    if (!parsed) continue;

    const filePath = path.join(migrationsDir, entry.name);
    const sql = await fs.readFile(filePath, "utf8");
    migrations.push({
      ...parsed,
      filePath,
      sql,
      checksum: checksum(sql)
    });
  }

  return migrations.sort((a, b) => a.version.localeCompare(b.version) || a.filename.localeCompare(b.filename));
};

const getAppliedMigrations = async (client) => {
  const { rows } = await client.query("SELECT * FROM schema_migrations ORDER BY version ASC");
  return new Map(rows.map((row) => [row.version, row]));
};

const getAppliedBy = () => process.env.USERNAME || process.env.USER || "unknown";

const assertNoChecksumMismatch = (migration, applied) => {
  if (!applied) return;
  if (applied.checksum !== migration.checksum) {
    throw new Error(
      `Migration ${migration.filename} checksum differs from recorded version. ` +
        "Do not edit an applied migration; create a new migration instead."
    );
  }
};

const applyMigration = async (client, migration) => {
  const start = Date.now();
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, applied_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [migration.version, migration.filename, migration.checksum, Date.now() - start, getAppliedBy()]
    );
    await client.query("COMMIT");
    console.log(`Applied ${migration.filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const markMigrationApplied = async (client, migration) => {
  await client.query(
    `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, applied_by)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (version) DO UPDATE
       SET filename = EXCLUDED.filename,
           checksum = EXCLUDED.checksum`,
    [migration.version, migration.filename, migration.checksum, getAppliedBy()]
  );
};

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
};

const filterThrough = (migrations) => {
  const through = getArgValue("--through");
  if (!through) return migrations;
  const normalized = String(through).padStart(3, "0");
  return migrations.filter((migration) => migration.version <= normalized);
};

const printStatus = async (client, migrations, applied) => {
  let pendingCount = 0;
  for (const migration of migrations) {
    const row = applied.get(migration.version);
    const status = row ? (row.checksum === migration.checksum ? "applied" : "changed") : "pending";
    if (status === "pending") pendingCount += 1;
    console.log(`${migration.version} ${status.padEnd(8)} ${migration.filename}`);
  }
  console.log(`\n${applied.size} recorded, ${pendingCount} pending.`);
};

const run = async () => {
  const command = process.argv[2] || "up";
  const pool = createPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const migrations = await loadMigrations();
    const applied = await getAppliedMigrations(client);

    if (command === "status") {
      await printStatus(client, migrations, applied);
      return;
    }

    if (command === "mark-applied") {
      const migrationsToMark = filterThrough(migrations);
      for (const migration of migrationsToMark) {
        await markMigrationApplied(client, migration);
        console.log(`Marked ${migration.filename}`);
      }
      console.log(`Marked ${migrationsToMark.length} migration(s) as applied.`);
      return;
    }

    if (command !== "up") {
      throw new Error("Usage: node src/db/migrate.js [up|status|mark-applied] [--through=041]");
    }

    let appliedCount = 0;
    for (const migration of migrations) {
      const row = applied.get(migration.version);
      assertNoChecksumMismatch(migration, row);
      if (row) continue;
      await applyMigration(client, migration);
      appliedCount += 1;
    }

    console.log(appliedCount ? `Applied ${appliedCount} migration(s).` : "No pending migrations.");
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
