const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { resolvePortalCustomer } = require("../services/portalAccount.service");

const categories = ["leak", "meter_fault", "no_water", "low_pressure", "water_quality", "connection", "billing_support", "other"];
const priorities = ["low", "normal", "high", "urgent"];

const dateOnlyOrNull = (value) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new ApiError(400, "Target date must use YYYY-MM-DD.");
  return value;
};

const getPortalDashboard = asyncHandler(async (req, res) => {
  const { customerId, accounts } = await resolvePortalCustomer(pool, req);

  const customerResult = await pool.query(
    `SELECT c.*, r.name AS rate_name, r.amount AS rate_amount, z.name AS zone_name
     FROM customers c
     JOIN rates r ON r.id = c.rate_id
     JOIN zones z ON z.id = c.zone_id
     WHERE c.id = $1`,
    [customerId]
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Customer profile not found.");

  const balanceResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'paid' AND bill_pay_status = 'payable') AS open_bills,
       COALESCE(SUM(COALESCE(NULLIF(balance_amount, 0), amount - paid_amount)) FILTER (WHERE status <> 'paid' AND bill_pay_status = 'payable'), 0) -
         COALESCE((SELECT SUM(unallocated_amount) FROM payments WHERE customer_id = $1 AND status = 'posted'), 0) AS balance_due,
       COALESCE((SELECT SUM(unallocated_amount) FROM payments WHERE customer_id = $1 AND status = 'posted'), 0) AS credit_balance,
       COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS lifetime_billed,
       COALESCE(SUM(paid_amount), 0) AS lifetime_paid
     FROM bills
     WHERE customer_id = $1 AND bill_pay_status = 'payable'`,
    [customerId]
  );

  const latestReadingResult = await pool.query(
    `SELECT mr.reading_value, mr.reading_date, m.meter_number
     FROM meter_readings mr
     LEFT JOIN meters m ON m.id = mr.meter_id
     WHERE mr.customer_id = $1
     ORDER BY mr.reading_date DESC, mr.id DESC
     LIMIT 1`,
    [customerId]
  );

  const billsResult = await pool.query(
    `SELECT b.id, b.bill_number, b.billing_month, bp.name AS billing_period_name, b.due_date,
            b.previous_reading, b.current_reading, b.units_used, b.rate, b.subtotal_amount,
            b.fixed_charge_amount, b.penalty_amount, b.vat_amount, b.reconnection_fee_amount,
            b.adjustment_amount, COALESCE(NULLIF(b.total_amount, 0), b.amount) AS total_amount,
            b.paid_amount, b.balance_amount, b.status
     FROM bills b
     LEFT JOIN billing_periods bp ON bp.id = b.billing_period_id
     WHERE b.customer_id = $1 AND b.bill_pay_status = 'payable'
     ORDER BY b.billing_month DESC, b.created_at DESC
     LIMIT 300`,
    [customerId]
  );

  const paymentsResult = await pool.query(
    `SELECT p.id, p.receipt_number, p.payment_date, p.payment_channel, p.external_reference,
            p.amount, p.total_allocated_amount, p.unallocated_amount, p.status,
            STRING_AGG(DISTINCT b.bill_number, ', ' ORDER BY b.bill_number) FILTER (WHERE b.bill_number IS NOT NULL) AS bill_numbers
     FROM payments p
     LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
     LEFT JOIN bills b ON b.id = pa.bill_id
     WHERE p.customer_id = $1 AND p.status = 'posted'
     GROUP BY p.id
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 300`,
    [customerId]
  );

  const requestsResult = await pool.query(
    `SELECT mr.id, mr.request_number, mr.title, mr.category, mr.priority, mr.status,
            mr.reported_at, mr.target_date, mr.resolved_at, mr.resolution_notes,
            u.name AS assigned_to_name
     FROM maintenance_requests mr
     LEFT JOIN users u ON u.id = mr.assigned_to
     WHERE mr.customer_id = $1
     ORDER BY mr.reported_at DESC
     LIMIT 300`,
    [customerId]
  );

  const activeRequestsResult = await pool.query(
    `SELECT COUNT(*) AS active_requests
     FROM maintenance_requests
     WHERE customer_id = $1 AND status IN ('open', 'in_progress')`,
    [customerId]
  );

  const businessResult = await pool.query("SELECT * FROM business_settings WHERE id = 1");

  res.json({
    business: businessResult.rows[0] || null,
    portalAccounts: accounts,
    activeCustomerId: customerId,
    customer,
    summary: {
      ...balanceResult.rows[0],
      active_requests: activeRequestsResult.rows[0]?.active_requests || 0
    },
    latestReading: latestReadingResult.rows[0] || null,
    bills: billsResult.rows,
    payments: paymentsResult.rows,
    serviceRequests: requestsResult.rows
  });
});

const getPortalPayment = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const paymentResult = await pool.query(
    `SELECT p.*,
            c.name AS customer_name,
            c.acc_number,
            c.phone,
            c.location,
            z.name AS zone_name
     FROM payments p
     JOIN customers c ON c.id = p.customer_id
     JOIN zones z ON z.id = c.zone_id
     WHERE p.id = $1 AND p.customer_id = $2 AND p.status = 'posted'`,
    [req.params.id, customerId]
  );
  const payment = paymentResult.rows[0];
  if (!payment) throw new ApiError(404, "Receipt not found.");

  const allocationsResult = await pool.query(
    `SELECT pa.*,
            b.bill_number,
            b.billing_month,
            b.due_date,
            COALESCE(NULLIF(b.total_amount, 0), b.amount) AS bill_total,
            b.paid_amount,
            b.balance_amount,
            b.status AS bill_status
     FROM payment_allocations pa
     JOIN bills b ON b.id = pa.bill_id
     WHERE pa.payment_id = $1
     ORDER BY b.billing_month ASC, b.id ASC`,
    [payment.id]
  );

  res.json({
    payment,
    allocations: allocationsResult.rows
  });
});

const createPortalServiceRequest = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const category = req.body.category || "other";
  const priority = req.body.priority || "normal";

  if (!title) throw new ApiError(400, "Title is required.");
  if (title.length > 180) throw new ApiError(400, "Title must be 180 characters or fewer.");
  if (!description) throw new ApiError(400, "Details are required.");
  if (description.length > 2000) throw new ApiError(400, "Details must be 2000 characters or fewer.");
  if (!categories.includes(category)) throw new ApiError(400, "Category is invalid.");
  if (!priorities.includes(priority)) throw new ApiError(400, "Priority is invalid.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT id, zone_id FROM customers WHERE id = $1", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new ApiError(404, "Customer profile not found.");

    const { rows } = await client.query(
      `INSERT INTO maintenance_requests (
        customer_id, zone_id, title, category, priority, source, target_date, description, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'customer_portal', $6, $7, $8)
      RETURNING *`,
      [
        customerId,
        customer.zone_id,
        title,
        category,
        priority,
        dateOnlyOrNull(req.body.target_date),
        description,
        req.user.id
      ]
    );

    const requestNumber = `MR-${String(rows[0].id).padStart(5, "0")}`;
    const updatedResult = await client.query(
      "UPDATE maintenance_requests SET request_number = $1 WHERE id = $2 RETURNING *",
      [requestNumber, rows[0].id]
    );

    await recordAuditEvent(client, {
      req,
      action: "portal.service_request_created",
      entityType: "maintenance_request",
      entityId: updatedResult.rows[0].id,
      afterData: updatedResult.rows[0]
    });

    await client.query("COMMIT");
    res.status(201).json(updatedResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  createPortalServiceRequest,
  getPortalDashboard,
  getPortalPayment
};
