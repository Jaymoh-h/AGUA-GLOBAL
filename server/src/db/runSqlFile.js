require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(sql);
    console.log(`Applied SQL file: ${filePath}`);
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
