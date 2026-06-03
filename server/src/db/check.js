require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const expectedUsers = [
  ["admin@agua.local", "Admin@123"],
  ["reader@agua.local", "Reader@123"],
  ["jane@agua.local", "Customer@123"]
];

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from server/.env");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const databaseResult = await client.query("SELECT current_database() AS database, current_user AS user");
    console.log(`Connected to database "${databaseResult.rows[0].database}" as "${databaseResult.rows[0].user}".`);

    const tableResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`Tables found: ${tableResult.rows.map((row) => row.table_name).join(", ") || "none"}`);

    const userResult = await client.query(
      "SELECT email, role, is_active, password_hash FROM users ORDER BY email"
    );
    console.log(`Users found: ${userResult.rowCount}`);

    const rateResult = await client.query("SELECT COUNT(*) AS count FROM rates");
    const zoneResult = await client.query("SELECT COUNT(*) AS count FROM zones");
    const customerLinkResult = await client.query(
      "SELECT COUNT(*) AS count FROM customers WHERE rate_id IS NULL OR zone_id IS NULL"
    );
    console.log(`Rates found: ${rateResult.rows[0].count}`);
    console.log(`Zones/locations found: ${zoneResult.rows[0].count}`);
    console.log(`Customers missing rate/zone links: ${customerLinkResult.rows[0].count}`);

    for (const [email, password] of expectedUsers) {
      const user = userResult.rows.find((row) => row.email === email);
      if (!user) {
        console.log(`Missing seeded user: ${email}`);
        continue;
      }

      const matches = await bcrypt.compare(password, user.password_hash);
      console.log(`${email}: role=${user.role}, active=${user.is_active}, password_ok=${matches}`);
    }

    const activeAccountants = userResult.rows.filter((row) => row.role === "accountant" && row.is_active);
    console.log(`Active accountant users found: ${activeAccountants.length}`);
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  if (error.code === "28P01") {
    console.error("Database login failed. Check the username/password in server/.env DATABASE_URL.");
  } else if (error.code === "3D000") {
    console.error("Database does not exist. Create the database named in server/.env DATABASE_URL.");
  } else if (error.code === "ECONNREFUSED") {
    console.error("Could not reach PostgreSQL. Confirm the PostgreSQL service is running and the port is correct.");
  } else {
    console.error(error.message);
  }
  process.exit(1);
});
