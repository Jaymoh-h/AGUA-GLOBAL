import { AlertTriangle, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, MapPin, Printer, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { dispatchSite, fieldVisits } from "../utils/fieldDispatch";
import { withPrintTitle } from "../utils/exportNames";

const dateOnly = (value) => String(value || "").slice(0, 10);
const label = (value) => String(value || "-").replaceAll("_", " ");

const targetLabel = (request, currentDate) => {
  const targetDate = dateOnly(request.target_date);
  if (!targetDate) return "Target date needs setting";
  if (targetDate < currentDate) return `Overdue since ${targetDate}`;
  if (targetDate === currentDate) return "Due today";
  return `Target ${targetDate}`;
};

function FieldDispatchPlan({ requests, currentDate, onBulkSchedule, onOpenCustomer, onSchedule, onReviewVisit, selectionResetKey = 0, busy = false }) {
  const [workDate, setWorkDate] = useState(currentDate);
  const [includeFuture, setIncludeFuture] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const activeRequests = fieldVisits(requests || [], workDate || currentDate, includeFuture);
  const activeRequestKey = activeRequests.map((request) => request.id).join(",");
  useEffect(() => {
    const visibleIds = new Set(activeRequests.map((request) => Number(request.id)));
    setSelectedRequestIds((current) => current.filter((id) => visibleIds.has(Number(id))));
  }, [activeRequestKey]);
  useEffect(() => {
    setSelectedRequestIds([]);
  }, [selectionResetKey]);
  const groups = activeRequests.reduce((result, request) => {
    const key = request.assigned_to ? `user-${request.assigned_to}` : "unassigned";
    if (!result[key]) {
      result[key] = {
        key,
        name: request.assigned_to_name || "Unassigned work",
        requests: []
      };
    }
    result[key].requests.push(request);
    return result;
  }, {});
  const dispatchGroups = Object.values(groups).sort((left, right) => {
    if (left.key === "unassigned") return -1;
    if (right.key === "unassigned") return 1;
    return left.name.localeCompare(right.name);
  });
  const unassignedCount = activeRequests.filter((request) => !request.assigned_to).length;
  const missingLocationCount = activeRequests.filter((request) => !dispatchSite(request)).length;
  const overdueCount = activeRequests.filter((request) => dateOnly(request.target_date) && dateOnly(request.target_date) < currentDate).length;
  const selectedRequests = activeRequests.filter((request) => selectedRequestIds.includes(Number(request.id)));
  const toggleRequestSelection = (requestId, checked) => {
    setSelectedRequestIds((current) => {
      const normalizedId = Number(requestId);
      if (!checked) return current.filter((id) => id !== normalizedId);
      if (current.includes(normalizedId) || current.length >= 50) return current;
      return [...current, normalizedId];
    });
  };
  const printDispatch = () => {
    setPrinting(true);
    const clearPrinting = () => setPrinting(false);
    window.addEventListener("afterprint", clearPrinting, { once: true });
    window.addEventListener("focus", clearPrinting, { once: true });
    window.setTimeout(() => {
      withPrintTitle(`Field dispatch ${workDate || currentDate}`, () => window.print());
    }, 80);
    window.setTimeout(clearPrinting, 60000);
  };

  return (
    <section className={`field-dispatch-plan print-surface ${printing ? "active-print-surface field-dispatch-print" : ""}`} aria-label="Daily field dispatch plan">
      <header className="field-dispatch-print-header">
        <div>
          <h1>Field dispatch plan</h1>
          <p>Work date: {workDate || currentDate}{includeFuture ? " | Future targets included" : ""}</p>
        </div>
        <p>Prepared {currentDate}</p>
      </header>
      <header className="field-dispatch-heading">
        <div>
          <p className="eyebrow">Daily field plan</p>
          <h3>Field visits</h3>
        </div>
        <div className="field-dispatch-heading-actions">
          {onBulkSchedule ? (
            <button
              className="field-dispatch-bulk-action"
              type="button"
              onClick={() => onBulkSchedule(selectedRequests)}
              disabled={busy || selectedRequests.length < 2}
            >
              <CalendarClock size={16} />
              Schedule {selectedRequests.length || "selected"}
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={printDispatch} title="Print or save field work pack">
            <Printer size={16} />
          </button>
          <ClipboardList size={22} aria-hidden="true" />
        </div>
      </header>

      <div className="field-dispatch-controls">
        <label>
          Work date
          <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} onBlur={() => !workDate && setWorkDate(currentDate)} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeFuture} onChange={(event) => setIncludeFuture(event.target.checked)} />
          Include future targets
        </label>
      </div>

      <div className="field-dispatch-metrics">
        <div className={unassignedCount ? "needs-attention" : ""}>
          <span>Unassigned</span>
          <strong>{unassignedCount}</strong>
          <small>Needs an owner</small>
        </div>
        <div className={overdueCount ? "needs-attention" : ""}>
          <span>Overdue</span>
          <strong>{overdueCount}</strong>
          <small>Past target date</small>
        </div>
        <div className={missingLocationCount ? "needs-attention" : ""}>
          <span>Location gaps</span>
          <strong>{missingLocationCount}</strong>
          <small>Confirm before dispatch</small>
        </div>
        <div>
          <span>Visits in view</span>
          <strong>{activeRequests.length}</strong>
          <small>Open or in progress</small>
        </div>
      </div>

      {dispatchGroups.length ? (
        <div className="field-dispatch-groups">
          {dispatchGroups.map((group) => (
            <section className="field-dispatch-group" key={group.key}>
              <header>
                <strong>{group.name}</strong>
                <span>{group.requests.length} visit{group.requests.length === 1 ? "" : "s"}</span>
              </header>
              <ol>
                {group.requests.map((request) => {
                  const location = dispatchSite(request);
                  const access = request.request_metadata?.connection_request;
                  const isOverdue = dateOnly(request.target_date) && dateOnly(request.target_date) < currentDate;
                  const isSelected = selectedRequestIds.includes(Number(request.id));
                  return (
                    <li className="field-dispatch-item" key={request.id}>
                      {onBulkSchedule ? (
                        <label className="field-dispatch-selection">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleRequestSelection(request.id, event.target.checked)}
                            disabled={busy || (!isSelected && selectedRequestIds.length >= 50)}
                            aria-label={`Select ${request.request_number || `request ${request.id}`} for bulk scheduling`}
                          />
                        </label>
                      ) : null}
                      <span className={`status status-${request.priority}`}>{label(request.priority)}</span>
                      <div className="field-dispatch-detail">
                        <strong>{request.request_number || `Request ${request.id}`}</strong>
                        <small>{label(request.status)}</small>
                        <span>{request.title || label(request.category)}</span>
                        {request.zone_name ? <small>{request.zone_name}</small> : null}
                        <small className={!location ? "needs-attention-text" : ""}><MapPin size={13} aria-hidden="true" />{location || "Site address needs confirmation"}</small>
                        <small className={isOverdue || !request.target_date ? "needs-attention-text" : ""}>
                          <CalendarDays size={13} aria-hidden="true" />{targetLabel(request, currentDate)}
                        </small>
                        {access?.preferred_inspection_date ? <small>Preferred inspection: {dateOnly(access.preferred_inspection_date)}</small> : null}
                        {access?.landmark ? <small>Landmark: {access.landmark}</small> : null}
                        {access?.access_contact_name || access?.access_contact_phone ? (
                          <small>Site contact: {[access.access_contact_name, access.access_contact_phone].filter(Boolean).join(" | ")}</small>
                        ) : null}
                        {access?.access_notes ? <small>Access: {access.access_notes}</small> : null}
                      </div>
                      <div className="field-dispatch-actions">
                        {onReviewVisit ? (
                          <button className="icon-button" type="button" onClick={() => onReviewVisit(request)} title="Review field visit" disabled={busy}>
                            <ClipboardCheck size={16} />
                          </button>
                        ) : null}
                        {onSchedule ? (
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => onSchedule(request)}
                            title="Set field owner and target date"
                            disabled={busy}
                          >
                            <CalendarClock size={16} />
                          </button>
                        ) : null}
                        {request.customer_id && onOpenCustomer ? (
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => onOpenCustomer(request)}
                            title="Open customer account"
                            disabled={busy}
                          >
                            <UserRound size={16} />
                          </button>
                        ) : null}
                        {!request.assigned_to ? <AlertTriangle className="field-dispatch-alert" size={17} aria-label="Unassigned" /> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-state">No active field work matches the current filters.</p>
      )}
    </section>
  );
}

export default FieldDispatchPlan;
