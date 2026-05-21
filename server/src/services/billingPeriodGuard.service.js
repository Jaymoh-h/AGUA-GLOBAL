const ApiError = require("../utils/apiError");

const normalizeCorrectionReason = (payload = {}) =>
  String(payload.correction_reason || payload.reason || payload.notes || "").trim();

const assertBillingPeriodEditable = (period, req, reason, action = "modify this billing period") => {
  if (!period || !["closed", "locked"].includes(period.status)) return null;

  if (period.status === "locked" && req.user.role !== "admin") {
    throw new ApiError(403, "Locked billing periods can only be corrected by an admin.");
  }

  if (period.status === "closed" && !["admin", "accountant"].includes(req.user.role)) {
    throw new ApiError(403, "Closed billing periods can only be corrected by an admin or accountant.");
  }

  if (!reason) {
    throw new ApiError(400, `A correction reason is required to ${action} in a ${period.status} billing period.`);
  }

  return reason;
};

const assertBillingPeriodEditableById = async (client, billingPeriodId, req, reason, action) => {
  if (!billingPeriodId) return null;
  const { rows } = await client.query("SELECT * FROM billing_periods WHERE id = $1", [billingPeriodId]);
  return assertBillingPeriodEditable(rows[0], req, reason, action);
};

const assertDateBillingPeriodEditable = async (client, dateValue, req, reason, action) => {
  const { rows } = await client.query(
    `SELECT *
     FROM billing_periods
     WHERE period_start = date_trunc('month', $1::date)::date
     LIMIT 1`,
    [dateValue]
  );
  return assertBillingPeriodEditable(rows[0], req, reason, action);
};

const assertBillEditable = async (client, billId, req, reason, action) => {
  const { rows } = await client.query(
    `SELECT b.id, b.billing_period_id, bp.status, bp.name
     FROM bills b
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.id = $1`,
    [billId]
  );
  if (!rows[0]) return null;
  return assertBillingPeriodEditable(rows[0], req, reason, action);
};

module.exports = {
  assertBillEditable,
  assertBillingPeriodEditable,
  assertBillingPeriodEditableById,
  assertDateBillingPeriodEditable,
  normalizeCorrectionReason
};
