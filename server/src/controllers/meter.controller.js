const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { getOrCreateBillingPeriod } = require("../services/billingPeriod.service");
const { ensureActiveMeter, getMeterHistory, getPreviousReadingForMeter } = require("../services/meter.service");
const { recalculateBillForReading } = require("./reading.controller");
const { recordAuditEvent } = require("../services/audit.service");

const listMeters = asyncHandler(async (req, res) => {
  const customerId = Number(req.query.customer_id);
  if (!customerId) {
    throw new ApiError(400, "Customer is required.");
  }

  if (req.user.role === "customer" && Number(req.user.customer_id) !== customerId) {
    throw new ApiError(403, "You do not have permission to view these meters.");
  }

  const client = await pool.connect();
  try {
    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customerId]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    await ensureActiveMeter(client, customer);
    const meters = await getMeterHistory(client, customerId);
    res.json(meters);
  } finally {
    client.release();
  }
});

const listMeterEvents = asyncHandler(async (req, res) => {
  const customerId = Number(req.query.customer_id);
  const params = [];
  const clauses = [];

  if (customerId) {
    params.push(customerId);
    clauses.push(`me.customer_id = $${params.length}`);
  }

  if (req.user.role === "customer") {
    params.push(req.user.customer_id || 0);
    clauses.push(`me.customer_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT me.*,
            c.name AS customer_name,
            c.acc_number,
            old_meter.meter_number AS old_meter_number,
            new_meter.meter_number AS new_meter_number,
            u.name AS created_by_name
     FROM meter_events me
     JOIN customers c ON c.id = me.customer_id
     LEFT JOIN meters old_meter ON old_meter.id = me.old_meter_id
     LEFT JOIN meters new_meter ON new_meter.id = me.new_meter_id
     LEFT JOIN users u ON u.id = me.created_by
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY me.event_date DESC, me.created_at DESC
     LIMIT 200`,
    params
  );

  res.json(rows);
});

const replaceMeter = asyncHandler(async (req, res) => {
  const {
    customer_id,
    old_final_reading,
    new_meter_number,
    new_initial_reading = 0,
    event_date,
    reason
  } = req.body;

  if (!customer_id || old_final_reading === undefined || !new_meter_number || event_date === undefined) {
    throw new ApiError(400, "Customer, old final reading, new meter number, and replacement date are required.");
  }

  const oldFinalReading = Number(old_final_reading);
  const newInitialReading = Number(new_initial_reading || 0);

  if (!Number.isFinite(oldFinalReading) || oldFinalReading < 0) {
    throw new ApiError(400, "Old final reading must be zero or greater.");
  }

  if (!Number.isFinite(newInitialReading) || newInitialReading < 0) {
    throw new ApiError(400, "New initial reading must be zero or greater.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const customerResult = await client.query("SELECT * FROM customers WHERE id = $1 FOR UPDATE", [customer_id]);
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new ApiError(404, "Customer not found.");
    }

    const oldMeter = await ensureActiveMeter(client, customer);
    const previous = await getPreviousReadingForMeter(client, oldMeter.id, event_date);

    if (previous && oldFinalReading < Number(previous.reading_value)) {
      throw new ApiError(400, "Old final reading cannot be lower than the previous reading.");
    }

    const duplicateMeter = await client.query("SELECT id FROM meters WHERE meter_number = $1", [
      new_meter_number
    ]);
    if (duplicateMeter.rows[0]) {
      throw new ApiError(400, "New meter number is already in use.");
    }

    const billingPeriod = await getOrCreateBillingPeriod(client, event_date, req.user.id);

    let finalReading = null;
    let createdFinalReading = false;
    const existingSameDate = await client.query(
      `SELECT * FROM meter_readings
       WHERE meter_id = $1 AND reading_date = $2
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [oldMeter.id, event_date]
    );

    if (existingSameDate.rows[0]) {
      const existing = existingSameDate.rows[0];
      if (Number(existing.reading_value) !== oldFinalReading) {
        throw new ApiError(400, "A different old-meter reading already exists for the replacement date.");
      }
      finalReading = existing;
    } else {
      const finalReadingResult = await client.query(
        `INSERT INTO meter_readings (
          customer_id, meter_id, billing_period_id, previous_reading_id, previous_reading_value,
          reading_value, reading_date, source, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', $8, $9)
        RETURNING *`,
        [
          customer.id,
          oldMeter.id,
          billingPeriod.id,
          previous?.id || null,
          previous?.reading_value || null,
          oldFinalReading,
          event_date,
          "Final reading recorded during meter replacement",
          req.user.id
        ]
      );
      finalReading = finalReadingResult.rows[0];
      createdFinalReading = true;
    }

    const bill = await recalculateBillForReading(client, finalReading.id);
    if (createdFinalReading) {
      await recordAuditEvent(client, {
        req,
        action: "reading.created",
        entityType: "meter_reading",
        entityId: finalReading.id,
        afterData: finalReading,
        reason: "Final old-meter reading during replacement"
      });
    }
    if (bill) {
      await recordAuditEvent(client, {
        req,
        action: "bill.recalculated",
        entityType: "bill",
        entityId: bill.id,
        afterData: bill,
        reason: "Meter replacement final reading"
      });
    }

    const oldMeterResult = await client.query(
      `UPDATE meters
       SET status = 'replaced',
           removed_at = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [event_date, oldMeter.id]
    );
    await recordAuditEvent(client, {
      req,
      action: "meter.replaced",
      entityType: "meter",
      entityId: oldMeterResult.rows[0].id,
      beforeData: oldMeter,
      afterData: oldMeterResult.rows[0],
      reason
    });

    const newMeterResult = await client.query(
      `INSERT INTO meters (
        customer_id, meter_number, installed_at, initial_reading, status, notes
      )
      VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING *`,
      [customer.id, new_meter_number, event_date, newInitialReading, reason || "Meter replacement"]
    );
    await recordAuditEvent(client, {
      req,
      action: "meter.created",
      entityType: "meter",
      entityId: newMeterResult.rows[0].id,
      afterData: newMeterResult.rows[0],
      reason: "Meter replacement"
    });

    const newBaselineReadingResult = await client.query(
      `INSERT INTO meter_readings (
        customer_id, meter_id, billing_period_id, previous_reading_id, previous_reading_value,
        reading_value, reading_date, source, notes, created_by
      )
      VALUES ($1, $2, $3, NULL, NULL, $4, $5, 'admin', $6, $7)
      RETURNING *`,
      [
        customer.id,
        newMeterResult.rows[0].id,
        billingPeriod.id,
        newInitialReading,
        event_date,
        "Initial reading recorded during meter replacement",
        req.user.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "reading.created",
      entityType: "meter_reading",
      entityId: newBaselineReadingResult.rows[0].id,
      afterData: newBaselineReadingResult.rows[0],
      reason: "New meter baseline during replacement"
    });

    const eventResult = await client.query(
      `INSERT INTO meter_events (
        customer_id, old_meter_id, new_meter_id, event_type, event_date,
        old_final_reading, new_initial_reading, reason, created_by
      )
      VALUES ($1, $2, $3, 'replacement', $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        customer.id,
        oldMeter.id,
        newMeterResult.rows[0].id,
        event_date,
        oldFinalReading,
        newInitialReading,
        reason || null,
        req.user.id
      ]
    );
    await recordAuditEvent(client, {
      req,
      action: "meter_event.created",
      entityType: "meter_event",
      entityId: eventResult.rows[0].id,
      afterData: eventResult.rows[0],
      reason
    });

    await client.query("COMMIT");
    res.status(201).json({
      event: eventResult.rows[0],
      oldMeter: oldMeterResult.rows[0],
      newMeter: newMeterResult.rows[0],
      finalReading,
      newBaselineReading: newBaselineReadingResult.rows[0],
      bill
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listMeterEvents,
  listMeters,
  replaceMeter
};
