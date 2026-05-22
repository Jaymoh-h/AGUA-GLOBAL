import { Download, History } from "lucide-react";
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

function AuditTrailPage() {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");

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
                </tr>
              ))}
              {!importTable.visibleRows.length ? (
                <EmptyTableRow colSpan={5} title="No import activity found" detail="Committed imports will appear here." />
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
                <th>Snapshot</th>
                <th>Reason</th>
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
                  <td>{summarizeSnapshot(event)}</td>
                  <td>{event.reason || "-"}</td>
                </tr>
              ))}
              {!eventTable.visibleRows.length ? (
                <EmptyTableRow colSpan={6} title="No audit events found" detail="System activity will appear here as changes are made." />
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AuditTrailPage;
