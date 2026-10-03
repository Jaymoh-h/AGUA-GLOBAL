import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchSite, fieldVisits } from "../src/utils/fieldDispatch.js";

const visit = (id, overrides = {}) => ({ id, category: "leak", status: "open", priority: "normal", ...overrides });

test("daily visits include overdue and unscheduled work but keep future targets separate", () => {
  const rows = [visit(1), visit(2, { target_date: "2026-09-12" }), visit(3, { target_date: "2026-09-13" }), visit(4, { target_date: "2026-09-18" })];
  assert.deepEqual(fieldVisits(rows, "2026-09-13").map((row) => row.id), [2, 3, 1]);
  assert.equal(fieldVisits(rows, "2026-09-18").length, 4);
  assert.equal(fieldVisits(rows, "2026-09-13", true).length, 4);
});

test("office cases and completed work never become field visits", () => {
  const rows = [visit(1, { category: "payment_plan" }), visit(2, { category: "billing_dispute" }), visit(3, { category: "billing_support" }), visit(4, { status: "resolved" }), visit(5, { status: "cancelled" }), visit(6, { category: "connection", status: "in_progress" })];
  assert.deepEqual(fieldVisits(rows, "2026-09-13", true).map((row) => row.id), [6]);
});

test("urgent work is first and sorting does not mutate the register", () => {
  const rows = [visit(1, { target_date: "2026-09-01" }), visit(2, { priority: "urgent", target_date: "2026-09-13" })];
  assert.deepEqual(fieldVisits(rows, "2026-09-13").map((row) => row.id), [2, 1]);
  assert.deepEqual(rows.map((row) => row.id), [1, 2]);
});

test("a zone alone cannot satisfy a site address gap", () => {
  assert.equal(dispatchSite({ zone_name: "Zone A", customer_location: "  " }), "");
  assert.equal(dispatchSite({ customer_location: "Old site", request_metadata: { connection_request: { site_location: " New site " } } }), "New site");
  assert.equal(dispatchSite({ customer_location: "Account site", request_metadata: { connection_request: { site_location: " " } } }), "Account site");
});
