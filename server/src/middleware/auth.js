const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { jwtSecret } = require("../config/env");
const ApiError = require("../utils/apiError");
const { getAccessProfile } = require("../services/accessProfile.service");

const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    const payload = jwt.verify(token, jwtSecret);
    const { rows } = await pool.query(
      `SELECT id, customer_id, name, email, phone, role, is_active,
        must_change_password, password_changed_at, last_login_at
       FROM users
       WHERE id = $1`,
      [payload.id]
    );

    if (!rows[0] || !rows[0].is_active) {
      throw new ApiError(401, "Invalid or inactive user.");
    }

    req.user = rows[0];
    if (payload.access_profile_id) {
      const profile = await getAccessProfile(pool, req.user.id, payload.access_profile_id);
      if (!profile || !profile.is_active) {
        throw new ApiError(401, "Selected access context is invalid or inactive.");
      }
      req.user.role = profile.role;
      req.user.customer_id = profile.customer_id;
      req.user.access_profile_id = profile.id;
      req.user.access_profile_label = profile.label;
    }
    if (
      req.user.must_change_password &&
      !["/api/auth/me", "/api/auth/change-password"].includes(req.originalUrl)
    ) {
      throw new ApiError(403, "Password change required before continuing.");
    }
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
