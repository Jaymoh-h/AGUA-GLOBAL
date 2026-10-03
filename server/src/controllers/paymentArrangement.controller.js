const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");

const frequencies = ["weekly", "monthly"];
const terminalStatuses = ["completed", "defaulted", "cancelled"];

const positiveAmount = (value, label) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, `${label} must be greater than zero.`);
  return Number(amount.toFixed(2));
};

const dateOnly = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new ApiError(400, `${label} must use YYYY-MM-DD.`);
  return String(value);
};

const arrangementSelect = `
  SELECT pa.*, c.name AS customer_name, c.acc_number,
         mr.request_number, mr.category AS request_category,
         creator.name AS created_by_name, approver.name AS approved_by_name, closer.name AS closed_by_name,
         schedule.installments_due,
         LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) AS expected_amount,
         collected.received_amount,
         GREATEST(LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) - collected.received_amount, 0) AS shortfall_amount,
         CASE
           WHEN pa.status <> 'active' THEN pa.status
           WHEN schedule.installments_due = 0 THEN 'upcoming'
           WHEN collected.received_amount >= LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) THEN 'on_track'
           ELSE 'behind'
         END AS performance_status,
         CASE pa.frequency
           WHEN 'weekly' THEN pa.first_due_date + (schedule.installments_due * 7)
           ELSE (pa.first_due_date + (schedule.installments_due * INTERVAL '1 month'))::date
         END AS next_due_date,
         reminder.channel AS last_reminder_channel,
         reminder.status AS last_reminder_status,
         reminder.sent_at AS last_reminder_at
  FROM payment_arrangements pa
  JOIN customers c ON c.id = pa.customer_id
  LEFT JOIN maintenance_requests mr ON mr.id = pa.maintenance_request_id
  LEFT JOIN users creator ON creator.id = pa.created_by
  LEFT JOIN users approver ON approver.id = pa.approved_by
  LEFT JOIN users closer ON closer.id = pa.closed_by
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN pa.status <> 'active' OR CURRENT_DATE < pa.first_due_date THEN 0
      WHEN pa.frequency = 'weekly' THEN ((CURRENT_DATE - pa.first_due_date) / 7) + 1
      ELSE (
        (EXTRACT(YEAR FROM age(CURRENT_DATE, pa.first_due_date))::integer * 12) +
        EXTRACT(MONTH FROM age(CURRENT_DATE, pa.first_due_date))::integer + 1
      )
    END::integer AS installments_due
  ) schedule ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS received_amount
    FROM payments p
    WHERE p.customer_id = pa.customer_id
      AND p.status = 'posted'
      AND p.payment_date >= COALESCE(pa.approved_at::date, pa.created_at::date)
  ) collected ON TRUE
  LEFT JOIN LATERAL (
    SELECT ddl.channel, ddl.status, COALESCE(ddl.sent_at, ddl.created_at) AS sent_at
    FROM document_delivery_logs ddl
    WHERE ddl.document_type = 'payment_arrangement'
      AND ddl.document_id = pa.id
    ORDER BY ddl.created_at DESC, ddl.id DESC
    LIMIT 1
  ) reminder ON TRUE`;

const listPaymentArrangements = asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  if (req.query.customer_id) filters.push(`pa.customer_id = $${params.push(Number(req.query.customer_id))}`);
  if (req.query.status) filters.push(`pa.status = $${params.push(String(req.query.status))}`);
  const { rows } = await pool.query(
    `${arrangementSelect}
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY CASE pa.status WHEN 'active' THEN 0 WHEN 'defaulted' THEN 1 ELSE 2 END, pa.first_due_date ASC, pa.created_at DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

const createPaymentArrangement = asyncHandler(async (req, res) => {
  const customerId = Number(req.body.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) throw new ApiError(400, "Customer is required.");
  const agreedAmount = positiveAmount(req.body.agreed_amount, "Agreed amount");
  const installmentAmount = positiveAmount(req.body.installment_amount, "Installment amount");
  const frequency = String(req.body.frequency || "").trim();
  if (!frequencies.includes(frequency)) throw new ApiError(400, "Frequency must be weekly or monthly.");
  const firstDueDate = dateOnly(req.body.first_due_date, "First due date");
  const notes = String(req.body.notes || "").trim() || null;
  const suppliedRequestId = req.body.maintenance_request_id;
  const requestId = suppliedRequestId === undefined || suppliedRequestId === null || suppliedRequestId === "" ? null : Number(suppliedRequestId);
  if (requestId !== null && (!Number.isInteger(requestId) || requestId <= 0)) {
    throw new ApiError(400, "The linked payment-plan request is invalid.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT id FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    if (!customerResult.rows[0]) throw new ApiError(404, "Customer not found.");
    const balanceResult = await client.query(
      `SELECT COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)), 0) AS balance
       FROM bills
       WHERE customer_id = $1 AND status <> 'paid' AND bill_pay_status = 'payable'`,
      [customerId]
    );
    const openBalance = Number(balanceResult.rows[0]?.balance || 0);
    if (openBalance <= 0) throw new ApiError(400, "A payment arrangement requires an outstanding payable balance.");
    if (agreedAmount > openBalance + 0.01) throw new ApiError(400, "Agreed amount cannot exceed the current payable balance.");
    const existing = await client.query("SELECT id FROM payment_arrangements WHERE customer_id = $1 AND status = 'active'", [customerId]);
    if (existing.rows[0]) throw new ApiError(409, "This customer already has an active payment arrangement.");
    let linkedRequest = null;
    if (requestId) {
      const request = await client.query(
        `SELECT *
         FROM maintenance_requests
         WHERE id = $1 AND customer_id = $2 AND category = 'payment_plan'
         FOR UPDATE`,
        [requestId, customerId]
      );
      linkedRequest = request.rows[0] || null;
      if (!linkedRequest) throw new ApiError(400, "The linked payment-plan request does not belong to this customer.");
      if (!["open", "in_progress"].includes(linkedRequest.status)) {
        throw new ApiError(400, "Only an open payment-plan request can be approved.");
      }
    }
    const { rows } = await client.query(
      `INSERT INTO payment_arrangements (
         customer_id, maintenance_request_id, agreed_amount, installment_amount, frequency, first_due_date,
         notes, created_by, approved_by, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
       RETURNING *`,
      [customerId, requestId, agreedAmount, installmentAmount, frequency, firstDueDate, notes, req.user.id]
    );
    const arrangementNumber = `PPA-${String(rows[0].id).padStart(5, "0")}`;
    const updated = await client.query(
      "UPDATE payment_arrangements SET arrangement_number = $1 WHERE id = $2 RETURNING *",
      [arrangementNumber, rows[0].id]
    );
    if (linkedRequest) {
      const resolutionNotes = `Approved as payment plan ${arrangementNumber}${notes ? `: ${notes}` : "."}`;
      const resolvedRequest = await client.query(
        `UPDATE maintenance_requests
         SET status = 'resolved',
             resolution_notes = $1,
             resolved_at = NOW(),
             resolved_by = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [resolutionNotes, req.user.id, linkedRequest.id]
      );
      await recordAuditEvent(client, {
        req,
        action: "maintenance_request.resolved",
        entityType: "maintenance_request",
        entityId: linkedRequest.id,
        beforeData: linkedRequest,
        afterData: resolvedRequest.rows[0],
        reason: resolutionNotes
      });
    }
    await recordAuditEvent(client, {
      req,
      action: "payment_arrangement.created",
      entityType: "payment_arrangement",
      entityId: updated.rows[0].id,
      afterData: updated.rows[0],
      reason: notes
    });
    await client.query("COMMIT");
    res.status(201).json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const closePaymentArrangement = asyncHandler(async (req, res) => {
  const status = String(req.body.status || "").trim();
  const closureNotes = String(req.body.closure_notes || "").trim();
  if (!terminalStatuses.includes(status)) throw new ApiError(400, "Choose a completed, defaulted, or cancelled outcome.");
  if (!closureNotes) throw new ApiError(400, "Closure notes are required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query("SELECT * FROM payment_arrangements WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!before.rows[0]) throw new ApiError(404, "Payment arrangement not found.");
    if (before.rows[0].status !== "active") throw new ApiError(400, "Only active payment arrangements can be closed.");
    const updated = await client.query(
      `UPDATE payment_arrangements
       SET status = $1, closure_notes = $2, closed_by = $3, closed_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, closureNotes, req.user.id, req.params.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "payment_arrangement.closed",
      entityType: "payment_arrangement",
      entityId: updated.rows[0].id,
      beforeData: before.rows[0],
      afterData: updated.rows[0],
      reason: closureNotes
    });
    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const declinePaymentPlanRequest = asyncHandler(async (req, res) => {
  const requestId = Number(req.params.id);
  const reason = String(req.body.reason || "").trim();
  if (!Number.isInteger(requestId) || requestId <= 0) throw new ApiError(400, "Payment-plan request is invalid.");
  if (!reason) throw new ApiError(400, "A decline reason is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      `SELECT *
       FROM maintenance_requests
       WHERE id = $1 AND category = 'payment_plan'
       FOR UPDATE`,
      [requestId]
    );
    const request = before.rows[0];
    if (!request) throw new ApiError(404, "Payment-plan request not found.");
    if (!["open", "in_progress"].includes(request.status)) {
      throw new ApiError(400, "Only an open payment-plan request can be declined.");
    }

    const { rows } = await client.query(
      `UPDATE maintenance_requests
       SET status = 'cancelled',
           resolution_notes = $1,
           resolved_at = NOW(),
           resolved_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [`Payment-plan proposal declined: ${reason}`, req.user.id, requestId]
    );
    await recordAuditEvent(client, {
      req,
      action: "maintenance_request.payment_plan_declined",
      entityType: "maintenance_request",
      entityId: requestId,
      beforeData: request,
      afterData: rows[0],
      reason
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

module.exports = { closePaymentArrangement, createPaymentArrangement, declinePaymentPlanRequest, listPaymentArrangements };
