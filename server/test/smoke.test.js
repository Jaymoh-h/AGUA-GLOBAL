const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

if (shouldRun) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-change-me";
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
}

const app = shouldRun ? require("../src/app") : null;

let server;
let baseUrl;

const request = async (path, { token, method = "GET", body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const login = async (email, password) => {
  const { response, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });
  assert.equal(response.status, 200, data.message || "login failed");
  assert.ok(data.token, "login response should include a token");
  return data;
};

describe("AGUA Global API smoke", { skip: !shouldRun }, () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("reports health and database status", async () => {
    const health = await request("/api/health");
    assert.equal(health.response.status, 200);
    assert.equal(health.data.status, "ok");

    const status = await request("/api/status");
    assert.equal(status.response.status, 200, status.data.message || "status endpoint failed");
    assert.equal(status.data.database, "ok");
  });

  it("protects internal endpoints from anonymous requests", async () => {
    const { response } = await request("/api/dashboard");
    assert.equal(response.status, 401);
  });

  it("allows seeded admin login and dashboard access", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { token, user } = await login(email, password);
    assert.equal(user.role, "admin");

    const dashboard = await request("/api/dashboard", { token });
    assert.equal(dashboard.response.status, 200, dashboard.data.message || "dashboard failed");
    assert.ok(dashboard.data.summary, "dashboard should include summary data");
  });

  it("allows optional business viewer read access to production and monitoring", async (t) => {
    const email = process.env.TEST_BUSINESS_VIEWER_EMAIL;
    const password = process.env.TEST_BUSINESS_VIEWER_PASSWORD;
    if (!email || !password) {
      t.skip("Set TEST_BUSINESS_VIEWER_EMAIL and TEST_BUSINESS_VIEWER_PASSWORD to run this role check.");
      return;
    }

    const { token, user } = await login(email, password);
    assert.equal(user.role, "business_viewer");

    for (const path of [
      "/api/business-settings",
      "/api/expenses",
      "/api/monitoring/summary",
      "/api/production/meters",
      "/api/production/weekly-readings",
      "/api/production/report"
    ]) {
      const result = await request(path, { token });
      assert.equal(result.response.status, 200, result.data.message || `${path} failed`);
    }
  });

  it("rejects optional business viewer production writes", async (t) => {
    const email = process.env.TEST_BUSINESS_VIEWER_EMAIL;
    const password = process.env.TEST_BUSINESS_VIEWER_PASSWORD;
    if (!email || !password) {
      t.skip("Set TEST_BUSINESS_VIEWER_EMAIL and TEST_BUSINESS_VIEWER_PASSWORD to run this role check.");
      return;
    }
    if (process.env.TEST_INCLUDE_WRITE_GUARD !== "1") {
      t.skip("Set TEST_INCLUDE_WRITE_GUARD=1 on a disposable database to verify rejected write attempts.");
      return;
    }

    const { token, user } = await login(email, password);
    assert.equal(user.role, "business_viewer");

    const writeAttempt = await request("/api/production/electricity-topups", {
      token,
      method: "POST",
      body: {
        topup_date: "",
        kwh_units: "",
        total_cost: ""
      }
    });
    assert.equal(writeAttempt.response.status, 403);
  });
});
