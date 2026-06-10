require("dotenv").config();

const pool = require("../db/pool");
const { sendOperationalReminders } = require("../services/operationalReminder.service");

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  const includeNoWork = process.argv.includes("--include-no-work");
  const typeArg = process.argv.find((arg) => arg.startsWith("--types="));
  const onlyTypes = typeArg
    ? typeArg
        .replace("--types=", "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const result = await sendOperationalReminders({ dryRun, includeNoWork, onlyTypes });
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
