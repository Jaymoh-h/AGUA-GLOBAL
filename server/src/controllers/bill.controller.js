const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { assertBillEditable, normalizeCorrectionReason } = require("../services/billingPeriodGuard.service");

const listBills = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const params = [];
  const clauses = [];

  if (status) {
    params.push(status);
    clauses.push(`b.status = $${params.length}`);
  }

  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    clauses.push(`b.customer_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone,
            bp.name AS billing_period_name,
            bp.status AS billing_period_status
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY b.billing_month DESC, b.created_at DESC`,
    params
  );
  res.json(rows);
});

const getBill = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS customer_name, c.acc_number, c.phone, c.location, z.name AS zone_name,
            bp.name AS billing_period_name,
            bp.status AS billing_period_status
     FROM bills b
     JOIN customers c ON c.id = b.customer_id
     LEFT JOIN zones z ON z.id = c.zone_id
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.id = $1
       AND ($2::text <> 'customer' OR b.customer_id = $3)`,
    [req.params.id, req.user.role, req.user.customer_id || 0]
  );

  if (!rows[0]) {
    throw new ApiError(404, "Bill not found.");
  }
  res.json(rows[0]);
});

const markBillStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const correctionReason = normalizeCorrectionReason(req.body);
  if (!["unpaid", "partial", "paid"].includes(status)) {
    throw new ApiError(400, "Status must be unpaid, partial, or paid.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM bills WHERE id = $1 FOR UPDATE", [req.params.id]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new ApiError(404, "Bill not found.");
    }
    await assertBillEditable(client, before.id, req, correctionReason, "manually update a bill status");
    const { rows } = await client.query(
      `UPDATE bills
       SET status = $1,
           paid_amount = CASE WHEN $1 = 'paid' THEN COALESCE(NULLIF(total_amount, 0), amount) ELSE paid_amount END,
           balance_amount = CASE WHEN $1 = 'paid' THEN 0 ELSE GREATEST(COALESCE(NULLIF(total_amount, 0), amount) - paid_amount, 0) END,
           paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "bill.status_updated",
      entityType: "bill",
      entityId: rows[0].id,
      beforeData: before,
      afterData: rows[0],
      reason: correctionReason || null
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listBills,
  getBill,
  markBillStatus
};
