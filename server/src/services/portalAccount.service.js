const ApiError = require("../utils/apiError");

const listPortalAccounts = async (client, userId) => {
  const { rows } = await client.query(
    `SELECT c.id, c.acc_number, c.name, c.phone, c.status, z.name AS zone_name, puc.is_primary
     FROM portal_user_customers puc
     JOIN customers c ON c.id = puc.customer_id
     LEFT JOIN zones z ON z.id = c.zone_id
     WHERE puc.user_id = $1
     ORDER BY puc.is_primary DESC, c.acc_number ASC`,
    [userId]
  );
  return rows;
};

const ensurePrimaryPortalLink = async (client, userId, customerId, actorUserId = null) => {
  if (!userId || !customerId) return;
  await client.query("UPDATE portal_user_customers SET is_primary = FALSE WHERE user_id = $1", [userId]);
  await client.query(
    `INSERT INTO portal_user_customers (user_id, customer_id, is_primary, linked_by)
     VALUES ($1, $2, TRUE, $3)
     ON CONFLICT (user_id, customer_id) DO UPDATE
     SET is_primary = TRUE`,
    [userId, customerId, actorUserId]
  );
};

const replacePortalLinks = async (client, userId, customerIds, primaryCustomerId, actorUserId = null) => {
  const cleanIds = [...new Set((customerIds || []).map((id) => Number(id)).filter(Boolean))];
  const primaryId = Number(primaryCustomerId || cleanIds[0] || 0);
  if (primaryId && !cleanIds.includes(primaryId)) cleanIds.unshift(primaryId);

  if (!cleanIds.length) {
    throw new ApiError(400, "At least one linked customer account is required.");
  }

  const validResult = await client.query("SELECT id FROM customers WHERE id = ANY($1::int[])", [cleanIds]);
  if (validResult.rows.length !== cleanIds.length) {
    throw new ApiError(400, "One or more linked customer accounts could not be found.");
  }

  await client.query("DELETE FROM portal_user_customers WHERE user_id = $1 AND NOT (customer_id = ANY($2::int[]))", [
    userId,
    cleanIds
  ]);
  await client.query("UPDATE portal_user_customers SET is_primary = FALSE WHERE user_id = $1", [userId]);
  for (const customerId of cleanIds) {
    await client.query(
      `INSERT INTO portal_user_customers (user_id, customer_id, is_primary, linked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, customer_id) DO UPDATE
       SET is_primary = EXCLUDED.is_primary`,
      [userId, customerId, Number(customerId) === Number(primaryId), actorUserId]
    );
  }
};

const clearPortalLinks = async (client, userId) => {
  await client.query("DELETE FROM portal_user_customers WHERE user_id = $1", [userId]);
};

const getPortalCustomerIds = async (client, user) => {
  if (!user?.id) return [];
  const accounts = await listPortalAccounts(client, user.id);
  const ids = accounts.map((account) => Number(account.id));
  if (user.customer_id && !ids.includes(Number(user.customer_id))) ids.unshift(Number(user.customer_id));
  return ids;
};

const assertPortalCustomerAccess = async (client, user, customerId) => {
  if (user?.role !== "customer") return Number(customerId);
  const targetId = Number(customerId || 0);
  if (!targetId) throw new ApiError(400, "Customer account is required.");
  const allowedIds = await getPortalCustomerIds(client, user);
  if (!allowedIds.includes(targetId)) {
    throw new ApiError(403, "You do not have permission to access this customer account.");
  }
  return targetId;
};

const resolvePortalCustomer = async (client, req) => {
  const accounts = await listPortalAccounts(client, req.user.id);
  const fallbackId = accounts.find((account) => account.is_primary)?.id || req.user.customer_id || accounts[0]?.id || null;
  const requestedId = req.query.customer_id || req.body.customer_id || fallbackId;
  const customerId = await assertPortalCustomerAccess(client, req.user, requestedId);
  const activeAccount = accounts.find((account) => Number(account.id) === Number(customerId)) || null;
  return { customerId, accounts, activeAccount };
};

module.exports = {
  assertPortalCustomerAccess,
  clearPortalLinks,
  ensurePrimaryPortalLink,
  getPortalCustomerIds,
  listPortalAccounts,
  replacePortalLinks,
  resolvePortalCustomer
};
