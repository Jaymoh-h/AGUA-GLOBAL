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

describe("mid-period meter replacement billing", { skip: !shouldRun }, () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("combines old and new meter usage into one invoice with one fixed charge and VAT amount", async (t) => {
    const suffix = `${process.pid}-${Date.now()}`;
    const replacementDate = "2098-06-15";
    const newMeterReadingDate = "2098-06-30";
    const periodStart = "2098-06-01";
    const artifacts = {
      billIds: [],
      customerId: null,
      meterIds: [],
      meterEventIds: [],
      periodId: null,
      rateId: null,
      readingIds: []
    };
    const periodExists = await pool.query("SELECT id FROM billing_periods WHERE period_start = $1", [periodStart]);
    const createdPeriod = periodExists.rows.length === 0;

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (artifacts.billIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'bill' AND entity_id = ANY($1::int[])", [artifacts.billIds]);
          await client.query("DELETE FROM bills WHERE id = ANY($1::int[])", [artifacts.billIds]);
        }
        if (artifacts.readingIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'meter_reading' AND entity_id = ANY($1::int[])", [artifacts.readingIds]);
          await client.query("DELETE FROM meter_readings WHERE id = ANY($1::int[])", [artifacts.readingIds]);
        }
        if (artifacts.meterEventIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'meter_event' AND entity_id = ANY($1::int[])", [artifacts.meterEventIds]);
          await client.query("DELETE FROM meter_events WHERE id = ANY($1::int[])", [artifacts.meterEventIds]);
        }
        if (artifacts.meterIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'meter' AND entity_id = ANY($1::int[])", [artifacts.meterIds]);
          await client.query("DELETE FROM meters WHERE id = ANY($1::int[])", [artifacts.meterIds]);
        }
        if (artifacts.customerId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'customer' AND entity_id = $1", [artifacts.customerId]);
          await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        }
        if (artifacts.rateId) await client.query("DELETE FROM rates WHERE id = $1", [artifacts.rateId]);
        if (createdPeriod && artifacts.periodId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'billing_period' AND entity_id = $1", [artifacts.periodId]);
          await client.query("DELETE FROM billing_periods WHERE id = $1", [artifacts.periodId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const session = await login();
    const zone = await pool.query("SELECT id FROM zones ORDER BY id LIMIT 1");
    assert.ok(zone.rows[0], "test database requires a zone");

    const rate = await pool.query(
      `INSERT INTO rates (
        name, amount, tariff_type, fixed_charge_amount, vat_enabled, vat_rate, is_active, effective_from
      )
       VALUES ($1, 0, 'block', 100, TRUE, 16, TRUE, '1900-01-01')
       RETURNING id`,
      [`Replacement regression tariff ${suffix}`]
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
      [artifacts.rateId, zone.rows[0].id, `Replacement billing ${suffix}`, `SMOKE-RPL-${suffix}`]
    );
    artifacts.customerId = customer.rows[0].id;
    const oldMeter = await pool.query(
      `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
       VALUES ($1, $2, 'client_billing', '2098-05-01', 100, 'active')
       RETURNING id`,
      [artifacts.customerId, `SMOKE-RPL-OLD-${suffix}`]
    );
    artifacts.meterIds.push(oldMeter.rows[0].id);
    const baseline = await pool.query(
      `INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes)
       VALUES ($1, $2, 100, '2098-05-31', 'admin', 'Replacement billing regression baseline')
       RETURNING id`,
      [artifacts.customerId, oldMeter.rows[0].id]
    );
    artifacts.readingIds.push(baseline.rows[0].id);

    const replacement = await request("/api/meters/replace", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        old_meter_id: oldMeter.rows[0].id,
        old_final_reading: 130,
        new_meter_number: `SMOKE-RPL-NEW-${suffix}`,
        new_initial_reading: 500,
        event_date: replacementDate,
        reason: "Automated mid-period replacement billing coverage",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(replacement.response.status, 201, replacement.data.message || "meter replacement failed");
    artifacts.meterIds.push(replacement.data.newMeter.id);
    artifacts.meterEventIds.push(replacement.data.event.id);
    artifacts.readingIds.push(replacement.data.finalReading.id, replacement.data.newBaselineReading.id);
    artifacts.periodId = replacement.data.finalReading.billing_period_id;
    if (replacement.data.bill?.id) artifacts.billIds.push(replacement.data.bill.id);

    const newMeterReading = await request("/api/readings", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        meter_id: replacement.data.newMeter.id,
        reading_value: 555,
        reading_date: newMeterReadingDate,
        notes: "Automated mid-period replacement billing coverage",
        future_date_override_reason: "Automated isolated regression fixture"
      }
    });
    assert.equal(newMeterReading.response.status, 201, newMeterReading.data.message || "new meter reading failed");
    artifacts.readingIds.push(newMeterReading.data.reading.id);
    if (newMeterReading.data.bill?.id) artifacts.billIds.push(newMeterReading.data.bill.id);

    const bills = await pool.query(
      `SELECT id, units_used, subtotal_amount, fixed_charge_amount, vat_amount, total_amount
       FROM bills
       WHERE customer_id = $1 AND billing_period_id = $2
       ORDER BY id`,
      [artifacts.customerId, artifacts.periodId]
    );
    artifacts.billIds = bills.rows.map((bill) => bill.id);

    assert.equal(bills.rows.length, 1, "a mid-period replacement must produce one monthly invoice, not one bill per meter");
    const [bill] = bills.rows;
    assert.equal(Number(bill.units_used), 85, "old and new meter consumption must be combined");
    assert.equal(Number(bill.subtotal_amount), 1200, "block tariff tiers must apply across the combined 85 units");
    assert.equal(Number(bill.fixed_charge_amount), 100, "the monthly fixed charge must be applied once");
    assert.equal(Number(bill.vat_amount), 208, "VAT must be calculated once from the combined charge");
    assert.equal(Number(bill.total_amount), 1508, "the invoice total must represent the combined monthly consumption");
  });
});
