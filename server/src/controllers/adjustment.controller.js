const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { createBillNumber } = require("../services/billingPeriod.service");
const { createPaymentWithAllocations } = require("./payment.controller");

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const createDebitBill = async (client, req, adjustment) => {
  const customerResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [
    adjustment.customer_id
  ]);
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Customer not found.");

  const billNumber = await createBillNumber(client);
  const billResult = await client.query(
    `INSERT INTO bills (
      customer_id, bill_number, billing_month, previous_reading, current_reading,
      units_used, rate, amount, subtotal_amount, adjustment_amount, total_amount,
      balance_amount, paid_amount, status, due_date, issued_at
    )
    VALUES ($1, $2, $3, 0, 0, 0, 0, $4, 0, $4, $4, $4, 0, 'unpaid', $3, NOW())
    RETURNING *`,
    [adjustment.customer_id, billNumber, adjustment.adjustment_date, adjustment.amount]
  );

  await recordAuditEvent(client, {
    req,
    action: "bill.manual_debit_created",
    entityType: "bill",
    entityId: billResult.rows[0].id,
    afterData: billResult.rows[0],
    reason: adjustment.reason
  });

  return billResult.rows[0];
};

const listAdjustments = asyncHandler(async (req, res) => {
  const params = [];
  const clauses = [];

  if (req.query.status) {
    params.push(req.query.status);
    clauses.push(`ca.status = $${params.length}`);
  }

  if (req.query.customer_id) {
    params.push(Number(req.query.customer_id));
    clauses.push(`ca.customer_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT ca.*,
            c.name AS customer_name,
            c.acc_number,
            requester.name AS requested_by_name,
            reviewer.name AS reviewed_by_name
     FROM customer_adjustments ca
     JOIN customers c ON c.id = ca.customer_id
     LEFT JOIN users requester ON requester.id = ca.requested_by
     LEFT JOIN users reviewer ON reviewer.id = ca.reviewed_by
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY ca.created_at DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

const createAdjustment = asyncHandler(async (req, res) => {
  const {
    customer_id,
    adjustment_type,
    amount,
    adjustment_date = new Date().toISOString().slice(0, 10),
    reason
  } = req.body;
  const parsedAmount = Number(amount);

  if (!customer_id || !["credit", "debit"].includes(adjustment_type)) {
    throw new ApiError(400, "Customer and adjustment type are required.");
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new ApiError(400, "Adjustment amount must be greater than zero.");
  }
  if (!isDateOnly(adjustment_date)) {
    throw new ApiError(400, "Adjustment date must use YYYY-MM-DD format.");
  }
  if (!String(reason || "").trim()) {
    throw new ApiError(400, "Reason is required for manual adjustments.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT id FROM customers WHERE id = $1", [customer_id]);
    if (!customerResult.rows[0]) throw new ApiError(404, "Customer not found.");

    const result = await client.query(
      `INSERT INTO customer_adjustments (
        customer_id, adjustment_type, amount, adjustment_date, reason, requested_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [customer_id, adjustment_type, parsedAmount, adjustment_date, reason.trim(), req.user.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "customer_adjustment.requested",
      entityType: "customer_adjustment",
      entityId: result.rows[0].id,
      afterData: result.rows[0],
      reason: reason.trim()
    });

    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const reviewAdjustment = asyncHandler(async (req, res) => {
  const { status, review_notes = "" } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    throw new ApiError(400, "Review status must be approved or rejected.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeResult = await client.query("SELECT * FROM customer_adjustments WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const before = beforeResult.rows[0];
    if (!before) throw new ApiError(404, "Adjustment request not found.");
    if (before.status !== "pending") {
      throw new ApiError(400, "Only pending adjustments can be reviewed.");
    }

    let payment = null;
    let bill = null;
    if (status === "approved") {
      if (before.adjustment_type === "credit") {
        const result = await createPaymentWithAllocations(
          client,
          req,
          {
            customer_id: before.customer_id,
            amount: before.amount,
            payment_date: before.adjustment_date,
            payment_channel: "manual_adjustment",
            external_reference: `CREDIT-ADJ-${before.id}`,
            notes: before.reason
          },
          { auditReason: `Approved credit adjustment #${before.id}` }
        );
        payment = result.payment;
      } else {
        bill = await createDebitBill(client, req, before);
      }
    }

    const updatedResult = await client.query(
      `UPDATE customer_adjustments
       SET status = $1,
           payment_id = $2,
           bill_id = $3,
           reviewed_by = $4,
           reviewed_at = NOW(),
           review_notes = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [status, payment?.id || null, bill?.id || null, req.user.id, review_notes || null, before.id]
    );

    await recordAuditEvent(client, {
      req,
      action: `customer_adjustment.${status}`,
      entityType: "customer_adjustment",
      entityId: before.id,
      beforeData: before,
      afterData: {
        adjustment: updatedResult.rows[0],
        payment,
        bill
      },
      reason: review_notes || before.reason
    });

    await client.query("COMMIT");
    res.json({ adjustment: updatedResult.rows[0], payment, bill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  createAdjustment,
  listAdjustments,
  reviewAdjustment
};
