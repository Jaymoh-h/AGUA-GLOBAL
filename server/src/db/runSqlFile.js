require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const ensureMigrationsTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_by VARCHAR(120)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
      ON schema_migrations(applied_at DESC)
  `);
};

const migrationMeta = (filePath, sql) => {
  const filename = path.basename(filePath);
  const match = filename.match(/^(\d{3})_.+\.sql$/);
  if (!match) return null;
  return {
    version: match[1],
    filename,
    checksum: crypto.createHash("sha256").update(sql).digest("hex")
  };
};

const run = async () => {
  const relativeFile = process.argv[2];
  if (!relativeFile) {
    throw new Error("Usage: node src/db/runSqlFile.js <path-to-sql-file>");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from server/.env");
  }

  const filePath = path.resolve(process.cwd(), relativeFile);
  const sql = fs.readFileSync(filePath, "utf8");
  const databaseSsl =
    process.env.DATABASE_SSL === "true" ||
    process.env.PGSSLMODE === "require" ||
    /[?&]sslmode=require\b/i.test(process.env.DATABASE_URL || "");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } : undefined
  });
  const meta = migrationMeta(filePath, sql);

  try {
    const start = Date.now();
    if (meta) {
      await ensureMigrationsTable(pool);
      const applied = await pool.query("SELECT * FROM schema_migrations WHERE version = $1", [meta.version]);
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== meta.checksum) {
          throw new Error(`Migration ${meta.filename} checksum differs from recorded version.`);
        }
        console.log(`Skipped already applied migration: ${meta.filename}`);
        return;
      }
    }
    await pool.query(sql);
    if (meta) {
      await pool.query(
        `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, applied_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [meta.version, meta.filename, meta.checksum, Date.now() - start, process.env.USERNAME || process.env.USER || "unknown"]
      );
    }
    console.log(`Applied SQL file: ${filePath}`);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
