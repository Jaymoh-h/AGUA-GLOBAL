import { Download, Eye, History, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

const summarizeSnapshot = (event) => {
  const beforeKeys = event.before_data ? Object.keys(event.before_data).length : 0;
  const afterKeys = event.after_data ? Object.keys(event.after_data).length : 0;

  if (beforeKeys && afterKeys) return `${beforeKeys} before fields, ${afterKeys} after fields`;
  if (afterKeys) return `${afterKeys} captured fields`;
  if (beforeKeys) return `${beforeKeys} removed fields`;
  return "-";
};

const importSummary = (event) => {
  const data = event.after_data || {};
  const parts = [
    data.totalRows !== undefined ? `${data.totalRows} rows` : null,
    data.importedRows !== undefined ? `${data.importedRows} imported` : null,
    data.billCount !== undefined ? `${data.billCount} bills` : null,
    data.totalAmount !== undefined ? `KES ${Number(data.totalAmount || 0).toLocaleString()}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : summarizeSnapshot(event);
};

const flattenRecord = (value, prefix = "", result = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, nestedValue]) => {
      flattenRecord(nestedValue, prefix ? `${prefix}.${key}` : key, result);
    });
    return result;
  }
  result[prefix || "value"] = value;
  return result;
};

const stringifyValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

const buildChangeRows = (event) => {
  const before = flattenRecord(event.before_data || {});
  const after = flattenRecord(event.after_data || {});
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return fields
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => ({
      field,
      before: before[field],
      after: after[field]
    }));
};

const changeSummary = (event) => {
  const changes = buildChangeRows(event).length;
  if (changes) return `${changes} changed field${changes === 1 ? "" : "s"}`;
  return summarizeSnapshot(event);
};

function AuditTrailPage() {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    api.auditEvents.list().then(setEvents).catch((err) => setMessage(err.message));
  }, []);
  const eventTable = useTableControls(events, {
    searchFields: ["actor_name", "actor_email", "action", "entity_type", "entity_id", "reason", "created_at"]
  });
  const importEvents = events.filter((event) => String(event.action || "").includes("_import."));
  const importTable = useTableControls(importEvents, {
    searchFields: ["actor_name", "actor_email", "action", "entity_type", "reason", "created_at"]
  });
  const exportEvents = () => {
    downloadCsvRows(
      "audit-trail.csv",
      [
        { header: "Time", value: (row) => row.created_at },
        { header: "Actor", value: (row) => row.actor_name || "System" },
        { header: "Actor Email", value: (row) => row.actor_email },
        { header: "Action", value: (row) => row.action },
        { header: "Entity", value: (row) => row.entity_type },
        { header: "Entity ID", value: (row) => row.entity_id },
        { header: "Reason", value: (row) => row.reason }
      ],
      eventTable.filteredRows
    );
  };
  const exportImports = () => {
    downloadCsvRows(
      "import-activity.csv",
      [
        { header: "Time", value: (row) => row.created_at },
        { header: "Actor", value: (row) => row.actor_name || "System" },
        { header: "Actor Email", value: (row) => row.actor_email },
        { header: "Action", value: (row) => row.action },
        { header: "Summary", value: importSummary },
        { header: "Reason", value: (row) => row.reason }
      ],
      importTable.filteredRows
    );
  };

  const selectedChanges = selectedEvent ? buildChangeRows(selectedEvent) : [];

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accountability</p>
          <h2>Audit Trail</h2>
        </div>
      </header>

      {message ? <p className="form-note">{message}</p> : null}
      <div className="panel">
        <div className="panel-heading">
          <h3>Import Activity</h3>
          <div className="row-actions">
            <History size={18} />
            <button type="button" onClick={exportImports}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
        <TableControls table={importTable} label="imports" placeholder="Search imports" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Import</th>
                <th>Summary</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {importTable.visibleRows.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>
                    <strong>{event.actor_name || "System"}</strong>
                    <small>{event.actor_email || ""}</small>
                  </td>
                  <td>{event.action.replace("_import.committed", "")}</td>
                  <td>{importSummary(event)}</td>
                  <td>{event.reason || "-"}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedEvent(event)} title="View audit details">
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!importTable.visibleRows.length ? (
                <EmptyTableRow colSpan={6} title="No import activity found" detail="Committed imports will appear here." />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>Recent Events</h3>
          <div className="row-actions">
            <History size={18} />
            <button type="button" onClick={exportEvents}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
        <TableControls table={eventTable} label="events" placeholder="Search audit events" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Changes</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {eventTable.visibleRows.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>
                    <strong>{event.actor_name || "System"}</strong>
                    <small>{event.actor_email || ""}</small>
                  </td>
                  <td>{event.action}</td>
                  <td>
                    <strong>{event.entity_type}</strong>
                    <small>{event.entity_id || "-"}</small>
                  </td>
                  <td>{changeSummary(event)}</td>
                  <td>{event.reason || "-"}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedEvent(event)} title="View audit details">
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!eventTable.visibleRows.length ? (
                <EmptyTableRow colSpan={7} title="No audit events found" detail="System activity will appear here as changes are made." />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {selectedEvent ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedEvent(null)}>
          <div className="modal-panel audit-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Audit Record</p>
                <h3>{selectedEvent.action}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedEvent(null)} title="Close audit details">
                <X size={15} />
              </button>
            </div>
            <div className="audit-detail-grid">
              <div>
                <span>Time</span>
                <strong>{formatDate(selectedEvent.created_at)}</strong>
              </div>
              <div>
                <span>Actor</span>
                <strong>{selectedEvent.actor_name || "System"}</strong>
                <small>{selectedEvent.actor_email || ""}</small>
              </div>
              <div>
                <span>Entity</span>
                <strong>{selectedEvent.entity_type}</strong>
                <small>Record ID: {selectedEvent.entity_id || "-"}</small>
              </div>
              <div>
                <span>Reason</span>
                <strong>{selectedEvent.reason || "-"}</strong>
              </div>
              <div>
                <span>IP address</span>
                <strong>{selectedEvent.ip_address || "-"}</strong>
              </div>
              <div>
                <span>User agent</span>
                <strong>{selectedEvent.user_agent || "-"}</strong>
              </div>
            </div>

            <div className="panel-heading compact-heading">
              <h3>Field Changes</h3>
              <small>{selectedChanges.length ? `${selectedChanges.length} changed field(s)` : "No before/after difference captured"}</small>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedChanges.length ? (
                    selectedChanges.map((row) => (
                      <tr key={row.field}>
                        <td>{row.field}</td>
                        <td><pre className="json-inline">{stringifyValue(row.before)}</pre></td>
                        <td><pre className="json-inline">{stringifyValue(row.after)}</pre></td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={3} title="No field-level changes" detail="This event captured a snapshot rather than a before/after edit." />
                  )}
                </tbody>
              </table>
            </div>

            <div className="audit-snapshot-grid">
              <div>
                <h3>Before Snapshot</h3>
                <pre className="json-block">{stringifyValue(selectedEvent.before_data)}</pre>
              </div>
              <div>
                <h3>After Snapshot</h3>
                <pre className="json-block">{stringifyValue(selectedEvent.after_data)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AuditTrailPage;
