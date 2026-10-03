require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const run = async () => {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Development scenario data is blocked in production environments.");
  }

  const sql = fs.readFileSync(path.join(__dirname, "../../database/development_scenarios.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM customers WHERE acc_number LIKE 'DEV-%') AS customers,
        (SELECT COUNT(*) FROM meters WHERE meter_number LIKE 'DEV-%') AS meters,
        (SELECT COUNT(*) FROM bills WHERE bill_number LIKE 'DEV-%') AS bills,
        (SELECT COUNT(*) FROM maintenance_requests WHERE request_number LIKE 'DEV-%' AND status IN ('open', 'in_progress')) AS active_requests,
        (SELECT COUNT(*) FROM contractor_invoices WHERE invoice_number LIKE 'DEV-%') AS contractor_invoices,
        (SELECT COUNT(*) FROM payroll_runs WHERE name LIKE 'DEV Payroll%') AS payroll_runs,
        (SELECT COUNT(*) FROM production_source_meters WHERE meter_number LIKE 'DEV-%') AS production_meters
    `);
    console.log("Development scenarios are ready.");
    console.table(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
