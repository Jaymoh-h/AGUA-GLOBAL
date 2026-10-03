import { Ban, Banknote, CalendarClock, CheckCircle2, FileText, MoreHorizontal, Play, RefreshCw, Save, UserRound, Wrench, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import EntryPanel from "../components/EntryPanel";
import { EmptyTableRow } from "../components/EmptyState";
import MaintenanceDispatchDialogs from "../components/MaintenanceDispatchDialogs";
import FieldDispatchPlan from "../components/FieldDispatchPlan";
import FieldVisitReview from "../components/FieldVisitReview";
import FocusNotice from "../components/FocusNotice";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import SupportingDocumentsPanel from "../components/SupportingDocumentsPanel";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import useScopedDraft from "../utils/useScopedDraft";

const today = () => new Date().toISOString().slice(0, 10);
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

const emptyForm = () => ({
  reported_date: today(),
  category: "leak",
  priority: "normal",
  source: "internal",
  customer_id: "",
  zone_id: "",
  assigned_to: "",
  target_date: "",
  description: ""
});

const emptyExpenseDraft = (request = {}) => ({
  expense_date: today(),
  category: `Maintenance - ${label(request.category || "other")}`,
  vendor: "",
  description: request.id ? `${request.request_number || `Request ${request.id}`}: ${label(request.category)}` : "",
  amount: "",
  payment_channel: "cash",
  reference: "",
  receipt_number: "",
  notes: ""
});

function MaintenancePage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [requestEntryOpen, setRequestEntryOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [resolutionDrafts, setResolutionDrafts] = useScopedDraft(user, "maintenance-resolution-notes", () => ({}), { storage: "local" });
  const [customerResolutionDrafts, setCustomerResolutionDrafts] = useState({});
  const [activeExpenseRequestId, setActiveExpenseRequestId] = useState(null);
  const [activeDocumentRequestId, setActiveDocumentRequestId] = useState(null);
  const [dispatchReview, setDispatchReview] = useState(null);
  const [bulkDispatchReview, setBulkDispatchReview] = useState(null);
  const [bulkDispatchVersion, setBulkDispatchVersion] = useState(0);
  const [fieldVisitId, setFieldVisitId] = useState(null);
  const [expenseDrafts, setExpenseDrafts] = useState({});
  const [expenseReview, setExpenseReview] = useState(null);
  const [, setMessage] = useToastMessage();
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [missingExpenseReview, setMissingExpenseReview] = useState(null);
  const canOpenCustomer360 = ["admin", "accountant"].includes(user?.role);
  const fieldVisit = requests.find((request) => request.id === fieldVisitId && ["open", "in_progress"].includes(request.status));

  const counts = useMemo(
    () => ({
      open: requests.filter((request) => request.status === "open").length,
      inProgress: requests.filter((request) => request.status === "in_progress").length,
      resolved: requests.filter((request) => request.status === "resolved").length,
      urgent: requests.filter((request) => request.priority === "urgent" && request.status !== "resolved").length
    }),
    [requests]
  );
  const overdueCount = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.target_date &&
          request.target_date.slice(0, 10) < today() &&
          ["open", "in_progress"].includes(request.status)
      ).length,
    [requests]
  );

  const loadRequests = async (nextStatus = statusFilter) => {
    setRequests(await api.maintenance.list(nextStatus));
  };

  const loadReferenceData = async () => {
    const [customerRows, zoneRows, assigneeRows] = await Promise.all([
      api.customers.list(),
      api.zones.list(),
      api.maintenance.assignees()
    ]);
    setCustomers(customerRows);
    setZones(zoneRows);
    setAssignees(assigneeRows);
  };

  const loadInitialWorkspace = async () => {
    setInitialLoading(true);
    setInitialError("");
    try {
      await Promise.all([loadRequests(""), loadReferenceData()]);
    } catch (err) {
      setInitialError(err.message || "Maintenance requests and field reference data could not be loaded.");
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadInitialWorkspace();
  }, []);

  useEffect(() => {
    if (navigationIntent?.page !== "maintenance" || navigationIntent.focus !== "create_customer_request" || !navigationIntent.customer_id) return;
    const customer = customers.find((row) => Number(row.id) === Number(navigationIntent.customer_id));
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customer_id: String(customer.id),
      zone_id: customer.zone_id ? String(customer.zone_id) : current.zone_id
    }));
    setRequestEntryOpen(true);
  }, [customers, navigationIntent]);

  useEffect(() => {
    if (navigationIntent?.page !== "maintenance" || navigationIntent.focus !== "maintenance_request" || !navigationIntent.request_id) return;
    const request = requests.find((row) => Number(row.id) === Number(navigationIntent.request_id));
    if (request && ["open", "in_progress"].includes(request.status) && Number(fieldVisitId) !== Number(request.id)) {
      setFieldVisitId(request.id);
    }
  }, [fieldVisitId, navigationIntent, requests]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await api.maintenance.create(form);
      setForm(emptyForm());
      setRequestEntryOpen(false);
      await loadRequests();
      setMessage("Maintenance request raised.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatusFilter = async (value) => {
    setStatusFilter(value);
    setMessage("");
    try {
      await loadRequests(value);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const updateRequest = async (id, payload, successMessage) => {
    setMessage("");
    setSaving(true);
    try {
      await api.maintenance.update(id, payload);
      await loadRequests();
      setMessage(successMessage);
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openDispatchReview = (request) => {
    setDispatchReview({
      request,
      assigned_to: request.assigned_to ? String(request.assigned_to) : "",
      target_date: request.target_date ? date(request.target_date) : ""
    });
  };

  const updateDispatchDraft = (field, value) => {
    setDispatchReview((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveDispatchReview = async () => {
    if (!dispatchReview) return;
    const { request, assigned_to, target_date } = dispatchReview;
    setSaving(true);
    setMessage("");
    try {
      await api.maintenance.update(request.id, { assigned_to, target_date });
      await loadRequests();
      setDispatchReview(null);
      setMessage(`${request.request_number || "Request"} dispatch details updated.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openBulkDispatchReview = (selectedRequests) => {
    if (selectedRequests.length < 2) return;
    setBulkDispatchReview({ requests: selectedRequests, assigned_to: "", target_date: today() });
  };

  const updateBulkDispatchDraft = (field, value) => {
    setBulkDispatchReview((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveBulkDispatchReview = async () => {
    if (!bulkDispatchReview) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await api.maintenance.dispatchBatch({
        request_ids: bulkDispatchReview.requests.map((request) => request.id),
        assigned_to: bulkDispatchReview.assigned_to,
        target_date: bulkDispatchReview.target_date
      });
      await loadRequests();
      setBulkDispatchReview(null);
      setBulkDispatchVersion((current) => current + 1);
      setMessage(`${result.count} field visits scheduled.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCustomer360 = (request) => {
    if (!request.customer_id || !canOpenCustomer360) return;
    onNavigate?.({
      page: "customers",
      focus: "customer_360",
      customer_id: request.customer_id,
      label: request.customer_name || request.acc_number || "Customer account"
    });
  };

  const performResolution = async (request, resolution_notes, customer_resolution_summary = "") => {
    setSaving(true);
    try {
      await api.maintenance.resolve(request.id, { resolution_notes, customer_resolution_summary });
      setResolutionDrafts((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setCustomerResolutionDrafts((current) => ({ ...current, [request.id]: "" }));
      await loadRequests();
      setMessage(`${request.request_number || "Request"} resolved.`);
      setFieldVisitId(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resolveRequest = async (request) => {
    const resolution_notes = String(resolutionDrafts[request.id] || "").trim();
    const customer_resolution_summary = String(customerResolutionDrafts[request.id] || "").trim();
    setMessage("");
    if (!resolution_notes) {
      setMessage("Resolution notes are required before closing a request.");
      return;
    }
    if (request.category === "billing_dispute" && !customer_resolution_summary) {
      setMessage("Add the customer-facing outcome before closing a billing dispute.");
      return;
    }
    const financeOnlyCase = ["billing_dispute", "payment_plan"].includes(request.category);
    if (!financeOnlyCase && Number(request.expense_count || 0) === 0) {
      setFieldVisitId(null);
      setMissingExpenseReview({ request, resolution_notes, customer_resolution_summary });
      return;
    }
    await performResolution(request, resolution_notes, customer_resolution_summary);
  };

  const addExpenseBeforeResolving = () => {
    if (!missingExpenseReview) return;
    openExpenseForm(missingExpenseReview.request);
    setMissingExpenseReview(null);
    setMessage("Add the expense, then resolve the request.");
  };

  const resolveWithoutExpense = async () => {
    if (!missingExpenseReview) return;
    const review = missingExpenseReview;
    setMissingExpenseReview(null);
    await performResolution(review.request, review.resolution_notes, review.customer_resolution_summary);
  };

  const openExpenseForm = (request) => {
    setActiveExpenseRequestId(request.id);
    setActiveDocumentRequestId(null);
    setExpenseDrafts((current) => ({
      ...current,
      [request.id]: current[request.id] || emptyExpenseDraft(request)
    }));
  };

  const setExpenseField = (requestId, field, value) => {
    setExpenseDrafts((current) => ({
      ...current,
      [requestId]: {
        ...emptyExpenseDraft(),
        ...(current[requestId] || {}),
        [field]: value
      }
    }));
  };

  const submitExpense = (event, request) => {
    event.preventDefault();
    const draft = expenseDrafts[request.id] || emptyExpenseDraft(request);
    setExpenseReview({
      request,
      draft: {
        ...draft,
        amount: Number(draft.amount)
      }
    });
  };

  const closeExpenseReview = () => {
    if (!saving) setExpenseReview(null);
  };

  const confirmExpenseReview = async (reviewNotes) => {
    if (!expenseReview) return;
    const { request, draft } = expenseReview;
    setMessage("");
    setSaving(true);
    try {
      await api.maintenance.addExpense(request.id, {
        ...draft,
        review_notes: reviewNotes
      });
      setActiveExpenseRequestId(null);
      setExpenseReview(null);
      setExpenseDrafts((current) => ({ ...current, [request.id]: emptyExpenseDraft(request) }));
      await loadRequests();
      setMessage(`Expense posted to ${request.request_number || "maintenance request"}.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };
  const focusKey = navigationIntent?.page === "maintenance" ? navigationIntent.focus : "";
  const returnTarget = navigationIntent?.page === "maintenance" ? navigationIntent.return_target : null;
  const hasMaintenanceFocus = ["urgent_maintenance", "overdue_maintenance", "finance_cases", "billing_disputes", "connection_requests", "maintenance_request"].includes(focusKey);
  const focusedRequests = requests.filter((request) => {
    let matchesFocus = true;
    if (focusKey === "urgent_maintenance") {
      matchesFocus = request.priority === "urgent" && !["resolved", "cancelled"].includes(request.status);
    }
    if (focusKey === "overdue_maintenance") {
      matchesFocus = request.target_date && request.target_date.slice(0, 10) < today() && ["open", "in_progress"].includes(request.status);
    }
    if (focusKey === "finance_cases") {
      matchesFocus = ["billing_dispute", "payment_plan"].includes(request.category) && !["resolved", "cancelled"].includes(request.status);
    }
    if (focusKey === "billing_disputes") {
      matchesFocus = request.category === "billing_dispute" && !["resolved", "cancelled"].includes(request.status);
    }
    if (focusKey === "connection_requests") {
      matchesFocus = request.category === "connection" && !["resolved", "cancelled"].includes(request.status);
    }
    if (focusKey === "maintenance_request") {
      matchesFocus = Number(request.id) === Number(navigationIntent?.request_id);
    }
    if (!matchesFocus) return false;
    if (categoryFilter && request.category !== categoryFilter) return false;
    if (zoneFilter && Number(request.zone_id) !== Number(zoneFilter)) return false;
    if (assigneeFilter === "unassigned" && request.assigned_to) return false;
    if (assigneeFilter && assigneeFilter !== "unassigned" && Number(request.assigned_to) !== Number(assigneeFilter)) return false;
    return true;
  });
  const requestTable = useTableControls(focusedRequests, {
    searchFields: [
      "request_number",
      "customer_name",
      "acc_number",
      "zone_name",
      "category",
      "priority",
      "status",
      "assigned_to_name",
      "resolution_notes"
    ]
  });

  if (initialLoading) {
    return <WorkspaceState title="Preparing field operations" detail="Retrieving maintenance work, service locations, and field assignment controls." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Field operations could not load" detail={initialError} onRetry={loadInitialWorkspace} />;
  }

  return (
    <section className="page-stack field-operations-page">
      <header className="page-header field-operations-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Keep field work moving.</h2>
          <p>Prioritise urgent service work, make ownership visible, and close every request with evidence and cost context.</p>
        </div>
        <div className="row-actions">
          <select value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value)} aria-label="Filter maintenance status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter maintenance category">
            <option value="">All categories</option>
            <option value="billing_dispute">Billing disputes</option>
            <option value="payment_plan">Payment plans</option>
            <option value="leak">Leaks</option>
            <option value="meter_fault">Meter faults</option>
            <option value="no_water">No water</option>
            <option value="low_pressure">Low pressure</option>
            <option value="water_quality">Water quality</option>
            <option value="connection">Connections</option>
            <option value="billing_support">Billing support</option>
            <option value="other">Other</option>
          </select>
          <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)} aria-label="Filter maintenance service zone">
            <option value="">All service zones</option>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Filter maintenance owner">
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
          <button className="icon-button" type="button" onClick={() => loadRequests()} title="Refresh maintenance requests">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {focusKey === "urgent_maintenance" ? (
        <FocusNotice
          title="Urgent maintenance"
          detail="Showing active requests marked urgent."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "create_customer_request" ? (
        <FocusNotice
          title="Raise service request for selected account"
          detail="The customer and service zone are prefilled. Record the request details before dispatching or changing service status."
          actionLabel={returnTarget ? "Return to account" : undefined}
          onAction={returnTarget ? () => onNavigate?.(returnTarget) : undefined}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "maintenance_request" ? (
        <FocusNotice
          title="Field task review"
          detail="Showing the selected active request with its customer context, ownership, and next field action."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "overdue_maintenance" ? (
        <FocusNotice
          title="Overdue maintenance"
          detail="Showing open or in-progress requests past their target date."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "finance_cases" ? (
        <FocusNotice
          title="Billing disputes and payment plans"
          detail="Showing active finance-related customer requests. Review the customer record, supporting evidence, ownership, and resolution notes before closing a case."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "billing_disputes" ? (
        <FocusNotice
          title="Billing disputes"
          detail="Showing active customer bill-review cases with their submitted bill context and supporting evidence."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "connection_requests" ? (
        <FocusNotice
          title="Connection requests"
          detail="Showing active customer connection and site-inspection requests with their submitted access details. Confirm site feasibility before creating any account, meter, service charge, or service-status change."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      {!hasMaintenanceFocus ? (
      <div className="field-operations-metrics">
        <div>
          <span>Open</span>
          <strong>{counts.open}</strong>
          <small>Awaiting action</small>
        </div>
        <div>
          <span>In progress</span>
          <strong>{counts.inProgress}</strong>
          <small>Assigned or underway</small>
        </div>
        <div>
          <span>Urgent</span>
          <strong>{counts.urgent}</strong>
          <small>Active priority calls</small>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{overdueCount}</strong>
          <small>Past target date</small>
        </div>
      </div>
      ) : null}

      <FieldDispatchPlan
        currentDate={today()}
        onBulkSchedule={openBulkDispatchReview}
        onOpenCustomer={canOpenCustomer360 ? openCustomer360 : null}
        onSchedule={openDispatchReview}
        onReviewVisit={(request) => setFieldVisitId(request.id)}
        selectionResetKey={bulkDispatchVersion}
        busy={saving}
        requests={focusedRequests}
      />

      <section className="workspace-grid entry-led-workspace field-operations-workspace">
        {!hasMaintenanceFocus ? (
        <EntryPanel
          actionLabel="Raise request"
          className="maintenance-entry-panel"
          disabled={saving}
          icon={<Wrench size={17} />}
          onOpenChange={(open) => {
            setRequestEntryOpen(open);
            if (!open) setForm(emptyForm());
          }}
          open={requestEntryOpen}
          summary="Capture a field or customer-service need"
          title="New service request"
        >
        <form className="form-grid" onSubmit={submit}>
          <label>
            Reported date
            <input value={form.reported_date} max={today()} onChange={(event) => setField("reported_date", event.target.value)} type="date" required />
          </label>
          <label>
            Customer
            <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)}>
              <option value="">General / not linked</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.acc_number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zone
            <select value={form.zone_id} onChange={(event) => setField("zone_id", event.target.value)}>
              <option value="">Use customer zone / none</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={form.category} onChange={(event) => setField("category", event.target.value)}>
              <option value="leak">Leak</option>
              <option value="meter_fault">Meter fault</option>
              <option value="no_water">No water</option>
              <option value="low_pressure">Low pressure</option>
              <option value="water_quality">Water quality</option>
              <option value="connection">Connection</option>
              <option value="billing_support">Billing support</option>
              <option value="billing_dispute">Billing dispute</option>
              <option value="payment_plan">Payment plan</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Priority
            <select value={form.priority} onChange={(event) => setField("priority", event.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            Source
            <select value={form.source} onChange={(event) => setField("source", event.target.value)}>
              <option value="internal">Internal</option>
              <option value="field">Field</option>
              <option value="phone">Phone</option>
              <option value="walk_in">Walk in</option>
              <option value="customer_portal">Customer portal</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Assign to
            <select value={form.assigned_to} onChange={(event) => setField("assigned_to", event.target.value)}>
              <option value="">Unassigned</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name} - {label(assignee.role)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target date
            <input value={form.target_date} min={today()} onChange={(event) => setField("target_date", event.target.value)} type="date" />
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows="4" />
          </label>
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={17} />
            Save request
          </button>
        </form>
        </EntryPanel>
        ) : null}

        <div className="panel wide-panel register-panel maintenance-register-panel">
          <div className="panel-heading">
            <h3>Maintenance Register</h3>
          </div>
          <TableControls table={requestTable} label="requests" placeholder="Search maintenance" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer / Zone</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assignment</th>
                  <th>Resolution</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requestTable.total ? (
                  requestTable.visibleRows.map((request) => {
                    const expenseDraft = expenseDrafts[request.id] || emptyExpenseDraft(request);
                    return (
                      <Fragment key={request.id}>
                        <tr>
                          <td>
                            <strong>{request.request_number || `Request ${request.id}`}</strong>
                            <small>{request.title}</small>
                            <small>Reported {date(request.reported_at)}</small>
                            {Number(request.expense_count || 0) > 0 ? (
                              <small>{Number(request.expense_count).toLocaleString()} expense(s) | {money(request.expense_total)}</small>
                            ) : null}
                          </td>
                          <td>
                            {request.customer_name || "General"}
                            <small>{request.acc_number || request.zone_name || "-"}</small>
                            {request.customer_location ? <small>{request.customer_location}</small> : null}
                          </td>
                          <td>
                            {label(request.category)}
                            {request.request_metadata?.billing_dispute ? (
                              <>
                                <small>{request.request_metadata.billing_dispute.bill_number || `Bill ${request.request_metadata.billing_dispute.bill_id}`}</small>
                                <small>{label(request.request_metadata.billing_dispute.reason)} review</small>
                              </>
                            ) : null}
                            {request.request_metadata?.connection_request ? (
                              <>
                                <small>{label(request.request_metadata.connection_request.request_type)}</small>
                                <small>{request.request_metadata.connection_request.site_location}</small>
                                {request.request_metadata.connection_request.preferred_inspection_date ? <small>Inspection preferred {date(request.request_metadata.connection_request.preferred_inspection_date)}</small> : null}
                              </>
                            ) : null}
                          </td>
                          <td>
                            <span className={`status status-${request.priority}`}>{label(request.priority)}</span>
                          </td>
                          <td>
                            <StatusBadge status={request.status} />
                          </td>
                          <td>
                            {request.assigned_to_name || "Unassigned"}
                            <small>{request.target_date ? `Target ${date(request.target_date)}` : "No target date"}</small>
                          </td>
                          <td>
                            {request.status === "resolved" ? (
                              <>
                                <span>{date(request.resolved_at)}</span>
                                <small>{request.resolution_notes || "-"}</small>
                              </>
                            ) : (
                              <div className="maintenance-resolution-drafts">
                                <textarea
                                  value={resolutionDrafts[request.id] || ""}
                                  onChange={(event) =>
                                    setResolutionDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                                  }
                                  rows="2"
                                  placeholder="Internal resolution notes"
                                />
                                {request.category === "billing_dispute" ? (
                                  <textarea
                                    value={customerResolutionDrafts[request.id] || ""}
                                    onChange={(event) =>
                                      setCustomerResolutionDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                                    }
                                    rows="2"
                                    maxLength={2000}
                                    placeholder="Customer-facing outcome"
                                  />
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="row-actions">
                              {request.status === "open" ? (
                                <button
                                  type="button"
                                  onClick={() => updateRequest(request.id, { status: "in_progress" }, "Maintenance request started.")}
                                  disabled={saving}
                                >
                                  <Play size={16} />
                                  Start work
                                </button>
                              ) : null}
                              {request.status === "in_progress" ? (
                                <button
                                  type="button"
                                  onClick={() => resolveRequest(request)}
                                  disabled={saving}
                                >
                                  <CheckCircle2 size={16} />
                                  Resolve
                                </button>
                              ) : null}
                              <details className="table-row-more">
                                <summary aria-label={`More actions for ${request.request_number || `request ${request.id}`}`} title="More request actions">
                                  <MoreHorizontal size={18} />
                                </summary>
                                <div className="table-row-more-menu">
                                  {request.customer_id && canOpenCustomer360 ? (
                                    <button aria-label="Open customer account" type="button" onClick={() => openCustomer360(request)} disabled={saving}>
                                      <UserRound size={16} />
                                      Open customer account
                                    </button>
                                  ) : null}
                                  <button
                                    aria-label="Supporting documents"
                                    type="button"
                                    onClick={() => {
                                      setActiveExpenseRequestId(null);
                                      setActiveDocumentRequestId((current) => (current === request.id ? null : request.id));
                                    }}
                                    disabled={saving}
                                  >
                                    <FileText size={16} />
                                    Supporting documents
                                  </button>
                                  {request.status !== "resolved" && request.status !== "cancelled" ? (
                                    <button aria-label="Set field owner and target date" type="button" onClick={() => openDispatchReview(request)} disabled={saving}>
                                      <CalendarClock size={16} />
                                      Schedule field work
                                    </button>
                                  ) : null}
                                  {request.status !== "cancelled" ? (
                                    <button aria-label="Attach expense" type="button" onClick={() => openExpenseForm(request)} disabled={saving}>
                                      <Banknote size={16} />
                                      Attach expense
                                    </button>
                                  ) : null}
                                  {request.status !== "resolved" && request.status !== "cancelled" ? (
                                    <button aria-label="Cancel request" type="button" onClick={() => updateRequest(request.id, { status: "cancelled" }, "Maintenance request cancelled.")} disabled={saving}>
                                      <Ban size={16} />
                                      Cancel request
                                    </button>
                                  ) : null}
                                </div>
                              </details>
                            </div>
                          </td>
                        </tr>
                        {activeExpenseRequestId === request.id ? (
                          <tr>
                            <td colSpan="8">
                              <form className="maintenance-expense-form" onSubmit={(event) => submitExpense(event, request)}>
                                <label>
                                  Date
                                  <input
                                    value={expenseDraft.expense_date}
                                    onChange={(event) => setExpenseField(request.id, "expense_date", event.target.value)}
                                    type="date"
                                    required
                                  />
                                </label>
                                <label>
                                  Category
                                  <input
                                    value={expenseDraft.category}
                                    onChange={(event) => setExpenseField(request.id, "category", event.target.value)}
                                    required
                                  />
                                </label>
                                <label>
                                  Vendor
                                  <input
                                    value={expenseDraft.vendor}
                                    onChange={(event) => setExpenseField(request.id, "vendor", event.target.value)}
                                  />
                                </label>
                                <label>
                                  Amount
                                  <input
                                    value={expenseDraft.amount}
                                    onChange={(event) => setExpenseField(request.id, "amount", event.target.value)}
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    required
                                  />
                                </label>
                                <label>
                                  Channel
                                  <select
                                    value={expenseDraft.payment_channel}
                                    onChange={(event) => setExpenseField(request.id, "payment_channel", event.target.value)}
                                  >
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank</option>
                                    <option value="mpesa_paybill">M-Pesa / Paybill</option>
                                    <option value="manual_adjustment">Manual adjustment</option>
                                  </select>
                                </label>
                                <label>
                                  Reference
                                  <input
                                    value={expenseDraft.reference}
                                    onChange={(event) => setExpenseField(request.id, "reference", event.target.value)}
                                  />
                                </label>
                                <label className="full-span">
                                  Description
                                  <textarea
                                    value={expenseDraft.description}
                                    onChange={(event) => setExpenseField(request.id, "description", event.target.value)}
                                    rows="2"
                                    required
                                  />
                                </label>
                                <div className="row-actions full-span">
                                  <button className="primary-button" type="submit" disabled={saving}>
                                    <Save size={16} />
                                    Post expense
                                  </button>
                                  <button type="button" onClick={() => setActiveExpenseRequestId(null)} disabled={saving}>
                                    <X size={16} />
                                    Close
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ) : null}
                        {activeDocumentRequestId === request.id ? (
                          <tr>
                            <td colSpan="8">
                              <SupportingDocumentsPanel entityType="maintenance_request" entityId={request.id} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <EmptyTableRow colSpan={8} title="No maintenance requests found" detail="Create a request or adjust the search." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <FieldVisitReview
        request={fieldVisit}
        notes={resolutionDrafts[fieldVisitId] || ""}
        onNotesChange={(value) => setResolutionDrafts((current) => ({ ...current, [fieldVisitId]: value }))}
        busy={saving}
        onCancel={() => setFieldVisitId(null)}
        onStart={async () => {
          const started = await updateRequest(fieldVisit.id, { status: "in_progress" }, "Maintenance request started.");
          if (started) setFieldVisitId(null);
        }}
        onResolve={() => resolveRequest(fieldVisit)}
      />
      <MaintenanceDispatchDialogs
        assignees={assignees}
        bulkDispatchReview={bulkDispatchReview}
        dispatchReview={dispatchReview}
        label={label}
        onBulkCancel={() => setBulkDispatchReview(null)}
        onBulkChange={updateBulkDispatchDraft}
        onBulkConfirm={saveBulkDispatchReview}
        onDispatchCancel={() => setDispatchReview(null)}
        onDispatchChange={updateDispatchDraft}
        onDispatchConfirm={saveDispatchReview}
        saving={saving}
      />
      <ReviewDialog
        open={Boolean(expenseReview)}
        eyebrow="Maintenance expense review"
        title="Record maintenance operating expense"
        description="This records one operating expense linked to the maintenance request and updates service-cost reporting. It does not initiate or confirm a cash, bank, or M-Pesa payment."
        confirmLabel="Record maintenance expense"
        cancelLabel="Keep editing"
        reasonLabel="Finance approval note"
        reasonPlaceholder="State the receipt, work evidence, or decision basis for the expense audit trail"
        busy={saving}
        busyLabel="Recording expense..."
        onCancel={closeExpenseReview}
        onConfirm={confirmExpenseReview}
      >
        {expenseReview ? (
          <div className="reading-context">
            <div><span>Maintenance request</span><strong>{expenseReview.request.request_number || `Request ${expenseReview.request.id}`}</strong></div>
            <div><span>Customer / zone</span><strong>{expenseReview.request.customer_name || expenseReview.request.zone_name || "General"}</strong></div>
            <div><span>Expense date</span><strong>{date(expenseReview.draft.expense_date)}</strong></div>
            <div><span>Category</span><strong>{expenseReview.draft.category || "-"}</strong></div>
            <div><span>Vendor</span><strong>{expenseReview.draft.vendor || "Not specified"}</strong></div>
            <div><span>Amount</span><strong>{money(expenseReview.draft.amount)}</strong></div>
            <div><span>Channel</span><strong>{label(expenseReview.draft.payment_channel)}</strong></div>
            <div><span>Reference</span><strong>{expenseReview.draft.reference || "Not supplied"}</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(missingExpenseReview)}
        eyebrow="Maintenance cost check"
        title="No expense attached"
        description={
          missingExpenseReview
            ? `${missingExpenseReview.request.request_number || "This request"} has no recorded expense. Add the cost now, or explicitly resolve it as a no-cost request.`
            : ""
        }
        confirmLabel="Add expense"
        secondaryLabel="Resolve without expense"
        cancelLabel="Keep request open"
        reasonLabel={null}
        busy={saving}
        onCancel={() => setMissingExpenseReview(null)}
        onConfirm={addExpenseBeforeResolving}
        onSecondary={resolveWithoutExpense}
      />
    </section>
  );
}

export default MaintenancePage;
