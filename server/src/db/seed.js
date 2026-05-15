const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const run = async () => {
  const schema = fs.readFileSync(path.join(__dirname, "../../database/schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(__dirname, "../../database/seed.sql"), "utf8");

  await pool.query(schema);
  await pool.query(seed);
  await pool.end();
  console.log("Database schema and seed data applied.");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

