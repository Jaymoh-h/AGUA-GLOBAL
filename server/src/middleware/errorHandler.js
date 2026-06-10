const { recordSystemEvent } = require("../services/systemEvent.service");

const logError = (err, req, statusCode, message) => {
  const databaseCodes = new Set(["28P01", "3D000", "ECONNREFUSED", "57P01", "08006", "53300"]);
  recordSystemEvent({
    eventType: statusCode >= 500 ? "server.error" : "server.request_error",
    severity: statusCode >= 500 ? "error" : "warning",
    source: databaseCodes.has(err.code) ? "database" : "server",
    message,
    statusCode,
    details: {
      name: err.name,
      code: err.code,
      constraint: err.constraint,
      stack: statusCode >= 500 ? err.stack : undefined
    },
    req
  });
};

const errorHandler = (err, req, res, _next) => {
  if (err.code === "28P01") {
    logError(err, req, 500, "Database login failed.");
    return res.status(500).json({ message: "Database login failed. Check server/.env DATABASE_URL." });
  }

  if (err.code === "3D000") {
    logError(err, req, 500, "Database not found.");
    return res.status(500).json({ message: "Database not found. Create or correct the database in server/.env." });
  }

  if (err.code === "ECONNREFUSED") {
    logError(err, req, 500, "Cannot reach PostgreSQL.");
    return res.status(500).json({ message: "Cannot reach PostgreSQL. Confirm the database service is running." });
  }

  if (err.code === "23505") {
    if (err.constraint === "customers_acc_number_key") {
      return res.status(409).json({ message: "That account number is already in use." });
    }
    if (err.constraint === "meter_readings_customer_id_reading_date_key") {
      return res.status(409).json({ message: "That customer already has a reading for this date." });
    }
    return res.status(409).json({ message: "A record with those unique details already exists." });
  }

  if (err.code === "23503") {
    return res.status(400).json({ message: "Referenced record does not exist." });
  }

  if (err.code === "22P02") {
    return res.status(400).json({ message: "One of the submitted values has the wrong format." });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Something went wrong." : err.message;

  if (statusCode === 500) {
    console.error(err);
    logError(err, req, statusCode, err.message || "Unhandled server error.");
  }

  res.status(statusCode).json({
    message
  });
};

module.exports = errorHandler;
