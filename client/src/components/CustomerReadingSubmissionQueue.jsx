import { Check, Paperclip, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyTableRow } from "./EmptyState";
import ReviewDialog from "./ReviewDialog";
import StatusBadge from "./StatusBadge";
import SupportingDocumentsPanel from "./SupportingDocumentsPanel";
import TableControls, { useTableControls } from "./TableControls";
import { useToastMessage } from "./ToastProvider";
import { api } from "../services/api";

const date = (value) => value?.slice(0, 10) || "-";
const reading = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function CustomerReadingSubmissionQueue({ onReviewed }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);
  const [documentSubmission, setDocumentSubmission] = useState(null);
  const [saving, setSaving] = useState(false);
  const [, setMessage] = useToastMessage();
  const table = useTableControls(rows, {
    searchFields: ["customer_name", "acc_number", "meter_number", "reading_date", "notes"]
  });

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.readings.customerSubmissions());
    } catch (error) {
      setMessage(error.message || "Unable to load customer reading submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitReview = async (reviewNotes) => {
    if (!review) return;
    setSaving(true);
    try {
      const result = await api.readings.reviewCustomerSubmission(review.id, {
        action: review.action,
        review_notes: reviewNotes
      });
      setReview(null);
      await load();
      await onReviewed?.();
      setMessage(
        result.submission.status === "approved"
          ? result.bill
            ? "Customer reading approved and bill generated."
            : "Customer reading approved."
          : "Customer reading rejected."
      );
    } catch (error) {
      setMessage(error.message || "Unable to review the customer reading.");
    } finally {
      setSaving(false);
    }
  };

  const approving = review?.action === "approve";

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h3>Customer-Submitted Readings</h3>
          <p className="muted">Review against the registered meter before a submitted value enters billing.</p>
        </div>
        <button className="icon-button" type="button" title="Refresh customer reading submissions" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
        </button>
      </div>
      <TableControls table={table} label="customer submissions" placeholder="Search accounts, meters, or notes" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Meter</th>
              <th>Reading date</th>
              <th>Previous</th>
              <th>Submitted</th>
              <th>Notes</th>
              <th className="screen-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && table.visibleRows.length ? (
              table.visibleRows.map((submission) => (
                <tr key={submission.id}>
                  <td>{submission.customer_name}<small>{submission.acc_number}</small></td>
                  <td>{submission.meter_number}</td>
                  <td>{date(submission.reading_date)}<small>{date(submission.submitted_at)}</small></td>
                  <td>{submission.previous_reading_value === null ? "Baseline" : reading(submission.previous_reading_value)}</td>
                  <td><strong>{reading(submission.reading_value)}</strong></td>
                  <td>{submission.notes || "-"}</td>
                  <td className="screen-only">
                    <div className="row-actions">
                      <button className="icon-button" type="button" title="View meter photo and supporting documents" onClick={() => setDocumentSubmission(submission)}>
                        <Paperclip size={16} />
                      </button>
                      <button className="icon-button" type="button" title="Approve submitted reading" onClick={() => setReview({ ...submission, action: "approve" })}>
                        <Check size={16} />
                      </button>
                      <button className="icon-button danger-button" type="button" title="Reject submitted reading" onClick={() => setReview({ ...submission, action: "reject" })}>
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyTableRow
                colSpan={7}
                title={loading ? "Loading customer submissions" : "No customer readings awaiting review"}
                detail={loading ? "" : "Approved or rejected submissions leave this queue."}
              />
            )}
          </tbody>
        </table>
      </div>

      {documentSubmission ? (
        <div className="supporting-documents-workspace">
          <div className="panel-heading compact-heading">
            <div>
              <h4>{documentSubmission.acc_number} meter evidence</h4>
              <p className="muted">{documentSubmission.meter_number} | {reading(documentSubmission.reading_value)} on {date(documentSubmission.reading_date)}</p>
            </div>
            <button className="icon-button" type="button" title="Close supporting documents" onClick={() => setDocumentSubmission(null)}>
              <X size={16} />
            </button>
          </div>
          <SupportingDocumentsPanel entityType="customer_reading_submission" entityId={documentSubmission.id} />
        </div>
      ) : null}

      <ReviewDialog
        open={Boolean(review)}
        eyebrow="Customer reading review"
        title={approving ? "Approve submitted reading" : "Reject submitted reading"}
        description={review ? `${review.customer_name} (${review.acc_number}) submitted ${reading(review.reading_value)} for meter ${review.meter_number} on ${date(review.reading_date)}.` : ""}
        confirmLabel={approving ? "Approve reading" : "Reject reading"}
        busy={saving}
        busyLabel={approving ? "Approving..." : "Rejecting..."}
        danger={!approving}
        reasonLabel={approving ? "Review note" : "Rejection reason"}
        reasonPlaceholder={approving ? "Optional review note" : "Explain what the customer should correct"}
        reasonRequired={!approving}
        onCancel={() => !saving && setReview(null)}
        onConfirm={submitReview}
      />
    </section>
  );
}

export default CustomerReadingSubmissionQueue;
