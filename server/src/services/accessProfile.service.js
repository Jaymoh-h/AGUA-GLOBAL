const ApiError = require("../utils/apiError");

const roles = ["admin", "meter_reader", "accountant", "customer", "business_viewer"];

const defaultRoleLabels = {
  admin: "Admin Console",
  meter_reader: "Meter Reader",
  accountant: "Accounting Console",
  customer: "Customer Portal",
  business_viewer: "Business Viewer"
};

const roleLabel = (role) => defaultRoleLabels[role] || String(role || "").replace(/_/g, " ");

const normalizeProfile = (profile) => ({
  ...profile,
  label: profile.label || roleLabel(profile.role),
  is_active: Boolean(profile.is_active),
  is_default: Boolean(profile.is_default)
});

const publicAccessProfile = (profile) => {
  const normalized = normalizeProfile(profile);
  return {
    id: normalized.id,
    role: normalized.role,
    label: normalized.label,
    customer_id: normalized.customer_id,
    customer_acc_number: normalized.customer_acc_number,
    customer_name: normalized.customer_name,
    is_active: normalized.is_active,
    is_default: normalized.is_default
  };
};

const legacyProfileFromUser = (user) =>
  normalizeProfile({
    id: null,
    user_id: user.id,
    role: user.role,
    label: roleLabel(user.role),
    customer_id: user.customer_id,
    customer_acc_number: user.customer_acc_number,
    customer_name: user.customer_name,
    is_active: Boolean(user.is_active),
    is_default: true
  });

const validateProfileInput = ({ role, customer_id }) => {
  if (!roles.includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }
  if (role === "customer" && !customer_id) {
    throw new ApiError(400, "Customer portal contexts must be linked to a customer account.");
  }
};

const listAccessProfiles = async (client, userId, { activeOnly = false } = {}) => {
  const params = [userId];
  const where = ["uap.user_id = $1"];
  if (activeOnly) where.push("uap.is_active = TRUE");
  const { rows } = await client.query(
    `SELECT uap.*,
            c.acc_number AS customer_acc_number,
            c.name AS customer_name
     FROM user_access_profiles uap
     LEFT JOIN customers c ON c.id = uap.customer_id
     WHERE ${where.join(" AND ")}
     ORDER BY uap.is_default DESC, uap.created_at ASC, uap.id ASC`,
    params
  );
  return rows.map(normalizeProfile);
};

const getAccessProfile = async (client, userId, profileId) => {
  const { rows } = await client.query(
    `SELECT uap.*,
            c.acc_number AS customer_acc_number,
            c.name AS customer_name
     FROM user_access_profiles uap
     LEFT JOIN customers c ON c.id = uap.customer_id
     WHERE uap.id = $1
       AND uap.user_id = $2`,
    [profileId, userId]
  );
  return rows[0] ? normalizeProfile(rows[0]) : null;
};

const syncDefaultAccessProfile = async (client, user, actorUserId = null) => {
  validateProfileInput({ role: user.role, customer_id: user.customer_id });
  const label = roleLabel(user.role);
  const { rows } = await client.query(
    `INSERT INTO user_access_profiles (
       user_id, role, label, customer_id, is_active, is_default, created_by
     )
     VALUES ($1, $2, $3, $4, $5, TRUE, $6)
     ON CONFLICT (user_id) WHERE is_default = TRUE
     DO UPDATE SET
       role = EXCLUDED.role,
       label = EXCLUDED.label,
       customer_id = EXCLUDED.customer_id,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [user.id, user.role, label, user.customer_id, Boolean(user.is_active), actorUserId]
  );
  return normalizeProfile(rows[0]);
};

const createAccessProfile = async (client, userId, payload, actorUserId = null) => {
  const role = payload.role;
  const customerId = role === "customer" ? Number(payload.customer_id) : null;
  validateProfileInput({ role, customer_id: customerId });
  const label = String(payload.label || roleLabel(role)).trim();
  const { rows } = await client.query(
    `INSERT INTO user_access_profiles (
       user_id, role, label, customer_id, is_active, is_default, created_by
     )
     VALUES ($1, $2, $3, $4, $5, FALSE, $6)
     RETURNING *`,
    [userId, role, label, customerId, payload.is_active === undefined ? true : Boolean(payload.is_active), actorUserId]
  );
  return normalizeProfile(rows[0]);
};

const updateAccessProfile = async (client, userId, profileId, payload) => {
  const before = await getAccessProfile(client, userId, profileId);
  if (!before) throw new ApiError(404, "Access context not found.");
  if (before.is_default && payload.is_active === false) {
    throw new ApiError(400, "Default access context follows the user account status.");
  }
  const nextRole = payload.role || before.role;
  const nextCustomerId =
    nextRole === "customer"
      ? Number(payload.customer_id === undefined ? before.customer_id : payload.customer_id)
      : null;
  validateProfileInput({ role: nextRole, customer_id: nextCustomerId });
  const nextLabel = payload.label === undefined ? before.label : String(payload.label || roleLabel(nextRole)).trim();
  const nextIsActive = payload.is_active === undefined ? before.is_active : Boolean(payload.is_active);

  const { rows } = await client.query(
    `UPDATE user_access_profiles
     SET role = $1,
         label = $2,
         customer_id = $3,
         is_active = $4,
         updated_at = NOW()
     WHERE id = $5
       AND user_id = $6
     RETURNING *`,
    [nextRole, nextLabel, nextCustomerId, nextIsActive, profileId, userId]
  );
  return normalizeProfile(rows[0]);
};

const detachAccessProfile = async (client, userId, profileId) => {
  const before = await getAccessProfile(client, userId, profileId);
  if (!before) throw new ApiError(404, "Access context not found.");
  if (before.is_default) {
    throw new ApiError(400, "Default access context cannot be detached.");
  }
  if (before.is_active) {
    throw new ApiError(400, "Disable the access context before detaching it.");
  }

  await client.query(
    `DELETE FROM user_access_profiles
     WHERE id = $1
       AND user_id = $2`,
    [profileId, userId]
  );
  return before;
};

module.exports = {
  roles,
  roleLabel,
  legacyProfileFromUser,
  publicAccessProfile,
  listAccessProfiles,
  getAccessProfile,
  syncDefaultAccessProfile,
  createAccessProfile,
  updateAccessProfile,
  detachAccessProfile
};
