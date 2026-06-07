const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { clearPortalLinks, ensurePrimaryPortalLink, replacePortalLinks } = require("../services/portalAccount.service");
const {
  createAccessProfile,
  roles,
  syncDefaultAccessProfile,
  updateAccessProfile
} = require("../services/accessProfile.service");
const { validatePassword } = require("../utils/passwordPolicy");

const publicColumns = (alias = "u") => `
  ${alias}.id, ${alias}.customer_id, ${alias}.name, ${alias}.email, ${alias}.phone, ${alias}.role, ${alias}.is_active,
  ${alias}.must_change_password, ${alias}.password_changed_at, ${alias}.last_login_at, ${alias}.created_at,
  c.acc_number AS customer_acc_number,
  c.name AS customer_name,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', pc.id,
        'acc_number', pc.acc_number,
        'name', pc.name,
        'status', pc.status,
        'is_primary', puc.is_primary
      )
      ORDER BY puc.is_primary DESC, pc.acc_number ASC
    )
    FROM portal_user_customers puc
    JOIN customers pc ON pc.id = puc.customer_id
    WHERE puc.user_id = ${alias}.id
  ), '[]'::json) AS linked_customers,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', uap.id,
        'role', uap.role,
        'label', COALESCE(uap.label, initcap(replace(uap.role, '_', ' '))),
        'customer_id', uap.customer_id,
        'customer_acc_number', ac.acc_number,
        'customer_name', ac.name,
        'is_active', uap.is_active,
        'is_default', uap.is_default
      )
      ORDER BY uap.is_default DESC, uap.created_at ASC, uap.id ASC
    )
    FROM user_access_profiles uap
    LEFT JOIN customers ac ON ac.id = uap.customer_id
    WHERE uap.user_id = ${alias}.id
  ), '[]'::json) AS access_profiles
`;

const normalizeCustomerId = (role, customerId) => {
  if (role !== "customer") return null;
  return customerId ? Number(customerId) : null;
};

const normalizeLinkedCustomerIds = (role, customerId, linkedCustomerIds) => {
  if (role !== "customer") return [];
  const ids = Array.isArray(linkedCustomerIds)
    ? linkedCustomerIds.map((id) => Number(id)).filter(Boolean)
    : [];
  const primaryId = normalizeCustomerId(role, customerId);
  if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  return ids;
};

const countActiveAdminsExcluding = async (client, userId) => {
  const { rows } = await client.query(
    "SELECT COUNT(*)::integer AS count FROM users WHERE role = 'admin' AND is_active = TRUE AND id <> $1",
    [userId]
  );
  return rows[0]?.count || 0;
};

const listUsers = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${publicColumns("u")}
     FROM users u
     LEFT JOIN customers c ON c.id = u.customer_id
     ORDER BY u.created_at DESC`
  );
  res.json(rows);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, password, customer_id, linked_customer_ids, is_active = true } = req.body;

  if (!name || !email || !role || !password) {
    throw new ApiError(400, "Name, email, role, and password are required.");
  }

  if (!roles.includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }
  const passwordError = validatePassword(password, "Temporary password");
  if (passwordError) {
    throw new ApiError(400, passwordError);
  }

  const linkedCustomerIds = normalizeLinkedCustomerIds(role, customer_id, linked_customer_ids);
  const nextCustomerId = normalizeCustomerId(role, customer_id || linkedCustomerIds[0]);
  if (role === "customer" && !nextCustomerId) {
    throw new ApiError(400, "Customer portal users must be linked to a customer account.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `WITH inserted AS (
         INSERT INTO users (
           name, email, phone, role, customer_id, password_hash,
           is_active, must_change_password
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING *
       )
       SELECT ${publicColumns("inserted")}
       FROM inserted
       LEFT JOIN customers c ON c.id = inserted.customer_id`,
      [name, email.toLowerCase(), phone || null, role, nextCustomerId, passwordHash, Boolean(is_active)]
    );
    if (role === "customer") {
      await replacePortalLinks(client, rows[0].id, linkedCustomerIds, nextCustomerId, req.user.id);
    }
    await syncDefaultAccessProfile(client, rows[0], req.user.id);
    const userResult = await client.query(
      `SELECT ${publicColumns("u")}
       FROM users u
       LEFT JOIN customers c ON c.id = u.customer_id
       WHERE u.id = $1`,
      [rows[0].id]
    );

    await recordAuditEvent(client, {
      req,
      action: "user.created",
      entityType: "user",
      entityId: userResult.rows[0].id,
      afterData: userResult.rows[0]
    });
    await client.query("COMMIT");
    res.status(201).json(userResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, is_active, customer_id, linked_customer_ids, password } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "User not found.");
    }

    const nextRole = role || before.role;
    if (!roles.includes(nextRole)) {
      throw new ApiError(400, "Invalid role.");
    }

    const nextIsActive = is_active === undefined ? before.is_active : Boolean(is_active);
    if (Number(req.params.id) === Number(req.user.id) && !nextIsActive) {
      throw new ApiError(400, "You cannot deactivate your own account.");
    }
    if (Number(req.params.id) === Number(req.user.id) && nextRole !== "admin") {
      throw new ApiError(400, "You cannot remove your own admin role.");
    }
    if (before.role === "admin" && (!nextIsActive || nextRole !== "admin")) {
      const otherActiveAdmins = await countActiveAdminsExcluding(client, req.params.id);
      if (otherActiveAdmins === 0) {
        throw new ApiError(400, "At least one active admin account is required.");
      }
    }

    const shouldReplaceLinks = Array.isArray(linked_customer_ids) || customer_id !== undefined || role !== undefined;
    const linkedCustomerIds = normalizeLinkedCustomerIds(
      nextRole,
      customer_id === undefined ? before.customer_id : customer_id,
      linked_customer_ids
    );
    const nextCustomerId =
      customer_id === undefined && !Array.isArray(linked_customer_ids)
        ? normalizeCustomerId(nextRole, before.customer_id)
        : normalizeCustomerId(nextRole, customer_id || linkedCustomerIds[0]);
    if (nextRole === "customer" && !nextCustomerId) {
      throw new ApiError(400, "Customer portal users must be linked to a customer account.");
    }

    const nextPhone = phone === undefined ? before.phone : phone || null;
    if (password) {
      const passwordError = validatePassword(password, "Temporary password");
      if (passwordError) {
        throw new ApiError(400, passwordError);
      }
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await client.query(
      `WITH updated AS (
         UPDATE users
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = $3,
             role = $4,
             is_active = $5,
             customer_id = $6,
             password_hash = COALESCE($7, password_hash),
             must_change_password = CASE WHEN $7::text IS NULL THEN must_change_password ELSE TRUE END,
             password_changed_at = CASE WHEN $7::text IS NULL THEN password_changed_at ELSE NULL END,
             updated_at = NOW()
         WHERE id = $8
         RETURNING *
       )
       SELECT ${publicColumns("updated")}
       FROM updated
       LEFT JOIN customers c ON c.id = updated.customer_id`,
      [
        name || null,
        email ? email.toLowerCase() : null,
        nextPhone,
        nextRole,
        nextIsActive,
        nextCustomerId,
        passwordHash,
        req.params.id
      ]
    );
    if (nextRole === "customer") {
      if (shouldReplaceLinks) {
        await replacePortalLinks(client, rows[0].id, linkedCustomerIds, nextCustomerId, req.user.id);
        await ensurePrimaryPortalLink(client, rows[0].id, nextCustomerId, req.user.id);
      }
    } else {
      await clearPortalLinks(client, rows[0].id);
    }
    await syncDefaultAccessProfile(client, rows[0], req.user.id);
    const afterResult = await client.query(
      `SELECT ${publicColumns("u")}
       FROM users u
       LEFT JOIN customers c ON c.id = u.customer_id
       WHERE u.id = $1`,
      [rows[0].id]
    );

    await recordAuditEvent(client, {
      req,
      action: "user.updated",
      entityType: "user",
      entityId: afterResult.rows[0].id,
      beforeData: before,
      afterData: afterResult.rows[0]
    });
    await client.query("COMMIT");
    res.json(afterResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const createUserAccessProfile = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.params.id]);
    const account = userResult.rows[0];
    if (!account) throw new ApiError(404, "User not found.");

    const profile = await createAccessProfile(client, account.id, req.body, req.user.id);
    if (profile.role === "customer" && profile.customer_id) {
      await ensurePrimaryPortalLink(client, account.id, profile.customer_id, req.user.id);
    }
    const afterResult = await client.query(
      `SELECT ${publicColumns("u")}
       FROM users u
       LEFT JOIN customers c ON c.id = u.customer_id
       WHERE u.id = $1`,
      [account.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "user.access_profile.created",
      entityType: "user",
      entityId: account.id,
      afterData: { profile }
    });
    await client.query("COMMIT");
    res.status(201).json(afterResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const updateUserAccessProfile = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [req.params.id]);
    const account = userResult.rows[0];
    if (!account) throw new ApiError(404, "User not found.");

    const profile = await updateAccessProfile(client, account.id, req.params.profileId, req.body);
    if (profile.role === "customer" && profile.customer_id && profile.is_active) {
      await ensurePrimaryPortalLink(client, account.id, profile.customer_id, req.user.id);
    }
    const afterResult = await client.query(
      `SELECT ${publicColumns("u")}
       FROM users u
       LEFT JOIN customers c ON c.id = u.customer_id
       WHERE u.id = $1`,
      [account.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "user.access_profile.updated",
      entityType: "user",
      entityId: account.id,
      afterData: { profile }
    });
    await client.query("COMMIT");
    res.json(afterResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listUsers,
  createUser,
  updateUser,
  createUserAccessProfile,
  updateUserAccessProfile
};
