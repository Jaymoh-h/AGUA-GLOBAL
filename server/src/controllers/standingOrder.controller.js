const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { accountPaymentJoin } = require("../services/paymentAccount.service");

const frequencies = ["weekly", "monthly"];
const statuses = ["active", "paused", "cancelled"];

const positiveAmount = (value, label) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, `${label} must be greater than zero.`);
  return Number(amount.toFixed(2));
};

const dateOnly = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new ApiError(400, `${label} must use YYYY-MM-DD.`);
  return String(value);
};

const mandateReference = (value) => {
  const reference = String(value || "").trim().replace(/\s+/g, " ");
  if (reference.length < 4 || reference.length > 80) {
    throw new ApiError(400, "Mandate reference must be between 4 and 80 characters.");
  }
  if (reference.replace(/[^a-z0-9]/gi, "").length < 3) {
    throw new ApiError(400, "Mandate reference must include at least three letters or digits.");
  }
  return reference;
};

const standingOrderSelect = `
  SELECT so.*, c.name AS customer_name, c.acc_number, c.status AS customer_status,
         creator.name AS created_by_name, updater.name AS updated_by_name,
         schedule.installments_due,
         so.expected_amount * schedule.installments_due AS expected_to_date,
         matched.matched_amount,
         GREATEST((so.expected_amount * schedule.installments_due) - matched.matched_amount, 0) AS shortfall_amount,
         CASE
           WHEN so.status <> 'active' THEN so.status
           WHEN schedule.installments_due = 0 THEN 'upcoming'
           WHEN matched.matched_amount >= so.expected_amount * schedule.installments_due THEN 'on_track'
           ELSE 'behind'
         END AS performance_status,
         CASE so.frequency
           WHEN 'weekly' THEN so.first_due_date + (schedule.installments_due * 7)
           ELSE (so.first_due_date + (schedule.installments_due * INTERVAL '1 month'))::date
         END AS next_due_date
  FROM standing_orders so
  JOIN customers c ON c.id = so.customer_id
  LEFT JOIN users creator ON creator.id = so.created_by
  LEFT JOIN users updater ON updater.id = so.updated_by
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN so.status <> 'active' OR CURRENT_DATE < so.first_due_date THEN 0
      WHEN so.frequency = 'weekly' THEN ((CURRENT_DATE - so.first_due_date) / 7) + 1
      ELSE (
        (EXTRACT(YEAR FROM age(CURRENT_DATE, so.first_due_date))::integer * 12) +
        EXTRACT(MONTH FROM age(CURRENT_DATE, so.first_due_date))::integer + 1
      )
    END::integer AS installments_due
  ) schedule ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(account_payment.amount), 0) AS matched_amount
    FROM payments p
    ${accountPaymentJoin("so.customer_id")}
    WHERE account_payment.amount > 0
      AND p.status = 'posted'
      AND p.payment_date >= so.first_due_date
      AND CONCAT_WS(' ', p.external_reference, p.receipt_number, p.received_from, p.notes)
        ILIKE '%' || so.mandate_reference || '%'
  ) matched ON TRUE`;

const listStandingOrders = asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  if (req.query.customer_id) filters.push(`so.customer_id = $${params.push(Number(req.query.customer_id))}`);
  if (req.query.status) {
    const status = String(req.query.status).trim();
    if (!statuses.includes(status)) throw new ApiError(400, "Standing-order status must be active, paused, or cancelled.");
    filters.push(`so.status = $${params.push(status)}`);
  }
  const { rows } = await pool.query(
    `${standingOrderSelect}
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY CASE so.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, so.first_due_date ASC, so.created_at DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

const createStandingOrder = asyncHandler(async (req, res) => {
  const customerId = Number(req.body.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) throw new ApiError(400, "Customer is required.");
  const reference = mandateReference(req.body.mandate_reference);
  const expectedAmount = positiveAmount(req.body.expected_amount, "Expected amount");
  const frequency = String(req.body.frequency || "").trim();
  if (!frequencies.includes(frequency)) throw new ApiError(400, "Frequency must be weekly or monthly.");
  const firstDueDate = dateOnly(req.body.first_due_date, "First due date");
  const notes = String(req.body.notes || "").trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT id FROM customers WHERE id = $1 AND status = 'active' FOR UPDATE", [customerId]);
    if (!customerResult.rows[0]) throw new ApiError(400, "An active customer account is required for a standing order.");
    const existing = await client.query("SELECT id FROM standing_orders WHERE customer_id = $1 AND status = 'active'", [customerId]);
    if (existing.rows[0]) throw new ApiError(409, "This customer already has an active standing order.");
    const { rows } = await client.query(
      `INSERT INTO standing_orders (customer_id, mandate_reference, expected_amount, frequency, first_due_date, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [customerId, reference, expectedAmount, frequency, firstDueDate, notes, req.user.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "standing_order.created",
      entityType: "standing_order",
      entityId: rows[0].id,
      afterData: rows[0],
      reason: notes
    });
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && /mandate_reference/i.test(error.constraint || "")) {
      throw new ApiError(409, "That mandate reference is already registered.");
    }
    throw error;
  } finally {
    client.release();
  }
});

const updateStandingOrderStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (!statuses.includes(status)) throw new ApiError(400, "Choose active, paused, or cancelled.");
  if (!reason) throw new ApiError(400, "A status-change note is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query("SELECT * FROM standing_orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!before.rows[0]) throw new ApiError(404, "Standing order not found.");
    if (before.rows[0].status === "cancelled") throw new ApiError(400, "Cancelled standing orders cannot be reactivated.");
    if (before.rows[0].status === status) throw new ApiError(400, "The standing order already has that status.");
    const { rows } = await client.query(
      `UPDATE standing_orders
       SET status = $1, notes = CONCAT_WS(E'\n', notes, $2::text), updated_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, `Status changed to ${status}: ${reason}`, req.user.id, req.params.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "standing_order.status_changed",
      entityType: "standing_order",
      entityId: rows[0].id,
      beforeData: before.rows[0],
      afterData: rows[0],
      reason
    });
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && /one_active_customer/i.test(error.constraint || "")) {
      throw new ApiError(409, "This customer already has an active standing order.");
    }
    throw error;
  } finally {
    client.release();
  }
});

module.exports = { createStandingOrder, listStandingOrders, updateStandingOrderStatus };
