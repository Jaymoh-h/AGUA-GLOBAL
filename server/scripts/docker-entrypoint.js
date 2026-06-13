const { spawnSync } = require("child_process");
const pool = require("../src/db/pool");

const run = (args) => {
  const result = spawnSync("npm", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const tableExists = async (tableName) => {
  const { rows } = await pool.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(rows[0]?.table_name);
};

const migrationCount = async () => {
  if (!(await tableExists("schema_migrations"))) return null;
  const { rows } = await pool.query("SELECT COUNT(*)::integer AS count FROM schema_migrations");
  return rows[0]?.count || 0;
};

const main = async () => {
  const hasUsersTable = await tableExists("users");
  const appliedCount = await migrationCount();

  if (hasUsersTable && (appliedCount === null || appliedCount === 0)) {
    console.log("Detected initialized schema without migration ledger entries. Baselining migrations.");
    run(["run", "db:migrate:baseline"]);
  } else {
    run(["run", "db:migrate"]);
  }

  await pool.end();
  run(["start"]);
};

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(error);
  process.exit(1);
});
