const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { jwtSecret, sessionCookieName } = require("../config/env");
const ApiError = require("../utils/apiError");
const { getAccessProfile } = require("../services/accessProfile.service");
const { parseCookies } = require("../utils/cookies");

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const assertCsrfToken = (req, payload) => {
  if (!unsafeMethods.has(req.method)) return;
  const supplied = req.get("x-csrf-token") || "";
  const expected = payload.csrf_token || "";
  if (!supplied || !expected || supplied !== expected) {
    throw new ApiError(403, "Session verification failed. Refresh the page and try again.");
  }
};

const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    const cookies = parseCookies(req.headers.cookie || "");
    const cookieToken = cookies[sessionCookieName];
    const token = bearerToken || cookieToken;
    const tokenSource = bearerToken ? "bearer" : cookieToken ? "cookie" : "";

    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    const payload = jwt.verify(token, jwtSecret);
    if (tokenSource === "cookie") {
      assertCsrfToken(req, payload);
    }
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
    req.auth = {
      tokenSource,
      csrfToken: payload.csrf_token || null
    };
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
