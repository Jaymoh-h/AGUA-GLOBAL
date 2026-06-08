const pool = require("../db/pool");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { recordAuditEvent } = require("../services/audit.service");
const { calculateTariffCharge, getTariffWithBlocks } = require("../services/tariff.service");
const { assertNotFutureDate } = require("../services/dateGuard.service");
const { createExpenseRecord } = require("./expense.controller");

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const dateOnly = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10));
const toNumber = (value) => Number(value || 0);
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const listProductionMeters = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT psm.*,
            z.name AS zone_name,
            c.name AS customer_name,
            c.acc_number,
            cm.meter_number AS linked_meter_number,
            COALESCE(c.rate_id, psm.rate_id) AS effective_rate_id,
            r.name AS rate_name
     FROM production_source_meters psm
     LEFT JOIN zones z ON z.id = psm.zone_id
     LEFT JOIN customers c ON c.id = psm.customer_id
     LEFT JOIN meters cm ON cm.id = psm.meter_id
     LEFT JOIN rates r ON r.id = COALESCE(c.rate_id, psm.rate_id)
     ORDER BY psm.status = 'active' DESC, psm.meter_type ASC, psm.meter_number ASC`
  );
  res.json(rows);
});

const createProductionMeter = asyncHandler(async (req, res) => {
  const {
    meter_type = "shared_source",
    meter_number,
    name,
    zone_id,
    customer_id,
    meter_id,
    rate_id,
    installed_at,
    initial_reading = 0,
    notes
  } = req.body;
  if (!["customer_source", "shared_source"].includes(meter_type)) {
    throw new ApiError(400, "Meter type must be customer source or shared source.");
  }
  if (!String(meter_number || "").trim()) throw new ApiError(400, "Meter number is required.");
  if (meter_type === "customer_source" && !customer_id) {
    throw new ApiError(400, "Linked customer is required for a customer source meter.");
  }
  if (meter_type === "shared_source" && !rate_id) {
    throw new ApiError(400, "Default tariff is required for a shared source meter.");
  }
  const installedAt = installed_at || new Date().toISOString().slice(0, 10);
  const initialReading = toNumber(initial_reading);
  if (!isDateOnly(installedAt)) throw new ApiError(400, "Installed date must use YYYY-MM-DD.");
  if (!Number.isFinite(initialReading) || initialReading < 0) {
    throw new ApiError(400, "Initial reading must be zero or greater.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (meter_type === "customer_source") {
      const customerResult = await client.query("SELECT * FROM customers WHERE id = $1", [customer_id]);
      if (!customerResult.rows[0]) throw new ApiError(404, "Customer not found.");
      if (meter_id) {
        const meterResult = await client.query(
          "SELECT * FROM meters WHERE id = $1 AND customer_id = $2 AND meter_role = 'source_backup'",
          [meter_id, customer_id]
        );
        if (!meterResult.rows[0]) throw new ApiError(400, "Linked meter must be a source backup meter for this customer.");
      }
    }
    if (rate_id) {
      const rateResult = await client.query("SELECT id FROM rates WHERE id = $1 AND is_active = TRUE", [rate_id]);
      if (!rateResult.rows[0]) throw new ApiError(404, "Tariff not found or inactive.");
    }

    const { rows } = await client.query(
      `INSERT INTO production_source_meters (
        zone_id, customer_id, meter_id, rate_id, meter_number, name, meter_type,
        installed_at, initial_reading, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        zone_id || null,
        meter_type === "customer_source" ? customer_id : null,
        meter_type === "customer_source" ? meter_id || null : null,
        meter_type === "shared_source" ? rate_id : null,
        String(meter_number).trim(),
        name || null,
        meter_type,
        installedAt,
        initialReading,
        notes || null,
        req.user.id
      ]
    );

    await recordAuditEvent(client, {
      req,
      action: "production_meter.created",
      entityType: "production_source_meter",
      entityId: rows[0].id,
      afterData: rows[0],
      reason: notes || null
    });

    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const replaceProductionMeter = asyncHandler(async (req, res) => {
  const {
    new_meter_number,
    new_name,
    old_final_reading,
    new_initial_reading = 0,
    event_date,
    reason
  } = req.body;

  if (!String(new_meter_number || "").trim() || old_final_reading === undefined || !event_date) {
    throw new ApiError(400, "New meter number, old final reading, and replacement date are required.");
  }
  if (!isDateOnly(event_date)) throw new ApiError(400, "Replacement date must use YYYY-MM-DD.");
  const futureOverrideReason = assertNotFutureDate(event_date, req, "Replacement date");

  const oldFinalReading = toNumber(old_final_reading);
  const newInitialReading = toNumber(new_initial_reading);
  if (!Number.isFinite(oldFinalReading) || oldFinalReading < 0) {
    throw new ApiError(400, "Old final reading must be zero or greater.");
  }
  if (!Number.isFinite(newInitialReading) || newInitialReading < 0) {
    throw new ApiError(400, "New initial reading must be zero or greater.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const oldMeterResult = await client.query("SELECT * FROM production_source_meters WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const oldMeter = oldMeterResult.rows[0];
    if (!oldMeter) throw new ApiError(404, "Production meter not found.");
    if (oldMeter.status !== "active") throw new ApiError(400, "Only active production meters can be replaced.");

    const previous = await getPreviousProductionReading(client, oldMeter.id, event_date);
    if (previous && oldFinalReading < toNumber(previous.reading_value)) {
      throw new ApiError(400, "Old final reading cannot be lower than the previous production reading.");
    }

    const duplicateMeter = await client.query("SELECT id FROM production_source_meters WHERE meter_number = $1", [
      String(new_meter_number).trim()
    ]);
    if (duplicateMeter.rows[0]) {
      throw new ApiError(400, "New production meter number is already in use.");
    }

    const retiredResult = await client.query(
      `UPDATE production_source_meters
       SET status = 'replaced',
           removed_at = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [event_date, oldMeter.id]
    );

    const newMeterResult = await client.query(
      `INSERT INTO production_source_meters (
        zone_id, customer_id, meter_id, rate_id, meter_number, name, meter_type,
        installed_at, initial_reading, status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11)
      RETURNING *`,
      [
        oldMeter.zone_id || null,
        oldMeter.customer_id || null,
        oldMeter.meter_id || null,
        oldMeter.rate_id || null,
        String(new_meter_number).trim(),
        new_name || oldMeter.name || null,
        oldMeter.meter_type,
        event_date,
        newInitialReading,
        reason || `Replacement for ${oldMeter.meter_number}`,
        req.user.id
      ]
    );

    const eventResult = await client.query(
      `INSERT INTO production_meter_events (
        old_production_meter_id, new_production_meter_id, event_type, event_date,
        old_final_reading, new_initial_reading, reason, created_by
      )
      VALUES ($1, $2, 'replacement', $3, $4, $5, $6, $7)
      RETURNING *`,
      [
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
      action: "production_meter.replaced",
      entityType: "production_source_meter",
      entityId: oldMeter.id,
      beforeData: oldMeter,
      afterData: {
        oldMeter: retiredResult.rows[0],
        newMeter: newMeterResult.rows[0],
        event: eventResult.rows[0]
      },
      reason: reason || futureOverrideReason
    });

    await recordAuditEvent(client, {
      req,
      action: "production_meter_event.created",
      entityType: "production_meter_event",
      entityId: eventResult.rows[0].id,
      afterData: eventResult.rows[0],
      reason: reason || futureOverrideReason
    });

    await client.query("COMMIT");
    res.status(201).json({
      event: eventResult.rows[0],
      oldMeter: retiredResult.rows[0],
      newMeter: newMeterResult.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listElectricityTopups = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT pet.*,
            u.name AS created_by_name,
            e.reference AS expense_reference,
            e.category AS expense_category,
            e.amount AS expense_amount
     FROM production_electricity_topups pet
     LEFT JOIN users u ON u.id = pet.created_by
     LEFT JOIN expenses e ON e.id = pet.expense_id
     ORDER BY pet.topup_date DESC, pet.id DESC
     LIMIT 500`
  );
  res.json(rows);
});

const createElectricityTopup = asyncHandler(async (req, res) => {
  const { topup_date, kwh_units, total_cost, reference, notes } = req.body;
  if (!isDateOnly(topup_date)) throw new ApiError(400, "Top-up date must use YYYY-MM-DD.");
  const futureOverrideReason = assertNotFutureDate(topup_date, req, "Top-up date");
  const units = toNumber(kwh_units);
  const cost = toNumber(total_cost);
  if (!Number.isFinite(units) || units <= 0) throw new ApiError(400, "kWh units must be greater than zero.");
  if (!Number.isFinite(cost) || cost <= 0) throw new ApiError(400, "Total cost must be greater than zero.");
  const costPerUnit = units > 0 ? roundMoney(cost / units) : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const topupResult = await client.query(
      `INSERT INTO production_electricity_topups (
        topup_date, kwh_units, total_cost, cost_per_unit, reference, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [topup_date, units, cost, costPerUnit, reference || null, notes || null, req.user.id]
    );
    const topup = topupResult.rows[0];
    const expense = await createExpenseRecord(
      client,
      req,
      {
        expense_date: topup.topup_date,
        category: "Production - Electricity",
        vendor: "Electricity top-up",
        description: `Electricity top-up ${Number(topup.kwh_units || 0).toLocaleString()} kWh`,
        amount: topup.total_cost,
        payment_channel: "mpesa_paybill",
        reference: topup.reference || `PROD-TOPUP-${topup.id}`,
        notes: topup.notes || `Posted from production electricity top-up #${topup.id}.`
      },
      { auditReason: `Production electricity top-up #${topup.id}` }
    );
    const updatedResult = await client.query(
      `UPDATE production_electricity_topups
       SET expense_id = $1
       WHERE id = $2
       RETURNING *`,
      [expense.id, topup.id]
    );

    await recordAuditEvent(client, {
      req,
      action: "production_electricity_topup.created",
      entityType: "production_electricity_topup",
      entityId: topup.id,
      afterData: {
        topup: updatedResult.rows[0],
        expense
      },
      reason: futureOverrideReason
    });

    await client.query("COMMIT");
    res.status(201).json({ ...updatedResult.rows[0], expense_reference: expense.reference });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const resolveProductionMeters = async (client, activeOnly = true) => {
  const { rows } = await client.query(
    `SELECT psm.*,
            c.rate_id AS customer_rate_id,
            c.name AS customer_name,
            c.acc_number,
            r.name AS rate_name
     FROM production_source_meters psm
     LEFT JOIN customers c ON c.id = psm.customer_id
     LEFT JOIN rates r ON r.id = COALESCE(c.rate_id, psm.rate_id)
     WHERE ($1::boolean = FALSE OR psm.status = 'active')
     ORDER BY psm.meter_number ASC`,
    [activeOnly]
  );
  return rows;
};

const getPreviousProductionReading = async (client, productionMeterId, readingDate) => {
  const { rows } = await client.query(
    `SELECT pmr.*, pwr.reading_date
     FROM production_meter_readings pmr
     JOIN production_weekly_readings pwr ON pwr.id = pmr.weekly_reading_id
     WHERE pmr.production_meter_id = $1
       AND pwr.reading_date < $2
     ORDER BY pwr.reading_date DESC, pmr.id DESC
     LIMIT 1`,
    [productionMeterId, readingDate]
  );
  if (rows[0]) return rows[0];

  const baselineResult = await client.query(
    `SELECT new_initial_reading AS reading_value,
            event_date AS reading_date
     FROM production_meter_events
     WHERE new_production_meter_id = $1
       AND event_date < $2
     ORDER BY event_date DESC, id DESC
     LIMIT 1`,
    [productionMeterId, readingDate]
  );
  return baselineResult.rows[0] || null;
};

const getProductionReadingContext = asyncHandler(async (req, res) => {
  const readingDate = isDateOnly(req.query.reading_date)
    ? req.query.reading_date
    : new Date().toISOString().slice(0, 10);

  const previousWeekResult = await pool.query(
    `SELECT id, reading_date, prepaid_kwh_balance
     FROM production_weekly_readings
     WHERE reading_date < $1
     ORDER BY reading_date DESC
     LIMIT 1`,
    [readingDate]
  );
  const meters = await resolveProductionMeters(pool);
  const readings = [];
  for (const meter of meters) {
    const previous = await getPreviousProductionReading(pool, meter.id, readingDate);
    readings.push({
      production_meter_id: meter.id,
      previous_reading_value: previous?.reading_value ?? null,
      previous_reading_date: previous?.reading_date ?? null
    });
  }

  res.json({
    reading_date: readingDate,
    previous_week: previousWeekResult.rows[0] || null,
    readings
  });
});

const calculateProductionReading = async (client, meter, readingDate, readingValue, previousReadingValue) => {
  if (previousReadingValue !== null && previousReadingValue !== undefined && readingValue < toNumber(previousReadingValue)) {
    throw new ApiError(400, `Reading for ${meter.meter_number} cannot be lower than its previous reading.`);
  }
  const consumption =
    previousReadingValue === null || previousReadingValue === undefined ? 0 : readingValue - toNumber(previousReadingValue);
  const rateId = meter.customer_rate_id || meter.rate_id;
  const tariff = rateId ? await getTariffWithBlocks(client, rateId, readingDate) : null;
  const charge = calculateTariffCharge(tariff || { amount: 0 }, consumption);
  return {
    previousReadingValue: previousReadingValue ?? null,
    consumption,
    tariffSnapshot: charge.tariffSnapshot,
    revenueAmount: charge.subtotalAmount
  };
};

const recalculateProductionMeterForward = async (client, productionMeterId, fromDate) => {
  const meterResult = await client.query(
    `SELECT psm.*,
            c.rate_id AS customer_rate_id,
            c.name AS customer_name,
            c.acc_number
     FROM production_source_meters psm
     LEFT JOIN customers c ON c.id = psm.customer_id
     WHERE psm.id = $1`,
    [productionMeterId]
  );
  const meter = meterResult.rows[0];
  if (!meter) return;

  const previousResult = await client.query(
    `SELECT pmr.reading_value
     FROM production_meter_readings pmr
     JOIN production_weekly_readings pwr ON pwr.id = pmr.weekly_reading_id
     WHERE pmr.production_meter_id = $1
       AND pwr.reading_date < $2
     ORDER BY pwr.reading_date DESC, pmr.id DESC
     LIMIT 1`,
    [productionMeterId, fromDate]
  );
  let previousReadingValue = previousResult.rows[0]?.reading_value ?? null;
  if (previousReadingValue === null || previousReadingValue === undefined) {
    const baselineResult = await client.query(
      `SELECT new_initial_reading AS reading_value
       FROM production_meter_events
       WHERE new_production_meter_id = $1
         AND event_date < $2
       ORDER BY event_date DESC, id DESC
       LIMIT 1`,
      [productionMeterId, fromDate]
    );
    previousReadingValue = baselineResult.rows[0]?.reading_value ?? null;
  }

  const readingsResult = await client.query(
    `SELECT pmr.*, pwr.reading_date
     FROM production_meter_readings pmr
     JOIN production_weekly_readings pwr ON pwr.id = pmr.weekly_reading_id
     WHERE pmr.production_meter_id = $1
       AND pwr.reading_date >= $2
     ORDER BY pwr.reading_date ASC, pmr.id ASC`,
    [productionMeterId, fromDate]
  );

  for (const reading of readingsResult.rows) {
    const readingValue = toNumber(reading.reading_value);
    const calculated = await calculateProductionReading(
      client,
      meter,
      reading.reading_date,
      readingValue,
      previousReadingValue
    );
    await client.query(
      `UPDATE production_meter_readings
       SET previous_reading_value = $1,
           consumption = $2,
           tariff_snapshot = $3::jsonb,
           revenue_amount = $4
       WHERE id = $5`,
      [
        calculated.previousReadingValue,
        calculated.consumption,
        JSON.stringify(calculated.tariffSnapshot),
        calculated.revenueAmount,
        reading.id
      ]
    );
    previousReadingValue = readingValue;
  }
};

const recalculateProductionMetersForward = async (client, productionMeterIds, fromDate) => {
  const meterIds = [...new Set(productionMeterIds.map((id) => Number(id)).filter(Boolean))];
  for (const meterId of meterIds) {
    await recalculateProductionMeterForward(client, meterId, fromDate);
  }
};

const createWeeklyReading = asyncHandler(async (req, res) => {
  const { reading_date, prepaid_kwh_balance, readings = [], notes } = req.body;
  if (!isDateOnly(reading_date)) throw new ApiError(400, "Reading date must use YYYY-MM-DD.");
  const futureOverrideReason = assertNotFutureDate(reading_date, req, "Production reading date");
  const prepaidBalance = toNumber(prepaid_kwh_balance);
  if (!Number.isFinite(prepaidBalance) || prepaidBalance < 0) {
    throw new ApiError(400, "Prepaid kWh balance cannot be negative.");
  }
  if (!Array.isArray(readings) || !readings.length) {
    throw new ApiError(400, "At least one production meter reading is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productionMeters = await resolveProductionMeters(client);
    const meterMap = new Map(productionMeters.map((meter) => [Number(meter.id), meter]));

    const weeklyResult = await client.query(
      `INSERT INTO production_weekly_readings (reading_date, prepaid_kwh_balance, notes, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (reading_date) DO UPDATE
       SET prepaid_kwh_balance = EXCLUDED.prepaid_kwh_balance,
           notes = EXCLUDED.notes,
           updated_at = NOW()
       RETURNING *`,
      [reading_date, prepaidBalance, notes || null, req.user.id]
    );
    const weekly = weeklyResult.rows[0];

    const savedRows = [];
    for (const item of readings) {
      const meter = meterMap.get(Number(item.production_meter_id));
      if (!meter) continue;
      const readingValue = toNumber(item.reading_value);
      if (!Number.isFinite(readingValue) || readingValue < 0) {
        throw new ApiError(400, `Reading for ${meter.meter_number} must be zero or greater.`);
      }
      const previous = await getPreviousProductionReading(client, meter.id, reading_date);
      if (previous && readingValue < toNumber(previous.reading_value)) {
        throw new ApiError(400, `Reading for ${meter.meter_number} cannot be lower than its previous reading.`);
      }
      const consumption = previous ? readingValue - toNumber(previous.reading_value) : 0;
      const rateId = meter.customer_rate_id || meter.rate_id;
      const tariff = rateId ? await getTariffWithBlocks(client, rateId, reading_date) : null;
      const charge = calculateTariffCharge(tariff || { amount: 0 }, consumption);
      const rowResult = await client.query(
        `INSERT INTO production_meter_readings (
          weekly_reading_id, production_meter_id, reading_value, previous_reading_value,
          consumption, tariff_snapshot, revenue_amount, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE
        SET reading_value = EXCLUDED.reading_value,
            previous_reading_value = EXCLUDED.previous_reading_value,
            consumption = EXCLUDED.consumption,
            tariff_snapshot = EXCLUDED.tariff_snapshot,
            revenue_amount = EXCLUDED.revenue_amount,
            notes = EXCLUDED.notes
        RETURNING *`,
        [
          weekly.id,
          meter.id,
          readingValue,
          previous?.reading_value ?? null,
          consumption,
          JSON.stringify(charge.tariffSnapshot),
          charge.subtotalAmount,
          item.notes || null
        ]
      );
      savedRows.push({ ...rowResult.rows[0], meter_number: meter.meter_number });
    }
    await recalculateProductionMetersForward(
      client,
      savedRows.map((row) => row.production_meter_id),
      reading_date
    );

    await recordAuditEvent(client, {
      req,
      action: "production_weekly_reading.saved",
      entityType: "production_weekly_reading",
      entityId: weekly.id,
      afterData: { weekly, readings: savedRows },
      reason: futureOverrideReason
    });

    await client.query("COMMIT");
    res.status(201).json({ weekly, readings: savedRows });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const getWeeklyReading = asyncHandler(async (req, res) => {
  const weeklyResult = await pool.query("SELECT * FROM production_weekly_readings WHERE id = $1", [req.params.id]);
  const weekly = weeklyResult.rows[0];
  if (!weekly) throw new ApiError(404, "Weekly reading not found.");

  const rowsResult = await pool.query(
    `SELECT pmr.*,
            psm.meter_number,
            psm.name AS meter_name,
            psm.meter_type,
            psm.status AS meter_status,
            c.name AS customer_name,
            c.acc_number
     FROM production_meter_readings pmr
     JOIN production_source_meters psm ON psm.id = pmr.production_meter_id
     LEFT JOIN customers c ON c.id = psm.customer_id
     WHERE pmr.weekly_reading_id = $1
     ORDER BY psm.meter_number ASC`,
    [weekly.id]
  );

  res.json({ weekly, readings: rowsResult.rows });
});

const updateWeeklyReading = asyncHandler(async (req, res) => {
  const { reading_date, prepaid_kwh_balance, readings = [], notes, correction_reason } = req.body;
  if (!isDateOnly(reading_date)) throw new ApiError(400, "Reading date must use YYYY-MM-DD.");
  const futureOverrideReason = assertNotFutureDate(reading_date, req, "Production reading date");
  if (!String(correction_reason || "").trim()) throw new ApiError(400, "Correction reason is required.");
  const prepaidBalance = toNumber(prepaid_kwh_balance);
  if (!Number.isFinite(prepaidBalance) || prepaidBalance < 0) {
    throw new ApiError(400, "Prepaid kWh balance cannot be negative.");
  }
  if (!Array.isArray(readings) || !readings.length) {
    throw new ApiError(400, "At least one production meter reading is required.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const weeklyResult = await client.query("SELECT * FROM production_weekly_readings WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const previousWeekly = weeklyResult.rows[0];
    if (!previousWeekly) throw new ApiError(404, "Weekly reading not found.");

    const previousRowsResult = await client.query(
      "SELECT * FROM production_meter_readings WHERE weekly_reading_id = $1 ORDER BY production_meter_id ASC",
      [previousWeekly.id]
    );
    const previousRows = previousRowsResult.rows;
    const productionMeters = await resolveProductionMeters(client, false);
    const meterMap = new Map(productionMeters.map((meter) => [Number(meter.id), meter]));
    const submittedMeterIds = readings.map((item) => Number(item.production_meter_id)).filter(Boolean);

    const updatedWeeklyResult = await client.query(
      `UPDATE production_weekly_readings
       SET reading_date = $1,
           prepaid_kwh_balance = $2,
           notes = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [reading_date, prepaidBalance, notes || null, previousWeekly.id]
    );
    const weekly = updatedWeeklyResult.rows[0];

    const deletedRowsResult = await client.query(
      `DELETE FROM production_meter_readings
       WHERE weekly_reading_id = $1
         AND NOT (production_meter_id = ANY($2::int[]))
       RETURNING production_meter_id`,
      [weekly.id, submittedMeterIds]
    );

    const savedRows = [];
    for (const item of readings) {
      const meter = meterMap.get(Number(item.production_meter_id));
      if (!meter) throw new ApiError(400, "One of the selected production meters could not be found.");
      const readingValue = toNumber(item.reading_value);
      if (!Number.isFinite(readingValue) || readingValue < 0) {
        throw new ApiError(400, `Reading for ${meter.meter_number} must be zero or greater.`);
      }
      const previous = await getPreviousProductionReading(client, meter.id, reading_date);
      const calculated = await calculateProductionReading(client, meter, reading_date, readingValue, previous?.reading_value);
      const rowResult = await client.query(
        `INSERT INTO production_meter_readings (
          weekly_reading_id, production_meter_id, reading_value, previous_reading_value,
          consumption, tariff_snapshot, revenue_amount, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        ON CONFLICT (weekly_reading_id, production_meter_id) DO UPDATE
        SET reading_value = EXCLUDED.reading_value,
            previous_reading_value = EXCLUDED.previous_reading_value,
            consumption = EXCLUDED.consumption,
            tariff_snapshot = EXCLUDED.tariff_snapshot,
            revenue_amount = EXCLUDED.revenue_amount,
            notes = EXCLUDED.notes
        RETURNING *`,
        [
          weekly.id,
          meter.id,
          readingValue,
          calculated.previousReadingValue,
          calculated.consumption,
          JSON.stringify(calculated.tariffSnapshot),
          calculated.revenueAmount,
          item.notes || null
        ]
      );
      savedRows.push({ ...rowResult.rows[0], meter_number: meter.meter_number });
    }

    const recalculateFrom =
      dateOnly(previousWeekly.reading_date) < dateOnly(reading_date) ? dateOnly(previousWeekly.reading_date) : reading_date;
    await recalculateProductionMetersForward(
      client,
      [...submittedMeterIds, ...deletedRowsResult.rows.map((row) => row.production_meter_id)],
      recalculateFrom
    );

    await recordAuditEvent(client, {
      req,
      action: "production_weekly_reading.corrected",
      entityType: "production_weekly_reading",
      entityId: weekly.id,
      beforeData: { weekly: previousWeekly, readings: previousRows },
      afterData: { weekly, readings: savedRows },
      reason: correction_reason || futureOverrideReason
    });

    await client.query("COMMIT");
    res.json({ weekly, readings: savedRows });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const deleteWeeklyReading = asyncHandler(async (req, res) => {
  const { correction_reason } = req.body;
  if (!String(correction_reason || "").trim()) throw new ApiError(400, "Rollback reason is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const weeklyResult = await client.query("SELECT * FROM production_weekly_readings WHERE id = $1 FOR UPDATE", [
      req.params.id
    ]);
    const weekly = weeklyResult.rows[0];
    if (!weekly) throw new ApiError(404, "Weekly reading not found.");

    const rowsResult = await client.query(
      "SELECT * FROM production_meter_readings WHERE weekly_reading_id = $1 ORDER BY production_meter_id ASC",
      [weekly.id]
    );
    const affectedMeterIds = rowsResult.rows.map((row) => row.production_meter_id);

    await client.query("DELETE FROM production_weekly_readings WHERE id = $1", [weekly.id]);
    await recalculateProductionMetersForward(client, affectedMeterIds, dateOnly(weekly.reading_date));

    await recordAuditEvent(client, {
      req,
      action: "production_weekly_reading.rolled_back",
      entityType: "production_weekly_reading",
      entityId: weekly.id,
      beforeData: { weekly, readings: rowsResult.rows },
      reason: correction_reason
    });

    await client.query("COMMIT");
    res.json({ message: "Weekly production reading rolled back." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

const listWeeklyReadings = asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT pwr.*,
            COUNT(pmr.id) AS meter_count,
            COALESCE(SUM(pmr.consumption), 0) AS total_consumption,
            COALESCE(SUM(pmr.revenue_amount), 0) AS total_revenue
     FROM production_weekly_readings pwr
     LEFT JOIN production_meter_readings pmr ON pmr.weekly_reading_id = pwr.id
     GROUP BY pwr.id
     ORDER BY pwr.reading_date DESC
     LIMIT 100`
  );
  res.json(rows);
});

const getProductionReport = asyncHandler(async (req, res) => {
  const to = isDateOnly(req.query.to) ? req.query.to : new Date().toISOString().slice(0, 10);
  const from = isDateOnly(req.query.from) ? req.query.from : "1900-01-01";
  const weeklyResult = await pool.query(
    `SELECT *
     FROM production_weekly_readings
     WHERE reading_date BETWEEN $1 AND $2
     ORDER BY reading_date DESC`,
    [from, to]
  );
  const weeks = [];

  for (const week of weeklyResult.rows) {
    const previousWeekResult = await pool.query(
      `SELECT *
       FROM production_weekly_readings
       WHERE reading_date < $1
       ORDER BY reading_date DESC
       LIMIT 1`,
      [week.reading_date]
    );
    const previousWeek = previousWeekResult.rows[0] || null;
    const periodStart = previousWeek?.reading_date || week.reading_date;

    const topupsResult = await pool.query(
      `SELECT COALESCE(SUM(kwh_units), 0) AS kwh_units,
              COALESCE(SUM(total_cost), 0) AS total_cost
       FROM production_electricity_topups
       WHERE topup_date > $1 AND topup_date <= $2`,
      [periodStart, week.reading_date]
    );
    const topups = topupsResult.rows[0];
    const topupUnits = toNumber(topups.kwh_units);
    const topupCost = toNumber(topups.total_cost);
    const lastTopupResult = await pool.query(
      `SELECT id, topup_date, cost_per_unit, reference
       FROM production_electricity_topups
       WHERE topup_date <= $1
       ORDER BY topup_date DESC, id DESC
       LIMIT 1`,
      [week.reading_date]
    );
    const lastTopup = lastTopupResult.rows[0] || null;
    const electricityUsed = Math.max(toNumber(previousWeek?.prepaid_kwh_balance) + topupUnits - toNumber(week.prepaid_kwh_balance), 0);
    const weightedCost = topupUnits > 0 ? topupCost / topupUnits : toNumber(lastTopup?.cost_per_unit);
    const electricityCostUsed = roundMoney(electricityUsed * weightedCost);

    const rowsResult = await pool.query(
      `SELECT pmr.*,
              psm.meter_number,
              psm.name AS meter_name,
              psm.meter_type,
              c.name AS customer_name,
              c.acc_number
       FROM production_meter_readings pmr
       JOIN production_source_meters psm ON psm.id = pmr.production_meter_id
       LEFT JOIN customers c ON c.id = psm.customer_id
       WHERE pmr.weekly_reading_id = $1
       ORDER BY psm.meter_number ASC`,
      [week.id]
    );
    const totalConsumption = rowsResult.rows.reduce((sum, row) => sum + toNumber(row.consumption), 0);
    const totalRevenue = rowsResult.rows.reduce((sum, row) => sum + toNumber(row.revenue_amount), 0);

    weeks.push({
      ...week,
      period_start: periodStart,
      previous_prepaid_kwh_balance: previousWeek?.prepaid_kwh_balance ?? null,
      topup_kwh_units: topupUnits,
      topup_total_cost: topupCost,
      electricity_cost_per_unit: roundMoney(weightedCost),
      electricity_cost_source: topupUnits > 0 ? "period_topups" : lastTopup ? "last_topup" : "none",
      electricity_cost_source_topup_id: topupUnits > 0 ? null : lastTopup?.id || null,
      electricity_cost_source_date: topupUnits > 0 ? null : lastTopup?.topup_date || null,
      electricity_cost_source_reference: topupUnits > 0 ? null : lastTopup?.reference || null,
      electricity_used: electricityUsed,
      electricity_cost_used: electricityCostUsed,
      total_consumption: totalConsumption,
      total_revenue: totalRevenue,
      cost_of_production_ratio: totalRevenue > 0 ? electricityCostUsed / totalRevenue : 0,
      cost_per_water_unit: totalConsumption > 0 ? electricityCostUsed / totalConsumption : 0,
      rows: rowsResult.rows
    });
  }

  res.json({ from, to, weeks });
});

module.exports = {
  createElectricityTopup,
  createProductionMeter,
  createWeeklyReading,
  deleteWeeklyReading,
  getProductionReadingContext,
  getProductionReport,
  getWeeklyReading,
  listElectricityTopups,
  listProductionMeters,
  listWeeklyReadings,
  replaceProductionMeter,
  updateWeeklyReading
};
