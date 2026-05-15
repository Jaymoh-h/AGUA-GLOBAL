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
  customer_id: user.customer_id
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

module.exports = {
  login,
  me
};
