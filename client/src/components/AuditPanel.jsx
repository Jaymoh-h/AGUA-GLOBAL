import { History } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "./EmptyState";
import { useToastMessage } from "./ToastProvider";
import { api } from "../services/api";

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "-");

const snapshotSummary = (event) => {
  const beforeKeys = event.before_data ? Object.keys(event.before_data).length : 0;
  const afterKeys = event.after_data ? Object.keys(event.after_data).length : 0;
  if (beforeKeys && afterKeys) return `${beforeKeys} before, ${afterKeys} after`;
  if (afterKeys) return `${afterKeys} captured fields`;
  if (beforeKeys) return `${beforeKeys} previous fields`;
  return "No snapshot";
};

function AuditPanel({ entityType, entityId, title = "Audit History" }) {
  const [events, setEvents] = useState([]);
  const [, setMessage] = useToastMessage();

  useEffect(() => {
    if (!entityType || !entityId) {
      setEvents([]);
      return undefined;
    }

    let ignore = false;
    setMessage("");
    api.auditEvents
      .list({ entity_type: entityType, entity_id: entityId })
      .then((rows) => {
        if (!ignore) setEvents(rows);
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });

    return () => {
      ignore = true;
    };
  }, [entityType, entityId]);

  if (!entityType || !entityId) return null;

  return (
    <div className="audit-panel">
      <div className="panel-heading compact-heading">
        <h3>{title}</h3>
        <History size={16} />
      </div>
      <div className="audit-list">
        {events.length ? (
          events.map((event) => (
            <div className="audit-item" key={event.id}>
              <div>
                <strong>{event.action}</strong>
                <small>{formatDate(event.created_at)}</small>
              </div>
              <span>{event.actor_name || "System"}</span>
              <small>{event.reason || snapshotSummary(event)}</small>
            </div>
          ))
        ) : (
          <EmptyState title="No audit events found" detail="Changes for this record will appear here." />
        )}
      </div>
    </div>
  );
}

export default AuditPanel;
