import ReviewDialog from "./ReviewDialog";
import { dispatchSite } from "../utils/fieldDispatch";
import { useEffect, useState } from "react";

const label = (value) => String(value || "-").replaceAll("_", " ");
const date = (value) => String(value || "").slice(0, 10);

function FieldVisitReview({ request, notes, onNotesChange, busy, onCancel, onStart, onResolve }) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (!request) return null;
  const starting = request.status === "open";
  const access = request.request_metadata?.connection_request;
  return (
    <ReviewDialog
      open
      eyebrow="Field visit"
      title={request.request_number || `Request ${request.id}`}
      confirmLabel={starting ? "Start work" : "Resolve visit"}
      cancelLabel="Back to plan"
      reasonLabel={null}
      busy={busy}
      confirmDisabled={!isOnline}
      onCancel={onCancel}
      onConfirm={starting ? onStart : onResolve}
    >
      <div className="field-visit-review">
        {!isOnline ? <p className="offline-field-notice">Offline. Resolution notes stay on this device; reconnect before starting or resolving this visit.</p> : null}
        <p className="field-visit-summary">{request.title || label(request.category)}</p>
        <dl className="field-visit-facts">
          <div><dt>Status</dt><dd>{label(request.status)}</dd></div>
          <div><dt>Priority</dt><dd>{label(request.priority)}</dd></div>
          <div><dt>Customer</dt><dd>{[request.customer_name, request.acc_number].filter(Boolean).join(" | ") || "General request"}</dd></div>
          <div><dt>Owner</dt><dd>{request.assigned_to_name || "Unassigned"}</dd></div>
          <div><dt>Site</dt><dd>{dispatchSite(request) || "Site address needs confirmation"}</dd></div>
          <div><dt>Target date</dt><dd>{date(request.target_date) || "Not set"}</dd></div>
          {request.meter_number ? <div><dt>Meter</dt><dd>{request.meter_number}</dd></div> : null}
          {access?.landmark ? <div><dt>Landmark</dt><dd>{access.landmark}</dd></div> : null}
          {access?.access_contact_name || access?.access_contact_phone ? (
            <div><dt>Site contact</dt><dd>{[access.access_contact_name, access.access_contact_phone].filter(Boolean).join(" | ")}</dd></div>
          ) : null}
          {access?.preferred_inspection_date ? <div><dt>Preferred inspection</dt><dd>{date(access.preferred_inspection_date)}</dd></div> : null}
          {access?.access_notes ? <div><dt>Access</dt><dd>{access.access_notes}</dd></div> : null}
          <div><dt>Recorded expenses</dt><dd>{Number(request.expense_count || 0)} | KES {Number(request.expense_total || 0).toLocaleString()}</dd></div>
        </dl>
        {request.description ? <div className="field-visit-description"><strong>Reported issue</strong><p>{request.description}</p></div> : null}
        {!starting ? (
          <label>
            Resolution notes
            <textarea rows="4" required disabled={busy} value={notes || ""} onChange={(event) => onNotesChange(event.target.value)} />
          </label>
        ) : null}
      </div>
    </ReviewDialog>
  );
}

export default FieldVisitReview;
