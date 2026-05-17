const recordAuditEvent = async (
  client,
  {
    req,
    actorUserId,
    action,
    entityType,
    entityId = null,
    beforeData = null,
    afterData = null,
    reason = null
  }
) => {
  if (!action || !entityType) return null;

  const resolvedActorUserId = actorUserId ?? req?.user?.id ?? null;
  const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"] || null;
  const userAgent = req?.headers?.["user-agent"] || null;

  const { rows } = await client.query(
    `INSERT INTO audit_events (
      actor_user_id, action, entity_type, entity_id, before_data, after_data,
      reason, ip_address, user_agent
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
    RETURNING *`,
    [
      resolvedActorUserId,
      action,
      entityType,
      entityId,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      reason || null,
      ipAddress,
      userAgent
    ]
  );

  return rows[0];
};

module.exports = {
  recordAuditEvent
};
