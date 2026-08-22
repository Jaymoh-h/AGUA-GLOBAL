const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { createBillNumber } = require("../services/billingPeriod.service");
const { assertNoFutureDates } = require("../services/dateGuard.service");

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const toMoney = (value) => Number(Number(value || 0).toFixed(2));

const chargeTypes = [
  "meter_replacement",
  "reconnection",
  "new_connection",
  "inspection",
  "repair",
  "water_delivery",
  "admin_fee",
  "other"
];

const normalizeChargeType = (value) => {
  const normalized = String(value || "other").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return chargeTypes.includes(normalized) ? normalized : "other";
};

const createChargeNumber = async (client) => {
  const { rows } = await client.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM customer_service_charges");
  return `SC-${String(rows[0]?.next_id || 1).padStart(6, "0")}`;
};

const serviceChargeSelect = `
  SELECT sc.*,
         c.name AS customer_name,
         c.acc_number,
         z.name AS zone_name,
         b.bill_number,
         b.status AS bill_status,
         b.bill_pay_status,
         b.paid_amount,
         b.balance_amount,
         b.due_date AS bill_due_date,
         COALESCE(NULLIF(b.total_amount, 0), b.amount, sc.amount) AS bill_total_amount,
         creator.name AS created_by_name,
         waiver.name AS waived_by_name,
         canceller.name AS cancelled_by_name,
         CASE
           WHEN sc.status <> 'payable' THEN sc.status
           WHEN b.status = 'paid' THEN 'paid'
           WHEN b.status = 'partial' THEN 'partial'
           ELSE 'payable'
         END AS display_status
  FROM customer_service_charges sc
  JOIN customers c ON c.id = sc.customer_id
  JOIN zones z ON z.id = c.zone_id
  LEFT JOIN bills b ON b.id = sc.bill_id
  LEFT JOIN users creator ON creator.id = sc.created_by
  LEFT JOIN users waiver ON waiver.id = sc.waived_by
  LEFT JOIN users canceller ON canceller.id = sc.cancelled_by
`;

const listCustomerServiceCharges = asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];

  if (req.query.customer_id) {
    params.push(Number(req.query.customer_id));
    filters.push(`sc.customer_id = $${params.length}`);
  }

  if (req.query.status) {
    params.push(String(req.query.status));
    filters.push(`(
      CASE
        WHEN sc.status <> 'payable' THEN sc.status
        WHEN b.status = 'paid' THEN 'paid'
        WHEN b.status = 'partial' THEN 'partial'
        ELSE 'payable'
      END
    ) = $${params.length}`);
  }

  const { rows } = await pool.query(
    `${serviceChargeSelect}
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY sc.charge_date DESC, sc.id DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

const getCustomerServiceCharge = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`${serviceChargeSelect} WHERE sc.id = $1`, [req.params.id]);
  if (!rows[0]) {
    throw new ApiError(404, "Customer service charge not found.");
  }
  res.json(rows[0]);
});

const createCustomerServiceCharge = asyncHandler(async (req, res) => {
  const {
    customer_id,
    charge_type,
    description,
    amount,
    charge_date = new Date().toISOString().slice(0, 10),
    due_date,
    linked_maintenance_request_id,
    linked_meter_event_id,
    notes
  } = req.body || {};

  const customerId = Number(customer_id);
  const chargeAmount = toMoney(amount);
  const cleanDescription = String(description || "").trim();
  const cleanChargeType = normalizeChargeType(charge_type);
  const chargeDate = charge_date || new Date().toISOString().slice(0, 10);
  const dueDate = due_date || chargeDate;

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new ApiError(400, "Customer is required.");
  }
  if (!cleanDescription) {
    throw new ApiError(400, "Service charge description is required.");
  }
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    throw new ApiError(400, "Service charge amount must be greater than zero.");
  }
  if (!isDateOnly(chargeDate) || !isDateOnly(dueDate)) {
    throw new ApiError(400, "Charge date and due date must use YYYY-MM-DD format.");
  }

  const futureOverrideReason = assertNoFutureDates(
    [
      { value: chargeDate, label: "Service charge date" },
      { value: dueDate, label: "Service charge due date" }
    ],
    req
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    const chargeNumber = await createChargeNumber(client);
    const chargeResult = await client.query(
      `INSERT INTO customer_service_charges (
         customer_id, charge_number, charge_type, description, amount, charge_date, due_date,
         linked_maintenance_request_id, linked_meter_event_id, notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        customer.id,
        chargeNumber,
        cleanChargeType,
        cleanDescription,
        chargeAmount,
        chargeDate,
        dueDate,
        linked_maintenance_request_id || null,
        linked_meter_event_id || null,
        notes || null,
        req.user.id
      ]
    );
    const charge = chargeResult.rows[0];
    const billNumber = await createBillNumber(client);
    const billResult = await client.query(
      `INSERT INTO bills (
         customer_id, bill_number, billing_month, previous_reading, current_reading,
         units_used, rate, amount, subtotal_amount, total_amount, balance_amount,
         paid_amount, status, due_date, issued_at, bill_origin, service_charge_id,
         bill_pay_status, payability_reason
       )
       VALUES ($1, $2, $3, 0, 0, 0, 0, $4, $4, $4, $4, 0, 'unpaid', $5, NOW(),
               'service_charge', $6, 'payable', $7)
       RETURNING *`,
      [customer.id, billNumber, chargeDate, chargeAmount, dueDate, charge.id, cleanDescription]
    );
    const bill = billResult.rows[0];
    const linkedCharge = await client.query(
      `UPDATE customer_service_charges
       SET bill_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [bill.id, charge.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "customer_service_charge.created",
      entityType: "customer_service_charge",
      entityId: charge.id,
      afterData: {
        service_charge: linkedCharge.rows[0],
        bill
      },
      reason: futureOverrideReason || notes || null
    });
    await recordAuditEvent(client, {
      req,
      action: "bill.service_charge_created",
      entityType: "bill",
      entityId: bill.id,
      afterData: bill,
      reason: futureOverrideReason || cleanDescription
    });

    await client.query("COMMIT");
    res.status(201).json({ service_charge: linkedCharge.rows[0], bill });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const closeCustomerServiceCharge = (targetStatus) =>
  asyncHandler(async (req, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      throw new ApiError(400, `${targetStatus === "waived" ? "Waiver" : "Cancellation"} reason is required.`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const chargeResult = await client.query(
        `SELECT sc.*, b.status AS bill_status, b.paid_amount, b.balance_amount
         FROM customer_service_charges sc
         LEFT JOIN bills b ON b.id = sc.bill_id
         WHERE sc.id = $1
         FOR UPDATE OF sc`,
        [req.params.id]
      );
      const charge = chargeResult.rows[0];
      if (!charge) {
        throw new ApiError(404, "Customer service charge not found.");
      }
      if (charge.status !== "payable") {
        throw new ApiError(400, "Only payable service charges can be changed.");
      }
      if (Number(charge.paid_amount || 0) > 0) {
        throw new ApiError(400, "Service charges with payments cannot be waived or cancelled.");
      }

      const fieldPrefix = targetStatus === "waived" ? "waiv" : "cancell";
      const updatedCharge = await client.query(
        `UPDATE customer_service_charges
         SET status = $1,
             ${fieldPrefix}ed_by = $2,
             ${fieldPrefix}ed_at = NOW(),
             ${targetStatus === "waived" ? "waiver_reason" : "cancellation_reason"} = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [targetStatus, req.user.id, reason, charge.id]
      );

      let updatedBill = null;
      if (charge.bill_id) {
        const billResult = await client.query(
          `UPDATE bills
           SET bill_pay_status = 'superseded',
               status = 'paid',
               balance_amount = 0,
               payability_reason = $1
           WHERE id = $2
           RETURNING *`,
          [`Service charge ${targetStatus}: ${reason}`, charge.bill_id]
        );
        updatedBill = billResult.rows[0] || null;
      }

      await recordAuditEvent(client, {
        req,
        action: `customer_service_charge.${targetStatus}`,
        entityType: "customer_service_charge",
        entityId: charge.id,
        beforeData: charge,
        afterData: {
          service_charge: updatedCharge.rows[0],
          bill: updatedBill
        },
        reason
      });

      await client.query("COMMIT");
      res.json({ service_charge: updatedCharge.rows[0], bill: updatedBill });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

module.exports = {
  listCustomerServiceCharges,
  getCustomerServiceCharge,
  createCustomerServiceCharge,
  waiveCustomerServiceCharge: closeCustomerServiceCharge("waived"),
  cancelCustomerServiceCharge: closeCustomerServiceCharge("cancelled")
};
