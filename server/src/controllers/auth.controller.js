const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { clientOrigin, jwtSecret, jwtExpiresIn, passwordResetMinutes } = require("../config/env");
const { recordAuditEvent } = require("../services/audit.service");
const { sendPasswordResetEmail } = require("../services/email.service");
const {
  legacyProfileFromUser,
  listAccessProfiles,
  publicAccessProfile
} = require("../services/accessProfile.service");
const { validatePassword } = require("../utils/passwordPolicy");

const publicUser = (user, profile = null) => {
  const accessProfile = profile || legacyProfileFromUser(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: accessProfile.role,
    customer_id: accessProfile.customer_id,
    access_profile_id: accessProfile.id,
    access_profile_label: accessProfile.label,
    must_change_password: Boolean(user.must_change_password),
    password_changed_at: user.password_changed_at,
    last_login_at: user.last_login_at
  };
};

const signUserToken = (user, profile = null) => {
  const accessProfile = profile || legacyProfileFromUser(user);
  return jwt.sign(
    {
      id: user.id,
      role: accessProfile.role,
      access_profile_id: accessProfile.id,
      customer_id: accessProfile.customer_id
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn
    }
  );
};

const signContextSelectionToken = (user) =>
  jwt.sign({ id: user.id, purpose: "context_selection" }, jwtSecret, { expiresIn: "10m" });

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const buildResetUrl = (token) => {
  const baseUrl = clientOrigin.replace(/\/$/, "");
  return `${baseUrl}/?reset_token=${encodeURIComponent(token)}`;
};

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

  const profiles = await listAccessProfiles(pool, user.id, { activeOnly: true });
  const activeProfiles = profiles.length ? profiles : [legacyProfileFromUser(user)];

  if (activeProfiles.length > 1) {
    return res.json({
      requires_context_selection: true,
      context_selection_token: signContextSelectionToken(user),
      user: publicUser(user),
      contexts: activeProfiles.map(publicAccessProfile)
    });
  }

  const loginResult = await pool.query(
    "UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *",
    [user.id]
  );

  const token = signUserToken(loginResult.rows[0], activeProfiles[0]);

  return res.json({
    token,
    user: publicUser(loginResult.rows[0], activeProfiles[0])
  });
});

const selectContext = asyncHandler(async (req, res) => {
  const { context_selection_token, access_profile_id } = req.body;
  if (!context_selection_token || !access_profile_id) {
    throw new ApiError(400, "Context selection token and access context are required.");
  }

  let payload;
  try {
    payload = jwt.verify(context_selection_token, jwtSecret);
  } catch (_error) {
    throw new ApiError(401, "Context selection has expired. Please sign in again.");
  }
  if (payload.purpose !== "context_selection") {
    throw new ApiError(401, "Invalid context selection token.");
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 AND is_active = TRUE", [payload.id]);
  const user = rows[0];
  if (!user) throw new ApiError(401, "Invalid or inactive user.");

  const profiles = await listAccessProfiles(pool, user.id, { activeOnly: true });
  const profile = profiles.find((item) => Number(item.id) === Number(access_profile_id));
  if (!profile) throw new ApiError(403, "Selected access context is not available.");

  const loginResult = await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *", [user.id]);
  res.json({
    token: signUserToken(loginResult.rows[0], profile),
    user: publicUser(loginResult.rows[0], profile)
  });
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) throw new ApiError(400, "Email is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM users WHERE email = $1 AND is_active = TRUE", [email]);
    const user = rows[0];

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + passwordResetMinutes * 60 * 1000);
      await client.query(
        `INSERT INTO password_reset_tokens (
          user_id, token_hash, expires_at, requested_ip, user_agent
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [user.id, tokenHash, expiresAt, req.ip || null, req.headers["user-agent"] || null]
      );
      await recordAuditEvent(client, {
        req,
        actorUserId: user.id,
        action: "auth.password_reset_requested",
        entityType: "user",
        entityId: user.id,
        afterData: { email: user.email, expires_at: expiresAt },
        reason: "Password reset requested"
      });
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: buildResetUrl(rawToken),
        expiresInMinutes: passwordResetMinutes
      });
    }

    await client.query("COMMIT");
    res.json({ message: "If that email exists, a password reset link has been sent." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) throw new ApiError(400, "Reset token and new password are required.");

  const passwordError = validatePassword(new_password, "New password");
  if (passwordError) {
    throw new ApiError(400, passwordError);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenHash = hashResetToken(token);
    const tokenResult = await client.query(
      `SELECT prt.*, u.name, u.email, u.phone, u.role, u.customer_id, u.must_change_password,
              u.password_changed_at, u.last_login_at
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
         AND u.is_active = TRUE
       ORDER BY prt.created_at DESC
       LIMIT 1
       FOR UPDATE OF prt`,
      [tokenHash]
    );
    const resetToken = tokenResult.rows[0];
    if (!resetToken) throw new ApiError(400, "Reset link is invalid or has expired.");

    const passwordHash = await bcrypt.hash(new_password, 10);
    const userResult = await client.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = FALSE,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, customer_id, name, email, phone, role, is_active, must_change_password, password_changed_at, last_login_at`,
      [passwordHash, resetToken.user_id]
    );
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [resetToken.user_id]
    );
    await recordAuditEvent(client, {
      req,
      actorUserId: resetToken.user_id,
      action: "auth.password_reset_completed",
      entityType: "user",
      entityId: resetToken.user_id,
      afterData: { email: resetToken.email },
      reason: "Password reset completed"
    });

    await client.query("COMMIT");
    const user = userResult.rows[0];
    res.json({
      token: signUserToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    throw new ApiError(400, "Current password and new password are required.");
  }

  const passwordError = validatePassword(new_password, "New password");
  if (passwordError) {
    throw new ApiError(400, passwordError);
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
     RETURNING id, customer_id, name, email, phone, role, is_active, must_change_password, password_changed_at, last_login_at`,
    [passwordHash, req.user.id]
  );

  const currentProfile = req.user.access_profile_id
    ? {
        id: req.user.access_profile_id,
        role: req.user.role,
        customer_id: req.user.customer_id,
        label: req.user.access_profile_label,
        is_active: true,
        is_default: false
      }
    : null;

  res.json({ user: publicUser(result.rows[0], currentProfile) });
});

module.exports = {
  login,
  selectContext,
  me,
  requestPasswordReset,
  resetPassword,
  changePassword
};
