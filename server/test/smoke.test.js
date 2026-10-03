const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const shouldRun = Boolean(testDatabaseUrl);

if (shouldRun) {
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-change-me";
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  // The suite intentionally signs into several isolated role contexts.
  process.env.AUTH_RATE_LIMIT_MAX = "1000";
}

const app = shouldRun ? require("../src/app") : null;
const pool = shouldRun ? require("../src/db/pool") : null;

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

const request = async (path, { token, session, method = "GET", body, extraHeaders = {} } = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(session?.cookie ? { Cookie: session.cookie } : {}),
    ...extraHeaders
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
  let sessionData = data;
  if (data.requires_context_selection) {
    assert.ok(data.context_selection_token, "multi-context login should include a selection token");
    assert.ok(data.contexts?.length, "multi-context login should include active contexts");
    const selected = await request("/api/auth/select-context", {
      session,
      method: "POST",
      body: {
        context_selection_token: data.context_selection_token,
        access_profile_id: data.contexts[0].id
      }
    });
    assert.equal(selected.response.status, 200, selected.data.message || "context selection failed");
    sessionData = selected.data;
  }
  assert.ok(session.cookie, "login response should set a session cookie");
  assert.ok(sessionData.csrf_token, "login response should include a CSRF token");
  assert.equal(sessionData.token, undefined, "login response should not expose a bearer token");
  return { ...sessionData, session };
};

const removePortalSmokeArtifacts = async () => {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id
       FROM maintenance_requests
       WHERE source = 'customer_portal'
         AND (
           description LIKE 'Customer document smoke request %'
           OR description LIKE 'Customer billing dispute smoke request %'
           OR description LIKE 'Customer connection smoke request %'
         )`
    );
    const requestIds = rows.map((row) => row.id);
    if (requestIds.length) {
      await client.query(
        "DELETE FROM audit_events WHERE entity_type = 'maintenance_request' AND entity_id = ANY($1::int[])",
        [requestIds]
      );
      await client.query(
        "DELETE FROM supporting_documents WHERE entity_type = 'maintenance_request' AND entity_id = ANY($1::int[])",
        [requestIds]
      );
      await client.query("DELETE FROM maintenance_requests WHERE id = ANY($1::int[])", [requestIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeCustomerReadingSubmissionSmokeArtifacts = async () => {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id
       FROM customer_reading_submissions
       WHERE notes LIKE 'Customer reading smoke submission %'`
    );
    const submissionIds = rows.map((row) => row.id);
    if (submissionIds.length) {
      await client.query(
        "DELETE FROM supporting_documents WHERE entity_type = 'customer_reading_submission' AND entity_id = ANY($1::int[])",
        [submissionIds]
      );
      await client.query(
        "DELETE FROM audit_events WHERE entity_type = 'customer_reading_submission' AND entity_id = ANY($1::int[])",
        [submissionIds]
      );
      await client.query("DELETE FROM customer_reading_submissions WHERE id = ANY($1::int[])", [submissionIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeCustomerServiceChargeSmokeArtifacts = async () => {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, bill_id
       FROM customer_service_charges
       WHERE description LIKE 'Customer service charge smoke %'`
    );
    const chargeIds = rows.map((row) => row.id);
    const billIds = rows.map((row) => row.bill_id).filter(Boolean);
    if (chargeIds.length) {
      await client.query(
        `DELETE FROM audit_events
         WHERE (entity_type = 'customer_service_charge' AND entity_id = ANY($1::int[]))
            OR (entity_type = 'bill' AND entity_id = ANY($2::int[]))`,
        [chargeIds, billIds]
      );
      await client.query("DELETE FROM bills WHERE id = ANY($1::int[])", [billIds]);
      await client.query("DELETE FROM customer_service_charges WHERE id = ANY($1::int[])", [chargeIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeBillingPeriodSmokeArtifacts = async (periodStart) => {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM billing_periods WHERE period_start = $1", [periodStart]);
    const periodIds = rows.map((row) => row.id);
    if (periodIds.length) {
      await client.query(
        "DELETE FROM audit_events WHERE entity_type = 'billing_period' AND entity_id = ANY($1::int[])",
        [periodIds]
      );
      await client.query("DELETE FROM billing_periods WHERE id = ANY($1::int[])", [periodIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeMonthlyBudgetSmokeArtifacts = async (budgetMonth) => {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM monthly_budget_targets WHERE budget_month = $1", [budgetMonth]);
    const targetIds = rows.map((row) => row.id);
    if (targetIds.length) {
      await client.query(
        "DELETE FROM audit_events WHERE entity_type = 'monthly_budget_target' AND entity_id = ANY($1::int[])",
        [targetIds]
      );
      await client.query("DELETE FROM monthly_budget_targets WHERE id = ANY($1::int[])", [targetIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeMpesaCallbackSmokeArtifacts = async (transactionIds) => {
  if (!pool || !transactionIds.length) return;
  await pool.query(
    `DELETE FROM system_event_logs
     WHERE event_type = 'payment.mpesa_confirmation_rejected'
       AND details ->> 'transaction_id' = ANY($1::text[])`,
    [transactionIds]
  );
};

const removeCsrfSmokeArtifacts = async () => {
  if (!pool) return;
  await pool.query(
    `DELETE FROM system_event_logs
     WHERE event_type = 'client.error'
       AND source = 'client'
       AND message = ANY($1::text[])`,
    [["CSRF smoke check", "Missing CSRF smoke check"]]
  );
};

const removeMonitoringResolutionSmokeArtifacts = async () => {
  if (!pool) return;
  const { rows } = await pool.query(
    `SELECT id
     FROM system_event_logs
     WHERE event_type = 'monitoring.smoke_resolution'
       AND message = 'Monitoring resolution smoke check'`
  );
  const eventIds = rows.map((row) => row.id);
  if (!eventIds.length) return;
  await pool.query("DELETE FROM audit_events WHERE entity_type = 'system_event' AND entity_id = ANY($1::int[])", [eventIds]);
  await pool.query("DELETE FROM system_event_logs WHERE id = ANY($1::int[])", [eventIds]);
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

  it("limits operational reminder previews to finance and administration roles", async () => {
    const admin = await login(
      process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
      process.env.TEST_ADMIN_PASSWORD || "Admin@123"
    );
    const adminPreview = await request("/api/reminders/operational/preview", { session: admin.session });
    assert.equal(adminPreview.response.status, 200, adminPreview.data.message || "admin reminder preview failed");
    assert.match(adminPreview.data.generated_at || "", /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Array.isArray(adminPreview.data.reminders), "reminder preview should include reminder groups");
    for (const reminder of adminPreview.data.reminders) {
      assert.equal(typeof reminder.type, "string");
      assert.equal(typeof reminder.label, "string");
      assert.equal(typeof reminder.count, "number");
      assert.equal(typeof reminder.hasWork, "boolean");
      assert.equal(typeof reminder.dueToday, "boolean");
      assert.equal(typeof reminder.schedule?.cadence, "string");
    }

    const adminLogs = await request("/api/reminders/operational/logs?limit=12", { session: admin.session });
    assert.equal(adminLogs.response.status, 200, adminLogs.data.message || "admin reminder logs failed");
    assert.ok(Array.isArray(adminLogs.data));
    assert.ok(adminLogs.data.length <= 12, "reminder logs should honor the requested limit");

    const accountant = await login(
      process.env.TEST_ACCOUNTANT_EMAIL || "accountant@agua.local",
      process.env.TEST_ACCOUNTANT_PASSWORD || "Accountant@123"
    );
    const accountantPreview = await request("/api/reminders/operational/preview", { session: accountant.session });
    assert.equal(accountantPreview.response.status, 200, accountantPreview.data.message || "accountant reminder preview failed");
    assert.ok(Array.isArray(accountantPreview.data.reminders));

    const reader = await login(
      process.env.TEST_READER_EMAIL || "reader@agua.local",
      process.env.TEST_READER_PASSWORD || "Reader@123"
    );
    const readerPreview = await request("/api/reminders/operational/preview", { session: reader.session });
    assert.equal(readerPreview.response.status, 403, "meter readers must not access operational reminder delivery previews");
  });

  it("allows seeded admin login and dashboard access", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session, user } = await login(email, password);
    assert.equal(user.role, "admin");

    const dashboard = await request("/api/dashboard", { session });
    assert.equal(dashboard.response.status, 200, dashboard.data.message || "dashboard failed");
    assert.ok(dashboard.data.summary, "dashboard should include summary data");
    assert.ok(dashboard.data.actionCenter?.summary, "dashboard should include an action-center summary");
    assert.ok(Array.isArray(dashboard.data.actionCenter?.groups), "dashboard action-center groups should be an array");
    assert.ok(dashboard.data.performance, "dashboard should include a management performance snapshot");
    assert.equal(typeof dashboard.data.performance.readings?.required_count, "number", "performance should expose reading coverage");
    assert.equal(typeof dashboard.data.performance.billing?.blocker_count, "number", "performance should expose billing blockers");
    assert.equal(typeof dashboard.data.performance.billing?.unbilled_consumption_count, "number", "performance should expose unbilled consumption for revenue assurance");
    assert.equal(typeof dashboard.data.performance.collections?.billed_amount, "number", "performance should expose collection inputs");
    assert.equal(typeof dashboard.data.performance.collections?.open_receivables, "number", "performance should expose open receivables for DSO");
    assert.equal(typeof dashboard.data.performance.collections?.trailing_billed_amount, "number", "performance should expose the DSO billing base");
    assert.ok(
      dashboard.data.performance.collections?.days_sales_outstanding === null || typeof dashboard.data.performance.collections?.days_sales_outstanding === "number",
      "performance should expose DSO when a 90-day billing base exists"
    );
    assert.equal(typeof dashboard.data.performance.deliveries?.exception_count, "number", "performance should expose delivery exceptions");
    assert.equal(typeof dashboard.data.performance.margin?.net_amount, "number", "performance should expose operating margin inputs");
    assert.equal(typeof dashboard.data.performance.budget?.has_target, "boolean", "performance should expose current monthly budget availability");
    assert.equal(typeof dashboard.data.performance.budget?.revenue_variance, "number", "performance should expose monthly revenue variance");
    assert.equal(typeof dashboard.data.performance.operations?.production?.variance_units, "number", "performance should expose production-to-billed variance");
    assert.equal(typeof dashboard.data.performance.operations?.maintenance?.avg_resolution_days, "number", "performance should expose maintenance turnaround");
    assert.equal(typeof dashboard.data.performance.operations?.payroll_liability?.approved_amount, "number", "performance should expose approved payroll liability");
    assert.equal(typeof dashboard.data.performance.operations?.contractor_payables?.open_amount, "number", "performance should expose contractor exposure");
    const actionItems = dashboard.data.actionCenter.groups.flatMap((group) => group.items || []);
    assert.ok(actionItems.length > 0, "admin dashboard should expose operational checks");
    for (const item of actionItems) {
      assert.equal(typeof item.key, "string", "dashboard checks should have stable keys");
      assert.equal(typeof item.label, "string", "dashboard checks should have labels");
      assert.equal(typeof item.count, "number", "dashboard check counts should be numeric");
      assert.equal(typeof item.page, "string", "dashboard checks should provide drill-down pages");
    }
    const customerReadingCheck = actionItems.find((item) => item.key === "pending_customer_readings");
    assert.ok(customerReadingCheck, "dashboard should expose pending customer meter-reading reviews");
    assert.equal(customerReadingCheck.page, "readings");
    const unbilledConsumptionCheck = actionItems.find((item) => item.key === "unbilled_consumption");
    assert.ok(unbilledConsumptionCheck, "dashboard should expose current unbilled consumption");
    assert.equal(unbilledConsumptionCheck.page, "billing");
    const standingOrderCheck = actionItems.find((item) => item.key === "standing_orders_behind");
    assert.ok(standingOrderCheck, "dashboard should expose standing-order collection exposure");
    assert.equal(standingOrderCheck.page, "collections");
    const paymentPlanRequestCheck = actionItems.find((item) => item.key === "payment_plan_requests");
    assert.ok(paymentPlanRequestCheck, "dashboard should expose customer payment-plan proposals");
    assert.equal(paymentPlanRequestCheck.page, "collections");
    const billingDisputeCheck = actionItems.find((item) => item.key === "billing_disputes");
    assert.ok(billingDisputeCheck, "dashboard should expose customer billing disputes");
    assert.equal(billingDisputeCheck.page, "maintenance");
    const contactGapCheck = actionItems.find((item) => item.key === "contact_gaps");
    assert.ok(contactGapCheck, "dashboard should expose overdue accounts without a usable delivery channel");
    assert.equal(contactGapCheck.page, "collections");
    assert.equal(typeof contactGapCheck.amount, "number", "contact-gap action should expose its blocked receivables amount");
    const budgetVarianceCheck = actionItems.find((item) => item.key === "monthly_budget_variance");
    assert.ok(budgetVarianceCheck, "dashboard should expose monthly budget variance");
    assert.equal(budgetVarianceCheck.page, "reports");
    if (!dashboard.data.performance.budget.has_target) {
      assert.equal(budgetVarianceCheck.count, 1, "a missing current-month target should create a setup action");
      assert.equal(budgetVarianceCheck.label, "Monthly budget target missing");
    }

    const mappingProfiles = await request("/api/payments/import-mapping-profiles", { session });
    assert.equal(mappingProfiles.response.status, 200, mappingProfiles.data.message || "mapping profiles failed");
    assert.ok(Array.isArray(mappingProfiles.data), "mapping profiles should be an array");

    const mpesaStatus = await request("/api/payments/mpesa/status", { session });
    assert.equal(mpesaStatus.response.status, 200, mpesaStatus.data.message || "M-Pesa status failed");
    assert.equal(typeof mpesaStatus.data.enabled, "boolean", "M-Pesa status should include its enabled state");
    assert.equal(typeof mpesaStatus.data.callback_token_configured, "boolean", "M-Pesa status should include callback-token readiness");
    assert.equal(typeof mpesaStatus.data.paybill_configured, "boolean", "M-Pesa status should include paybill readiness");
    assert.equal(mpesaStatus.data.enabled, mpesaStatus.data.callback_token_configured && mpesaStatus.data.paybill_configured, "M-Pesa posting must require both callback and paybill readiness");

    const integrationReadiness = await request("/api/business-settings/integration-readiness", { session });
    assert.equal(integrationReadiness.response.status, 200, integrationReadiness.data.message || "integration readiness failed");
    assert.equal(typeof integrationReadiness.data.generated_at, "string");
    assert.equal(typeof integrationReadiness.data.messaging?.email?.configured, "boolean");
    assert.equal(typeof integrationReadiness.data.messaging?.sms?.configured, "boolean");
    assert.equal(typeof integrationReadiness.data.messaging?.whatsapp?.configured, "boolean");
    assert.equal(typeof integrationReadiness.data.payments?.mpesa?.direct_posting_ready, "boolean");
    assert.equal(integrationReadiness.data.payments?.mpesa?.direct_posting_ready, integrationReadiness.data.payments?.mpesa?.callback_token_configured && integrationReadiness.data.payments?.mpesa?.paybill_configured);
    assert.equal("smtp_pass" in integrationReadiness.data, false, "integration readiness must not expose delivery credentials");

    const commissioningChecks = await request("/api/business-settings/commissioning-checks", { session });
    assert.equal(commissioningChecks.response.status, 200, commissioningChecks.data.message || "commissioning checks failed");
    assert.ok(Array.isArray(commissioningChecks.data), "commissioning checks should be an array");

    const passedWithoutEvidence = await request("/api/business-settings/commissioning-checks", {
      session,
      method: "POST",
      body: {
        check_key: "messaging_email",
        status: "passed",
        verification_date: new Date().toISOString().slice(0, 10)
      }
    });
    assert.equal(passedWithoutEvidence.response.status, 400, "passed commissioning checks must require evidence");

    const callbackEvents = await request("/api/payments/mpesa/callback-events?limit=5", { session });
    assert.equal(callbackEvents.response.status, 200, callbackEvents.data.message || "M-Pesa callback events failed");
    assert.ok(Array.isArray(callbackEvents.data), "M-Pesa callback events should be an array");

    const cashFlowForecast = await request("/api/reports/cash-flow-forecast", { session });
    assert.equal(cashFlowForecast.response.status, 200, cashFlowForecast.data.message || "cash flow forecast failed");
    assert.equal(cashFlowForecast.data.horizon_days, 90);
    assert.equal(cashFlowForecast.data.history_months, 3);
    assert.ok(Array.isArray(cashFlowForecast.data.assumptions), "forecast should disclose its assumptions");
    assert.equal(typeof cashFlowForecast.data.efficiency?.average_monthly_bills, "number");
    assert.equal(typeof cashFlowForecast.data.efficiency?.average_monthly_operating_expense, "number");
    assert.ok(
      cashFlowForecast.data.efficiency?.cost_per_bill === null || typeof cashFlowForecast.data.efficiency?.cost_per_bill === "number",
      "cost per bill should be numeric when a billing baseline exists"
    );
    assert.equal(cashFlowForecast.data.rows?.length, 3, "forecast should return three monthly outlook rows");
    for (const row of cashFlowForecast.data.rows) {
      assert.match(row.month_start, /^\d{4}-\d{2}-01$/);
      for (const key of ["expected_billings", "baseline_collections", "committed_coverage", "projected_collections", "projected_expenses", "projected_net_cash"]) {
        assert.equal(typeof row[key], "number", `forecast ${key} should be numeric`);
      }
      assert.ok(
        Number(row.projected_collections) >= Number(row.baseline_collections) &&
          Number(row.projected_collections) >= Number(row.committed_coverage),
        "forecast collections should not be below either disclosed input"
      );
    }

    const accountantReport = await request("/api/reports/accountant?start_date=2026-01-01&end_date=2026-12-31", { session });
    assert.equal(accountantReport.response.status, 200, accountantReport.data.message || "accountant report failed");
    assert.ok(Number.isFinite(Number(accountantReport.data.billingTotals?.units_billed)), "accountant report should expose billed units for production comparison");
    assert.ok(Number.isFinite(Number(accountantReport.data.payrollLiabilityTotals?.approved_run_count)), "accountant report should expose approved payroll-run count");
    assert.ok(Number.isFinite(Number(accountantReport.data.payrollLiabilityTotals?.approved_amount)), "accountant report should expose approved payroll liability");

    const budgetVariance = await request("/api/reports/budget-variance", { session });
    assert.equal(budgetVariance.response.status, 200, budgetVariance.data.message || "budget variance failed");
    assert.equal(budgetVariance.data.months_covered, 12);
    assert.ok(Array.isArray(budgetVariance.data.rows), "budget variance should return a target register");
    for (const row of budgetVariance.data.rows) {
      assert.match(row.budget_month, /^\d{4}-\d{2}-01$/);
      for (const key of ["revenue_target", "collection_target", "operating_expense_budget", "revenue_actual", "collection_actual", "operating_expense_actual", "revenue_variance", "collection_variance", "operating_expense_variance"]) {
        assert.equal(typeof row[key], "number", `budget ${key} should be numeric`);
      }
    }

    const periods = await request("/api/billing/periods", { session });
    assert.equal(periods.response.status, 200, periods.data.message || "billing periods failed");
    if (periods.data[0]) {
      const readiness = await request(`/api/billing/periods/${periods.data[0].id}/readiness`, { session });
      assert.equal(readiness.response.status, 200, readiness.data.message || "billing readiness failed");
      assert.equal(typeof readiness.data.summary?.reading_completion_rate, "number");
      assert.equal(typeof readiness.data.summary?.reading_completion_recommendation_threshold, "number");
      assert.equal(typeof readiness.data.summary?.reading_completion_recommendation_met, "boolean");
      const assurance = await request(`/api/billing/periods/${periods.data[0].id}/revenue-assurance`, { session });
      assert.equal(assurance.response.status, 200, assurance.data.message || "revenue assurance failed");
      assert.equal(typeof assurance.data.summary?.unbilled_consumption_count, "number");
      assert.equal(typeof assurance.data.summary?.unbilled_units, "number");
      assert.equal(typeof assurance.data.summary?.held_bill_value, "number");
      assert.ok(Array.isArray(assurance.data.rows), "revenue assurance should return a recovery queue");
      for (const row of assurance.data.rows) {
        assert.ok(["unbilled_consumption", "held_bill", "missing_reading"].includes(row.issue_type));
        assert.ok(row.customer_id && row.acc_number, "revenue assurance rows should identify an account");
      }
    }
  });

  it("records auditable commissioning evidence and keeps it available to oversight roles", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const evidenceReference = `SMOKE-COMMISSIONING-${Date.now()}`;
    let checkId = null;

    t.after(async () => {
      if (!checkId) return;
      await pool.query("DELETE FROM audit_events WHERE entity_type = 'integration_commissioning_check' AND entity_id = $1", [checkId]);
      await pool.query("DELETE FROM integration_commissioning_checks WHERE id = $1", [checkId]);
    });

    const created = await request("/api/business-settings/commissioning-checks", {
      session,
      method: "POST",
      body: {
        check_key: "external_uptime",
        status: "passed",
        verification_date: new Date().toISOString().slice(0, 10),
        evidence_reference: evidenceReference,
        findings: "Smoke coverage only; removed after verification.",
        follow_up_actions: "None."
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "commissioning evidence failed to record");
    checkId = created.data.id;
    assert.equal(created.data.evidence_reference, evidenceReference);

    const list = await request("/api/business-settings/commissioning-checks", { session });
    assert.equal(list.response.status, 200, list.data.message || "commissioning evidence list failed");
    assert.ok(list.data.some((row) => row.id === checkId && row.status === "passed"));

    const audit = await pool.query(
      "SELECT action, after_data FROM audit_events WHERE entity_type = 'integration_commissioning_check' AND entity_id = $1",
      [checkId]
    );
    assert.equal(audit.rows[0]?.action, "integration_commissioning_check.recorded");
    assert.equal(audit.rows[0]?.after_data?.evidence_reference, evidenceReference);
  });

  it("keeps direct M-Pesa confirmation posting disabled without its server token", async () => {
    if (process.env.MPESA_CALLBACK_TOKEN) return;
    const confirmation = await request("/api/payments/mpesa/confirmation", {
      method: "POST",
      body: { TransID: "TEST-DISABLED", BillRefNumber: "AG-0001", TransAmount: "100" }
    });
    assert.equal(confirmation.response.status, 503);
  });

  it("rejects M-Pesa confirmations without a matching receiving paybill before posting", async (t) => {
    if (!process.env.MPESA_CALLBACK_TOKEN) {
      t.skip("Set MPESA_CALLBACK_TOKEN or use test:smoke:current to exercise callback validation.");
      return;
    }
    const suffix = Date.now();
    const missingShortcodeTransactionId = `MPESA-SMOKE-MISSING-SHORTCODE-${suffix}`;
    const mismatchedShortcodeTransactionId = `MPESA-SMOKE-MISMATCHED-SHORTCODE-${suffix}`;
    const transactionIds = [missingShortcodeTransactionId, mismatchedShortcodeTransactionId];
    await removeMpesaCallbackSmokeArtifacts(transactionIds);
    t.after(() => removeMpesaCallbackSmokeArtifacts(transactionIds));

    const confirmation = await request("/api/payments/mpesa/confirmation", {
      method: "POST",
      extraHeaders: { "X-AGUA-CALLBACK-TOKEN": process.env.MPESA_CALLBACK_TOKEN },
      body: {
        TransID: missingShortcodeTransactionId,
        BillRefNumber: "AG-0003",
        TransAmount: "1"
      }
    });
    assert.equal(confirmation.response.status, 400, confirmation.data.message || "missing shortcode should be rejected");
    assert.equal(confirmation.data.message, "M-Pesa confirmation must include the receiving paybill shortcode.");

    const mismatchedShortcode = await request("/api/payments/mpesa/confirmation", {
      method: "POST",
      extraHeaders: { "X-AGUA-CALLBACK-TOKEN": process.env.MPESA_CALLBACK_TOKEN },
      body: {
        TransID: mismatchedShortcodeTransactionId,
        BillRefNumber: "AG-0003",
        TransAmount: "1",
        BusinessShortCode: "999999"
      }
    });
    assert.equal(mismatchedShortcode.response.status, 400, mismatchedShortcode.data.message || "mismatched shortcode should be rejected");
    assert.equal(mismatchedShortcode.data.message, "M-Pesa confirmation shortcode does not match the configured paybill.");
  });

  it("records audited monthly budget targets and exposes their variance", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const budgetMonth = `${new Date().getUTCFullYear() + 50}-10-01`;
    await removeMonthlyBudgetSmokeArtifacts(budgetMonth);
    t.after(() => removeMonthlyBudgetSmokeArtifacts(budgetMonth));

    const created = await request(`/api/reports/budget-targets/${budgetMonth.slice(0, 7)}`, {
      session,
      method: "PUT",
      body: {
        revenue_target: 150000,
        collection_target: 120000,
        operating_expense_budget: 75000,
        notes: "Monthly budget smoke target"
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "monthly budget create failed");
    assert.equal(created.data.revenue_target, 150000);
    assert.equal(created.data.collection_target, 120000);

    const updated = await request(`/api/reports/budget-targets/${budgetMonth.slice(0, 7)}`, {
      session,
      method: "PUT",
      body: {
        revenue_target: 160000,
        collection_target: 125000,
        operating_expense_budget: 80000,
        notes: "Monthly budget smoke target updated"
      }
    });
    assert.equal(updated.response.status, 200, updated.data.message || "monthly budget update failed");
    assert.equal(updated.data.revenue_target, 160000);

    const variance = await request("/api/reports/budget-variance", { session });
    assert.equal(variance.response.status, 200, variance.data.message || "monthly budget variance failed");
    const target = variance.data.rows.find((row) => row.budget_month === budgetMonth);
    assert.ok(target, "saved monthly budget should appear in the variance register");
    assert.equal(target.collection_target, 125000);
    assert.equal(target.operating_expense_budget, 80000);
    assert.equal(target.revenue_status, "planned");
  });

  it("posts an approved contractor invoice to one auditable expense only", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifactIds = { contractorId: null, invoiceId: null, expenseId: null };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ids = [artifactIds.contractorId, artifactIds.invoiceId, artifactIds.expenseId].filter(Boolean);
        if (ids.length) {
          await client.query(
            `DELETE FROM audit_events
             WHERE (entity_type = 'contractor' AND entity_id = $1)
                OR (entity_type = 'contractor_invoice' AND entity_id = $2)
                OR (entity_type = 'expense' AND entity_id = $3)`,
            [artifactIds.contractorId, artifactIds.invoiceId, artifactIds.expenseId]
          );
        }
        if (artifactIds.invoiceId) await client.query("DELETE FROM contractor_invoices WHERE id = $1", [artifactIds.invoiceId]);
        if (artifactIds.expenseId) await client.query("DELETE FROM expenses WHERE id = $1", [artifactIds.expenseId]);
        if (artifactIds.contractorId) await client.query("DELETE FROM contractors WHERE id = $1", [artifactIds.contractorId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const suffix = Date.now();
    const contractor = await request("/api/contractor-invoices/contractors", {
      session,
      method: "POST",
      body: { name: `Smoke contractor ${suffix}`, payment_terms_days: 14 }
    });
    assert.equal(contractor.response.status, 201, contractor.data.message || "contractor create failed");
    artifactIds.contractorId = contractor.data.id;

    const invoice = await request("/api/contractor-invoices/invoices", {
      session,
      method: "POST",
      body: {
        contractor_id: contractor.data.id,
        invoice_number: `SMOKE-CI-${suffix}`,
        invoice_date: "2026-08-01",
        due_date: "2026-08-15",
        description: "Smoke contractor invoice posting control",
        category: "Repairs",
        subtotal_amount: 1000,
        vat_amount: 160,
        total_amount: 1160,
        status: "draft"
      }
    });
    assert.equal(invoice.response.status, 201, invoice.data.message || "contractor invoice create failed");
    artifactIds.invoiceId = invoice.data.id;

    const unapprovedPosting = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/post-expense`, {
      session,
      method: "POST",
      body: { expense_date: "2026-08-01", payment_channel: "bank" }
    });
    assert.equal(unapprovedPosting.response.status, 400, "draft invoices must not post to expenses");
    assert.match(unapprovedPosting.data.message || "", /approved contractor invoices/i);

    const missingApprovalReview = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "approved", reason: "" }
    });
    assert.equal(missingApprovalReview.response.status, 400, "approval must require a review note");
    assert.match(missingApprovalReview.data.message || "", /review notes are required/i);

    const approved = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "approved", reason: "Smoke approval before expense posting" }
    });
    assert.equal(approved.response.status, 200, approved.data.message || "contractor invoice approval failed");
    assert.equal(approved.data.status, "approved");

    const missingPostingReview = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/post-expense`, {
      session,
      method: "POST",
      body: { expense_date: "2026-08-01", payment_channel: "bank", notes: "Missing review note" }
    });
    assert.equal(missingPostingReview.response.status, 400, "expense posting must require an approval note");
    assert.match(missingPostingReview.data.message || "", /posting approval notes are required/i);

    const posted = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/post-expense`, {
      session,
      method: "POST",
      body: {
        expense_date: "2026-08-01",
        payment_channel: "bank",
        notes: "Smoke contractor invoice expense",
        review_notes: "Smoke reviewed contractor expense posting"
      }
    });
    assert.equal(posted.response.status, 201, posted.data.message || "contractor invoice expense posting failed");
    artifactIds.expenseId = posted.data.expense.id;
    assert.equal(posted.data.invoice.status, "posted_to_expense");
    assert.equal(Number(posted.data.invoice.expense_id), Number(posted.data.expense.id));
    assert.equal(Number(posted.data.expense.amount), 1160);
    assert.equal(posted.data.expense.reference, `SMOKE-CI-${suffix}`);

    const repost = await request(`/api/contractor-invoices/invoices/${invoice.data.id}/post-expense`, {
      session,
      method: "POST",
      body: { expense_date: "2026-08-01", payment_channel: "bank" }
    });
    assert.equal(repost.response.status, 400, "an invoice must post to an expense only once");

    const audit = await pool.query(
      `SELECT action
       FROM audit_events
       WHERE entity_type = 'contractor_invoice' AND entity_id = $1
       ORDER BY id`,
      [artifactIds.invoiceId]
    );
    assert.ok(audit.rows.some((row) => row.action === "contractor_invoice.approved"));
    assert.ok(audit.rows.some((row) => row.action === "contractor_invoice.posted_to_expense"));
  });

  it("ends recurring payees with an audit trail and excludes them from later pay runs", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifactIds = { payeeId: null, runId: null };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM audit_events
           WHERE (entity_type = 'payroll_payee' AND entity_id = $1)
              OR (entity_type = 'payroll_run' AND entity_id = $2)`,
          [artifactIds.payeeId, artifactIds.runId]
        );
        if (artifactIds.runId) await client.query("DELETE FROM payroll_line_items WHERE payroll_run_id = $1", [artifactIds.runId]);
        if (artifactIds.runId) await client.query("DELETE FROM payroll_runs WHERE id = $1", [artifactIds.runId]);
        if (artifactIds.payeeId) await client.query("DELETE FROM payroll_payees WHERE id = $1", [artifactIds.payeeId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const suffix = Date.now();
    const payee = await request("/api/payroll/payees", {
      session,
      method: "POST",
      body: {
        payee_type: "employee",
        name: `Smoke terminated employee ${suffix}`,
        code: `TERM-${suffix}`,
        rate_amount: 1000,
        rate_basis: "monthly",
        payment_channel: "bank",
        start_date: "2026-08-01"
      }
    });
    assert.equal(payee.response.status, 201, payee.data.message || "payroll payee create failed");
    artifactIds.payeeId = payee.data.id;

    const missingReason = await request(`/api/payroll/payees/${payee.data.id}/terminate`, {
      session,
      method: "PATCH",
      body: { end_date: "2026-08-02" }
    });
    assert.equal(missingReason.response.status, 400);
    assert.match(missingReason.data.message || "", /reason is required/i);

    const beforeStart = await request(`/api/payroll/payees/${payee.data.id}/terminate`, {
      session,
      method: "PATCH",
      body: { end_date: "2026-07-31", termination_reason: "Smoke invalid early termination" }
    });
    assert.equal(beforeStart.response.status, 400);
    assert.match(beforeStart.data.message || "", /cannot be before/i);

    const terminated = await request(`/api/payroll/payees/${payee.data.id}/terminate`, {
      session,
      method: "PATCH",
      body: { end_date: "2026-08-02", termination_reason: "Smoke end-date verification" }
    });
    assert.equal(terminated.response.status, 200, terminated.data.message || "payee termination failed");
    assert.equal(terminated.data.status, "terminated");
    assert.equal(String(terminated.data.end_date).slice(0, 10), "2026-08-02");

    const laterRun = await request("/api/payroll/runs", {
      session,
      method: "POST",
      body: {
        name: `Smoke post-termination payroll ${suffix}`,
        period_start: "2026-08-03",
        period_end: "2026-08-03",
        payee_type: "employee"
      }
    });
    assert.equal(laterRun.response.status, 201, laterRun.data.message || "later payroll run create failed");
    artifactIds.runId = laterRun.data.id;
    assert.equal(
      laterRun.data.lines.some((line) => Number(line.payee_id) === Number(artifactIds.payeeId)),
      false,
      "an end-dated payee must not be included in a later payroll run"
    );

    const audit = await pool.query(
      "SELECT action, reason FROM audit_events WHERE entity_type = 'payroll_payee' AND entity_id = $1 ORDER BY id",
      [artifactIds.payeeId]
    );
    const terminationEvent = audit.rows.find((row) => row.action === "payroll_payee.terminated");
    assert.ok(terminationEvent, "payee termination should be audited");
    assert.equal(terminationEvent.reason, "Smoke end-date verification");
  });

  it("requires payroll approval before posting its expense", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifactIds = { payeeId: null, runId: null, lineId: null, expenseId: null };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM audit_events
           WHERE (entity_type = 'payroll_payee' AND entity_id = $1)
              OR (entity_type = 'payroll_run' AND entity_id = $2)
              OR (entity_type = 'payroll_line_item' AND entity_id = $3)
              OR (entity_type = 'expense' AND entity_id = $4)`,
          [artifactIds.payeeId, artifactIds.runId, artifactIds.lineId, artifactIds.expenseId]
        );
        if (artifactIds.runId) await client.query("DELETE FROM payroll_line_items WHERE payroll_run_id = $1", [artifactIds.runId]);
        if (artifactIds.runId) await client.query("DELETE FROM payroll_runs WHERE id = $1", [artifactIds.runId]);
        if (artifactIds.expenseId) await client.query("DELETE FROM expenses WHERE id = $1", [artifactIds.expenseId]);
        if (artifactIds.payeeId) await client.query("DELETE FROM payroll_payees WHERE id = $1", [artifactIds.payeeId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const suffix = Date.now();
    const payee = await request("/api/payroll/payees", {
      session,
      method: "POST",
      body: {
        payee_type: "employee",
        name: `Smoke payroll employee ${suffix}`,
        code: `SP-${suffix}`,
        rate_amount: 3200,
        rate_basis: "monthly",
        payment_channel: "bank",
        start_date: "2026-08-01"
      }
    });
    assert.equal(payee.response.status, 201, payee.data.message || "payroll payee create failed");
    artifactIds.payeeId = payee.data.id;

    const run = await request("/api/payroll/runs", {
      session,
      method: "POST",
      body: { name: `Smoke payroll run ${suffix}`, period_start: "2026-08-01", period_end: "2026-08-31", payee_type: "employee" }
    });
    assert.equal(run.response.status, 201, run.data.message || "payroll run create failed");
    artifactIds.runId = run.data.id;
    const line = run.data.lines.find((item) => Number(item.payee_id) === Number(payee.data.id));
    assert.ok(line, "the new employee should be included in the payroll run");
    artifactIds.lineId = line.id;

    const prematurePaid = await request(`/api/payroll/runs/${run.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "paid", notes: "Smoke premature payroll payment" }
    });
    assert.equal(prematurePaid.response.status, 400, "unapproved payroll must not be paid");
    assert.match(prematurePaid.data.message || "", /approved payroll runs/i);

    const missingApprovalReview = await request(`/api/payroll/runs/${run.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "approved", notes: "" }
    });
    assert.equal(missingApprovalReview.response.status, 400, "payroll approval must require an audit note");
    assert.match(missingApprovalReview.data.message || "", /approval and payment posting notes are required/i);

    const approved = await request(`/api/payroll/runs/${run.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "approved", notes: "Smoke payroll approval" }
    });
    assert.equal(approved.response.status, 200, approved.data.message || "payroll approval failed");
    assert.equal(approved.data.status, "approved");

    const missingPaymentReview = await request(`/api/payroll/runs/${run.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "paid", notes: "" }
    });
    assert.equal(missingPaymentReview.response.status, 400, "payroll payment posting must require an audit note");
    assert.match(missingPaymentReview.data.message || "", /approval and payment posting notes are required/i);

    const paid = await request(`/api/payroll/runs/${run.data.id}/status`, {
      session,
      method: "PATCH",
      body: { status: "paid", notes: "Smoke payroll payment" }
    });
    assert.equal(paid.response.status, 200, paid.data.message || "payroll payment failed");
    assert.equal(paid.data.status, "paid");
    const paidLine = paid.data.lines.find((item) => Number(item.id) === Number(artifactIds.lineId));
    assert.ok(paidLine?.expense_id, "paying payroll should create a linked expense");
    artifactIds.expenseId = paidLine.expense_id;
    assert.equal(Number(paidLine.net_amount), 3200);

    const audit = await pool.query(
      "SELECT action FROM audit_events WHERE entity_type = 'payroll_run' AND entity_id = $1 ORDER BY id",
      [artifactIds.runId]
    );
    assert.ok(audit.rows.some((row) => row.action === "payroll_run.approved"));
    assert.ok(audit.rows.some((row) => row.action === "payroll_run.paid"));
  });

  it("posts a production electricity top-up to an auditable operating expense", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifactIds = { topupId: null, expenseId: null };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM audit_events
           WHERE (entity_type = 'production_electricity_topup' AND entity_id = $1)
              OR (entity_type = 'expense' AND entity_id = $2)`,
          [artifactIds.topupId, artifactIds.expenseId]
        );
        if (artifactIds.topupId) await client.query("DELETE FROM production_electricity_topups WHERE id = $1", [artifactIds.topupId]);
        if (artifactIds.expenseId) await client.query("DELETE FROM expenses WHERE id = $1", [artifactIds.expenseId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const invalid = await request("/api/production/electricity-topups", {
      session,
      method: "POST",
      body: { topup_date: "2026-08-20", kwh_units: 0, total_cost: 100, reference: "SMOKE-INVALID-TOPUP", review_notes: "Smoke invalid top-up review" }
    });
    assert.equal(invalid.response.status, 400, "zero-unit top-ups must be rejected");
    assert.match(invalid.data.message || "", /kWh units/i);

    const missingReview = await request("/api/production/electricity-topups", {
      session,
      method: "POST",
      body: { topup_date: "2026-08-20", kwh_units: 50, total_cost: 1250, reference: "SMOKE-MISSING-TOPUP-REVIEW" }
    });
    assert.equal(missingReview.response.status, 400, "electricity top-ups must require a finance approval note");
    assert.match(missingReview.data.message || "", /finance approval notes are required/i);

    const reference = `SMOKE-TOPUP-${Date.now()}`;
    const created = await request("/api/production/electricity-topups", {
      session,
      method: "POST",
      body: { topup_date: "2026-08-20", kwh_units: 50, total_cost: 1250, reference, notes: "Smoke production top-up", review_notes: "Smoke reviewed production top-up" }
    });
    assert.equal(created.response.status, 201, created.data.message || "production top-up create failed");
    artifactIds.topupId = created.data.id;
    artifactIds.expenseId = created.data.expense_id;
    assert.equal(Number(created.data.cost_per_unit), 25);
    assert.ok(artifactIds.expenseId, "a production top-up should create a linked expense");

    const linkedExpense = await pool.query("SELECT * FROM expenses WHERE id = $1", [artifactIds.expenseId]);
    assert.equal(linkedExpense.rows[0]?.category, "Production - Electricity");
    assert.equal(Number(linkedExpense.rows[0]?.amount), 1250);
    assert.equal(linkedExpense.rows[0]?.reference, reference);

    const audit = await pool.query(
      "SELECT action FROM audit_events WHERE entity_type = 'production_electricity_topup' AND entity_id = $1",
      [artifactIds.topupId]
    );
    assert.equal(audit.rows[0]?.action, "production_electricity_topup.created");
  });

  it("previews invalid expense imports and commits only valid rows", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const startedAt = new Date();
    const expenseIds = [];
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (expenseIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'expense' AND entity_id = ANY($1::int[])", [expenseIds]);
          await client.query("DELETE FROM expenses WHERE id = ANY($1::int[])", [expenseIds]);
        }
        await client.query(
          "DELETE FROM audit_events WHERE action = 'expense_import.committed' AND created_at >= $1",
          [startedAt]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const invalidPreview = await request("/api/expenses/imports/preview", {
      session,
      method: "POST",
      body: { csv: "expense_date,category,description,amount,payment_channel\n2026-08-01,Repairs,Missing amount,,bank" }
    });
    assert.equal(invalidPreview.response.status, 200, invalidPreview.data.message || "expense import preview failed");
    assert.equal(invalidPreview.data.summary.invalid, 1);
    assert.match(invalidPreview.data.rows[0]?.errors?.join(" ") || "", /Amount is required/i);

    const suffix = Date.now();
    const csv = [
      "expense_date,category,vendor,description,amount,payment_channel,reference,notes",
      `2026-08-01,Repairs,Smoke supplier,Smoke imported repair ${suffix},2500,bank,SMOKE-EXP-${suffix}-A,Import test row A`,
      `2026-08-02,Utilities,Smoke supplier,Smoke imported utility ${suffix},1250,mpesa_paybill,SMOKE-EXP-${suffix}-B,Import test row B`
    ].join("\n");
    const preview = await request("/api/expenses/imports/preview", { session, method: "POST", body: { csv } });
    assert.equal(preview.response.status, 200, preview.data.message || "valid expense import preview failed");
    assert.equal(preview.data.summary.valid, 2);
    assert.equal(preview.data.summary.totalAmount, 3750);

    const missingImportReview = await request("/api/expenses/imports/commit", { session, method: "POST", body: { csv } });
    assert.equal(missingImportReview.response.status, 400, "expense imports must require an approval note");
    assert.match(missingImportReview.data.message || "", /import approval notes are required/i);

    const committed = await request("/api/expenses/imports/commit", {
      session,
      method: "POST",
      body: { csv, review_notes: "Smoke reviewed expense import" }
    });
    assert.equal(committed.response.status, 201, committed.data.message || "expense import commit failed");
    assert.equal(committed.data.summary.imported, 2);
    assert.equal(committed.data.summary.totalAmount, 3750);
    expenseIds.push(...committed.data.imported.map((row) => row.expense_id));

    const importedExpenses = await pool.query("SELECT amount, reference FROM expenses WHERE id = ANY($1::int[]) ORDER BY amount DESC", [expenseIds]);
    assert.deepEqual(importedExpenses.rows.map((row) => Number(row.amount)), [2500, 1250]);
    assert.deepEqual(importedExpenses.rows.map((row) => row.reference), [`SMOKE-EXP-${suffix}-A`, `SMOKE-EXP-${suffix}-B`]);
  });

  it("records a valid direct expense only after passing financial validation", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    let expenseId = null;
    t.after(async () => {
      if (!expenseId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_events WHERE entity_type = 'expense' AND entity_id = $1", [expenseId]);
        await client.query("DELETE FROM expenses WHERE id = $1", [expenseId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const invalid = await request("/api/expenses", {
      session,
      method: "POST",
      body: {
        expense_date: "2026-08-10",
        category: "Repairs",
        description: "Smoke invalid direct expense",
        amount: 0,
        payment_channel: "bank",
        review_notes: "Smoke invalid amount review"
      }
    });
    assert.equal(invalid.response.status, 400, "zero-amount expenses must be rejected");
    assert.match(invalid.data.message || "", /greater than zero/i);

    const missingReview = await request("/api/expenses", {
      session,
      method: "POST",
      body: {
        expense_date: "2026-08-10",
        category: "Repairs",
        description: "Smoke missing direct-expense review",
        amount: 780,
        payment_channel: "bank"
      }
    });
    assert.equal(missingReview.response.status, 400, "direct expenses must require a finance approval note");
    assert.match(missingReview.data.message || "", /finance approval notes are required/i);

    const reference = `SMOKE-DIRECT-EXP-${Date.now()}`;
    const created = await request("/api/expenses", {
      session,
      method: "POST",
      body: {
        expense_date: "2026-08-10",
        category: "Repairs",
        vendor: "Smoke field supplier",
        description: "Smoke direct operating expense",
        amount: 780,
        payment_channel: "bank",
        reference,
        receipt_number: `RCT-${reference}`,
        notes: "Smoke direct expense validation",
        review_notes: "Smoke reviewed direct expense"
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "direct expense create failed");
    expenseId = created.data.id;
    assert.equal(Number(created.data.amount), 780);
    assert.equal(created.data.reference, reference);

    const audit = await pool.query(
      "SELECT action, after_data FROM audit_events WHERE entity_type = 'expense' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [expenseId]
    );
    assert.equal(audit.rows[0]?.action, "expense.created");
    assert.equal(Number(audit.rows[0]?.after_data?.amount), 780);
  });

  it("requires auditable approval notes for tariff pricing changes", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    let rateId = null;
    t.after(async () => {
      if (!rateId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_events WHERE entity_type = 'rate' AND entity_id = $1", [rateId]);
        await client.query("DELETE FROM rates WHERE id = $1", [rateId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const suffix = Date.now();
    const tariffPayload = {
      name: `Smoke tariff ${suffix}`,
      amount: 31,
      tariff_type: "block",
      effective_from: "2026-08-01",
      fixed_charge_amount: 55,
      vat_enabled: true,
      vat_rate: 16,
      reconnection_fee_amount: 250,
      is_active: true
    };
    const missingCreateReview = await request("/api/rates", { session, method: "POST", body: tariffPayload });
    assert.equal(missingCreateReview.response.status, 400, "tariff creation must require an approval note");
    assert.match(missingCreateReview.data.message || "", /pricing approval notes are required/i);

    const created = await request("/api/rates", {
      session,
      method: "POST",
      body: { ...tariffPayload, review_notes: "Smoke approved initial tariff pricing" }
    });
    assert.equal(created.response.status, 201, created.data.message || "tariff creation failed");
    rateId = created.data.id;

    const blocks = [
      { min_units: 0, max_units: 10, unit_rate: 25, sort_order: 0 },
      { min_units: 10, max_units: null, unit_rate: 35, sort_order: 1 }
    ];
    const missingBlockReview = await request(`/api/rates/${rateId}/blocks`, {
      session,
      method: "PUT",
      body: { blocks, effective_from: tariffPayload.effective_from }
    });
    assert.equal(missingBlockReview.response.status, 400, "tariff block changes must require an approval note");

    const savedBlocks = await request(`/api/rates/${rateId}/blocks`, {
      session,
      method: "PUT",
      body: { blocks, effective_from: tariffPayload.effective_from, review_notes: "Smoke approved block tariff tiers" }
    });
    assert.equal(savedBlocks.response.status, 200, savedBlocks.data.message || "tariff block save failed");
    assert.equal(savedBlocks.data.blocks.length, 2);

    const missingUpdateReview = await request(`/api/rates/${rateId}`, {
      session,
      method: "PUT",
      body: { ...tariffPayload, amount: 32 }
    });
    assert.equal(missingUpdateReview.response.status, 400, "tariff updates must require an approval note");

    const updated = await request(`/api/rates/${rateId}`, {
      session,
      method: "PUT",
      body: { ...tariffPayload, amount: 32, review_notes: "Smoke approved revised fallback rate" }
    });
    assert.equal(updated.response.status, 200, updated.data.message || "tariff update failed");
    assert.equal(Number(updated.data.amount), 32);

    const audit = await pool.query(
      "SELECT action, reason FROM audit_events WHERE entity_type = 'rate' AND entity_id = $1 ORDER BY id",
      [rateId]
    );
    assert.ok(audit.rows.some((row) => row.action === "rate.created" && /initial tariff pricing/.test(row.reason || "")));
    assert.ok(audit.rows.some((row) => row.action === "rate.blocks_updated" && /block tariff tiers/.test(row.reason || "")));
    assert.ok(audit.rows.some((row) => row.action === "rate.updated" && /revised fallback rate/.test(row.reason || "")));
  });

  it("requires an approval note before saving billing controls", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const current = await request("/api/billing/settings", { session });
    assert.equal(current.response.status, 200, current.data.message || "billing settings lookup failed");
    const payload = {
      penalty_grace_days: Number(current.data.penalty_grace_days || 0),
      penalty_type: current.data.penalty_type || "none",
      penalty_value: Number(current.data.penalty_value || 0),
      deposit_required: Boolean(current.data.deposit_required),
      default_deposit_amount: Number(current.data.default_deposit_amount || 0),
      bill_number_prefix: current.data.bill_number_prefix || "BILL",
      bill_number_next: Number(current.data.bill_number_next || 1),
      receipt_number_prefix: current.data.receipt_number_prefix || "RCPT",
      receipt_number_next: Number(current.data.receipt_number_next || 1),
      number_padding: Number(current.data.number_padding || 6)
    };
    const missingReview = await request("/api/billing/settings", { session, method: "PUT", body: payload });
    assert.equal(missingReview.response.status, 400, "billing settings must require an approval note");
    assert.match(missingReview.data.message || "", /configuration approval notes are required/i);

    const saved = await request("/api/billing/settings", {
      session,
      method: "PUT",
      body: { ...payload, review_notes: "Smoke reviewed unchanged billing control settings" }
    });
    assert.equal(saved.response.status, 200, saved.data.message || "billing settings save failed");
    assert.equal(saved.data.bill_number_prefix, payload.bill_number_prefix.toUpperCase());
    const audit = await pool.query(
      "SELECT id, reason FROM audit_events WHERE action = 'billing_settings.updated' AND entity_type = 'billing_settings' ORDER BY id DESC LIMIT 1"
    );
    assert.match(audit.rows[0]?.reason || "", /Smoke reviewed unchanged billing control settings/);
    t.after(async () => {
      await pool.query("DELETE FROM audit_events WHERE id = $1", [audit.rows[0]?.id]);
    });
  });

  it("posts a reviewed customer service charge with one linked payable bill", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const description = `Customer service charge smoke ${Date.now()}`;
    const chargeDate = new Date().toISOString().slice(0, 10);
    await removeCustomerServiceChargeSmokeArtifacts();
    try {
      const customers = await request("/api/customers", { session });
      assert.equal(customers.response.status, 200, customers.data.message || "customer list failed");
      const rows = [customers.data, customers.data.customers, customers.data.results, customers.data.items].find(Array.isArray) || [];
      assert.ok(rows[0]?.id, "a customer is required for service-charge checks");
      const payload = {
        customer_id: rows[0].id,
        charge_type: "inspection",
        description,
        amount: 125,
        charge_date: chargeDate,
        due_date: chargeDate
      };

      const missingApproval = await request("/api/customer-service-charges", {
        session,
        method: "POST",
        body: payload
      });
      assert.equal(missingApproval.response.status, 400, "customer charges must require finance approval notes");
      assert.match(missingApproval.data.message || "", /finance approval notes are required/i);

      const created = await request("/api/customer-service-charges", {
        session,
        method: "POST",
        body: { ...payload, review_notes: "Smoke approved a customer inspection charge." }
      });
      assert.equal(created.response.status, 201, created.data.message || "customer service charge creation failed");
      assert.equal(created.data.service_charge.status, "payable");
      assert.equal(created.data.bill.bill_pay_status, "payable");
      assert.equal(Number(created.data.bill.service_charge_id), Number(created.data.service_charge.id));

      const billDetail = await request(`/api/bills/${created.data.bill.id}`, { session });
      assert.equal(billDetail.response.status, 200, billDetail.data.message || "service-charge bill detail failed");
      assert.equal(billDetail.data.bill_origin, "service_charge");
      assert.equal(billDetail.data.charge_type, "inspection");
      assert.equal(billDetail.data.service_charge_description, description);

      const audit = await pool.query(
        `SELECT reason
         FROM audit_events
         WHERE action = 'customer_service_charge.created'
           AND entity_type = 'customer_service_charge'
           AND entity_id = $1
         ORDER BY id DESC
         LIMIT 1`,
        [created.data.service_charge.id]
      );
      assert.match(audit.rows[0]?.reason || "", /Smoke approved a customer inspection charge/);
    } finally {
      await removeCustomerServiceChargeSmokeArtifacts();
    }
  });

  it("requires a closure approval note before changing a customer account", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/customers/2147483647/close", {
      session,
      method: "POST",
      body: {
        settlement_date: new Date().toISOString().slice(0, 10),
        apply_deposit: false,
        notes: "Smoke verifies closure approval is enforced before account lookup."
      }
    });
    assert.equal(result.response.status, 400, "customer closures must require an approval note");
    assert.match(result.data.message || "", /closure approval notes are required/i);
  });

  it("requires an approval note before creating a customer account", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const [rates, zones] = await Promise.all([
      request("/api/rates", { session }),
      request("/api/zones", { session })
    ]);
    const rateRows = [rates.data, rates.data.rates, rates.data.rows].find(Array.isArray) || [];
    const zoneRows = [zones.data, zones.data.zones, zones.data.rows].find(Array.isArray) || [];
    const rate = rateRows.find((row) => row.is_active);
    const zone = zoneRows.find((row) => row.is_active);
    assert.ok(rate?.id && zone?.id, "an active rate and zone are required for customer setup checks");
    const result = await request("/api/customers", {
      session,
      method: "POST",
      body: {
        name: "Customer setup smoke approval check",
        acc_number: `SETUP-SMOKE-NOTE-${Date.now()}`,
        rate_id: rate.id,
        zone_id: zone.id
      }
    });
    assert.equal(result.response.status, 400, "customer setup must require an approval note");
    assert.match(result.data.message || "", /account-setup approval notes are required/i);
  });

  it("requires an approval note before permanently deleting a customer", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/customers/2147483647", { session, method: "DELETE" });
    assert.equal(result.response.status, 400, "customer deletion must require an approval note");
    assert.match(result.data.message || "", /deletion approval notes are required/i);
  });

  it("requires an auditable reason for customer delivery preference changes", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const suffix = Date.now();
    const artifacts = { customerId: null };

    t.after(async () => {
      if (!artifacts.customerId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_events WHERE entity_type = 'customer' AND entity_id = $1", [artifacts.customerId]);
        await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const [rateResult, zoneResult] = await Promise.all([
      pool.query("SELECT id, amount FROM rates WHERE is_active = TRUE ORDER BY id LIMIT 1"),
      pool.query("SELECT id FROM zones WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ]);
    const rate = rateResult.rows[0];
    const zone = zoneResult.rows[0];
    assert.ok(rate && zone, "an active rate and zone are required for delivery-preference checks");

    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, email_delivery_enabled, sms_delivery_enabled, whatsapp_delivery_enabled)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, FALSE)
       RETURNING id`,
      [rate.id, zone.id, `Delivery preference smoke ${suffix}`, `SMOKE-DELIVERY-${suffix}`, rate.amount]
    );
    artifacts.customerId = customer.rows[0].id;

    const missingReason = await request(`/api/customers/${artifacts.customerId}`, {
      session,
      method: "PUT",
      body: { email_delivery_enabled: false }
    });
    assert.equal(missingReason.response.status, 400, "staff delivery-preference changes must require a reason");
    assert.match(missingReason.data.message || "", /customer request or operational reason/i);

    const reason = "Customer requested no electronic delivery while contact details are corrected.";
    const optOut = await request(`/api/customers/${artifacts.customerId}`, {
      session,
      method: "PUT",
      body: { email_delivery_enabled: false, delivery_preference_reason: reason }
    });
    assert.equal(optOut.response.status, 200, optOut.data.message || "delivery opt-out update failed");
    assert.equal(optOut.data.email_delivery_enabled, false, "all delivery channels may be disabled for an opt-out");

    const unusablePreferred = await request(`/api/customers/${artifacts.customerId}`, {
      session,
      method: "PUT",
      body: {
        email_delivery_enabled: true,
        preferred_delivery_channel: "sms",
        delivery_preference_reason: "Smoke verifies the preferred channel remains usable."
      }
    });
    assert.equal(unusablePreferred.response.status, 400, "an enabled delivery set cannot retain a disabled preferred channel");

    const audit = await pool.query(
      `SELECT reason
       FROM audit_events
       WHERE entity_type = 'customer' AND entity_id = $1 AND action = 'customer.updated'
       ORDER BY id DESC
       LIMIT 1`,
      [artifacts.customerId]
    );
    assert.match(audit.rows[0]?.reason || "", /Customer requested no electronic delivery/);
  });

  it("requires an approval note before committing customer import batches", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const [customerImport, openingBalanceImport] = await Promise.all([
      request("/api/customers/imports/commit", { session, method: "POST", body: { csv: "name,acc_number" } }),
      request("/api/customers/opening-balances/imports/commit", { session, method: "POST", body: { csv: "acc_number,opening_balance_amount" } })
    ]);
    assert.equal(customerImport.response.status, 400, "customer import commit must require an approval note");
    assert.equal(openingBalanceImport.response.status, 400, "opening balance import commit must require an approval note");
    assert.match(customerImport.data.message || "", /import approval notes are required/i);
    assert.match(openingBalanceImport.data.message || "", /import approval notes are required/i);
  });

  it("requires an approval note before saving locations", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/zones", {
      session,
      method: "POST",
      body: { name: `Location approval smoke ${Date.now()}` }
    });
    assert.equal(result.response.status, 400, "location changes must require an approval note");
    assert.match(result.data.message || "", /location approval notes are required/i);
  });

  it("requires an approval note before creating a user account", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/users", {
      session,
      method: "POST",
      body: {
        name: "Access approval smoke",
        email: `access-approval-${Date.now()}@agua.local`,
        role: "meter_reader",
        password: "Smoke!234"
      }
    });
    assert.equal(result.response.status, 400, "user creation must require an approval note");
    assert.match(result.data.message || "", /access approval notes are required/i);
  });

  it("requires an approval note before changing a user account", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/users/2147483647", {
      session,
      method: "PUT",
      body: { is_active: false }
    });
    assert.equal(result.response.status, 400, "user changes must require an approval note");
    assert.match(result.data.message || "", /access approval notes are required/i);
  });

  it("requires an approval note before detaching a user access context", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const result = await request("/api/users/2147483647/access-profiles/2147483647", {
      session,
      method: "DELETE"
    });
    assert.equal(result.response.status, 400, "access-context removal must require an approval note");
    assert.match(result.data.message || "", /access-context removal notes are required/i);
  });

  it("requires approval notes before creating or changing a user access context", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const createResult = await request("/api/users/2147483647/access-profiles", {
      session,
      method: "POST",
      body: { role: "business_viewer" }
    });
    assert.equal(createResult.response.status, 400, "access-context creation must require an approval note");
    assert.match(createResult.data.message || "", /access-context approval notes are required/i);

    const updateResult = await request("/api/users/2147483647/access-profiles/2147483647", {
      session,
      method: "PATCH",
      body: { is_active: false }
    });
    assert.equal(updateResult.response.status, 400, "access-context changes must require an approval note");
    assert.match(updateResult.data.message || "", /access-context approval notes are required/i);
  });

  it("requires a reason before an admin changes a locked billing period", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const periodStart = `${new Date().getUTCFullYear() + 50}-11-15`;

    await removeBillingPeriodSmokeArtifacts(`${periodStart.slice(0, 8)}01`);
    try {
      const missingCycleReview = await request("/api/billing/periods", {
        session,
        method: "POST",
        body: { period_start: periodStart, status: "locked" }
      });
      assert.equal(missingCycleReview.response.status, 400, "billing period creation must require a cycle-start approval note");
      assert.match(missingCycleReview.data.message || "", /cycle-start approval notes are required/i);

      const created = await request("/api/billing/periods", {
        session,
        method: "POST",
        body: { period_start: periodStart, status: "locked", review_notes: "Smoke approved locked-period setup" }
      });
      assert.equal(created.response.status, 201, created.data.message || "locked billing period creation failed");
      assert.equal(created.data.status, "locked");

      const missingReason = await request(`/api/billing/periods/${created.data.id}/status`, {
        session,
        method: "PATCH",
        body: { status: "open" }
      });
      assert.equal(missingReason.response.status, 400, "locked periods must require a correction reason");
      assert.match(missingReason.data.message || "", /correction reason is required/i);

      const corrected = await request(`/api/billing/periods/${created.data.id}/status`, {
        session,
        method: "PATCH",
        body: { status: "open", correction_reason: "Smoke test verified locked-period correction controls" }
      });
      assert.equal(corrected.response.status, 200, corrected.data.message || "locked billing period correction failed");
      assert.equal(corrected.data.status, "open");
    } finally {
      await removeBillingPeriodSmokeArtifacts(`${periodStart.slice(0, 8)}01`);
    }
  });

  it("requires and audits a close override when a period has unresolved blockers", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const periodStart = `${new Date().getUTCFullYear() + 49}-10-15`;

    await removeBillingPeriodSmokeArtifacts(`${periodStart.slice(0, 8)}01`);
    try {
      const created = await request("/api/billing/periods", {
        session,
        method: "POST",
        body: { period_start: periodStart, status: "open", review_notes: "Smoke approved open-period setup" }
      });
      assert.equal(created.response.status, 201, created.data.message || "close-override period creation failed");

      const missingOverrideReason = await request(`/api/billing/periods/${created.data.id}/status`, {
        session,
        method: "PATCH",
        body: { status: "closed", review_notes: "Smoke reviewed month-end readiness before close." }
      });
      assert.equal(missingOverrideReason.response.status, 400, "blocker overrides must require a reason");
      assert.match(missingOverrideReason.data.message || "", /close override reason is required/i);

      const missingApprovalNote = await request(`/api/billing/periods/${created.data.id}/status`, {
        session,
        method: "PATCH",
        body: { status: "closed", correction_reason: "Smoke documented blocker override without approval note." }
      });
      assert.equal(missingApprovalNote.response.status, 400, "period close must require a month-end approval note");
      assert.match(missingApprovalNote.data.message || "", /month-end approval notes are required/i);

      const closed = await request(`/api/billing/periods/${created.data.id}/status`, {
        session,
        method: "PATCH",
        body: {
          status: "closed",
          correction_reason: "Smoke test approved the documented close override.",
          review_notes: "Smoke reviewed readiness and approved the controlled month-end close."
        }
      });
      assert.equal(closed.response.status, 200, closed.data.message || "close override failed");
      assert.equal(closed.data.status, "closed");

      const audit = await pool.query(
        `SELECT after_data, reason
         FROM audit_events
         WHERE entity_type = 'billing_period'
           AND entity_id = $1
           AND action = 'billing_period.status_updated'
         ORDER BY id DESC
         LIMIT 1`,
        [created.data.id]
      );
      assert.match(audit.rows[0]?.reason || "", /Smoke reviewed readiness and approved the controlled month-end close/);
      assert.match(audit.rows[0]?.reason || "", /Smoke test approved the documented close override/);
      assert.ok(Number(audit.rows[0]?.after_data?.close_readiness?.blockers) > 0, "audit should retain the close blocker snapshot");
    } finally {
      await removeBillingPeriodSmokeArtifacts(`${periodStart.slice(0, 8)}01`);
    }
  });

  it("requires an explicit source-billing review and keeps approved source bills held", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifacts = { billIds: [], meterIds: [], readingIds: [], requestIds: [] };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM audit_events
           WHERE (entity_type = 'source_billing_request' AND entity_id = ANY($1::int[]))
              OR (entity_type = 'bill' AND entity_id = ANY($2::int[]))`,
          [artifacts.requestIds, artifacts.billIds]
        );
        if (artifacts.billIds.length) await client.query("DELETE FROM bills WHERE id = ANY($1::int[])", [artifacts.billIds]);
        if (artifacts.requestIds.length) await client.query("DELETE FROM source_billing_requests WHERE id = ANY($1::int[])", [artifacts.requestIds]);
        if (artifacts.readingIds.length) await client.query("DELETE FROM meter_readings WHERE id = ANY($1::int[])", [artifacts.readingIds]);
        if (artifacts.meterIds.length) await client.query("DELETE FROM meters WHERE id = ANY($1::int[])", [artifacts.meterIds]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const context = await pool.query(
      `SELECT c.id AS customer_id, bp.id AS billing_period_id
       FROM customers c
       CROSS JOIN billing_periods bp
       WHERE c.status = 'active'
       ORDER BY bp.id ASC, c.id ASC
       LIMIT 1`
    );
    if (!context.rows[0]) {
      t.skip("An active customer and billing period are required for source-billing review coverage.");
      return;
    }
    const { customer_id: customerId, billing_period_id: billingPeriodId } = context.rows[0];
    const suffix = Date.now();
    const createSourceRequest = async (kind, day) => {
      const meter = await pool.query(
        `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status, notes)
         VALUES ($1, $2, 'source_backup', '2096-01-01', 0, 'active', 'Source billing smoke fixture')
         RETURNING id`,
        [customerId, `SMOKE-SOURCE-${kind}-${suffix}`]
      );
      artifacts.meterIds.push(meter.rows[0].id);
      const previous = await pool.query(
        `INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, reading_value, reading_date, source, notes)
         VALUES ($1, $2, $3, 100, $4, 'field', 'Source billing smoke previous reading')
         RETURNING id`,
        [customerId, meter.rows[0].id, billingPeriodId, `2096-01-${String(day).padStart(2, "0")}`]
      );
      const current = await pool.query(
        `INSERT INTO meter_readings (customer_id, meter_id, billing_period_id, previous_reading_id, previous_reading_value, reading_value, reading_date, source, notes)
         VALUES ($1, $2, $3, $4, 100, 120, $5, 'field', 'Source billing smoke current reading')
         RETURNING id`,
        [customerId, meter.rows[0].id, billingPeriodId, previous.rows[0].id, `2096-01-${String(day + 1).padStart(2, "0")}`]
      );
      artifacts.readingIds.push(previous.rows[0].id, current.rows[0].id);
      const sourceRequest = await pool.query(
        `INSERT INTO source_billing_requests (
          customer_id, meter_id, billing_period_id, previous_reading_id, current_reading_id,
          previous_reading, current_reading, units_used, rate, amount, subtotal_amount,
          fixed_charge_amount, vat_amount, reconnection_fee_amount, tariff_snapshot, due_date, reason
        )
        VALUES ($1, $2, $3, $4, $5, 100, 120, 20, 50, 1000, 1000, 0, 0, 0, '{}'::jsonb, '2096-01-31', $6)
        RETURNING id`,
        [customerId, meter.rows[0].id, billingPeriodId, previous.rows[0].id, current.rows[0].id, `Source billing smoke ${kind}`]
      );
      artifacts.requestIds.push(sourceRequest.rows[0].id);
      return sourceRequest.rows[0].id;
    };

    const rejectedRequestId = await createSourceRequest("reject", 1);
    const missingNotes = await request(`/api/billing/source-billing-requests/${rejectedRequestId}/review`, {
      session,
      method: "PATCH",
      body: { action: "reject" }
    });
    assert.equal(missingNotes.response.status, 400, "source-billing rejection must require review notes");
    assert.match(missingNotes.data.message || "", /review notes are required/i);

    const rejected = await request(`/api/billing/source-billing-requests/${rejectedRequestId}/review`, {
      session,
      method: "PATCH",
      body: { action: "reject", review_notes: "Source meter variance rejected by smoke review" }
    });
    assert.equal(rejected.response.status, 200, rejected.data.message || "source-billing rejection failed");
    assert.equal(rejected.data.request.status, "rejected");
    assert.equal(rejected.data.bill, null);

    const approvedRequestId = await createSourceRequest("approve", 4);
    const approved = await request(`/api/billing/source-billing-requests/${approvedRequestId}/review`, {
      session,
      method: "PATCH",
      body: { action: "approve", review_notes: "Source backup charge approved by smoke review" }
    });
    assert.equal(approved.response.status, 200, approved.data.message || "source-billing approval failed");
    assert.equal(approved.data.request.status, "approved");
    assert.equal(approved.data.bill.billing_source, "source_backup");
    assert.equal(approved.data.bill.bill_pay_status, "held", "source billing must not become payable without promotion");
    assert.equal(Number(approved.data.bill.total_amount), 1000);
    artifacts.billIds.push(approved.data.bill.id);

    const readiness = await request(`/api/billing/periods/${billingPeriodId}/readiness`, { session });
    assert.equal(readiness.response.status, 200, readiness.data.message || "billing-period readiness failed");
    const heldBillBlocker = readiness.data.checks?.find((check) => check.key === "held_bills");
    assert.ok(Number(heldBillBlocker?.count) >= 1, "a partially issued period must surface held bills as a close blocker");
    assert.ok(Number(heldBillBlocker?.amount) >= 1000, "held bill exposure must remain visible during readiness review");

    const repeatReview = await request(`/api/billing/source-billing-requests/${approvedRequestId}/review`, {
      session,
      method: "PATCH",
      body: { action: "approve" }
    });
    assert.equal(repeatReview.response.status, 400, "reviewed source billing must not be processed twice");

    const audit = await pool.query(
      `SELECT action, reason
       FROM audit_events
       WHERE entity_type = 'source_billing_request' AND entity_id = ANY($1::int[])
       ORDER BY id`,
      [artifacts.requestIds]
    );
    assert.ok(audit.rows.some((row) => row.action === "source_billing_request.rejected"));
    assert.ok(audit.rows.some((row) => row.action === "source_billing_request.approved"));
  });

  it("requires reasons and preserves bill balances when a penalty is waived then re-applied", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const artifacts = { billId: null, applicationId: null };
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM audit_events
           WHERE entity_type = 'bill' AND entity_id = $1`,
          [artifacts.billId]
        );
        if (artifacts.applicationId) await client.query("DELETE FROM bill_penalty_applications WHERE id = $1", [artifacts.applicationId]);
        if (artifacts.billId) await client.query("DELETE FROM bills WHERE id = $1", [artifacts.billId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const customer = await pool.query("SELECT id FROM customers WHERE status = 'active' ORDER BY id ASC LIMIT 1");
    if (!customer.rows[0]) {
      t.skip("An active customer is required for penalty correction coverage.");
      return;
    }
    const suffix = Date.now();
    const bill = await pool.query(
      `INSERT INTO bills (
        customer_id, bill_number, billing_month, previous_reading, current_reading, units_used, rate,
        amount, subtotal_amount, penalty_amount, vat_amount, reconnection_fee_amount, total_amount,
        balance_amount, paid_amount, status, due_date, bill_pay_status
      )
      VALUES ($1, $2, '2096-02-01', 0, 0, 0, 0, 1250, 1000, 250, 0, 0, 1250, 1250, 0, 'unpaid', '2096-02-10', 'payable')
      RETURNING id`,
      [customer.rows[0].id, `SMOKE-PENALTY-${suffix}`]
    );
    artifacts.billId = bill.rows[0].id;
    const application = await pool.query(
      `INSERT INTO bill_penalty_applications (
        bill_id, application_month, applied_on, amount, penalty_type, penalty_value, principal_amount, reason
      )
      VALUES ($1, '2096-02-01', '2096-02-20', 250, 'fixed', 250, 1000, 'Smoke penalty application')
      RETURNING id`,
      [artifacts.billId]
    );
    artifacts.applicationId = application.rows[0].id;

    const missingWaiverReason = await request(`/api/billing/penalties/${artifacts.applicationId}/waive`, {
      session,
      method: "PATCH",
      body: {}
    });
    assert.equal(missingWaiverReason.response.status, 400, "penalty waiver must require a reason");
    assert.match(missingWaiverReason.data.message || "", /waiver reason is required/i);

    const waived = await request(`/api/billing/penalties/${artifacts.applicationId}/waive`, {
      session,
      method: "PATCH",
      body: { reason: "Smoke waiver for verified customer correction" }
    });
    assert.equal(waived.response.status, 200, waived.data.message || "penalty waiver failed");
    assert.equal(Number(waived.data.bill.penalty_amount), 0);
    assert.equal(Number(waived.data.bill.total_amount), 1000);
    assert.equal(Number(waived.data.bill.balance_amount), 1000);
    assert.ok(waived.data.penalty_application.waived_at, "waived penalties must retain their waiver state");

    const repeatedWaiver = await request(`/api/billing/penalties/${artifacts.applicationId}/waive`, {
      session,
      method: "PATCH",
      body: { reason: "Smoke duplicate waiver" }
    });
    assert.equal(repeatedWaiver.response.status, 400, "a penalty must not be waived twice");

    const missingReapplyReason = await request(`/api/billing/penalties/${artifacts.applicationId}/reapply`, {
      session,
      method: "PATCH",
      body: {}
    });
    assert.equal(missingReapplyReason.response.status, 400, "penalty re-application must require a reason");
    assert.match(missingReapplyReason.data.message || "", /re-application reason is required/i);

    const reapplied = await request(`/api/billing/penalties/${artifacts.applicationId}/reapply`, {
      session,
      method: "PATCH",
      body: { reason: "Smoke re-application after correction reversal" }
    });
    assert.equal(reapplied.response.status, 200, reapplied.data.message || "penalty re-application failed");
    assert.equal(Number(reapplied.data.bill.penalty_amount), 250);
    assert.equal(Number(reapplied.data.bill.total_amount), 1250);
    assert.equal(Number(reapplied.data.bill.balance_amount), 1250);
    assert.equal(reapplied.data.penalty_application.waived_at, null);

    const audit = await pool.query(
      `SELECT action, reason
       FROM audit_events
       WHERE entity_type = 'bill' AND entity_id = $1
       ORDER BY id`,
      [artifacts.billId]
    );
    assert.ok(audit.rows.some((row) => row.action === "bill.penalty_waived"));
    assert.ok(audit.rows.some((row) => row.action === "bill.penalty_reapplied"));
  });

  it("returns a read-only penalty candidate preview", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const preview = await request("/api/billing/penalties/preview?application_date=2096-02-20", { session });
    assert.equal(preview.response.status, 200, preview.data.message || "penalty preview failed");
    assert.ok(preview.data.summary, "penalty preview should include a summary");
    assert.equal(typeof preview.data.summary.eligible_bills, "number");
    assert.equal(typeof preview.data.summary.total_penalties, "number");
    assert.equal(typeof preview.data.summary.enabled, "boolean");
    assert.ok(Array.isArray(preview.data.rows), "penalty preview should return candidate rows");
  });

  it("updates individual and batch field dispatches without closing requests", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const [customers, assignees] = await Promise.all([
      request("/api/customers", { session }),
      request("/api/maintenance-requests/assignees", { session })
    ]);
    assert.equal(customers.response.status, 200, customers.data.message || "customer list failed");
    assert.equal(assignees.response.status, 200, assignees.data.message || "maintenance assignee list failed");
    const customer = customers.data.find((row) => row.status === "active");
    const assignee = assignees.data.find((row) => row.role === "meter_reader") || assignees.data[0];
    if (!customer?.id || !assignee?.id) {
      t.skip("An active customer and field assignee are required for the dispatch update check.");
      return;
    }

    const maintenanceRequestIds = [];
    t.after(async () => {
      if (!maintenanceRequestIds.length) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const expenses = await client.query("SELECT id FROM expenses WHERE maintenance_request_id = ANY($1::int[])", [maintenanceRequestIds]);
        const expenseIds = expenses.rows.map((row) => row.id);
        if (expenseIds.length) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'expense' AND entity_id = ANY($1::int[])", [expenseIds]);
          await client.query("DELETE FROM expenses WHERE id = ANY($1::int[])", [expenseIds]);
        }
        await client.query("DELETE FROM audit_events WHERE entity_type = 'maintenance_request' AND entity_id = ANY($1::int[])", [maintenanceRequestIds]);
        await client.query("DELETE FROM maintenance_requests WHERE id = ANY($1::int[])", [maintenanceRequestIds]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const created = await request("/api/maintenance-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customer.id,
        category: "leak",
        priority: "high",
        source: "field",
        description: `Smoke dispatch assignment ${Date.now()}`
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "dispatch test request creation failed");
    maintenanceRequestIds.push(created.data.id);

    const targetDate = new Date().toISOString().slice(0, 10);
    const updated = await request(`/api/maintenance-requests/${created.data.id}`, {
      session,
      method: "PUT",
      body: { assigned_to: assignee.id, target_date: targetDate }
    });
    assert.equal(updated.response.status, 200, updated.data.message || "dispatch update failed");
    assert.equal(Number(updated.data.assigned_to), Number(assignee.id));
    assert.equal(String(updated.data.target_date).slice(0, 10), targetDate);
    assert.equal(updated.data.status, created.data.status, "scheduling must preserve the request status");

    const audit = await pool.query(
      `SELECT after_data
       FROM audit_events
       WHERE action = 'maintenance_request.updated' AND entity_type = 'maintenance_request' AND entity_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [created.data.id]
    );
    assert.equal(Number(audit.rows[0]?.after_data?.assigned_to), Number(assignee.id));
    assert.equal(String(audit.rows[0]?.after_data?.target_date).slice(0, 10), targetDate);

    const secondCreated = await request("/api/maintenance-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customer.id,
        category: "meter_fault",
        priority: "normal",
        source: "field",
        description: `Smoke batch dispatch assignment ${Date.now()}`
      }
    });
    assert.equal(secondCreated.response.status, 201, secondCreated.data.message || "batch dispatch test request creation failed");
    maintenanceRequestIds.push(secondCreated.data.id);

    const batch = await request("/api/maintenance-requests/dispatch", {
      session,
      method: "PUT",
      body: { request_ids: [created.data.id, secondCreated.data.id], assigned_to: assignee.id, target_date: targetDate }
    });
    assert.equal(batch.response.status, 200, batch.data.message || "batch dispatch failed");
    assert.equal(batch.data.count, 2);
    assert.equal(batch.data.requests.length, 2);
    for (const requestRow of batch.data.requests) {
      assert.equal(Number(requestRow.assigned_to), Number(assignee.id));
      assert.equal(String(requestRow.target_date).slice(0, 10), targetDate);
      assert.equal(requestRow.status, "open", "batch scheduling must preserve the request status");
    }
    const batchAudit = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM audit_events
       WHERE action = 'maintenance_request.batch_dispatched'
         AND entity_type = 'maintenance_request'
         AND entity_id = ANY($1::int[])`,
      [maintenanceRequestIds]
    );
    assert.equal(batchAudit.rows[0].count, 2, "each scheduled request needs a batch dispatch audit event");

    const duplicateBatch = await request("/api/maintenance-requests/dispatch", {
      session,
      method: "PUT",
      body: { request_ids: [created.data.id, created.data.id], assigned_to: assignee.id, target_date: targetDate }
    });
    assert.equal(duplicateBatch.response.status, 400, "duplicate request selections must be rejected");
    assert.match(duplicateBatch.data.message || "", /only once/i);

    const financeCreated = await request("/api/maintenance-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customer.id,
        category: "payment_plan",
        priority: "normal",
        source: "internal",
        description: `Smoke non-field dispatch guard ${Date.now()}`
      }
    });
    assert.equal(financeCreated.response.status, 201, financeCreated.data.message || "finance guard request creation failed");
    maintenanceRequestIds.push(financeCreated.data.id);

    const rejectedMixedBatch = await request("/api/maintenance-requests/dispatch", {
      session,
      method: "PUT",
      body: {
        request_ids: [created.data.id, financeCreated.data.id],
        assigned_to: assignee.id,
        target_date: "2099-01-01"
      }
    });
    assert.equal(rejectedMixedBatch.response.status, 400, "finance cases must not enter a field dispatch batch");
    assert.match(rejectedMixedBatch.data.message || "", /active field requests/i);

    const untouched = await pool.query(
      `SELECT id, assigned_to, target_date
       FROM maintenance_requests
       WHERE id = ANY($1::int[])
       ORDER BY id`,
      [[created.data.id, financeCreated.data.id]]
    );
    const unchangedFieldRequest = untouched.rows.find((row) => Number(row.id) === Number(created.data.id));
    const unchangedFinanceRequest = untouched.rows.find((row) => Number(row.id) === Number(financeCreated.data.id));
    assert.equal(Number(unchangedFieldRequest?.assigned_to), Number(assignee.id), "a rejected batch must not reschedule earlier field rows");
    assert.equal(String(unchangedFieldRequest?.target_date).slice(0, 10), targetDate, "a rejected batch must retain existing field dates");
    assert.equal(unchangedFinanceRequest?.assigned_to, null, "a rejected batch must not assign a finance case");
    assert.equal(unchangedFinanceRequest?.target_date, null, "a rejected batch must not schedule a finance case");

    const expensePayload = {
      expense_date: targetDate,
      category: "Maintenance - leak",
      vendor: "Smoke field supplier",
      description: "Smoke maintenance repair materials",
      amount: 215,
      payment_channel: "cash",
      reference: `SMOKE-MR-${Date.now()}`
    };
    const missingExpenseReview = await request(`/api/maintenance-requests/${created.data.id}/expenses`, {
      session,
      method: "POST",
      body: expensePayload
    });
    assert.equal(missingExpenseReview.response.status, 400, "maintenance expenses must require a finance approval note");
    assert.match(missingExpenseReview.data.message || "", /finance approval notes are required/i);

    const attachedExpense = await request(`/api/maintenance-requests/${created.data.id}/expenses`, {
      session,
      method: "POST",
      body: { ...expensePayload, review_notes: "Smoke reviewed maintenance repair receipt" }
    });
    assert.equal(attachedExpense.response.status, 201, attachedExpense.data.message || "maintenance expense attachment failed");
    assert.equal(Number(attachedExpense.data.expense.amount), expensePayload.amount);
    assert.equal(Number(attachedExpense.data.expense.maintenance_request_id), Number(created.data.id));

    const expenseAudit = await pool.query(
      "SELECT reason FROM audit_events WHERE entity_type = 'expense' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [attachedExpense.data.expense.id]
    );
    assert.match(expenseAudit.rows[0]?.reason || "", /Smoke reviewed maintenance repair receipt/);
    const maintenanceExpenseAudit = await pool.query(
      "SELECT reason FROM audit_events WHERE action = 'maintenance_request.expense_attached' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [created.data.id]
    );
    assert.equal(maintenanceExpenseAudit.rows[0]?.reason, "Smoke reviewed maintenance repair receipt");
  });

  it("records an approved payment arrangement without changing bill allocation", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const arrears = await request("/api/communications/arrears-follow-up?limit=1", { session });
    assert.equal(arrears.response.status, 200, arrears.data.message || "arrears queue failed");
    const customer = arrears.data.rows?.[0];
    if (!customer?.customer_id || Number(customer.overdue_balance) <= 0) {
      t.skip("No overdue customer is available for the payment arrangement check.");
      return;
    }

    let arrangementId;
    let paymentPlanRequestId;
    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (arrangementId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'payment_arrangement' AND entity_id = $1", [arrangementId]);
          await client.query("DELETE FROM payment_arrangements WHERE id = $1", [arrangementId]);
        }
        if (paymentPlanRequestId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'maintenance_request' AND entity_id = $1", [paymentPlanRequestId]);
          await client.query("DELETE FROM maintenance_requests WHERE id = $1", [paymentPlanRequestId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const paymentPlanRequest = await request("/api/maintenance-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customer.customer_id,
        category: "payment_plan",
        priority: "normal",
        description: `Smoke payment-plan request ${Date.now()}`
      }
    });
    assert.equal(paymentPlanRequest.response.status, 201, paymentPlanRequest.data.message || "payment-plan request creation failed");
    paymentPlanRequestId = paymentPlanRequest.data.id;

    const created = await request("/api/payment-arrangements", {
      session,
      method: "POST",
      body: {
        customer_id: customer.customer_id,
        agreed_amount: 1,
        installment_amount: 1,
        frequency: "weekly",
        first_due_date: new Date().toISOString().slice(0, 10),
        notes: "Smoke payment arrangement",
        maintenance_request_id: paymentPlanRequestId
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "payment arrangement creation failed");
    arrangementId = created.data.id;
    assert.equal(created.data.status, "active");
    assert.ok(created.data.arrangement_number, "payment arrangement should receive an identifier");
    assert.equal(Number(created.data.maintenance_request_id), Number(paymentPlanRequestId));

    const resolvedRequest = await pool.query(
      "SELECT status, resolution_notes FROM maintenance_requests WHERE id = $1",
      [paymentPlanRequestId]
    );
    assert.equal(resolvedRequest.rows[0]?.status, "resolved", "linked request should close when its payment plan is approved");
    assert.match(resolvedRequest.rows[0]?.resolution_notes || "", new RegExp(created.data.arrangement_number));

    const listed = await request(`/api/payment-arrangements?customer_id=${customer.customer_id}`, { session });
    assert.equal(listed.response.status, 200, listed.data.message || "payment arrangement list failed");
    const activeArrangement = listed.data.find((arrangement) => arrangement.id === created.data.id);
    assert.equal(activeArrangement?.performance_status, "behind");
    assert.equal(Number(activeArrangement?.expected_amount), 1);
    assert.equal(Number(activeArrangement?.received_amount), 0);
    assert.equal(activeArrangement?.last_reminder_status, null);

    const planFollowUp = await request("/api/communications/payment-plan-follow-up", { session });
    assert.equal(planFollowUp.response.status, 200, planFollowUp.data.message || "payment-plan follow-up failed");
    const reminder = planFollowUp.data.rows?.find((row) => row.arrangement_id === created.data.id);
    assert.ok(reminder, "behind arrangement should be included in the payment-plan reminder queue");
    assert.equal(Number(reminder.shortfall_amount), 1);
    assert.equal(typeof reminder.template_values?.shortfall_amount, "string");
    assert.equal(typeof reminder.contacts?.email?.ready, "boolean");

    const closed = await request(`/api/payment-arrangements/${created.data.id}/close`, {
      session,
      method: "PATCH",
      body: { status: "cancelled", closure_notes: "Smoke arrangement cleanup" }
    });
    assert.equal(closed.response.status, 200, closed.data.message || "payment arrangement closure failed");
    assert.equal(closed.data.status, "cancelled");
  });

  it("declines an open payment-plan request only with an auditable reason", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const arrears = await request("/api/communications/arrears-follow-up?limit=1", { session });
    assert.equal(arrears.response.status, 200, arrears.data.message || "arrears queue failed");
    const customer = arrears.data.rows?.[0];
    if (!customer?.customer_id) {
      t.skip("No customer is available for the payment-plan decline check.");
      return;
    }

    let paymentPlanRequestId;
    t.after(async () => {
      if (!paymentPlanRequestId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_events WHERE entity_type = 'maintenance_request' AND entity_id = $1", [paymentPlanRequestId]);
        await client.query("DELETE FROM maintenance_requests WHERE id = $1", [paymentPlanRequestId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const paymentPlanRequest = await request("/api/maintenance-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customer.customer_id,
        category: "payment_plan",
        priority: "normal",
        description: `Smoke payment-plan decline request ${Date.now()}`
      }
    });
    assert.equal(paymentPlanRequest.response.status, 201, paymentPlanRequest.data.message || "payment-plan request creation failed");
    paymentPlanRequestId = paymentPlanRequest.data.id;

    const missingReason = await request(`/api/payment-arrangements/requests/${paymentPlanRequestId}/decline`, {
      session,
      method: "PATCH",
      body: {}
    });
    assert.equal(missingReason.response.status, 400);
    assert.match(missingReason.data.message || "", /decline reason/i);

    const declined = await request(`/api/payment-arrangements/requests/${paymentPlanRequestId}/decline`, {
      session,
      method: "PATCH",
      body: { reason: "Customer needs to provide a sustainable repayment amount." }
    });
    assert.equal(declined.response.status, 200, declined.data.message || "payment-plan decline failed");
    assert.equal(declined.data.status, "cancelled");
    assert.match(declined.data.resolution_notes || "", /sustainable repayment amount/i);
  });

  it("tracks an auditable standing order without creating a payment", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const customerList = await request("/api/customers", { session });
    assert.equal(customerList.response.status, 200, customerList.data.message || "customer list failed");
    const existingOrders = await request("/api/standing-orders?status=active", { session });
    assert.equal(existingOrders.response.status, 200, existingOrders.data.message || "standing-order list failed");
    const activeMandateCustomerIds = new Set(existingOrders.data.map((order) => Number(order.customer_id)));
    const customer = customerList.data.find(
      (row) => row.status === "active" && !activeMandateCustomerIds.has(Number(row.id))
    );
    if (!customer?.id) {
      t.skip("No active customer without an existing standing order is available for the standing-order check.");
      return;
    }

    const reference = `SO-SMOKE-${Date.now()}`;
    let standingOrderId;
    t.after(async () => {
      if (!standingOrderId) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_events WHERE entity_type = 'standing_order' AND entity_id = $1", [standingOrderId]);
        await client.query("DELETE FROM standing_orders WHERE id = $1", [standingOrderId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const created = await request("/api/standing-orders", {
      session,
      method: "POST",
      body: {
        customer_id: customer.id,
        mandate_reference: reference,
        expected_amount: 10,
        frequency: "weekly",
        first_due_date: new Date().toISOString().slice(0, 10),
        notes: "Smoke standing order"
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "standing-order creation failed");
    standingOrderId = created.data.id;
    assert.equal(created.data.status, "active");

    const listed = await request(`/api/standing-orders?customer_id=${customer.id}`, { session });
    assert.equal(listed.response.status, 200, listed.data.message || "standing-order list failed");
    const activeOrder = listed.data.find((order) => order.id === standingOrderId);
    assert.equal(activeOrder?.mandate_reference, reference);
    assert.equal(activeOrder?.performance_status, "behind");
    assert.equal(Number(activeOrder?.expected_to_date), 10);
    assert.equal(Number(activeOrder?.matched_amount), 0);

    const standingOrderFollowUp = await request("/api/communications/standing-order-follow-up", { session });
    assert.equal(standingOrderFollowUp.response.status, 200, standingOrderFollowUp.data.message || "standing-order follow-up queue failed");
    const reminder = standingOrderFollowUp.data.rows?.find((row) => row.standing_order_id === standingOrderId);
    assert.ok(reminder, "behind standing order should be included in the reminder queue");
    assert.equal(Number(reminder.shortfall_amount), 10);
    assert.equal(typeof reminder.template_values?.mandate_reference, "string");

    const paused = await request(`/api/standing-orders/${standingOrderId}/status`, {
      session,
      method: "PATCH",
      body: { status: "paused", reason: "Smoke status review" }
    });
    assert.equal(paused.response.status, 200, paused.data.message || "standing-order pause failed");
    assert.equal(paused.data.status, "paused");
  });

  it("allows a portal customer to attach files only to their own portal request", async (t) => {
    await removePortalSmokeArtifacts();
    t.after(removePortalSmokeArtifacts);
    const { session, user } = await login(
      process.env.TEST_CUSTOMER_EMAIL || "jane@agua.local",
      process.env.TEST_CUSTOMER_PASSWORD || "Customer@123"
    );
    assert.equal(user.role, "customer");

    const portal = await request("/api/portal/dashboard", { session });
    assert.equal(portal.response.status, 200, portal.data.message || "portal dashboard failed");
    const customerId = portal.data.customer?.id;
    assert.ok(customerId, "portal customer account is required");
    assert.ok(Object.hasOwn(portal.data, "paymentArrangement"), "portal dashboard should expose the customer payment-plan summary field");
    assert.ok(
      portal.data.charts?.consumptionPaymentTrend?.every((row) => Number.isFinite(Number(row.units_used))),
      "portal dashboard should expose verified monthly consumption alongside billing and payment data"
    );
    assert.equal(typeof portal.data.usageBenchmark?.available, "boolean", "portal dashboard should expose benchmark availability");
    assert.equal(typeof portal.data.deliveryPreferences?.contacts?.email_available, "boolean", "portal should expose delivery preference readiness");

    const preferences = portal.data.deliveryPreferences;
    const preferenceUpdate = await request("/api/portal/delivery-preferences", {
      session,
      method: "PUT",
      body: {
        preferred_delivery_channel: preferences.preferred_delivery_channel,
        email_delivery_enabled: preferences.email_delivery_enabled,
        sms_delivery_enabled: preferences.sms_delivery_enabled,
        whatsapp_delivery_enabled: preferences.whatsapp_delivery_enabled
      }
    });
    assert.equal(preferenceUpdate.response.status, 200, preferenceUpdate.data.message || "delivery preference update failed");
    assert.equal(preferenceUpdate.data.preferred_delivery_channel, preferences.preferred_delivery_channel);
    assert.equal(Number(portal.data.usageBenchmark?.period_months), 6, "portal usage benchmark should use a six-month window");
    assert.ok(
      Number.isFinite(Number(portal.data.usageBenchmark?.customer_average_units)),
      "portal usage benchmark should expose the customer's aggregate usage"
    );
    assert.equal(
      portal.data.usageBenchmark?.available ? Number.isFinite(Number(portal.data.usageBenchmark?.peer_median_units)) : portal.data.usageBenchmark?.peer_median_units,
      portal.data.usageBenchmark?.available ? true : null,
      "peer usage is only exposed when the privacy threshold is met"
    );

    const denied = await request(
      `/api/documents?entity_type=maintenance_request&entity_id=2147483647&customer_id=${customerId}`,
      { session }
    );
    assert.equal(denied.response.status, 403, "portal customer must not access an unrelated request");

    const created = await request("/api/portal/service-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customerId,
        category: "payment_plan",
        priority: "normal",
        description: `Customer document smoke request ${Date.now()}`,
        payment_plan_proposal: {
          installment_amount: 250,
          frequency: "monthly",
          preferred_first_due_date: "2099-01-15"
        }
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "portal request creation failed");
    assert.equal(created.data.category, "payment_plan");
    assert.equal(created.data.source, "customer_portal");
    assert.equal(created.data.request_metadata?.payment_plan_proposal?.installment_amount, 250);

    const invalidConnection = await request("/api/portal/service-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customerId,
        category: "connection",
        priority: "normal",
        description: `Customer connection smoke request ${Date.now()}`,
        connection_request: { request_type: "new_connection", site_location: "" }
      }
    });
    assert.equal(invalidConnection.response.status, 400, "portal connection request must require a site location");

    const connection = await request("/api/portal/service-requests", {
      session,
      method: "POST",
      body: {
        customer_id: customerId,
        category: "connection",
        priority: "normal",
        description: `Customer connection smoke request ${Date.now()}`,
        connection_request: {
          request_type: "service_extension",
          site_location: "Smoke test service point",
          landmark: "Smoke test landmark",
          access_contact_name: "Smoke contact",
          access_contact_phone: "0700000000",
          preferred_inspection_date: "2099-01-15",
          access_notes: "Access after a confirmed appointment."
        }
      }
    });
    assert.equal(connection.response.status, 201, connection.data.message || "portal connection request creation failed");
    assert.equal(connection.data.category, "connection");
    assert.equal(connection.data.request_metadata?.connection_request?.request_type, "service_extension");
    assert.equal(connection.data.request_metadata?.connection_request?.site_location, "Smoke test service point");

    const refreshedPortal = await request("/api/portal/dashboard", { session });
    assert.equal(refreshedPortal.response.status, 200, refreshedPortal.data.message || "portal dashboard refresh failed");
    const requestDetail = refreshedPortal.data.serviceRequests?.find((item) => item.id === created.data.id);
    assert.equal(requestDetail?.description, created.data.description, "portal request details should include the submitted description");
    assert.equal(requestDetail?.request_metadata?.payment_plan_proposal?.frequency, "monthly", "portal should retain the payment-plan proposal");
    assert.equal(Object.hasOwn(requestDetail || {}, "resolution_notes"), false, "portal details must not expose internal resolution notes");
    const connectionDetail = refreshedPortal.data.serviceRequests?.find((item) => item.id === connection.data.id);
    assert.equal(connectionDetail?.request_metadata?.connection_request?.landmark, "Smoke test landmark", "portal should retain the connection site brief");

    const { session: adminSession } = await login(
      process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
      process.env.TEST_ADMIN_PASSWORD || "Admin@123"
    );
    const adminDashboard = await request("/api/dashboard", { session: adminSession });
    assert.equal(adminDashboard.response.status, 200, adminDashboard.data.message || "admin dashboard failed");
    const connectionAction = adminDashboard.data.actionCenter?.groups
      ?.flatMap((group) => group.items || [])
      .find((item) => item.key === "connection_requests");
    assert.ok(connectionAction, "dashboard should expose portal connection requests");
    assert.equal(connectionAction.page, "maintenance");
    assert.equal(connectionAction.focus, "connection_requests");
    assert.ok(Number(connectionAction.count) >= 1, "dashboard should count the active portal connection request");

    const disputableBill = refreshedPortal.data.bills?.[0];
    if (disputableBill) {
      const invalidDispute = await request("/api/portal/service-requests", {
        session,
        method: "POST",
        body: {
          customer_id: customerId,
          category: "billing_dispute",
          priority: "normal",
          description: `Customer billing dispute smoke request ${Date.now()}`,
          billing_dispute: { bill_id: 2147483647, reason: "usage" }
        }
      });
      assert.equal(invalidDispute.response.status, 404, "portal dispute must reject a bill outside the customer account");

      const dispute = await request("/api/portal/service-requests", {
        session,
        method: "POST",
        body: {
          customer_id: customerId,
          category: "billing_dispute",
          priority: "normal",
          description: `Customer billing dispute smoke request ${Date.now()}`,
          billing_dispute: { bill_id: disputableBill.id, reason: "meter_reading" }
        }
      });
      assert.equal(dispute.response.status, 201, dispute.data.message || "portal billing dispute creation failed");
      assert.equal(Number(dispute.data.request_metadata?.billing_dispute?.bill_id), Number(disputableBill.id));
      assert.equal(dispute.data.request_metadata?.billing_dispute?.reason, "meter_reading");

      const duplicateDispute = await request("/api/portal/service-requests", {
        session,
        method: "POST",
        body: {
          customer_id: customerId,
          category: "billing_dispute",
          priority: "normal",
          description: `Customer billing dispute smoke request ${Date.now()}`,
          billing_dispute: { bill_id: disputableBill.id, reason: "meter_reading" }
        }
      });
      assert.equal(duplicateDispute.response.status, 409, "portal should keep one active dispute per bill");

      const incompleteResolution = await request(`/api/maintenance-requests/${dispute.data.id}/resolve`, {
        session: adminSession,
        method: "PATCH",
        body: { resolution_notes: "Internal review confirmed the customer account history." }
      });
      assert.equal(incompleteResolution.response.status, 400, "billing disputes require a customer-safe outcome");

      const resolvedDispute = await request(`/api/maintenance-requests/${dispute.data.id}/resolve`, {
        session: adminSession,
        method: "PATCH",
        body: {
          resolution_notes: "Internal review confirmed the customer account history.",
          customer_resolution_summary: "We reviewed the bill and account history. Your account balance remains unchanged."
        }
      });
      assert.equal(resolvedDispute.response.status, 200, resolvedDispute.data.message || "billing dispute resolution failed");

      const portalAfterResolution = await request("/api/portal/dashboard", { session });
      const resolvedPortalDispute = portalAfterResolution.data.serviceRequests?.find((item) => item.id === dispute.data.id);
      assert.equal(resolvedPortalDispute?.customer_resolution_summary, "We reviewed the bill and account history. Your account balance remains unchanged.");
      assert.equal(Object.hasOwn(resolvedPortalDispute || {}, "resolution_notes"), false, "portal must not expose internal dispute notes");
    }

    const uploaded = await request("/api/documents", {
      session,
      method: "POST",
      body: {
        entity_type: "maintenance_request",
        entity_id: created.data.id,
        customer_id: customerId,
        original_name: "portal-evidence.png",
        mime_type: "image/png",
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ8AAAAABJRU5ErkJggg==",
        description: "Portal smoke evidence",
        evidence_metadata: {
          type: "field_photo",
          location_consent: true,
          captured_at: "2026-10-01T08:00:00.000Z",
          location: { latitude: -1.286389, longitude: 36.817223, accuracy_m: 12.5 }
        }
      }
    });
    assert.equal(uploaded.response.status, 201, uploaded.data.message || "portal document upload failed");

    const documents = await request(
      `/api/documents?entity_type=maintenance_request&entity_id=${created.data.id}&customer_id=${customerId}`,
      { session }
    );
    assert.equal(documents.response.status, 200, documents.data.message || "portal documents list failed");
    assert.equal(documents.data.length, 1, "portal customer should see their uploaded document");
    assert.equal(documents.data[0].evidence_metadata?.type, "field_photo", "location evidence should remain reviewable to the permitted uploader");

    const removed = await request(`/api/documents/${uploaded.data.id}?customer_id=${customerId}`, {
      session,
      method: "DELETE"
    });
    assert.equal(removed.response.status, 200, removed.data.message || "portal document removal failed");
  });

  it("holds customer meter readings for staff review before billing", async (t) => {
    await removeCustomerReadingSubmissionSmokeArtifacts();
    t.after(removeCustomerReadingSubmissionSmokeArtifacts);
    const { session: customerSession, user } = await login(
      process.env.TEST_CUSTOMER_EMAIL || "jane@agua.local",
      process.env.TEST_CUSTOMER_PASSWORD || "Customer@123"
    );
    assert.equal(user.role, "customer");

    const portal = await request("/api/portal/dashboard", { session: customerSession });
    assert.equal(portal.response.status, 200, portal.data.message || "portal dashboard failed");
    if (!portal.data.activeMeter?.id) {
      t.skip("No active billing meter is available for the portal reading submission check.");
      return;
    }

    const submission = await request("/api/portal/reading-submissions", {
      session: customerSession,
      method: "POST",
      body: {
        reading_value: Number(portal.data.latestReading?.reading_value || 0) + 1,
        reading_date: new Date().toISOString().slice(0, 10),
        notes: `Customer reading smoke submission ${Date.now()}`
      }
    });
    assert.equal(submission.response.status, 201, submission.data.message || "portal reading submission failed");
    assert.equal(submission.data.status, "pending");
    assert.equal(submission.data.official_reading_id, null, "customer submission must not create an official reading");

    const evidence = await request("/api/documents", {
      session: customerSession,
      method: "POST",
      body: {
        entity_type: "customer_reading_submission",
        entity_id: submission.data.id,
        original_name: "meter-photo.png",
        mime_type: "image/png",
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ8AAAAABJRU5ErkJggg==",
        description: "Meter display photo"
      }
    });
    assert.equal(evidence.response.status, 201, evidence.data.message || "meter evidence upload failed");

    const evidenceList = await request(
      `/api/documents?entity_type=customer_reading_submission&entity_id=${submission.data.id}`,
      { session: customerSession }
    );
    assert.equal(evidenceList.response.status, 200, evidenceList.data.message || "meter evidence list failed");
    assert.equal(evidenceList.data.length, 1, "portal customer should see their submitted meter photo");
    assert.equal(evidenceList.data[0].original_name, "meter-photo.png");

    const { session: staffSession } = await login(
      process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
      process.env.TEST_ADMIN_PASSWORD || "Admin@123"
    );
    const queue = await request("/api/readings/customer-submissions", { session: staffSession });
    assert.equal(queue.response.status, 200, queue.data.message || "customer reading queue failed");
    assert.ok(queue.data.some((item) => item.id === submission.data.id), "staff queue should include the pending customer reading");

    const rejected = await request(`/api/readings/customer-submissions/${submission.data.id}/review`, {
      session: staffSession,
      method: "POST",
      body: { action: "reject", review_notes: "Smoke review cleanup" }
    });
    assert.equal(rejected.response.status, 200, rejected.data.message || "customer reading rejection failed");
    assert.equal(rejected.data.submission.status, "rejected");
    assert.equal(rejected.data.submission.official_reading_id, null);

    const refreshedPortal = await request("/api/portal/dashboard", { session: customerSession });
    assert.equal(refreshedPortal.response.status, 200, refreshedPortal.data.message || "portal dashboard refresh failed");
    const history = refreshedPortal.data.readingSubmissions?.find((item) => item.id === submission.data.id);
    assert.equal(history?.status, "rejected", "portal history should show the review outcome");
    assert.equal(Object.hasOwn(history || {}, "review_notes"), false, "portal must not expose staff review notes");
  });

  it("lists active contexts and restricts the meter-reader dashboard to field measures", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const contexts = await request("/api/auth/contexts", { session });
    assert.equal(contexts.response.status, 200, contexts.data.message || "contexts endpoint failed");
    assert.ok(Array.isArray(contexts.data.contexts), "contexts should be an array");
    assert.ok(contexts.data.contexts.length >= 1, "at least one active context should be available");

    const switchAttempt = await request("/api/auth/switch-context", {
      session,
      method: "POST",
      body: { access_profile_id: 2147483647 }
    });
    assert.equal(switchAttempt.response.status, 403);

    const meterReaderContext = contexts.data.contexts.find((context) => context.role === "meter_reader");
    if (!meterReaderContext) {
      t.skip("No meter-reader access context is configured for the seeded admin user.");
      return;
    }
    const switched = await request("/api/auth/switch-context", {
      session,
      method: "POST",
      body: { access_profile_id: meterReaderContext.id }
    });
    assert.equal(switched.response.status, 200, switched.data.message || "meter-reader context switch failed");
    assert.equal(switched.data.user?.role, "meter_reader");

    const fieldDashboard = await request("/api/dashboard", { session });
    assert.equal(fieldDashboard.response.status, 200, fieldDashboard.data.message || "meter-reader dashboard failed");
    assert.ok(fieldDashboard.data.performance?.readings, "meter-reader dashboard should include reading completion");
    assert.ok(fieldDashboard.data.performance?.billing, "meter-reader dashboard should include billing readiness");
    assert.equal(Object.hasOwn(fieldDashboard.data.performance || {}, "collections"), false);
    assert.equal(Object.hasOwn(fieldDashboard.data.performance || {}, "deliveries"), false);
    assert.equal(Object.hasOwn(fieldDashboard.data.performance || {}, "margin"), false);
  });

  it("exposes the guarded production meter update route", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const updateAttempt = await request("/api/production/meters/2147483647", {
      session,
      method: "PATCH",
      body: {}
    });
    assert.equal(updateAttempt.response.status, 404);

    const meterList = await request("/api/production/meters", { session });
    assert.equal(meterList.response.status, 200, meterList.data.message || "production meters failed");
    const customerSourceMeter = meterList.data.find(
      (meter) => meter.meter_type === "customer_source" && meter.status === "active"
    );
    if (!customerSourceMeter) {
      t.skip("No active customer-source production meter is available for the link validation check.");
      return;
    }

    const invalidLinkAttempt = await request(`/api/production/meters/${customerSourceMeter.id}`, {
      session,
      method: "PATCH",
      body: { meter_id: 2147483647 }
    });
    assert.equal(invalidLinkAttempt.response.status, 400);
  });

  it("requires CSRF token for cookie-authenticated writes", async (t) => {
    await removeCsrfSmokeArtifacts();
    t.after(removeCsrfSmokeArtifacts);
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

  it("resolves reviewed monitoring events with an auditable note", async (t) => {
    await removeMonitoringResolutionSmokeArtifacts();
    t.after(removeMonitoringResolutionSmokeArtifacts);
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const { rows } = await pool.query(
      `INSERT INTO system_event_logs (event_type, severity, source, message)
       VALUES ('monitoring.smoke_resolution', 'error', 'client', 'Monitoring resolution smoke check')
       RETURNING id`
    );
    const eventId = rows[0].id;

    const missingNotes = await request(`/api/monitoring/events/${eventId}/resolve`, {
      session,
      method: "PATCH",
      body: { resolution_notes: "" }
    });
    assert.equal(missingNotes.response.status, 400);

    const resolutionNotes = "Verified the isolated development failure and no further action is required.";
    const resolved = await request(`/api/monitoring/events/${eventId}/resolve`, {
      session,
      method: "PATCH",
      body: { resolution_notes: resolutionNotes }
    });
    assert.equal(resolved.response.status, 200, resolved.data.message || "monitoring resolution failed");
    assert.ok(resolved.data.resolved_at);
    assert.equal(resolved.data.resolution_notes, resolutionNotes);

    const { rows: auditRows } = await pool.query(
      `SELECT action, reason
       FROM audit_events
       WHERE entity_type = 'system_event' AND entity_id = $1
       ORDER BY id DESC
       LIMIT 1`,
      [eventId]
    );
    assert.equal(auditRows[0]?.action, "system_event.resolved");
    assert.equal(auditRows[0]?.reason, resolutionNotes);
  });

  it("returns explicit meter and period-safe context for batch reading entry", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const eligibility = await request("/api/readings/eligible-customers?period_start=2099-01-15", { session });
    assert.equal(eligibility.response.status, 200, eligibility.data.message || "reading eligibility failed");
    assert.equal(eligibility.data.period?.periodStart, "2099-01-01");
    assert.equal(eligibility.data.period?.periodEnd, "2099-01-31");
    assert.ok(Array.isArray(eligibility.data.rows), "reading eligibility rows should be an array");

    for (const row of eligibility.data.rows) {
      assert.ok(Number(row.active_meter_count) > 0, "eligible customers should have an active billing meter");
      assert.ok(row.active_meter_id, "batch rows should identify the selected active meter");
      assert.ok(row.active_meter_number, "batch rows should identify the selected active meter number");
      if (row.latest_reading_date) {
        assert.ok(
          String(row.latest_reading_date).slice(0, 10) < eligibility.data.period.periodStart,
          "previous reading context must precede the selected billing period"
        );
      }
    }
  });

  it("returns a read-only, period-scoped reading anomaly queue", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const anomalies = await request("/api/readings/anomalies?period_start=2099-01-15", { session });

    assert.equal(anomalies.response.status, 200, anomalies.data.message || "reading anomalies request failed");
    assert.equal(anomalies.data.period?.periodStart, "2099-01-01");
    assert.equal(anomalies.data.period?.periodEnd, "2099-01-31");
    assert.equal(anomalies.data.threshold, 0.5);
    assert.equal(anomalies.data.baseline_intervals, 3);
    assert.ok(Array.isArray(anomalies.data.rows), "reading anomaly rows should be an array");

    for (const row of anomalies.data.rows) {
      assert.ok(row.id && row.customer_id && row.meter_id, "anomaly rows should identify the reading, customer, and meter");
      assert.ok(Number(row.baseline_interval_count) >= 3, "anomaly rows require three historical intervals");
      assert.ok(Number(row.variance_ratio) > 0.5, "anomaly rows must exceed the review threshold");
    }
  });

  it("returns read-only estimated-reading candidates for missing period readings", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const candidates = await request("/api/readings/estimation-candidates?period_start=2099-01-15", { session });

    assert.equal(candidates.response.status, 200, candidates.data.message || "estimated-reading candidates request failed");
    assert.equal(candidates.data.period?.periodStart, "2099-01-01");
    assert.equal(candidates.data.period?.periodEnd, "2099-01-31");
    assert.equal(candidates.data.baseline_intervals, 3);
    assert.ok(Array.isArray(candidates.data.rows), "estimated-reading candidate rows should be an array");

    for (const row of candidates.data.rows) {
      assert.ok(row.customer_id && row.meter_id, "candidate rows should identify the customer and meter");
      assert.equal(Number(row.interval_count), 3, "candidate rows need three earlier intervals");
      assert.ok(Number(row.average_units) > 0, "candidate averages must be positive");
      assert.ok(Number(row.suggested_reading_value) > Number(row.last_reading_value), "suggested readings must advance the meter");
    }
  });

  it("persists field-verification notes on estimated-reading submissions", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const suffix = Date.now();
    const artifacts = { customerId: null, meterId: null, baselineReadingId: null, readingId: null, billId: null, periodId: null };

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const readingIds = [artifacts.baselineReadingId, artifacts.readingId].filter(Boolean);
        if (artifacts.billId) await client.query("DELETE FROM audit_events WHERE entity_type = 'bill' AND entity_id = $1", [artifacts.billId]);
        if (readingIds.length) await client.query("DELETE FROM audit_events WHERE entity_type = 'meter_reading' AND entity_id = ANY($1::int[])", [readingIds]);
        if (artifacts.periodId) await client.query("DELETE FROM audit_events WHERE entity_type = 'billing_period' AND entity_id = $1", [artifacts.periodId]);
        if (artifacts.billId) await client.query("DELETE FROM bills WHERE id = $1", [artifacts.billId]);
        if (readingIds.length) await client.query("DELETE FROM meter_readings WHERE id = ANY($1::int[])", [readingIds]);
        if (artifacts.meterId) await client.query("DELETE FROM meters WHERE id = $1", [artifacts.meterId]);
        if (artifacts.customerId) await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        if (artifacts.periodId) await client.query("DELETE FROM billing_periods WHERE id = $1", [artifacts.periodId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const [{ rows: rateRows }, { rows: zoneRows }] = await Promise.all([
      pool.query("SELECT id, amount FROM rates ORDER BY id LIMIT 1"),
      pool.query("SELECT id FROM zones ORDER BY id LIMIT 1")
    ]);
    assert.ok(rateRows[0] && zoneRows[0], "a seeded rate and zone are required for the reading-note fixture");

    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [rateRows[0].id, zoneRows[0].id, `Estimated note smoke ${suffix}`, `SMOKE-EST-${suffix}`, rateRows[0].amount]
    );
    artifacts.customerId = customer.rows[0].id;
    const meter = await pool.query(
      `INSERT INTO meters (customer_id, meter_number, meter_role, installed_at, initial_reading, status)
       VALUES ($1, $2, 'client_billing', '2098-12-01', 100, 'active')
       RETURNING id`,
      [artifacts.customerId, `SMOKE-EST-MTR-${suffix}`]
    );
    artifacts.meterId = meter.rows[0].id;
    const baseline = await pool.query(
      `INSERT INTO meter_readings (customer_id, meter_id, reading_value, reading_date, source, notes, created_by)
       VALUES ($1, $2, 100, '2098-12-31', 'field', 'Estimated note smoke baseline', (SELECT id FROM users WHERE email = $3))
       RETURNING id`,
      [artifacts.customerId, artifacts.meterId, email]
    );
    artifacts.baselineReadingId = baseline.rows[0].id;

    const verificationNote = "Verified against photographed meter face and site log.";
    const created = await request("/api/readings", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        meter_id: artifacts.meterId,
        reading_value: 126,
        reading_date: "2099-01-31",
        notes: verificationNote,
        correction_reason: "Isolated future-period verification-note smoke fixture."
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "estimated reading note create failed");
    artifacts.readingId = created.data.reading.id;
    artifacts.billId = created.data.bill?.id || null;
    artifacts.periodId = created.data.reading.billing_period_id;
    assert.equal(created.data.reading.notes, verificationNote);

    const listed = await request("/api/readings", { session });
    assert.equal(listed.response.status, 200, listed.data.message || "reading register lookup failed");
    assert.equal(listed.data.find((row) => row.id === artifacts.readingId)?.notes, verificationNote);

    const register = await request(`/api/readings/register?limit=1&customer_id=${artifacts.customerId}&date_from=2099-01-01&date_to=2099-01-31`, { session });
    assert.equal(register.response.status, 200, register.data.message || "paged reading register lookup failed");
    assert.equal(register.data.limit, 1);
    assert.equal(typeof register.data.total, "number");
    assert.ok(register.data.rows.length <= 1, "reading register must honor the requested page size");
    assert.ok(register.data.rows.every((row) => Number(row.customer_id) === Number(artifacts.customerId)));

    const invalidRegisterDate = await request("/api/readings/register?date_from=not-a-date", { session });
    assert.equal(invalidRegisterDate.response.status, 400, "reading register must reject invalid date filters");

    const audit = await pool.query(
      "SELECT action, after_data FROM audit_events WHERE entity_type = 'meter_reading' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [artifacts.readingId]
    );
    assert.equal(audit.rows[0]?.action, "reading.created");
    assert.equal(audit.rows[0]?.after_data?.notes, verificationNote);
  });

  it("includes overdue outreach context in the communication preview", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const preview = await request("/api/communications/invoice-preview", { session });

    assert.equal(preview.response.status, 200, preview.data.message || "communication preview failed");
    assert.ok(Array.isArray(preview.data.rows), "communication preview rows should be an array");
    for (const row of preview.data.rows) {
      assert.equal(typeof row.overdue_balance, "number");
      assert.equal(typeof row.days_overdue, "number");
      if (row.bill_id) {
        assert.ok(Object.hasOwn(row.template_values || {}, "overdue_balance"));
        assert.ok(Object.hasOwn(row.template_values || {}, "oldest_due_date"));
        assert.ok(Object.hasOwn(row.template_values || {}, "days_overdue"));
      } else {
        assert.deepEqual(row.template_values, {}, "customers without payable invoices must not receive invoice message values");
      }
    }
  });

  it("rejects a zone-scoped invoice campaign before it can include another zone", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const preview = await request("/api/communications/invoice-preview", { session });
    assert.equal(preview.response.status, 200, preview.data.message || "communication preview failed");
    const customer = preview.data.rows?.find((row) => row.customer_id);
    if (!customer) {
      t.skip("No customer is available for campaign zone validation.");
      return;
    }

    const campaignsBefore = await request("/api/communications/campaigns", { session });
    assert.equal(campaignsBefore.response.status, 200, campaignsBefore.data.message || "campaign list failed");

    const rejected = await request("/api/communications/invoice-alerts/bulk-send", {
      session,
      method: "POST",
      body: {
        medium: "email",
        template: "Smoke test campaign zone validation.",
        zone_name: "Smoke test invalid zone",
        customer_ids: [customer.customer_id]
      }
    });
    assert.equal(rejected.response.status, 400, "mixed-zone campaign requests must be rejected before delivery");
    assert.match(rejected.data.message || "", /campaign service zone/i);

    const campaignsAfter = await request("/api/communications/campaigns", { session });
    assert.equal(campaignsAfter.response.status, 200, campaignsAfter.data.message || "campaign list failed");
    assert.equal(campaignsAfter.data.length, campaignsBefore.data.length, "rejected campaign scope must not create campaign history");
  });

  it("returns a bounded, read-only delivery exception queue", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const exceptions = await request("/api/communications/delivery-exceptions?status=all&days=30&limit=10", { session });

    assert.equal(exceptions.response.status, 200, exceptions.data.message || "delivery exception queue failed");
    assert.equal(exceptions.data.status, "all");
    assert.equal(exceptions.data.days, 30);
    assert.equal(exceptions.data.limit, 10);
    assert.ok(Array.isArray(exceptions.data.rows), "delivery exception rows should be an array");
    assert.ok(exceptions.data.rows.length <= 10, "delivery exception queue should respect the requested limit");
    assert.equal(typeof exceptions.data.summary?.exception_count, "number");
    assert.equal(typeof exceptions.data.summary?.failed_count, "number");
    assert.equal(typeof exceptions.data.summary?.skipped_count, "number");

    for (const row of exceptions.data.rows) {
      assert.ok(["failed", "skipped"].includes(row.status), "queue should contain only delivery exceptions");
      assert.ok(row.document_type && row.document_id, "delivery exceptions should identify the source document");
      assert.ok(Object.hasOwn(row, "recipient"), "delivery exceptions should include the attempted recipient");
    }

    const periods = await request("/api/billing/periods", { session });
    assert.equal(periods.response.status, 200, periods.data.message || "billing period list failed");
    const scopedPeriod = periods.data.find((period) => Number(period.bill_count || 0) > 0) || periods.data[0];
    assert.ok(scopedPeriod?.id, "a billing period should be available for delivery scoping");
    const scopedExceptions = await request(
      `/api/communications/delivery-exceptions?status=all&days=90&limit=10&billing_period_id=${scopedPeriod.id}`,
      { session }
    );

    assert.equal(scopedExceptions.response.status, 200, scopedExceptions.data.message || "period delivery exception queue failed");
    assert.equal(Number(scopedExceptions.data.billing_period_id), Number(scopedPeriod.id));
    for (const row of scopedExceptions.data.rows) {
      assert.equal(row.document_type, "bill", "period-scoped delivery exceptions should only include bills");
      assert.equal(Number(row.billing_period_id), Number(scopedPeriod.id), "period-scoped rows must belong to the selected period");
    }
  });

  it("returns a bounded, read-only arrears follow-up queue", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const followUp = await request("/api/communications/arrears-follow-up?limit=10", { session });

    assert.equal(followUp.response.status, 200, followUp.data.message || "arrears follow-up request failed");
    assert.equal(followUp.data.limit, 10);
    assert.ok(Array.isArray(followUp.data.rows), "arrears follow-up rows should be an array");
    assert.ok(followUp.data.rows.length <= 10, "arrears follow-up queue should respect the requested limit");
    assert.equal(typeof followUp.data.summary?.account_count, "number");
    assert.equal(typeof followUp.data.summary?.overdue_balance, "number");
    assert.equal(typeof followUp.data.summary?.contact_ready_count, "number");
    assert.equal(typeof followUp.data.summary?.contact_gap_count, "number");
    assert.equal(typeof followUp.data.summary?.contact_gap_balance, "number");
    assert.equal(typeof followUp.data.summary?.critical_count, "number");
    assert.equal(typeof followUp.data.summary?.at_risk_count, "number");
    assert.equal(typeof followUp.data.summary?.early_arrears_count, "number");
    assert.equal(typeof followUp.data.summary?.top_exposure_count, "number");
    assert.equal(typeof followUp.data.summary?.top_exposure_balance, "number");

    for (const row of followUp.data.rows) {
      assert.ok(row.customer_id && row.acc_number, "arrears rows should identify the customer account");
      assert.ok(Number(row.overdue_balance) > 0, "arrears rows must have an overdue balance");
      assert.ok(Number(row.days_overdue) > 0, "arrears rows must be overdue");
      assert.ok(["critical", "at_risk", "early_arrears"].includes(row.priority_tier), "arrears rows should declare a collection priority tier");
      assert.equal(typeof row.priority_reason, "string", "arrears rows should state the priority reason");
      assert.equal(typeof row.is_top_exposure, "boolean", "arrears rows should identify top exposure accounts");
      assert.equal(typeof row.has_ready_contact, "boolean", "arrears rows should state whether outreach can start");
      assert.equal(Object.hasOwn(row, "message"), false, "arrears rows must not include rendered messages");
      assert.equal(Object.hasOwn(row, "template_values"), false, "arrears rows must not include delivery template data");
    }
  });

  it("returns a guarded disconnection-warning review queue", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const warnings = await request("/api/communications/disconnection-warning-follow-up", { session });

    assert.equal(warnings.response.status, 200, warnings.data.message || "disconnection-warning queue failed");
    assert.ok(Array.isArray(warnings.data.rows), "warning rows should be an array");
    assert.equal(typeof warnings.data.default_template, "string");
    assert.equal(typeof warnings.data.summary?.critical_account_count, "number");
    assert.equal(typeof warnings.data.summary?.eligible_count, "number");
    assert.equal(typeof warnings.data.summary?.ready_to_send_count, "number");
    assert.equal(typeof warnings.data.summary?.cooldown_count, "number");
    assert.equal(typeof warnings.data.summary?.protected_payment_plan_count, "number");
    assert.equal(typeof warnings.data.summary?.eligible_balance, "number");

    for (const row of warnings.data.rows) {
      assert.ok(Number(row.overdue_balance) > 0, "warning accounts must have an overdue balance");
      assert.ok(Number(row.days_overdue) > 90, "warning accounts must be more than 90 days overdue");
      assert.ok(row.bill_id, "warning accounts must retain their latest payable bill context");
      assert.ok(Object.hasOwn(row, "template_values"), "warning accounts should include message values");
      assert.equal(typeof row.can_send, "boolean", "warning accounts should expose the delivery cooldown state");
    }
  });

  it("requires an approval note before preparing a formal warning send", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const warning = await request("/api/communications/disconnection-warnings/2147483647/send", {
      session,
      method: "POST",
      body: { medium: "email" }
    });

    assert.equal(warning.response.status, 400);
    assert.match(warning.data.message || "", /approval reference or note/i);
  });

  it("rejects invalid interactive payment submission metadata without posting", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const invalidKey = await request("/api/payments", {
      session,
      method: "POST",
      body: {
        customer_id: 2147483647,
        amount: 1,
        payment_channel: "cash",
        idempotency_key: "short"
      }
    });
    assert.equal(invalidKey.response.status, 400);
    assert.match(invalidKey.data.message || "", /idempotency key/i);

    const invalidChannel = await request("/api/payments", {
      session,
      method: "POST",
      body: {
        customer_id: 2147483647,
        amount: 1,
        payment_channel: "unsupported",
        idempotency_key: "payment-smoke-invalid-channel"
      }
    });
    assert.equal(invalidChannel.response.status, 400);
    assert.match(invalidChannel.data.message || "", /payment channel/i);

    const customerList = await request("/api/customers", { session });
    assert.equal(customerList.response.status, 200, customerList.data.message || "customers list failed");
    const customerRows = [
      customerList.data,
      customerList.data.customers,
      customerList.data.results,
      customerList.data.items,
      customerList.data.data
    ].find(Array.isArray) || [];
    if (customerRows[0]) {
      const invalidTarget = await request("/api/payments", {
        session,
        method: "POST",
        body: {
          customer_id: customerRows[0].id,
          bill_id: 2147483647,
          amount: 1,
          payment_channel: "cash",
          idempotency_key: `payment-smoke-invalid-target-${Date.now()}`
        }
      });
      assert.equal(invalidTarget.response.status, 404);
      assert.match(invalidTarget.data.message || "", /payable unpaid bill/i);
    }
  });

  it("replays a valid payment idempotently without posting it twice", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const suffix = Date.now();
    const artifacts = { customerId: null, paymentId: null };

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (artifacts.paymentId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'payment' AND entity_id = $1", [artifacts.paymentId]);
          await client.query("DELETE FROM payment_allocations WHERE payment_id = $1", [artifacts.paymentId]);
          await client.query("DELETE FROM payments WHERE id = $1", [artifacts.paymentId]);
        }
        if (artifacts.customerId) await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const [{ rows: rateRows }, { rows: zoneRows }] = await Promise.all([
      pool.query("SELECT id, amount FROM rates ORDER BY id LIMIT 1"),
      pool.query("SELECT id FROM zones ORDER BY id LIMIT 1")
    ]);
    assert.ok(rateRows[0] && zoneRows[0], "a seeded rate and zone are required for the idempotent payment fixture");

    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [rateRows[0].id, zoneRows[0].id, `Payment replay smoke ${suffix}`, `SMOKE-PAY-${suffix}`, rateRows[0].amount]
    );
    artifacts.customerId = customer.rows[0].id;

    const payload = {
      customer_id: artifacts.customerId,
      amount: 137,
      payment_date: "2026-09-18",
      payment_channel: "cash",
      received_from: "Smoke replay payer",
      notes: "Isolated payment idempotency smoke fixture",
      idempotency_key: `payment-smoke-replay-${suffix}`
    };
    const first = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(first.response.status, 201, first.data.message || "initial payment submission failed");
    artifacts.paymentId = first.data.payment?.id;
    assert.ok(artifacts.paymentId, "initial payment should return its payment id");
    assert.ok(first.data.payment?.receipt_number, "initial payment should receive a receipt number");

    const replay = await request("/api/payments", { session, method: "POST", body: payload });
    assert.equal(replay.response.status, 200, replay.data.message || "idempotent payment replay failed");
    assert.equal(replay.data.idempotent_replay, true);
    assert.equal(Number(replay.data.payment?.id), Number(artifacts.paymentId));
    assert.equal(replay.data.payment?.receipt_number, first.data.payment?.receipt_number);
    assert.equal(Number(replay.data.unallocatedAmount), 137);
    assert.deepEqual(replay.data.allocations, []);

    const conflictingReplay = await request("/api/payments", {
      session,
      method: "POST",
      body: { ...payload, amount: 138 }
    });
    assert.equal(conflictingReplay.response.status, 409, "a reused key with different payment details must be rejected");
    assert.match(conflictingReplay.data.message || "", /already used for different payment details/i);

    const persisted = await pool.query(
      "SELECT COUNT(*)::int AS count FROM payments WHERE customer_id = $1 AND idempotency_key = $2",
      [artifacts.customerId, payload.idempotency_key]
    );
    assert.equal(persisted.rows[0].count, 1, "a retry must not create another payment row");
  });

  it("reallocates a corrected targeted payment without drifting the bill balance", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const suffix = Date.now();
    const artifacts = { customerId: null, billId: null, paymentId: null };

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (artifacts.paymentId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'payment' AND entity_id = $1", [artifacts.paymentId]);
          await client.query("DELETE FROM payments WHERE id = $1", [artifacts.paymentId]);
        }
        if (artifacts.billId) await client.query("DELETE FROM bills WHERE id = $1", [artifacts.billId]);
        if (artifacts.customerId) await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const [{ rows: rateRows }, { rows: zoneRows }] = await Promise.all([
      pool.query("SELECT id, amount FROM rates ORDER BY id LIMIT 1"),
      pool.query("SELECT id FROM zones ORDER BY id LIMIT 1")
    ]);
    assert.ok(rateRows[0] && zoneRows[0], "a seeded rate and zone are required for the payment correction fixture");

    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [rateRows[0].id, zoneRows[0].id, `Payment correction smoke ${suffix}`, `SMOKE-CORR-${suffix}`, rateRows[0].amount]
    );
    artifacts.customerId = customer.rows[0].id;
    const bill = await pool.query(
      `INSERT INTO bills (
        customer_id, bill_number, billing_month, previous_reading, current_reading, units_used, rate,
        amount, subtotal_amount, total_amount, balance_amount, paid_amount, status, due_date, bill_pay_status
      )
       VALUES ($1, $2, '2026-08-01', 0, 0, 0, 0, 100, 100, 100, 100, 0, 'unpaid', '2026-08-10', 'payable')
       RETURNING id`,
      [artifacts.customerId, `SMOKE-CORR-BILL-${suffix}`]
    );
    artifacts.billId = bill.rows[0].id;

    const created = await request("/api/payments", {
      session,
      method: "POST",
      body: {
        customer_id: artifacts.customerId,
        bill_id: artifacts.billId,
        amount: 75,
        payment_date: "2026-09-18",
        payment_channel: "cash",
        received_from: "Smoke correction payer",
        idempotency_key: `payment-smoke-correction-${suffix}`
      }
    });
    assert.equal(created.response.status, 201, created.data.message || "targeted payment creation failed");
    artifacts.paymentId = created.data.payment?.id;
    const receiptNumber = created.data.payment?.receipt_number;
    assert.equal(Number(created.data.allocations?.[0]?.amount), 75);

    const increased = await request(`/api/payments/${artifacts.paymentId}`, {
      session,
      method: "PUT",
      body: {
        amount: 100,
        payment_date: "2026-09-18",
        payment_channel: "cash",
        receipt_number: receiptNumber,
        correction_reason: "Verified the cash receipt was recorded short."
      }
    });
    assert.equal(increased.response.status, 200, increased.data.message || "payment increase correction failed");
    assert.equal(increased.data.payment?.receipt_number, receiptNumber, "a correction must preserve the original receipt");
    assert.equal(Number(increased.data.allocations?.[0]?.amount), 100);
    assert.equal(Number(increased.data.payment?.total_allocated_amount), 100);
    assert.equal(Number(increased.data.payment?.unallocated_amount), 0);

    const paidBill = await pool.query("SELECT paid_amount, balance_amount, status FROM bills WHERE id = $1", [artifacts.billId]);
    assert.equal(Number(paidBill.rows[0]?.paid_amount), 100);
    assert.equal(Number(paidBill.rows[0]?.balance_amount), 0);
    assert.equal(paidBill.rows[0]?.status, "paid");

    const reduced = await request(`/api/payments/${artifacts.paymentId}`, {
      session,
      method: "PUT",
      body: {
        amount: 40,
        payment_date: "2026-09-18",
        payment_channel: "cash",
        receipt_number: receiptNumber,
        correction_reason: "Verified that the excess cash was returned to the payer."
      }
    });
    assert.equal(reduced.response.status, 200, reduced.data.message || "payment reduction correction failed");
    assert.equal(Number(reduced.data.allocations?.[0]?.amount), 40);
    assert.equal(Number(reduced.data.payment?.total_allocated_amount), 40);
    assert.equal(Number(reduced.data.payment?.unallocated_amount), 0);

    const correctedBill = await pool.query("SELECT paid_amount, balance_amount, status FROM bills WHERE id = $1", [artifacts.billId]);
    assert.equal(Number(correctedBill.rows[0]?.paid_amount), 40);
    assert.equal(Number(correctedBill.rows[0]?.balance_amount), 60);
    assert.equal(correctedBill.rows[0]?.status, "partial");
  });

  it("requires auditable notes before a manual adjustment decision", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const review = await request("/api/adjustments/2147483647/review", {
      session,
      method: "PATCH",
      body: { status: "approved", review_notes: "" }
    });

    assert.equal(review.response.status, 400);
    assert.match(review.data.message || "", /review notes are required/i);
  });

  it("previews repeated bank references without posting duplicate payments", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const customers = await request("/api/customers", { session });
    const customerRows = [customers.data, customers.data.customers, customers.data.data].find(Array.isArray) || [];
    assert.ok(customerRows[0]?.acc_number, "a customer account is required for bank import checks");

    const missingInteractiveReference = await request("/api/payments", {
      session,
      method: "POST",
      body: {
        customer_id: customerRows[0].id,
        amount: 1,
        payment_channel: "bank",
        idempotency_key: `payment-smoke-missing-reference-${Date.now()}`
      }
    });
    assert.equal(missingInteractiveReference.response.status, 400);
    assert.match(missingInteractiveReference.data.message || "", /reference is required/i);

    const before = await request("/api/payments", { session });
    assert.equal(before.response.status, 200);
    const beforeRows = Array.isArray(before.data) ? before.data : [];
    const reference = `BANK-SMOKE-DUP-${Date.now()}`;
    const csv = [
      "acc_number,payment_date,amount,payment_channel,external_reference,received_from",
      `${customerRows[0].acc_number},2026-01-15,1,bank,${reference},Smoke payer`,
      `${customerRows[0].acc_number},2026-01-15,1,bank,${reference},Smoke payer`
    ].join("\n");

    const preview = await request("/api/payments/imports/preview", {
      session,
      method: "POST",
      body: { csv }
    });
    assert.equal(preview.response.status, 200, preview.data.message || "bank import preview failed");
    assert.equal(preview.data.rows.length, 2);
    assert.ok(
      preview.data.rows.some((row) => row.errors.some((error) => /reference is duplicated/i.test(error))),
      "repeated transaction references should be invalid"
    );

    const missingReference = await request("/api/payments/imports/preview", {
      session,
      method: "POST",
      body: {
        csv: `acc_number,payment_date,amount,payment_channel\n${customerRows[0].acc_number},2026-01-15,1,bank`
      }
    });
    assert.equal(missingReference.response.status, 200);
    assert.ok(
      missingReference.data.rows[0].errors.some((error) => /reference is required/i.test(error)),
      "bank imports should require a transaction reference"
    );

    const rejectedCommit = await request("/api/payments/imports/commit", {
      session,
      method: "POST",
      body: { csv }
    });
    assert.equal(rejectedCommit.response.status, 400);

    const after = await request("/api/payments", { session });
    assert.equal(after.response.status, 200);
    assert.equal((Array.isArray(after.data) ? after.data : []).length, beforeRows.length, "invalid import must not post payments");
  });

  it("records explained reconciliation exclusions with a committed payment import", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const suffix = Date.now();
    const artifacts = { customerId: null, paymentId: null, importAuditId: null };

    t.after(async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (artifacts.paymentId) {
          await client.query("DELETE FROM audit_events WHERE entity_type = 'payment' AND entity_id = $1", [artifacts.paymentId]);
          await client.query("DELETE FROM payment_allocations WHERE payment_id = $1", [artifacts.paymentId]);
          await client.query("DELETE FROM payments WHERE id = $1", [artifacts.paymentId]);
        }
        if (artifacts.importAuditId) {
          await client.query("DELETE FROM audit_events WHERE id = $1", [artifacts.importAuditId]);
        }
        if (artifacts.customerId) {
          await client.query("DELETE FROM customers WHERE id = $1", [artifacts.customerId]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });

    const [{ rows: rateRows }, { rows: zoneRows }] = await Promise.all([
      pool.query("SELECT id, amount FROM rates WHERE is_active = TRUE ORDER BY id LIMIT 1"),
      pool.query("SELECT id FROM zones WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ]);
    assert.ok(rateRows[0] && zoneRows[0], "an active rate and zone are required for reconciliation exclusion checks");
    const customer = await pool.query(
      `INSERT INTO customers (rate_id, zone_id, name, acc_number, rate, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id`,
      [rateRows[0].id, zoneRows[0].id, `Import exclusion smoke ${suffix}`, `SMOKE-IMPORT-${suffix}`, rateRows[0].amount]
    );
    artifacts.customerId = customer.rows[0].id;

    const reference = `BANK-IMPORT-${suffix}`;
    const csv = [
      "acc_number,payment_date,amount,payment_channel,external_reference,received_from",
      `SMOKE-IMPORT-${suffix},2026-09-18,57,bank,${reference},Smoke import payer`
    ].join("\n");
    const exclusion = {
      source_row_number: 3,
      external_reference: `BANK-IGNORED-${suffix}`,
      amount: 19,
      reason: "Statement fee does not represent a customer receipt."
    };

    const missingReason = await request("/api/payments/imports/commit", {
      session,
      method: "POST",
      body: { csv, reconciliation_exclusions: [{ ...exclusion, reason: "no" }] }
    });
    assert.equal(missingReason.response.status, 400, "an exclusion requires a usable explanation");
    assert.match(missingReason.data.message || "", /exclusion reason/i);

    const committed = await request("/api/payments/imports/commit", {
      session,
      method: "POST",
      body: { csv, source_name: "Smoke reconciliation statement", reconciliation_exclusions: [exclusion] }
    });
    assert.equal(committed.response.status, 201, committed.data.message || "reconciled payment import failed");
    artifacts.paymentId = committed.data.imported?.[0]?.payment_id;
    artifacts.importAuditId = committed.data.batch?.id;
    assert.equal(committed.data.batch?.excluded_rows, 1);
    assert.equal(Number(committed.data.batch?.excluded_total), 19);

    const audit = await pool.query("SELECT after_data FROM audit_events WHERE id = $1", [artifacts.importAuditId]);
    assert.equal(audit.rows[0]?.after_data?.reconciliation_exclusions?.count, 1);
    assert.equal(Number(audit.rows[0]?.after_data?.reconciliation_exclusions?.total_amount), 19);
    assert.equal(audit.rows[0]?.after_data?.reconciliation_exclusions?.rows?.[0]?.reason, exclusion.reason);
  });

  it("lists redacted immutable payment import batch summaries", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const recent = await request("/api/payments/imports/recent?limit=3", { session });

    assert.equal(recent.response.status, 200, recent.data.message || "payment import batch list failed");
    assert.ok(Array.isArray(recent.data));
    for (const batch of recent.data) {
      assert.equal(Object.hasOwn(batch, "after_data"), false);
      assert.equal(Object.hasOwn(batch, "before_data"), false);
      assert.ok(batch.batch_reference);
      assert.ok(batch.source_name);
      assert.equal(typeof batch.total_rows, "number");
      assert.equal(typeof batch.imported_rows, "number");
      assert.equal(typeof batch.total_amount, "number");
      assert.equal(typeof batch.excluded_rows, "number");
      assert.equal(typeof batch.excluded_total, "number");
    }
  });

  it("returns a scoped, redacted customer 360 workspace", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const customers = await request("/api/customers", { session });
    const customerRows = [customers.data, customers.data.customers, customers.data.data].find(Array.isArray) || [];
    assert.ok(customerRows[0]?.id, "a customer is required for the customer 360 check");

    const overview = await request(`/api/customers/${customerRows[0].id}/overview`, { session });
    assert.equal(overview.response.status, 200, overview.data.message || "customer 360 request failed");
    assert.equal(Number(overview.data.customer?.id), Number(customerRows[0].id));
    for (const key of ["meters", "readings", "bills", "payments", "requests", "documents", "audit_events"]) {
      assert.ok(Array.isArray(overview.data[key]), `customer 360 ${key} should be an array`);
    }
    for (const event of overview.data.audit_events) {
      assert.equal(Object.hasOwn(event, "before_data"), false);
      assert.equal(Object.hasOwn(event, "after_data"), false);
    }
  });

  it("keeps Customer 360 finance-scoped while preserving role-specific customer access", async () => {
    const admin = await login(
      process.env.TEST_ADMIN_EMAIL || "admin@agua.local",
      process.env.TEST_ADMIN_PASSWORD || "Admin@123"
    );
    const customers = await request("/api/customers", { session: admin.session });
    const customerRows = [customers.data, customers.data.customers, customers.data.data].find(Array.isArray) || [];
    const customerId = customerRows[0]?.id;
    assert.ok(customerId, "a customer is required for customer-access scope checks");

    const accountant = await login(
      process.env.TEST_ACCOUNTANT_EMAIL || "accountant@agua.local",
      process.env.TEST_ACCOUNTANT_PASSWORD || "Accountant@123"
    );
    const accountantOverview = await request(`/api/customers/${customerId}/overview`, { session: accountant.session });
    assert.equal(accountantOverview.response.status, 200, accountantOverview.data.message || "accountant Customer 360 lookup failed");

    const reader = await login(
      process.env.TEST_READER_EMAIL || "reader@agua.local",
      process.env.TEST_READER_PASSWORD || "Reader@123"
    );
    const readerCustomer = await request(`/api/customers/${customerId}`, { session: reader.session });
    assert.equal(readerCustomer.response.status, 200, readerCustomer.data.message || "meter-reader customer lookup failed");
    const readerOverview = await request(`/api/customers/${customerId}/overview`, { session: reader.session });
    assert.equal(readerOverview.response.status, 403, "meter readers must not access Customer 360 financial evidence");

    const viewer = await login(
      process.env.TEST_BUSINESS_VIEWER_EMAIL || "viewer@agua.local",
      process.env.TEST_BUSINESS_VIEWER_PASSWORD || "Viewer@123"
    );
    const viewerCustomer = await request(`/api/customers/${customerId}`, { session: viewer.session });
    assert.equal(viewerCustomer.response.status, 200, viewerCustomer.data.message || "business-viewer customer lookup failed");
    const viewerOverview = await request(`/api/customers/${customerId}/overview`, { session: viewer.session });
    assert.equal(viewerOverview.response.status, 403, "business viewers must not access Customer 360 financial evidence");

    const portal = await login(
      process.env.TEST_CUSTOMER_EMAIL || "jane@agua.local",
      process.env.TEST_CUSTOMER_PASSWORD || "Customer@123"
    );
    const portalDashboard = await request("/api/portal/dashboard", { session: portal.session });
    assert.equal(portalDashboard.response.status, 200, portalDashboard.data.message || "portal account dashboard failed");
    assert.ok(portalDashboard.data.customer?.id, "portal dashboard should return the linked account");
    const portalOverview = await request(`/api/customers/${portalDashboard.data.customer.id}/overview`, { session: portal.session });
    assert.equal(portalOverview.response.status, 403, "portal customers must use their own scoped dashboard instead of staff Customer 360");
  });

  it("returns authorised meter search results with customer context", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const customers = await request("/api/customers", { session });
    const customerRows = [customers.data, customers.data.customers, customers.data.data].find(Array.isArray) || [];
    let meter = null;
    for (const customer of customerRows) {
      const overview = await request(`/api/customers/${customer.id}/overview`, { session });
      meter = overview.data.meters?.[0] || null;
      if (meter) break;
    }
    assert.ok(meter?.meter_number, "a customer meter is required for the meter search check");

    const search = await request(`/api/meters/search?search=${encodeURIComponent(meter.meter_number.slice(0, 4))}`, { session });
    assert.equal(search.response.status, 200, search.data.message || "meter search failed");
    assert.ok(Array.isArray(search.data));
    assert.ok(search.data.some((row) => Number(row.id) === Number(meter.id)));
    assert.ok(search.data.every((row) => row.customer_id && row.customer_name && row.acc_number));
  });

  it("requires completed M-Pesa transaction statuses before import", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const customers = await request("/api/customers", { session });
    const customerRows = [customers.data, customers.data.customers, customers.data.data].find(Array.isArray) || [];
    assert.ok(customerRows[0]?.acc_number, "a customer account is required for M-Pesa import checks");

    const referenceBase = `MPESA-SMOKE-${Date.now()}`;
    const preview = await request("/api/payments/imports/preview", {
      session,
      method: "POST",
      body: {
        csv: [
          "acc_number,payment_date,amount,payment_channel,transaction_status,external_reference",
          `${customerRows[0].acc_number},2026-01-15,1,mpesa_paybill,completed,${referenceBase}-OK`,
          `${customerRows[0].acc_number},2026-01-15,1,mpesa_paybill,pending,${referenceBase}-PENDING`,
          `${customerRows[0].acc_number},2026-01-15,1,mpesa_paybill,,${referenceBase}-MISSING`
        ].join("\n")
      }
    });

    assert.equal(preview.response.status, 200, preview.data.message || "M-Pesa import preview failed");
    assert.equal(preview.data.summary.valid, 1);
    assert.equal(preview.data.summary.invalid, 2);
    assert.equal(preview.data.rows[0].transaction_status, "completed");
    assert.ok(preview.data.rows[1].errors.some((error) => /not a completed payment/i.test(error)));
    assert.ok(preview.data.rows[2].errors.some((error) => /transaction status is required/i.test(error)));
  });

  it("rejects payment corrections without a reason and preserves receipt identity", async (t) => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const paymentList = await request("/api/payments", { session });
    assert.equal(paymentList.response.status, 200, paymentList.data.message || "payments list failed");
    const paymentRows = [
      paymentList.data,
      paymentList.data.payments,
      paymentList.data.results,
      paymentList.data.items,
      paymentList.data.data,
      paymentList.data.data?.payments
    ].find(Array.isArray) || [];
    const payment = paymentRows.find((row) => String(row.status).toLowerCase() === "posted");
    if (!payment) {
      t.skip("No posted payment is available for the payment correction safeguard checks.");
      return;
    }

    const existingValues = {
      amount: payment.amount,
      payment_date: String(payment.payment_date).slice(0, 10),
      payment_channel: payment.payment_channel || payment.method,
      external_reference: payment.external_reference ?? payment.reference ?? null,
      receipt_number: payment.receipt_number ?? null
    };
    const missingReason = await request(`/api/payments/${payment.id}`, {
      session,
      method: "PUT",
      body: existingValues
    });
    assert.equal(missingReason.response.status, 400, "payment corrections must require a reason");

    const changedReceiptNumber = `SMOKE-IMMUTABLE-${payment.id}-${Date.now()}`;
    const changedReceipt = await request(`/api/payments/${payment.id}`, {
      session,
      method: "PUT",
      body: {
        ...existingValues,
        receipt_number: changedReceiptNumber,
        correction_reason: "Verify receipt identity is immutable"
      }
    });
    assert.equal(changedReceipt.response.status, 400, "posted payment receipt numbers must be immutable");

    const paymentAfterRejection = await request(`/api/payments/${payment.id}`, { session });
    assert.equal(
      paymentAfterRejection.response.status,
      200,
      paymentAfterRejection.data.message || "payment detail failed"
    );
    const persistedPayment = paymentAfterRejection.data.payment || paymentAfterRejection.data;
    assert.equal(persistedPayment.receipt_number ?? null, existingValues.receipt_number);
  });

  it("pages payment register history with validated server-side filters", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);

    const register = await request("/api/payments/register?limit=1&offset=0", { session });
    assert.equal(register.response.status, 200, register.data.message || "payment register failed");
    assert.equal(register.data.limit, 1);
    assert.equal(register.data.offset, 0);
    assert.equal(typeof register.data.total, "number");
    assert.equal(typeof register.data.summary?.received_total, "number");
    assert.equal(typeof register.data.summary?.credit_total, "number");
    assert.ok(Array.isArray(register.data.rows));
    assert.ok(register.data.rows.length <= 1, "payment register must honor the requested page size");

    const payment = register.data.rows[0];
    if (payment?.receipt_number) {
      const filtered = await request(
        `/api/payments/register?limit=10&channel=${encodeURIComponent(payment.payment_channel)}&search=${encodeURIComponent(payment.receipt_number)}`,
        { session }
      );
      assert.equal(filtered.response.status, 200, filtered.data.message || "filtered payment register failed");
      assert.ok(filtered.data.rows.every((row) => row.payment_channel === payment.payment_channel));
      assert.ok(filtered.data.rows.every((row) => String(row.receipt_number || "").includes(payment.receipt_number)));
    }

    const invalidDate = await request("/api/payments/register?date_from=not-a-date", { session });
    assert.equal(invalidDate.response.status, 400, "payment register must reject invalid date filters");
  });

  it("lists recent payment corrections without exposing audit payloads", async () => {
    const email = process.env.TEST_ADMIN_EMAIL || "admin@agua.local";
    const password = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { session } = await login(email, password);
    const allowedEventTypes = new Set(["corrected", "voided", "reapplied", "discarded"]);

    const recent = await request("/api/payments/corrections?limit=5", { session });
    assert.equal(recent.response.status, 200, recent.data.message || "recent payment corrections failed");
    assert.ok(Array.isArray(recent.data), "recent payment corrections should be an array");
    assert.ok(recent.data.length <= 5, "recent payment corrections should honor the requested limit");

    for (const row of recent.data) {
      assert.ok(
        (typeof row.id === "number" && Number.isFinite(row.id)) ||
          (typeof row.id === "string" && row.id.length > 0),
        "payment correction ids should be stable numeric or string values"
      );
      assert.ok(allowedEventTypes.has(row.event_type), "payment corrections should expose a known event type");
      assert.equal(typeof row.action, "string", "payment corrections should include an action label");
      assert.ok(row.action.length > 0, "payment correction action labels should not be empty");
      assert.ok(row.created_at, "payment corrections should include a creation timestamp");
      assert.equal(
        Object.prototype.hasOwnProperty.call(row, "before_data"),
        false,
        "payment corrections must not expose before_data"
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(row, "after_data"),
        false,
        "payment corrections must not expose after_data"
      );
    }

    const reapplied = recent.data.find((row) => row.event_type === "reapplied" && row.related_payment_id);
    if (reapplied) {
      assert.ok(reapplied.related_receipt_number, "reapplied events should identify the replacement receipt");
      const replacement = await request(`/api/payments/${reapplied.related_payment_id}`, { session });
      assert.equal(replacement.response.status, 200, replacement.data.message || "replacement receipt lookup failed");
      assert.equal(
        replacement.data.payment?.receipt_number,
        reapplied.related_receipt_number,
        "reapplied events should link to the replacement payment"
      );
    }

    const bounded = await request("/api/payments/corrections?limit=500", { session });
    assert.equal(bounded.response.status, 200, bounded.data.message || "bounded payment corrections failed");
    assert.ok(Array.isArray(bounded.data), "bounded payment corrections should be an array");
    assert.ok(bounded.data.length <= 50, "payment correction limits should be capped at 50 rows");
  });

  it("allows seeded accountant read access to recent payment corrections", async () => {
    const email = process.env.TEST_ACCOUNTANT_EMAIL || "accountant@agua.local";
    const password = process.env.TEST_ACCOUNTANT_PASSWORD || "Accountant@123";
    const { session, user } = await login(email, password);
    assert.equal(user.role, "accountant");

    const corrections = await request("/api/payments/corrections?limit=3", { session });
    assert.equal(corrections.response.status, 200, corrections.data.message || "accountant corrections feed failed");
    assert.ok(Array.isArray(corrections.data));
    assert.ok(corrections.data.length <= 3);
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
      "/api/dashboard",
      "/api/business-settings",
      "/api/business-settings/commissioning-checks",
      "/api/expenses",
      "/api/monitoring/summary",
      "/api/payments/corrections?limit=3",
      "/api/production/meters",
      "/api/production/weekly-readings",
      "/api/production/report"
    ]) {
      const result = await request(path, { session });
      assert.equal(result.response.status, 200, result.data.message || `${path} failed`);
    }

    const monitoringMessage = "Business viewer monitoring resolution guard";
    const { rows: monitoringRows } = await pool.query(
      `INSERT INTO system_event_logs (event_type, severity, source, message)
       VALUES ('monitoring.viewer_resolution_guard', 'warning', 'client', $1)
       RETURNING id`,
      [monitoringMessage]
    );
    const monitoringEventId = monitoringRows[0].id;
    t.after(async () => {
      await pool.query(
        "DELETE FROM audit_events WHERE entity_type = 'system_event' AND entity_id = $1",
        [monitoringEventId]
      );
      await pool.query("DELETE FROM system_event_logs WHERE id = $1", [monitoringEventId]);
    });
    const resolutionAttempt = await request(`/api/monitoring/events/${monitoringEventId}/resolve`, {
      session,
      method: "PATCH",
      body: { resolution_notes: "Business viewers must not resolve monitoring events." }
    });
    assert.equal(resolutionAttempt.response.status, 403, "business viewers must not resolve monitoring events");

    const dashboard = await request("/api/dashboard", { session });
    const allowedPages = new Set(["contractors", "production", "reports"]);
    const actionItems = (dashboard.data.actionCenter?.groups || []).flatMap((group) => group.items || []);
    assert.ok(actionItems.length > 0, "business viewer dashboard should include management checks");
    assert.ok(
      actionItems.every((item) => allowedPages.has(item.page)),
      "business viewer dashboard should not expose restricted workflow pages"
    );
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
