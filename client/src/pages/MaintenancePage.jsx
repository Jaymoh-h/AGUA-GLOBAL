import { Ban, CheckCircle2, Play, RefreshCw, Save, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const today = () => new Date().toISOString().slice(0, 10);
const date = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");

const emptyForm = () => ({
  title: "",
  category: "leak",
  priority: "normal",
  source: "internal",
  customer_id: "",
  zone_id: "",
  assigned_to: "",
  target_date: "",
  description: ""
});

function MaintenancePage() {
  const [requests, setRequests] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState("");
  const [resolutionDrafts, setResolutionDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const counts = useMemo(
    () => ({
      open: requests.filter((request) => request.status === "open").length,
      inProgress: requests.filter((request) => request.status === "in_progress").length,
      resolved: requests.filter((request) => request.status === "resolved").length,
      urgent: requests.filter((request) => request.priority === "urgent" && request.status !== "resolved").length
    }),
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

  useEffect(() => {
    Promise.all([loadRequests(""), loadReferenceData()]).catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await api.maintenance.create(form);
      setForm(emptyForm());
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
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resolveRequest = async (request) => {
    const resolution_notes = String(resolutionDrafts[request.id] || "").trim();
    setMessage("");
    if (!resolution_notes) {
      setMessage("Resolution notes are required before closing a request.");
      return;
    }
    setSaving(true);
    try {
      await api.maintenance.resolve(request.id, { resolution_notes });
      setResolutionDrafts((current) => ({ ...current, [request.id]: "" }));
      await loadRequests();
      setMessage(`${request.request_number || "Request"} resolved.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };
  const requestTable = useTableControls(requests, {
    searchFields: [
      "request_number",
      "title",
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

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Maintenance Requests</h2>
        </div>
        <div className="row-actions">
          <select value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value)} aria-label="Filter maintenance status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="icon-button" type="button" onClick={() => loadRequests()} title="Refresh maintenance requests">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <span>Open</span>
          <strong>{counts.open}</strong>
          <small>Awaiting action</small>
        </div>
        <div className="stat-card">
          <span>In progress</span>
          <strong>{counts.inProgress}</strong>
          <small>Assigned or underway</small>
        </div>
        <div className="stat-card">
          <span>Urgent</span>
          <strong>{counts.urgent}</strong>
          <small>Active priority calls</small>
        </div>
        <div className="stat-card">
          <span>Resolved</span>
          <strong>{counts.resolved}</strong>
          <small>Current view</small>
        </div>
      </div>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>Raise Request</h3>
            <Wrench size={18} />
          </div>
          <label>
            Title
            <input value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="Leak at customer line" required />
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
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit" disabled={saving}>
            <Save size={17} />
            Save request
          </button>
        </form>

        <div className="panel wide-panel">
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
                  requestTable.visibleRows.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <strong>{request.request_number || `Request ${request.id}`}</strong>
                        <small>{request.title}</small>
                        <small>Reported {date(request.reported_at)}</small>
                      </td>
                      <td>
                        {request.customer_name || "General"}
                        <small>{request.acc_number || request.zone_name || "-"}</small>
                      </td>
                      <td>{label(request.category)}</td>
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
                          <textarea
                            value={resolutionDrafts[request.id] || ""}
                            onChange={(event) =>
                              setResolutionDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                            }
                            rows="2"
                            placeholder="Resolution notes"
                          />
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {request.status === "open" ? (
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => updateRequest(request.id, { status: "in_progress" }, "Maintenance request started.")}
                              title="Start work"
                              disabled={saving}
                            >
                              <Play size={16} />
                            </button>
                          ) : null}
                          {request.status !== "resolved" && request.status !== "cancelled" ? (
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => resolveRequest(request)}
                              title="Resolve request"
                              disabled={saving}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          ) : null}
                          {request.status !== "resolved" && request.status !== "cancelled" ? (
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => updateRequest(request.id, { status: "cancelled" }, "Maintenance request cancelled.")}
                              title="Cancel request"
                              disabled={saving}
                            >
                              <Ban size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={8} title="No maintenance requests found" detail="Create a request or adjust the search." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

export default MaintenancePage;
