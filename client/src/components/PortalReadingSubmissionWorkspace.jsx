import { Gauge, Paperclip, Send, X } from "lucide-react";
import { EmptyTableRow } from "./EmptyState";
import StatusBadge from "./StatusBadge";
import SupportingDocumentsPanel from "./SupportingDocumentsPanel";
import TableControls from "./TableControls";

function PortalReadingSubmissionWorkspace({
  customerId,
  currentDate,
  data,
  date,
  form,
  number,
  onCloseEvidence,
  onEvidence,
  onFieldChange,
  onSubmit,
  saving,
  selectedSubmission,
  table
}) {
  return <>
    <form className="panel form-grid" onSubmit={onSubmit}>
      <div className="panel-heading"><div><h3>Submit Meter Reading</h3><p className="muted">Submissions are reviewed before they affect billing.</p></div><Gauge size={18} /></div>
      <div className="portal-profile-grid">
        <div><span>Registered meter</span><strong>{data?.activeMeter?.meter_number || "No active meter"}</strong></div>
        <div><span>Latest verified reading</span><strong>{data?.latestReading ? number(data.latestReading.reading_value) : "No reading yet"}</strong></div>
        <div><span>Verified on</span><strong>{date(data?.latestReading?.reading_date)}</strong></div>
      </div>
      <label>Current meter reading<input value={form.reading_value} onChange={(event) => onFieldChange("reading_value", event.target.value)} type="number" min={data?.latestReading?.reading_value || 0} step="0.01" required /></label>
      <label>Reading date<input value={form.reading_date} onChange={(event) => onFieldChange("reading_date", event.target.value)} type="date" max={currentDate} required /></label>
      <label>Note for the reviewer<textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} rows="3" maxLength={1000} placeholder="For example, meter display was difficult to read." /></label>
      <button className="primary-button" type="submit" disabled={saving || !data?.activeMeter?.meter_number}><Send size={17} />{saving ? "Submitting..." : "Submit reading for review"}</button>
    </form>

    <div className="panel">
      <div className="panel-heading"><div><h3>Meter Reading Submissions</h3><p className="muted">Track readings you have sent for review.</p></div></div>
      <TableControls table={table} label="meter reading submissions" placeholder="Search submitted readings" />
      <div className="table-wrap"><table><thead><tr><th>Meter</th><th>Reading date</th><th>Submitted reading</th><th>Submitted</th><th>Status</th><th className="screen-only">Evidence</th></tr></thead><tbody>
        {table.visibleRows.length ? table.visibleRows.map((submission) => <tr key={submission.id}><td>{submission.meter_number}</td><td>{date(submission.reading_date)}</td><td>{number(submission.reading_value)}</td><td>{date(submission.submitted_at)}</td><td><StatusBadge status={submission.status} /></td><td className="screen-only"><button className="icon-button" type="button" title="Attach or view meter photo" onClick={() => onEvidence(submission)}><Paperclip size={16} /></button></td></tr>) : <EmptyTableRow colSpan={6} title="No meter readings submitted" detail="Submit a current reading above to send it for review." />}
      </tbody></table></div>
    </div>

    {selectedSubmission ? <div className="panel">
      <div className="panel-heading"><div><h3>Meter Reading Evidence</h3><small>{selectedSubmission.meter_number} | {number(selectedSubmission.reading_value)} on {date(selectedSubmission.reading_date)}</small></div><button className="icon-button" type="button" onClick={onCloseEvidence} title="Close meter reading evidence"><X size={16} /></button></div>
      <p className="muted">Attach a clear photo of the meter display to help the reviewer verify this reading.</p>
      <SupportingDocumentsPanel entityType="customer_reading_submission" entityId={selectedSubmission.id} customerId={customerId} />
    </div> : null}
  </>;
}

export default PortalReadingSubmissionWorkspace;
