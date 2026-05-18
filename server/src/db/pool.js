const { Pool, types } = require("pg");
const { databaseUrl, databaseSsl, databaseSslRejectUnauthorized } = require("../config/env");

types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: databaseSslRejectUnauthorized } : undefined
});

module.exports = pool;
