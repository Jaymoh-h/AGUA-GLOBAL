const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { assertNotFutureDate } = require("../services/dateGuard.service");
const { getActiveMeter, getPreviousReadingForMeter } = require("../services/meter.service");
const { resolvePortalCustomer } = require("../services/portalAccount.service");
const { normalizePhoneNumber } = require("../services/sms.service");
const { normalizeWhatsAppNumber } = require("../services/whatsapp.service");
const { accountPaymentJoin } = require("../services/paymentAccount.service");

const categories = ["leak", "meter_fault", "no_water", "low_pressure", "water_quality", "connection", "billing_support", "billing_dispute", "payment_plan", "other"];
const priorities = ["low", "normal", "high", "urgent"];
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const dateOnlyOrNull = (value) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new ApiError(400, "Target date must use YYYY-MM-DD.");
  return value;
};

const paymentPlanProposal = (value) => {
  const proposed = value && typeof value === "object" ? value : null;
  const installmentAmount = Number(proposed?.installment_amount);
  const frequency = String(proposed?.frequency || "").trim().toLowerCase();
  const firstDueDate = String(proposed?.preferred_first_due_date || "").trim();
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
    throw new ApiError(400, "Proposed instalment amount must be greater than zero.");
  }
  if (!["weekly", "monthly"].includes(frequency)) {
    throw new ApiError(400, "Proposed payment frequency must be weekly or monthly.");
  }
  if (!isDateOnly(firstDueDate) || firstDueDate < new Date().toISOString().slice(0, 10)) {
    throw new ApiError(400, "Preferred first payment date must be today or later.");
  }
  return {
    installment_amount: Number(installmentAmount.toFixed(2)),
    frequency,
    preferred_first_due_date: firstDueDate
  };
};

const billingDispute = async (client, customerId, value) => {
  const proposed = value && typeof value === "object" ? value : null;
  const billId = Number(proposed?.bill_id);
  const reason = String(proposed?.reason || "").trim().toLowerCase();
  const reasons = ["usage", "meter_reading", "payment", "tariff", "other"];

  if (!Number.isInteger(billId) || billId <= 0) {
    throw new ApiError(400, "Select a bill to dispute.");
  }
  if (!reasons.includes(reason)) {
    throw new ApiError(400, "Dispute reason is invalid.");
  }

  const billResult = await client.query(
    `SELECT id, bill_number, billing_month,
            COALESCE(NULLIF(total_amount, 0), amount) AS total_amount,
            COALESCE(NULLIF(balance_amount, 0), amount - paid_amount) AS balance_amount
     FROM bills
     WHERE id = $1 AND customer_id = $2 AND bill_pay_status = 'payable'`,
    [billId, customerId]
  );
  const bill = billResult.rows[0];
  if (!bill) {
    throw new ApiError(404, "The selected payable bill is not available for this account.");
  }

  const existingResult = await client.query(
    `SELECT request_number
     FROM maintenance_requests
     WHERE customer_id = $1
       AND category = 'billing_dispute'
       AND status IN ('open', 'in_progress')
       AND request_metadata -> 'billing_dispute' ->> 'bill_id' = $2
     LIMIT 1`,
    [customerId, String(billId)]
  );
  if (existingResult.rows[0]) {
    throw new ApiError(409, `A billing dispute for this bill is already open (${existingResult.rows[0].request_number || "request"}).`);
  }

  return {
    bill_id: bill.id,
    bill_number: bill.bill_number || null,
    billing_month: bill.billing_month ? String(bill.billing_month).slice(0, 10) : null,
    total_amount: Number(bill.total_amount || 0),
    balance_amount: Number(bill.balance_amount || 0),
    reason
  };
};

const connectionRequest = (value) => {
  const proposed = value && typeof value === "object" ? value : null;
  const requestType = String(proposed?.request_type || "").trim().toLowerCase();
  const siteLocation = String(proposed?.site_location || "").trim();
  const landmark = String(proposed?.landmark || "").trim();
  const accessContactName = String(proposed?.access_contact_name || "").trim();
  const accessContactPhone = String(proposed?.access_contact_phone || "").trim();
  const preferredInspectionDate = String(proposed?.preferred_inspection_date || "").trim();
  const accessNotes = String(proposed?.access_notes || "").trim();

  if (!["new_connection", "service_extension", "reconnection", "relocation"].includes(requestType)) {
    throw new ApiError(400, "Connection request type is invalid.");
  }
  if (!siteLocation) throw new ApiError(400, "Connection site or location is required.");
  if (siteLocation.length > 240) throw new ApiError(400, "Connection site or location must be 240 characters or fewer.");
  if (landmark.length > 180) throw new ApiError(400, "Landmark must be 180 characters or fewer.");
  if (accessContactName.length > 120) throw new ApiError(400, "Access contact name must be 120 characters or fewer.");
  if (accessContactPhone.length > 40) throw new ApiError(400, "Access contact phone must be 40 characters or fewer.");
  if (accessNotes.length > 600) throw new ApiError(400, "Access notes must be 600 characters or fewer.");
  if (preferredInspectionDate && (!isDateOnly(preferredInspectionDate) || preferredInspectionDate < new Date().toISOString().slice(0, 10))) {
    throw new ApiError(400, "Preferred inspection date must be today or later.");
  }

  return {
    request_type: requestType,
    site_location: siteLocation,
    landmark: landmark || null,
    access_contact_name: accessContactName || null,
    access_contact_phone: accessContactPhone || null,
    preferred_inspection_date: preferredInspectionDate || null,
    access_notes: accessNotes || null
  };
};

const buildRequestTitle = ({ category, customerName }) =>
  [String(category || "other").replace(/_/g, " "), customerName || "Customer portal"]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 180);

const portalDeliveryPreferences = ({ customer, portalEmail }) => ({
  preferred_delivery_channel: customer.preferred_delivery_channel || "email",
  email_delivery_enabled: customer.email_delivery_enabled !== false,
  sms_delivery_enabled: customer.sms_delivery_enabled === true,
  whatsapp_delivery_enabled: customer.whatsapp_delivery_enabled === true,
  contacts: {
    email_available: Boolean(customer.email || portalEmail),
    sms_available: Boolean(normalizePhoneNumber(customer.phone)),
    whatsapp_available: Boolean(normalizeWhatsAppNumber(customer.phone))
  }
});

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
     JOIN meters m ON m.id = mr.meter_id AND m.meter_role = 'client_billing'
     WHERE mr.customer_id = $1
     ORDER BY mr.reading_date DESC, mr.id DESC
     LIMIT 1`,
    [customerId]
  );

  const activeMeterResult = await pool.query(
    `SELECT id, meter_number
     FROM meters
     WHERE customer_id = $1 AND meter_role = 'client_billing' AND status = 'active'
     ORDER BY installed_at DESC NULLS LAST, id DESC
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
    `SELECT p.id, p.receipt_number, p.payment_date, p.payment_channel,
            CASE WHEN p.customer_id = $1 THEN p.external_reference ELSE NULL END AS external_reference,
            account_payment.amount, account_payment.total_allocated_amount, account_payment.unallocated_amount, p.status,
            account_payment.bill_numbers
     FROM payments p
     ${accountPaymentJoin("$1")}
     WHERE account_payment.amount > 0 AND p.status = 'posted'
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 300`,
    [customerId]
  );

  const consumptionPaymentTrendResult = await pool.query(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', CURRENT_DATE)::date - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE)::date,
         INTERVAL '1 month'
       )::date AS month_start
     ),
     billing AS (
       SELECT date_trunc('month', billing_month)::date AS month_start,
              COALESCE(SUM(COALESCE(NULLIF(total_amount, 0), amount)), 0) AS billed_amount,
              COALESCE(SUM(units_used), 0) AS units_used
       FROM bills
       WHERE customer_id = $1
         AND bill_pay_status = 'payable'
       GROUP BY date_trunc('month', billing_month)::date
     ),
     payments_by_month AS (
       SELECT date_trunc('month', p.payment_date)::date AS month_start,
              COALESCE(SUM(account_payment.amount), 0) AS paid_amount
       FROM payments p
       ${accountPaymentJoin("$1")}
       WHERE account_payment.amount > 0
         AND p.status = 'posted'
       GROUP BY date_trunc('month', p.payment_date)::date
     )
     SELECT to_char(months.month_start, 'Mon YYYY') AS label,
            months.month_start,
            COALESCE(billing.billed_amount, 0) AS billed_amount,
            COALESCE(billing.units_used, 0) AS units_used,
            COALESCE(payments_by_month.paid_amount, 0) AS paid_amount
     FROM months
     LEFT JOIN billing ON billing.month_start = months.month_start
     LEFT JOIN payments_by_month ON payments_by_month.month_start = months.month_start
     ORDER BY months.month_start ASC`,
    [customerId]
  );

  const usageBenchmarkResult = await pool.query(
    `WITH customer_usage AS (
       SELECT b.customer_id,
              ROUND((SUM(COALESCE(b.units_used, 0)) / NULLIF(COUNT(DISTINCT date_trunc('month', b.billing_month)), 0))::numeric, 1) AS average_units
       FROM bills b
       WHERE b.bill_pay_status = 'payable'
         AND b.billing_month >= (date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')::date
       GROUP BY b.customer_id
     ),
     profile AS (
       SELECT zone_id, rate_id
       FROM customers
       WHERE id = $1
     )
     SELECT COALESCE(target.average_units, 0) AS customer_average_units,
            COUNT(peer.customer_id)::integer AS peer_count,
            COALESCE(ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY peer.average_units))::numeric, 1), 0) AS peer_median_units
     FROM profile
     LEFT JOIN customer_usage target ON target.customer_id = $1
     LEFT JOIN customers peer_customer
       ON peer_customer.zone_id = profile.zone_id
      AND peer_customer.rate_id = profile.rate_id
      AND peer_customer.status = 'active'
      AND peer_customer.id <> $1
     LEFT JOIN customer_usage peer ON peer.customer_id = peer_customer.id
     GROUP BY target.average_units`,
    [customerId]
  );

  const requestsResult = await pool.query(
    `SELECT mr.id, mr.request_number, mr.title, mr.category, mr.priority, mr.status, mr.source,
            mr.reported_at, mr.target_date, mr.resolved_at, mr.description, mr.request_metadata, mr.customer_resolution_summary,
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

  const readingSubmissionsResult = await pool.query(
    `SELECT crs.id, crs.reading_value, crs.reading_date, crs.notes, crs.status, crs.submitted_at, crs.reviewed_at,
            m.meter_number
     FROM customer_reading_submissions crs
     JOIN meters m ON m.id = crs.meter_id
     WHERE crs.customer_id = $1
     ORDER BY crs.submitted_at DESC
     LIMIT 50`,
    [customerId]
  );

  const paymentArrangementResult = await pool.query(
    `SELECT pa.arrangement_number, pa.agreed_amount, pa.installment_amount, pa.frequency, pa.first_due_date,
            schedule.installments_due,
            LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) AS expected_amount,
            receipts.received_amount,
            GREATEST(LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) - receipts.received_amount, 0) AS shortfall_amount,
            CASE
              WHEN schedule.installments_due = 0 THEN 'upcoming'
              WHEN receipts.received_amount >= LEAST(pa.agreed_amount, pa.installment_amount * schedule.installments_due) THEN 'on_track'
              ELSE 'behind'
            END AS performance_status,
            CASE pa.frequency
              WHEN 'weekly' THEN pa.first_due_date + (schedule.installments_due * 7)
              ELSE (pa.first_due_date + (schedule.installments_due * INTERVAL '1 month'))::date
            END AS next_due_date
     FROM payment_arrangements pa
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN CURRENT_DATE < pa.first_due_date THEN 0
         WHEN pa.frequency = 'weekly' THEN ((CURRENT_DATE - pa.first_due_date) / 7) + 1
         ELSE (EXTRACT(YEAR FROM age(CURRENT_DATE, pa.first_due_date))::integer * 12) +
              EXTRACT(MONTH FROM age(CURRENT_DATE, pa.first_due_date))::integer + 1
       END::integer AS installments_due
     ) schedule ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(account_payment.amount), 0) AS received_amount
       FROM payments p
       ${accountPaymentJoin("pa.customer_id")}
       WHERE account_payment.amount > 0
         AND p.status = 'posted'
         AND p.payment_date >= COALESCE(pa.approved_at::date, pa.created_at::date)
     ) receipts ON TRUE
     WHERE pa.customer_id = $1
       AND pa.status = 'active'
     ORDER BY pa.created_at DESC
     LIMIT 1`,
    [customerId]
  );

  const businessResult = await pool.query("SELECT * FROM business_settings WHERE id = 1");
  const usageBenchmarkRow = usageBenchmarkResult.rows[0] || {};
  const customerAverageUnits = Number(usageBenchmarkRow.customer_average_units || 0);
  const peerMedianUnits = Number(usageBenchmarkRow.peer_median_units || 0);
  const peerCount = Number(usageBenchmarkRow.peer_count || 0);
  const benchmarkAvailable = peerCount >= 3 && peerMedianUnits > 0;
  const variancePercent = benchmarkAvailable
    ? Number((((customerAverageUnits - peerMedianUnits) / peerMedianUnits) * 100).toFixed(1))
    : null;

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
    activeMeter: activeMeterResult.rows[0] || null,
    usageBenchmark: {
      available: benchmarkAvailable,
      period_months: 6,
      customer_average_units: customerAverageUnits,
      peer_median_units: benchmarkAvailable ? peerMedianUnits : null,
      variance_percent: variancePercent,
      comparison_group: "Active accounts on the same tariff in your zone"
    },
    paymentArrangement: paymentArrangementResult.rows[0] || null,
    deliveryPreferences: portalDeliveryPreferences({ customer, portalEmail: req.user.email }),
    bills: billsResult.rows,
    payments: paymentsResult.rows,
    charts: {
      consumptionPaymentTrend: consumptionPaymentTrendResult.rows
    },
    serviceRequests: requestsResult.rows,
    readingSubmissions: readingSubmissionsResult.rows
  });
});

const getPortalPayment = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const paymentResult = await pool.query(
    `SELECT p.id, p.receipt_number, p.payment_date, p.payment_channel, p.status,
            p.created_at, account_payment.amount, account_payment.total_allocated_amount,
            account_payment.unallocated_amount, c.id AS customer_id,
            CASE WHEN p.customer_id = $2 THEN p.reference ELSE NULL END AS reference,
            CASE WHEN p.customer_id = $2 THEN p.external_reference ELSE NULL END AS external_reference,
            CASE WHEN p.customer_id = $2 THEN p.received_from ELSE NULL END AS received_from,
            CASE WHEN p.customer_id = $2 THEN p.notes ELSE NULL END AS notes,
            c.name AS customer_name,
            c.acc_number,
            c.phone,
            c.location,
            z.name AS zone_name
     FROM payments p
     ${accountPaymentJoin("$2")}
     JOIN customers c ON c.id = $2
     JOIN zones z ON z.id = c.zone_id
     WHERE p.id = $1 AND account_payment.amount > 0 AND p.status = 'posted'`,
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
     WHERE pa.payment_id = $1 AND b.customer_id = $2
     ORDER BY b.billing_month ASC, b.id ASC`,
    [payment.id, customerId]
  );

  res.json({
    payment,
    allocations: allocationsResult.rows
  });
});

const updatePortalDeliveryPreferences = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const preferredChannel = String(req.body.preferred_delivery_channel || "email").trim().toLowerCase();
  if (!["email", "sms", "whatsapp"].includes(preferredChannel)) {
    throw new ApiError(400, "Preferred delivery channel must be email, SMS, or WhatsApp.");
  }
  const enabled = {
    email: req.body.email_delivery_enabled === true,
    sms: req.body.sms_delivery_enabled === true,
    whatsapp: req.body.whatsapp_delivery_enabled === true
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new ApiError(404, "Customer profile not found.");
    const before = portalDeliveryPreferences({ customer, portalEmail: req.user.email });
    if (enabled.email && !before.contacts.email_available) throw new ApiError(400, "Customer care must add an email address before email delivery can be enabled.");
    if (enabled.sms && !before.contacts.sms_available) throw new ApiError(400, "Customer care must add a valid phone number before SMS delivery can be enabled.");
    if (enabled.whatsapp && !before.contacts.whatsapp_available) throw new ApiError(400, "Customer care must add a valid phone number before WhatsApp delivery can be enabled.");
    if (enabled[preferredChannel] !== true) throw new ApiError(400, "Choose an enabled channel as the preferred delivery channel.");

    const { rows } = await client.query(
      `UPDATE customers
       SET preferred_delivery_channel = $1,
           email_delivery_enabled = $2,
           sms_delivery_enabled = $3,
           whatsapp_delivery_enabled = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [preferredChannel, enabled.email, enabled.sms, enabled.whatsapp, customerId]
    );
    const preferences = portalDeliveryPreferences({ customer: rows[0], portalEmail: req.user.email });
    await recordAuditEvent(client, {
      req,
      action: "portal.delivery_preferences_updated",
      entityType: "customer",
      entityId: customerId,
      beforeData: before,
      afterData: preferences,
      reason: "Customer updated portal delivery preferences"
    });
    await client.query("COMMIT");
    res.json(preferences);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const createPortalServiceRequest = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const description = String(req.body.description || "").trim();
  const category = req.body.category || "other";
  const priority = req.body.priority || "normal";

  if (!description) throw new ApiError(400, "Details are required.");
  if (description.length > 2000) throw new ApiError(400, "Details must be 2000 characters or fewer.");
  if (!categories.includes(category)) throw new ApiError(400, "Category is invalid.");
  if (!priorities.includes(priority)) throw new ApiError(400, "Priority is invalid.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT id, name, zone_id FROM customers WHERE id = $1", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) throw new ApiError(404, "Customer profile not found.");
    const requestMetadata = category === "payment_plan"
      ? { payment_plan_proposal: paymentPlanProposal(req.body.payment_plan_proposal) }
      : category === "billing_dispute"
        ? { billing_dispute: await billingDispute(client, customerId, req.body.billing_dispute) }
        : category === "connection"
          ? { connection_request: connectionRequest(req.body.connection_request) }
          : {};
    const title = buildRequestTitle({ category, customerName: customer.name });

    const { rows } = await client.query(
      `INSERT INTO maintenance_requests (
        customer_id, zone_id, title, category, priority, source, target_date, description, request_metadata, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'customer_portal', $6, $7, $8::jsonb, $9)
      RETURNING *`,
      [
        customerId,
        customer.zone_id,
        title,
        category,
        priority,
        dateOnlyOrNull(req.body.target_date),
        description,
        JSON.stringify(requestMetadata),
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

const createPortalReadingSubmission = asyncHandler(async (req, res) => {
  const { customerId } = await resolvePortalCustomer(pool, req);
  const readingDate = String(req.body.reading_date || "").trim();
  const readingValue = Number(req.body.reading_value);
  const notes = String(req.body.notes || "").trim();

  if (!isDateOnly(readingDate)) throw new ApiError(400, "Reading date must use YYYY-MM-DD.");
  if (!Number.isFinite(readingValue) || readingValue < 0) throw new ApiError(400, "Reading value must be zero or greater.");
  if (notes.length > 1000) throw new ApiError(400, "Notes must be 1000 characters or fewer.");
  assertNotFutureDate(readingDate, req, "Reading date");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meter = await getActiveMeter(client, customerId);
    if (!meter) throw new ApiError(400, "No active billing meter is available for this account.");

    const officialReading = await client.query(
      "SELECT id FROM meter_readings WHERE meter_id = $1 AND reading_date = $2",
      [meter.id, readingDate]
    );
    if (officialReading.rows[0]) throw new ApiError(400, "A verified reading already exists for this meter and date.");

    const previousReading = await getPreviousReadingForMeter(client, meter.id, readingDate);
    if (previousReading && readingValue < Number(previousReading.reading_value)) {
      throw new ApiError(400, `Reading cannot be lower than the latest verified value (${previousReading.reading_value}).`);
    }

    const pending = await client.query(
      "SELECT id FROM customer_reading_submissions WHERE meter_id = $1 AND reading_date = $2 AND status = 'pending'",
      [meter.id, readingDate]
    );
    if (pending.rows[0]) throw new ApiError(400, "A reading submission is already awaiting review for this meter and date.");

    const { rows } = await client.query(
      `INSERT INTO customer_reading_submissions (
        customer_id, meter_id, reading_value, reading_date, notes, submitted_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [customerId, meter.id, readingValue, readingDate, notes || null, req.user.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "customer_reading_submission.created",
      entityType: "customer_reading_submission",
      entityId: rows[0].id,
      afterData: rows[0]
    });
    await client.query("COMMIT");
    res.status(201).json({ ...rows[0], meter_number: meter.meter_number });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  createPortalServiceRequest,
  createPortalReadingSubmission,
  getPortalDashboard,
  getPortalPayment,
  updatePortalDeliveryPreferences
};
