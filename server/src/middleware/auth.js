const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { jwtSecret } = require("../config/env");
const ApiError = require("../utils/apiError");

const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    const payload = jwt.verify(token, jwtSecret);
    const { rows } = await pool.query(
      "SELECT id, customer_id, name, email, phone, role, is_active, must_change_password FROM users WHERE id = $1",
      [payload.id]
    );

    if (!rows[0] || !rows[0].is_active) {
      throw new ApiError(401, "Invalid or inactive user.");
    }

    req.user = rows[0];
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Invalid token."));
  }
};

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, "You do not have permission to perform this action."));
  }
  return next();
};

module.exports = {
  authenticate,
  authorize
};
