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

describe("communication invoice period summaries", { skip: !shouldRun }, () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("aggregates a meter bill and service charge for the latest bill's period in invoice template values", async (t) => {
    const suffix = `${process.pid}-${Date.now()}`;
    const artifacts = { billIds: [], customerId: null, meterIds: [], readingIds: [], chargeId: null, rateId: null, periodId: null };

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (artifacts.chargeId) await client.query("UPDATE bills SET service_charge_id = NULL WHERE service_charge_id = $1", [artifacts.chargeId]);
        if (artifacts.chargeId) await client.query("DELETE FROM customer_service_charges WHERE id = $1", [artifacts.chargeId]);
        if (artifacts.billIds.length) await client.query("DELETE FROM bills WHERE id = ANY($1::int[])", [artifacts.billIds]);
        if (artifacts.readingIds.length) await client.query("DELETE FROM meter_readings WHERE id = ANY($1::int[])", [artifacts.readingIds]);
        if (artifacts.meterIds.length) await client.query("DELETE FROM meters WHERE id = ANY($1::int[])", [artifacts.meterIds]);
        if (artifacts.customerId) await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        if (artifacts.rateId) await client.query("DELETE FROM rates WHERE id = $1", [artifacts.rateId]);
        if (artifacts.periodId) await client.query("DELETE FROM billing_periods WHERE id = $1", [artifacts.periodId]);
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
      "INSERT INTO rates (name, amount, is_active, effective_from) VALUES ($1, 10, TRUE, '1900-01-01') RETURNING id",
      [`Communication period rate ${suffix}`]
    );
    artifacts.rateId = rate.rows[0].id;
    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, email, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, $5, 10, 'active') RETURNING id`,
      [artifacts.rateId, zone.rows[0].id, `Communication period ${suffix}`, `communication-${suffix}@example.test`, `COMMS-${suffix}`]
    );
    artifacts.customerId = customer.rows[0].id;
    const period = await pool.query(
      `INSERT INTO billing_periods (name, period_start, period_end, closing_date, bill_date, due_date, status)
       VALUES ($1, '2098-07-01', '2098-07-31', '2098-07-31', '2098-07-31', '2098-08-15', 'open') RETURNING id`,
      [`Communication period ${suffix}`]
    );
    artifacts.periodId = period.rows[0].id;

    const [oldMeter, newMeter] = await Promise.all([
      pool.query(
        `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
         VALUES ($1, $2, 'client_billing', '2098-06-01', 100, 'replaced') RETURNING id`,
        [artifacts.customerId, `COMMS-OLD-${suffix}`]
      ),
      pool.query(
        `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
         VALUES ($1, $2, 'client_billing', '2098-07-15', 500, 'active') RETURNING id`,
        [artifacts.customerId, `COMMS-NEW-${suffix}`]
      )
    ]);
    artifacts.meterIds.push(oldMeter.rows[0].id, newMeter.rows[0].id);
    const readings = await pool.query(
      `INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, billing_period_id)
       VALUES
         ($1, $2, 100, '2098-06-30', 'admin', NULL),
         ($1, $2, 130, '2098-07-15', 'admin', $4),
         ($1, $3, 500, '2098-07-15', 'admin', $4),
         ($1, $3, 555, '2098-07-31', 'admin', $4)
       RETURNING id, meter_id, reading_value`,
      [artifacts.customerId, oldMeter.rows[0].id, newMeter.rows[0].id, artifacts.periodId]
    );
    artifacts.readingIds.push(...readings.rows.map((reading) => reading.id));
    const [oldBaseline, oldFinal, newBaseline, newFinal] = readings.rows;

    const meterBill = await pool.query(
      `INSERT INTO bills (
         customer_id, billing_period_id, bill_number, previous_reading_id, current_reading_id, billing_month,
         previous_reading, current_reading, units_used, rate, amount, subtotal_amount, total_amount,
         balance_amount, due_date, issued_at, billing_meter_id, bill_pay_status, bill_origin, tariff_snapshot
       ) VALUES ($1, $2, $3, $4, $5, '2098-07-01', 100, 555, 85, 10, 1200, 1200, 1200, 1200,
         '2098-08-15', '2098-07-31', $6, 'payable', 'meter_reading', $7::jsonb)
       RETURNING id`,
      [
        artifacts.customerId,
        artifacts.periodId,
        `COMMS-METER-${suffix}`,
        oldBaseline.id,
        oldFinal.id,
        oldMeter.rows[0].id,
        JSON.stringify({ meter_segments: [{ segment_type: "replacement_old", units_used: 30 }, { segment_type: "replacement_new", units_used: 55 }] })
      ]
    );
    artifacts.billIds.push(meterBill.rows[0].id);
    await pool.query(
      `INSERT INTO bill_meter_segments (
         bill_id, meter_id, previous_reading_id, current_reading_id, previous_reading, current_reading, units_used, segment_type
       ) VALUES
         ($1, $2, $3, $4, 100, 130, 30, 'replacement_old'),
         ($1, $5, $6, $7, 500, 555, 55, 'replacement_new')`,
      [meterBill.rows[0].id, oldMeter.rows[0].id, oldBaseline.id, oldFinal.id, newMeter.rows[0].id, newBaseline.id, newFinal.id]
    );

    const charge = await pool.query(
      `INSERT INTO customer_service_charges (
         customer_id, charge_number, charge_type, description, amount, status, charge_date, due_date
       ) VALUES ($1, $2, 'service_charge', 'Meter testing service', 250, 'payable', '2098-07-28', '2098-08-15') RETURNING id`,
      [artifacts.customerId, `COMMS-CHARGE-${suffix}`]
    );
    artifacts.chargeId = charge.rows[0].id;
    const chargeBill = await pool.query(
      `INSERT INTO bills (
         customer_id, billing_period_id, bill_number, billing_month, previous_reading, current_reading, units_used,
         rate, amount, subtotal_amount, total_amount, balance_amount, due_date, issued_at,
         bill_pay_status, bill_origin, service_charge_id
       ) VALUES ($1, $2, $3, '2098-07-01', 0, 0, 0, 0, 250, 250, 250, 250, '2098-08-15',
         '2098-07-31 12:00:00+00', 'payable', 'service_charge', $4) RETURNING id`,
      [artifacts.customerId, artifacts.periodId, `COMMS-SERVICE-${suffix}`, artifacts.chargeId]
    );
    artifacts.billIds.push(chargeBill.rows[0].id);
    await pool.query("UPDATE customer_service_charges SET bill_id = $1 WHERE id = $2", [chargeBill.rows[0].id, artifacts.chargeId]);

    const preview = await request("/api/communications/invoice-preview", { session });
    assert.equal(preview.response.status, 200, preview.data.message || "invoice preview failed");
    const row = preview.data.rows.find((candidate) => candidate.customer_id === artifacts.customerId);
    assert.ok(row, "invoice preview must include the customer with payable charges");

    assert.equal(row.template_values.meter_consumption, "");
    assert.equal(row.template_values.old_meter_consumption, "Old meter consumption: 30 units.");
    assert.equal(row.template_values.new_meter_consumption, "New meter consumption: 55 units.");
    assert.equal(row.template_values.additional_charges, "Additional charges: Meter testing service (KES 250).");
    assert.equal(row.template_values.period_charges, "KES 1,450");
    assert.match(row.message, /KES 1,450/, "the rendered default message must state the total charges for the invoice period");
  });
});
