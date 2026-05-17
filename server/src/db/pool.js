const { Pool, types } = require("pg");
const { databaseUrl } = require("../config/env");

types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: databaseUrl
});

module.exports = pool;
