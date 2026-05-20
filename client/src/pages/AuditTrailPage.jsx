import { History } from "lucide-react";
import { useEffect, useState } from "react";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

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

function AuditTrailPage() {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.auditEvents.list().then(setEvents).catch((err) => setMessage(err.message));
  }, []);
  const eventTable = useTableControls(events, {
    searchFields: ["actor_name", "actor_email", "action", "entity_type", "entity_id", "reason", "created_at"]
  });

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
          <h3>Recent Events</h3>
          <History size={18} />
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
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AuditTrailPage;
