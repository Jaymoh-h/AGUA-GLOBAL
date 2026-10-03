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
  const headers = { "Content-Type": "application/json", ...(session?.cookie ? { Cookie: session.cookie } : {}) };
  if (session?.csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = session.csrfToken;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
      body: { context_selection_token: result.data.context_selection_token, access_profile_id: result.data.contexts[0].id }
    });
    assert.equal(selected.response.status, 200, selected.data.message || "admin context selection failed");
  }
  return session;
};

describe("cross-account payment allocation", { skip: !shouldRun }, () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("records one receipt and applies its reviewed shares to separate customer accounts", async (t) => {
    const session = await login();
    const payable = await pool.query(
      `SELECT DISTINCT ON (b.customer_id)
          b.id AS bill_id, b.customer_id, b.paid_amount, b.balance_amount, b.status, c.acc_number
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.status <> 'paid' AND b.bill_pay_status = 'payable'
         AND COALESCE(NULLIF(b.balance_amount, 0), b.amount - b.paid_amount) >= 20
       ORDER BY b.customer_id ASC, b.id ASC
       LIMIT 2`
    );
    assert.equal(payable.rows.length, 2, "test database requires two payable bills with at least KES 20 each");
    const [first, second] = payable.rows;
    const idempotencyKey = `cross-account-${Date.now()}-allocation-test`;
    let paymentId = null;

    t.after(async () => {
      if (!paymentId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE bills SET paid_amount = $1, balance_amount = $2, status = $3 WHERE id = $4", [first.paid_amount, first.balance_amount, first.status, first.bill_id]);
        await client.query("UPDATE bills SET paid_amount = $1, balance_amount = $2, status = $3 WHERE id = $4", [second.paid_amount, second.balance_amount, second.status, second.bill_id]);
        await client.query("DELETE FROM audit_events WHERE entity_type = 'payment' AND entity_id = $1", [paymentId]);
        await client.query("DELETE FROM payments WHERE id = $1", [paymentId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const payload = {
      customer_id: first.customer_id,
      amount: 40,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_channel: "cash",
      received_from: "Cross-account smoke payment",
      notes: "Automated cross-account allocation coverage.",
      idempotency_key: idempotencyKey,
      allocation_plan: [
        { customer_id: first.customer_id, amount: 20 },
        { customer_id: second.customer_id, amount: 20 }
      ]
    };
    const created = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(created.response.status, 201, created.data.message || "cross-account payment failed");
    paymentId = created.data.payment.id;
    assert.equal(created.data.payment.allocation_mode, "cross_account");
    assert.equal(created.data.allocations.length, 2);
    assert.equal(Number(created.data.payment.total_allocated_amount), 40);
    assert.equal(Number(created.data.payment.unallocated_amount), 0);

    const receipt = await request(`/api/payments/${paymentId}`, { session });
    assert.equal(receipt.response.status, 200, receipt.data.message || "cross-account receipt lookup failed");
    assert.deepEqual(
      new Set(receipt.data.allocations.map((allocation) => allocation.allocation_acc_number)),
      new Set([first.acc_number, second.acc_number])
    );

    const replay = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(replay.response.status, 200, replay.data.message || "idempotent replay failed");
    assert.equal(replay.data.idempotent_replay, true);
  });
});
