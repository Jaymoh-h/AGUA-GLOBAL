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

const login = async (
  email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
  password = process.env.TEST_ADMIN_PASSWORD || "Admin@123"
) => {
  const session = {};
  const result = await request("/api/auth/login", {
    session,
    method: "POST",
    body: {
      email,
      password
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
    const originalBills = await pool.query(
      "SELECT id, customer_id, paid_amount, balance_amount, status FROM bills WHERE customer_id = ANY($1::int[])",
      [[first.customer_id, second.customer_id]]
    );
    const originalStatements = [];
    const originalOverviews = [];
    const originalOpenings = [];
    const paymentDate = new Date().toISOString().slice(0, 10);
    const followingDay = new Date(`${paymentDate}T00:00:00Z`);
    followingDay.setUTCDate(followingDay.getUTCDate() + 1);
    const statementStart = followingDay.toISOString().slice(0, 10);
    for (const account of [first, second]) {
      originalStatements.push((await request(`/api/customers/${account.customer_id}/statement`, { session })).data);
      originalOverviews.push((await request(`/api/customers/${account.customer_id}/overview`, { session })).data);
      originalOpenings.push((await request(`/api/customers/${account.customer_id}/statement?start_date=${statementStart}`, { session })).data);
    }
    const originalSummary = await request("/api/reports/summary", { session });
    assert.equal(originalSummary.response.status, 200);
    const idempotencyKey = `cross-account-${Date.now()}-allocation-test`;
    let paymentId = null;
    const paymentIds = [];
    const addedPortalLinks = [];

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const bill of originalBills.rows) {
          await client.query("UPDATE bills SET paid_amount = $1, balance_amount = $2, status = $3 WHERE id = $4", [bill.paid_amount, bill.balance_amount, bill.status, bill.id]);
        }
        await client.query("DELETE FROM audit_events WHERE entity_type = 'payment' AND entity_id = ANY($1::int[])", [paymentIds]);
        await client.query("DELETE FROM payments WHERE id = ANY($1::int[])", [paymentIds]);
        for (const link of addedPortalLinks) {
          await client.query("DELETE FROM portal_user_customers WHERE user_id = $1 AND customer_id = $2", [link.user_id, link.customer_id]);
        }
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
      amount: 45,
      payment_date: paymentDate,
      payment_channel: "cash",
      received_from: "Cross-account smoke payment",
      notes: "Automated cross-account allocation coverage.",
      idempotency_key: idempotencyKey,
      allocation_plan: [
        { customer_id: first.customer_id, amount: 20 },
        { customer_id: second.customer_id, amount: 20 }
      ]
    };
    const invalidShare = originalBills.rows
      .filter((bill) => bill.customer_id === second.customer_id)
      .reduce((sum, bill) => sum + Math.max(Number(bill.balance_amount), 0), 100000);
    const failedKey = `${idempotencyKey}-invalid-share`;
    const failedSplit = await request("/api/payments", {
      session, method: "POST", body: {
        ...payload,
        idempotency_key: failedKey,
        amount: 20 + invalidShare,
        allocation_plan: [{ customer_id: first.customer_id, amount: 20 }, { customer_id: second.customer_id, amount: invalidShare }]
      }
    });
    if (failedSplit.data.payment?.id) paymentIds.push(failedSplit.data.payment.id);
    assert.equal(failedSplit.response.status, 400, "an excessive second share must reject the entire split");
    assert.match(failedSplit.data.message, /split allocation exceeds/i);
    const unchangedBills = await pool.query(
      "SELECT id, customer_id, paid_amount, balance_amount, status FROM bills WHERE customer_id = ANY($1::int[]) ORDER BY id",
      [[first.customer_id, second.customer_id]]
    );
    assert.deepEqual(unchangedBills.rows, [...originalBills.rows].sort((left, right) => left.id - right.id), "no account may be charged by a partially failed split");
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM payments WHERE idempotency_key = $1", [failedKey])).rows[0].count), 0);
    const created = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(created.response.status, 201, created.data.message || "cross-account payment failed");
    paymentId = created.data.payment.id;
    paymentIds.push(paymentId);
    assert.equal(created.data.payment.allocation_mode, "cross_account");
    assert.ok(created.data.allocations.length >= 2);
    assert.equal(Number(created.data.payment.total_allocated_amount), 40);
    assert.equal(Number(created.data.payment.unallocated_amount), 5);

    const receipt = await request(`/api/payments/${paymentId}`, { session });
    assert.equal(receipt.response.status, 200, receipt.data.message || "cross-account receipt lookup failed");
    assert.deepEqual(
      new Set(receipt.data.allocations.map((allocation) => allocation.allocation_acc_number)),
      new Set([first.acc_number, second.acc_number])
    );
    const recipientSearch = await request(`/api/payments/register?search=${encodeURIComponent(second.acc_number)}`, { session });
    assert.equal(recipientSearch.response.status, 200);
    const registerRow = recipientSearch.data.rows.find((row) => row.id === paymentId);
    assert.ok(registerRow, "receipt search must include receiving accounts, not only the payer");
    assert.equal(Number(registerRow.amount), 45, "the receipt register must count the full receipt only once");
    assert.deepEqual(new Set(registerRow.allocated_accounts.split(", ")), new Set([first.acc_number, second.acc_number]));

    for (const [index, account] of [first, second].entries()) {
      const share = index === 0 ? 25 : 20;
      const statement = await request(`/api/customers/${account.customer_id}/statement`, { session });
      assert.equal(statement.response.status, 200);
      const entry = statement.data.transactions.find((row) => row.transaction_type === "payment" && Number(row.id) === paymentId);
      assert.equal(entry?.credit, share, "each statement must credit only that account's share");
      assert.equal(statement.data.totals.credit - originalStatements[index].totals.credit, share);
      const overview = await request(`/api/customers/${account.customer_id}/overview`, { session });
      assert.equal(overview.response.status, 200);
      assert.equal(Number(overview.data.payments.find((row) => row.id === paymentId)?.amount), share);
      assert.equal(Number(originalOverviews[index].customer.balance_due) - Number(overview.data.customer.balance_due), share);
      const opening = await request(`/api/customers/${account.customer_id}/statement?start_date=${statementStart}`, { session });
      assert.equal(opening.response.status, 200);
      assert.equal(originalOpenings[index].opening_balance - opening.data.opening_balance, share, "date-filtered opening balances must include split shares");
    }

    const summary = await request("/api/reports/summary", { session });
    assert.equal(summary.response.status, 200);
    for (const [index, account] of [first, second].entries()) {
      const beforeRow = originalSummary.data.clientFinancialSummary.find((row) => row.id === account.customer_id);
      const afterRow = summary.data.clientFinancialSummary.find((row) => row.id === account.customer_id);
      assert.equal(Number(beforeRow.current_outstanding) - Number(afterRow.current_outstanding), index === 0 ? 25 : 20);
    }
    const ledger = await request(`/api/reports/accountant?start_date=${payload.payment_date}&end_date=${payload.payment_date}`, { session });
    assert.equal(ledger.response.status, 200);
    assert.deepEqual(
      new Set(ledger.data.allocationLedger.filter((row) => row.receipt_number === created.data.payment.receipt_number).map((row) => row.acc_number)),
      new Set([first.acc_number, second.acc_number])
    );

    const portalEmail = process.env.TEST_CUSTOMER_EMAIL || "jane@agua.local";
    const portalUser = (await pool.query("SELECT id FROM users WHERE email = $1", [portalEmail])).rows[0];
    assert.ok(portalUser, "test database requires the demo customer user");
    for (const account of [first, second]) {
      const inserted = await pool.query(
        "INSERT INTO portal_user_customers (user_id, customer_id, is_primary) VALUES ($1, $2, FALSE) ON CONFLICT (user_id, customer_id) DO NOTHING RETURNING user_id, customer_id",
        [portalUser.id, account.customer_id]
      );
      addedPortalLinks.push(...inserted.rows);
    }
    const portalSession = await login(portalEmail, process.env.TEST_CUSTOMER_PASSWORD || "Customer@123");
    for (const [index, account] of [first, second].entries()) {
      const share = index === 0 ? 25 : 20;
      const dashboard = await request(`/api/portal/dashboard?customer_id=${account.customer_id}`, { session: portalSession });
      assert.equal(dashboard.response.status, 200);
      assert.equal(Number(dashboard.data.payments.find((row) => row.id === paymentId)?.amount), share);
      const portalReceipt = await request(`/api/portal/payments/${paymentId}?customer_id=${account.customer_id}`, { session: portalSession });
      assert.equal(portalReceipt.response.status, 200);
      assert.equal(Number(portalReceipt.data.payment.amount), share);
      assert.equal(portalReceipt.data.payment.customer_id, account.customer_id);
      assert.equal(Number(portalReceipt.data.payment.total_allocated_amount), 20);
      assert.equal(Number(portalReceipt.data.payment.unallocated_amount), index === 0 ? 5 : 0);
      const billIds = new Set(originalBills.rows.filter((bill) => bill.customer_id === account.customer_id).map((bill) => bill.id));
      assert.ok(portalReceipt.data.allocations.every((allocation) => billIds.has(allocation.bill_id)));
      assert.equal(portalReceipt.data.payment.allocation_plan, undefined, "portal receipts must not expose other account shares");
      if (index === 1) assert.equal(portalReceipt.data.payment.received_from, null);
    }

    const replay = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(replay.response.status, 200, replay.data.message || "idempotent replay failed");
    assert.equal(replay.data.idempotent_replay, true);
  });
});
