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

const updateSessionCookies = (session, response) => {
  if (!session) return;
  const setCookies = response.headers.getSetCookie?.() || [response.headers.get("set-cookie")].filter(Boolean);
  const nextCookies = new Map(
    String(session.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator), part.slice(separator + 1)];
      })
  );
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value) nextCookies.delete(name);
    else nextCookies.set(name, value);
  }
  session.cookie = [...nextCookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
};

const request = async (path, { token, session, method = "GET", body } = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  updateSessionCookies(session, response);
  const data = await response.json().catch(() => ({}));
  if (session && data.csrf_token) session.csrfToken = data.csrf_token;
  return { response, data };
};

const login = async (email, password) => {
  const session = {};
  const { response, data } = await request("/api/auth/login", {
    session,
    method: "POST",
    body: { email, password }
  });
  assert.equal(response.status, 200, data.message || "login failed");
  assert.ok(session.cookie, "login response should set a session cookie");
  assert.ok(data.csrf_token, "login response should include a CSRF token");
  assert.equal(data.token, undefined, "login response should not expose a bearer token");
  return { ...data, session };
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
    const { session, user } = await login(email, password);
    assert.equal(user.role, "admin");

    const dashboard = await request("/api/dashboard", { session });
    assert.equal(dashboard.response.status, 200, dashboard.data.message || "dashboard failed");
    assert.ok(dashboard.data.summary, "dashboard should include summary data");
  });

  it("requires CSRF token for cookie-authenticated writes", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const missingCsrf = await request("/api/monitoring/client-events", {
      session: { cookie: session.cookie },
      method: "POST",
      body: { message: "Missing CSRF smoke check" }
    });
    assert.equal(missingCsrf.response.status, 403);

    const withCsrf = await request("/api/monitoring/client-events", {
      session,
      method: "POST",
      body: { message: "CSRF smoke check" }
    });
    assert.equal(withCsrf.response.status, 204);
  });

  it("allows optional business viewer read access to production and monitoring", async (t) => {
    const email = process.env.TEST_BUSINESS_VIEWER_EMAIL;
    const password = process.env.TEST_BUSINESS_VIEWER_PASSWORD;
    if (!email || !password) {
      t.skip("Set TEST_BUSINESS_VIEWER_EMAIL and TEST_BUSINESS_VIEWER_PASSWORD to run this role check.");
      return;
    }

    const { session, user } = await login(email, password);
    assert.equal(user.role, "business_viewer");

    for (const path of [
      "/api/business-settings",
      "/api/expenses",
      "/api/monitoring/summary",
      "/api/production/meters",
      "/api/production/weekly-readings",
      "/api/production/report"
    ]) {
      const result = await request(path, { session });
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

    const { session, user } = await login(email, password);
    assert.equal(user.role, "business_viewer");

    const writeAttempt = await request("/api/production/electricity-topups", {
      session,
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
