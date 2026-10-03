import ReviewDialog from "./ReviewDialog";

function MaintenanceDispatchDialogs({
  assignees,
  bulkDispatchReview,
  dispatchReview,
  label,
  onBulkCancel,
  onBulkChange,
  onBulkConfirm,
  onDispatchCancel,
  onDispatchChange,
  onDispatchConfirm,
  saving
}) {
  return (
    <>
      <ReviewDialog
        open={Boolean(bulkDispatchReview)}
        eyebrow="Field dispatch"
        title="Schedule selected visits"
        description={
          bulkDispatchReview
            ? `Set one owner and target date for ${bulkDispatchReview.requests.length} active field visits. Their current status stays unchanged and each update is retained in the audit history.`
            : ""
        }
        confirmLabel="Schedule visits"
        cancelLabel="Keep current details"
        reasonLabel={null}
        busy={saving}
        onCancel={onBulkCancel}
        onConfirm={onBulkConfirm}
      >
        <div className="dispatch-review-fields">
          <label>
            Field owner
            <select value={bulkDispatchReview?.assigned_to || ""} onChange={(event) => onBulkChange("assigned_to", event.target.value)} disabled={saving} required>
              <option value="">Select owner</option>
              {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} - {label(assignee.role)}</option>)}
            </select>
          </label>
          <label>
            Target date
            <input value={bulkDispatchReview?.target_date || ""} onChange={(event) => onBulkChange("target_date", event.target.value)} type="date" disabled={saving} required />
          </label>
        </div>
      </ReviewDialog>

      <ReviewDialog
        open={Boolean(dispatchReview)}
        eyebrow="Field dispatch"
        title="Set owner and target"
        description={
          dispatchReview
            ? `Confirm the field handoff for ${dispatchReview.request.request_number || "this request"}. This keeps the request open and records the assignment change in its audit history.`
            : ""
        }
        confirmLabel="Save dispatch details"
        cancelLabel="Keep current details"
        reasonLabel={null}
        busy={saving}
        onCancel={onDispatchCancel}
        onConfirm={onDispatchConfirm}
      >
        <div className="dispatch-review-fields">
          <label>
            Field owner
            <select value={dispatchReview?.assigned_to || ""} onChange={(event) => onDispatchChange("assigned_to", event.target.value)} disabled={saving}>
              <option value="">Unassigned</option>
              {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} - {label(assignee.role)}</option>)}
            </select>
          </label>
          <label>
            Target date
            <input value={dispatchReview?.target_date || ""} onChange={(event) => onDispatchChange("target_date", event.target.value)} type="date" disabled={saving} />
          </label>
        </div>
      </ReviewDialog>
    </>
  );
}

export default MaintenanceDispatchDialogs;
