const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

if (shouldRun) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-change-me";
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  process.env.AUTH_RATE_LIMIT_MAX = "1000";
}

const app = shouldRun ? require("../src/app") : null;
const pool = shouldRun ? require("../src/db/pool") : null;
let server;
let baseUrl;

const request = async (path, { session, method = "GET", body } = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(session?.cookie ? { Cookie: session.cookie } : {})
  };
  if (session?.csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = session.csrfToken;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookies = response.headers.getSetCookie?.() || [response.headers.get("set-cookie")].filter(Boolean);
  if (session) session.cookie = setCookies.map((cookie) => cookie.split(";")[0]).join("; ") || session.cookie;
  const data = await response.json().catch(() => ({}));
  if (session && data.csrf_token) session.csrfToken = data.csrf_token;
  return { response, data };
};

const login = async () => {
  const session = {};
  const result = await request("/api/auth/login", {
    session,
    method: "POST",
    body: {
      email: process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
      password: process.env.TEST_ADMIN_PASSWORD || "Admin@123"
    }
  });
  assert.equal(result.response.status, 200, result.data.message || "admin login failed");
  if (result.data.requires_context_selection) {
    const selected = await request("/api/auth/select-context", {
      session,
      method: "POST",
      body: {
        context_selection_token: result.data.context_selection_token,
        access_profile_id: result.data.contexts[0].id
      }
    });
    assert.equal(selected.response.status, 200, selected.data.message || "admin context selection failed");
  }
  return session;
};

const cleanupCustomerArtifacts = async ({ customerId, rateId, periodId, createdPeriod }) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const meterIds = (
      await client.query("SELECT id FROM meters WHERE customer_id = $1", [customerId])
    ).rows.map((row) => row.id);
    const productionMeterIds = (
      await client.query("SELECT id FROM production_source_meters WHERE customer_id = $1", [customerId])
    ).rows.map((row) => row.id);
    const readingIds = meterIds.length
      ? (await client.query("SELECT id FROM meter_readings WHERE meter_id = ANY($1::int[])", [meterIds])).rows.map((row) => row.id)
      : [];
    const billIds = (
      await client.query("SELECT id FROM bills WHERE customer_id = $1", [customerId])
    ).rows.map((row) => row.id);
    const sourceRequestIds = (
      await client.query("SELECT id FROM source_billing_requests WHERE customer_id = $1", [customerId])
    ).rows.map((row) => row.id);
    const productionEventIds = productionMeterIds.length
      ? (
          await client.query(
            `SELECT id
             FROM production_meter_events
             WHERE old_production_meter_id = ANY($1::int[])
                OR new_production_meter_id = ANY($1::int[])`,
            [productionMeterIds]
          )
        ).rows.map((row) => row.id)
      : [];
    const weeklyIds = productionMeterIds.length
      ? (
          await client.query(
            "SELECT DISTINCT weekly_reading_id FROM production_meter_readings WHERE production_meter_id = ANY($1::int[])",
            [productionMeterIds]
          )
        ).rows.map((row) => row.weekly_reading_id)
      : [];

    await client.query(
      `DELETE FROM audit_events
       WHERE (entity_type = 'customer' AND entity_id = $1)
          OR (entity_type = 'meter' AND entity_id = ANY($2::int[]))
          OR (entity_type = 'meter_reading' AND entity_id = ANY($3::int[]))
          OR (entity_type = 'meter_event' AND entity_id IN (
            SELECT id FROM meter_events WHERE customer_id = $1
          ))
          OR (entity_type = 'production_source_meter' AND entity_id = ANY($4::int[]))
          OR (entity_type = 'production_meter_event' AND entity_id = ANY($5::int[]))
          OR (entity_type = 'production_weekly_reading' AND entity_id = ANY($6::int[]))
          OR (entity_type = 'source_billing_request' AND entity_id = ANY($7::int[]))
          OR (entity_type = 'bill' AND entity_id = ANY($8::int[]))
          OR (entity_type = 'billing_period' AND entity_id = $9)`,
      [
        customerId,
        meterIds,
        readingIds,
        productionMeterIds,
        productionEventIds,
        weeklyIds,
        sourceRequestIds,
        billIds,
        createdPeriod ? periodId || 0 : 0
      ]
    );

    if (sourceRequestIds.length) {
      await client.query("DELETE FROM source_billing_requests WHERE id = ANY($1::int[])", [sourceRequestIds]);
    }
    if (billIds.length) await client.query("DELETE FROM bills WHERE id = ANY($1::int[])", [billIds]);
    if (productionEventIds.length) {
      await client.query("DELETE FROM production_meter_events WHERE id = ANY($1::int[])", [productionEventIds]);
    }
    if (weeklyIds.length) {
      await client.query("DELETE FROM production_weekly_readings WHERE id = ANY($1::int[])", [weeklyIds]);
    }
    if (productionMeterIds.length) {
      await client.query("DELETE FROM production_source_meters WHERE id = ANY($1::int[])", [productionMeterIds]);
    }
    if (readingIds.length) await client.query("DELETE FROM meter_readings WHERE id = ANY($1::int[])", [readingIds]);
    await client.query("DELETE FROM meter_events WHERE customer_id = $1", [customerId]);
    if (meterIds.length) await client.query("DELETE FROM meters WHERE id = ANY($1::int[])", [meterIds]);
    await client.query("DELETE FROM customers WHERE id = $1", [customerId]);
    if (rateId) {
      await client.query("DELETE FROM tariff_blocks WHERE rate_id = $1", [rateId]);
      await client.query("DELETE FROM rates WHERE id = $1", [rateId]);
    }
    if (createdPeriod && periodId) await client.query("DELETE FROM billing_periods WHERE id = $1", [periodId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

describe("unified customer source-meter replacement", { skip: !shouldRun }, () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("replaces the linked production meter, preserves history, starts from the new baseline, and retains both bill segments", async (t) => {
    const suffix = `${process.pid}-${Date.now()}`;
    const replacementDate = "2098-08-15";
    const periodStart = "2098-08-01";
    const artifacts = { customerId: null, rateId: null, periodId: null, createdPeriod: false };

    t.after(async () => {
      if (artifacts.customerId) await cleanupCustomerArtifacts(artifacts);
    });

    const session = await login();
    const zone = await pool.query("SELECT id FROM zones ORDER BY id LIMIT 1");
    assert.ok(zone.rows[0], "test database requires a zone");
    const existingPeriod = await pool.query("SELECT id FROM billing_periods WHERE period_start = $1", [periodStart]);
    artifacts.createdPeriod = existingPeriod.rows.length === 0;

    const rate = await pool.query(
      `INSERT INTO rates (name, amount, tariff_type, fixed_charge_amount, vat_enabled, vat_rate, is_active, effective_from)
       VALUES ($1, 0, 'block', 100, TRUE, 16, TRUE, '1900-01-01')
       RETURNING id`,
      [`Unified source replacement rate ${suffix}`]
    );
    artifacts.rateId = rate.rows[0].id;
    await pool.query(
      `INSERT INTO tariff_blocks (rate_id, min_units, max_units, unit_rate, sort_order)
       VALUES ($1, 0, 50, 10, 1), ($1, 50, NULL, 20, 2)`,
      [artifacts.rateId]
    );
    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, 0, 'active')
       RETURNING id`,
      [artifacts.rateId, zone.rows[0].id, `Unified source replacement ${suffix}`, `USR-${suffix}`]
    );
    artifacts.customerId = customer.rows[0].id;

    const sourceMeter = await pool.query(
      `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
       VALUES ($1, $2, 'source_backup', '2098-08-01', 100, 'active')
       RETURNING *`,
      [artifacts.customerId, `USR-SOURCE-OLD-${suffix}`]
    );
    const sourceBaseline = await pool.query(
      `INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes)
       VALUES ($1, $2, 100, '2098-08-01', 'admin', 'Unified source replacement baseline')
       RETURNING id`,
      [artifacts.customerId, sourceMeter.rows[0].id]
    );
    assert.ok(sourceBaseline.rows[0].id);
    const productionMeter = await pool.query(
      `INSERT INTO production_source_meters (
         zone_id, customer_id, meter_id, meter_number, name, meter_type, installed_at, initial_reading, status
       ) VALUES ($1, $2, $3, $4, $5, 'customer_source', '2098-08-01', 100, 'active')
       RETURNING *`,
      [
        zone.rows[0].id,
        artifacts.customerId,
        sourceMeter.rows[0].id,
        `USR-PROD-OLD-${suffix}`,
        "Customer source production meter"
      ]
    );

    const oldWeekly = await request("/api/production/weekly-readings", {
      session,
      method: "POST",
      body: {
        reading_date: "2098-08-08",
        prepaid_kwh_balance: 0,
        readings: [{ production_meter_id: productionMeter.rows[0].id, reading_value: 125 }],
        notes: "Unified source replacement old-meter history",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(oldWeekly.response.status, 201, oldWeekly.data.message || "old production reading failed");
    assert.equal(Number(oldWeekly.data.readings[0].consumption), 25);

    const sourceReplacement = await request("/api/meters/replace", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        old_meter_id: sourceMeter.rows[0].id,
        old_final_reading: 140,
        new_meter_number: `USR-SOURCE-NEW-${suffix}`,
        new_initial_reading: 1000,
        event_date: replacementDate,
        reason: "Automated unified source replacement coverage",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(sourceReplacement.response.status, 201, sourceReplacement.data.message || "source meter replacement failed");
    artifacts.periodId = sourceReplacement.data.finalReading.billing_period_id;

    const productionRows = await pool.query(
      `SELECT *
       FROM production_source_meters
       WHERE customer_id = $1
       ORDER BY id`,
      [artifacts.customerId]
    );
    const retiredProductionMeter = productionRows.rows.find((row) => row.id === productionMeter.rows[0].id);
    const successorProductionMeter = productionRows.rows.find(
      (row) => row.meter_id === sourceReplacement.data.newMeter.id && row.id !== productionMeter.rows[0].id
    );

    const newWeekly = await request("/api/production/weekly-readings", {
      session,
      method: "POST",
      body: {
        reading_date: "2098-08-22",
        prepaid_kwh_balance: 0,
        readings: [
          {
            production_meter_id: successorProductionMeter?.id || productionMeter.rows[0].id,
            reading_value: 1025
          }
        ],
        notes: "Unified source replacement successor baseline",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(newWeekly.response.status, 201, newWeekly.data.message || "new production reading failed");

    const billingMeter = await pool.query(
      `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
       VALUES ($1, $2, 'client_billing', '2098-07-01', 100, 'active')
       RETURNING *`,
      [artifacts.customerId, `USR-BILL-OLD-${suffix}`]
    );
    await pool.query(
      `INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes)
       VALUES ($1, $2, 100, '2098-07-31', 'admin', 'Unified billing replacement baseline')`,
      [artifacts.customerId, billingMeter.rows[0].id]
    );
    const billingReplacement = await request("/api/meters/replace", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        old_meter_id: billingMeter.rows[0].id,
        old_final_reading: 130,
        new_meter_number: `USR-BILL-NEW-${suffix}`,
        new_initial_reading: 500,
        event_date: replacementDate,
        reason: "Automated bill-segment regression coverage",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(billingReplacement.response.status, 201, billingReplacement.data.message || "billing meter replacement failed");
    const billingReading = await request("/api/readings", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        meter_id: billingReplacement.data.newMeter.id,
        reading_value: 555,
        reading_date: "2098-08-31",
        notes: "Unified billing replacement successor reading",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(billingReading.response.status, 201, billingReading.data.message || "billing successor reading failed");

    assert.equal(retiredProductionMeter?.status, "replaced", "the prior production meter must be retired");
    assert.equal(retiredProductionMeter?.removed_at?.slice(0, 10), replacementDate);
    assert.ok(successorProductionMeter, "a successor production meter must be created for the new source meter");
    assert.equal(successorProductionMeter?.status, "active");
    assert.equal(successorProductionMeter?.meter_id, sourceReplacement.data.newMeter.id);
    assert.equal(Number(successorProductionMeter?.initial_reading), 1000);

    const productionEvent = await pool.query(
      `SELECT *
       FROM production_meter_events
       WHERE old_production_meter_id = $1
         AND new_production_meter_id = $2
         AND event_type = 'replacement'`,
      [productionMeter.rows[0].id, successorProductionMeter?.id || 0]
    );
    assert.equal(productionEvent.rows.length, 1, "the linked production replacement must be recorded");
    assert.equal(Number(productionEvent.rows[0]?.old_final_reading), 140);
    assert.equal(Number(productionEvent.rows[0]?.new_initial_reading), 1000);
    assert.equal(Number(productionEvent.rows[0]?.old_consumption), 15, "the replacement event must retain old-meter consumption");

    const oldProductionHistory = await pool.query(
      "SELECT reading_value, consumption FROM production_meter_readings WHERE production_meter_id = $1",
      [productionMeter.rows[0].id]
    );
    assert.ok(
      oldProductionHistory.rows.some(
        (row) => Number(row.reading_value) === 125 && Number(row.consumption) === 25
      ),
      "old production readings must stay with the retired meter"
    );
    const newProductionReading = newWeekly.data.readings.find(
      (row) => row.production_meter_id === successorProductionMeter?.id
    );
    assert.equal(Number(newProductionReading?.previous_reading_value), 1000, "the successor must begin at its new baseline");
    assert.equal(Number(newProductionReading?.consumption), 25, "the successor must not inherit the old meter reading");

    const weeklyHistory = await request("/api/production/weekly-readings", { session });
    assert.equal(weeklyHistory.response.status, 200, weeklyHistory.data.message || "weekly history failed");
    const replacementWeek = weeklyHistory.data.find((week) => week.reading_date?.slice(0, 10) === "2098-08-22");
    assert.equal(Number(replacementWeek?.total_consumption), 40, "weekly history must include both replacement segments");

    const productionReport = await request("/api/production/report?from=2098-08-08&to=2098-08-22", { session });
    assert.equal(productionReport.response.status, 200, productionReport.data.message || "production report failed");
    const replacementReportWeek = productionReport.data.weeks.find((week) => week.reading_date?.slice(0, 10) === "2098-08-22");
    assert.equal(Number(replacementReportWeek?.total_consumption), 40, "production report must include both replacement segments");
    assert.ok(
      replacementReportWeek?.rows.some(
        (row) => row.is_replacement_segment && Number(row.production_meter_id) === productionMeter.rows[0].id && Number(row.consumption) === 15
      ),
      "the report must identify the old-meter final segment"
    );

    const bills = await pool.query(
      `SELECT id, units_used, subtotal_amount, fixed_charge_amount, vat_amount, total_amount
       FROM bills
       WHERE customer_id = $1
         AND billing_period_id = $2
         AND billing_meter_id = $3`,
      [artifacts.customerId, artifacts.periodId, billingMeter.rows[0].id]
    );
    assert.equal(bills.rows.length, 1, "the billing meter replacement must keep one invoice for the period");
    const [bill] = bills.rows;
    assert.equal(Number(bill.units_used), 85);
    assert.equal(Number(bill.subtotal_amount), 1200);
    assert.equal(Number(bill.fixed_charge_amount), 100, "fixed charge must be applied once");
    assert.equal(Number(bill.vat_amount), 208, "VAT must be calculated once from combined usage");
    assert.equal(Number(bill.total_amount), 1508);
    const segments = await pool.query(
      `SELECT meter_id, units_used, segment_type
       FROM bill_meter_segments
       WHERE bill_id = $1
       ORDER BY segment_type`,
      [bill.id]
    );
    assert.deepEqual(
      segments.rows.map((segment) => ({
        meter_id: segment.meter_id,
        units_used: Number(segment.units_used),
        segment_type: segment.segment_type
      })),
      [
        { meter_id: billingMeter.rows[0].id, units_used: 30, segment_type: "replacement_old" },
        { meter_id: billingReplacement.data.newMeter.id, units_used: 55, segment_type: "replacement_new" }
      ]
    );
  });
});
