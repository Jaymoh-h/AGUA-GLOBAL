const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { jwtSecret, jwtExpiresIn } = require("../config/env");

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  customer_id: user.customer_id,
  must_change_password: Boolean(user.must_change_password)
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 AND is_active = TRUE", [
    email.toLowerCase()
  ]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, "Invalid email or password.");
  }

  await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

  const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
    expiresIn: jwtExpiresIn
  });

  res.json({
    token,
    user: publicUser(user)
  });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    throw new ApiError(400, "Current password and new password are required.");
  }

  if (String(new_password).length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters.");
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 AND is_active = TRUE", [req.user.id]);
  const user = rows[0];

  if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
    throw new ApiError(401, "Current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(new_password, 10);
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = FALSE,
         password_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, customer_id, name, email, phone, role, is_active, must_change_password`,
    [passwordHash, req.user.id]
  );

  res.json({ user: publicUser(result.rows[0]) });
});

module.exports = {
  login,
  me,
  changePassword
};
