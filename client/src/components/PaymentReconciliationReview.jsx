import { ArrowLeft, ArrowRight, FilterX, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

function PaymentReconciliationReview({
  bankReviewRows,
  customers,
  onAccountChange,
  onBack,
  onIgnoreUnresolved,
  onRowChange,
  onRestoreIgnored,
  onValidate,
  statementConfidenceLabel,
  statementRowStatus
}) {
  const [view, setView] = useState("attention");
  const [bulkIgnoreReason, setBulkIgnoreReason] = useState("");
  const countByStatus = (statuses) => bankReviewRows.filter((row) => statuses.includes(statementRowStatus(row))).length;
  const unresolvedCount = bankReviewRows.filter((row) => {
    const status = statementRowStatus(row);
    return status !== "ready" && status !== "ignored";
  }).length;
  const ignoredCount = bankReviewRows.filter((row) => row.ignored).length;
  const visibleRows = useMemo(
    () =>
      bankReviewRows
        .map((row, index) => ({ row, index, status: statementRowStatus(row) }))
        .filter(({ status }) => {
          if (view === "all") return true;
          if (view === "ready") return status === "ready";
          if (view === "ignored") return status === "ignored";
          return status !== "ready" && status !== "ignored";
        }),
    [bankReviewRows, statementRowStatus, view]
  );

  return (
    <>
      <div className="reading-context">
        <div><span>Total rows</span><strong>{bankReviewRows.length}</strong></div>
        <div><span>Ready</span><strong>{countByStatus(["ready"])}</strong></div>
        <div><span>Need match</span><strong>{countByStatus(["needs_match"])}</strong></div>
        <div><span>Need review</span><strong>{countByStatus(["needs_review", "invalid"])}</strong></div>
        <div><span>Ignored</span><strong>{bankReviewRows.filter((row) => row.ignored).length}</strong></div>
      </div>
      <div className="reconciliation-review-toolbar">
        <div className="reconciliation-review-filters" role="group" aria-label="Statement row view">
          {[
            ["attention", `Needs attention (${unresolvedCount})`],
            ["ready", `Ready (${countByStatus(["ready"])})`],
            ["ignored", `Ignored (${ignoredCount})`],
            ["all", `All (${bankReviewRows.length})`]
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="reconciliation-review-bulk-actions">
          <label className="reconciliation-ignore-reason">
            <span>Reason for exclusion</span>
            <input
              value={bulkIgnoreReason}
              onChange={(event) => setBulkIgnoreReason(event.target.value)}
              placeholder="e.g. Reversal, fee, or unmatched payer"
              maxLength={600}
            />
          </label>
          <button type="button" onClick={() => onIgnoreUnresolved(bulkIgnoreReason)} disabled={!unresolvedCount || bulkIgnoreReason.trim().length < 3}>
            <FilterX size={16} />
            Ignore unresolved ({unresolvedCount})
          </button>
          <button type="button" onClick={onRestoreIgnored} disabled={!ignoredCount}>
            <RotateCcw size={16} />
            Restore ignored
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ignore</th><th>Reason for exclusion</th><th>Row</th><th>Date</th><th>Amount</th><th>Reference</th><th>Transaction status</th><th>Narration</th><th>Account match</th><th>Confidence</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, index, status }) => {
              return (
                <tr key={row.id}>
                  <td><input checked={Boolean(row.ignored)} onChange={(event) => onRowChange(index, "ignored", event.target.checked)} type="checkbox" title="Exclude this statement row from the import" /></td>
                  <td><input value={row.ignore_reason || ""} onChange={(event) => onRowChange(index, "ignore_reason", event.target.value)} disabled={!row.ignored} maxLength={600} placeholder="Required when excluded" /></td>
                  <td>{row.source_row_number}</td>
                  <td><input value={row.payment_date || ""} onChange={(event) => onRowChange(index, "payment_date", event.target.value)} type="date" /></td>
                  <td><input value={row.amount || ""} onChange={(event) => onRowChange(index, "amount", event.target.value)} type="number" min="1" /></td>
                  <td>
                    <input value={row.external_reference || ""} onChange={(event) => onRowChange(index, "external_reference", event.target.value)} />
                    {row.received_from ? <small>{row.received_from}</small> : null}
                  </td>
                  <td><input value={row.transaction_status || ""} onChange={(event) => onRowChange(index, "transaction_status", event.target.value)} placeholder={row.payment_channel === "mpesa_paybill" ? "Completed" : "Optional"} /></td>
                  <td><input value={row.narration || ""} onChange={(event) => onRowChange(index, "narration", event.target.value)} /></td>
                  <td>
                    <select value={row.acc_number} onChange={(event) => onAccountChange(index, event.target.value)}>
                      <option value="">Select account</option>
                      {row.candidates.map((candidate) => <option key={`${row.id}-${candidate.id}`} value={candidate.acc_number}>{candidate.acc_number} - {candidate.name} ({candidate.score}%)</option>)}
                      <option value="" disabled>All customers</option>
                      {customers.map((customer) => <option key={`${row.id}-customer-${customer.id}`} value={customer.acc_number}>{customer.acc_number} - {customer.name}</option>)}
                    </select>
                    {row.candidate_reason ? <small>Matched by {row.candidate_reason}</small> : null}
                  </td>
                  <td><strong>{statementConfidenceLabel(row.candidate_score)}</strong>{row.candidate_score ? <small>{row.candidate_score}%</small> : null}</td>
                  <td><span className={`status status-${status}`}>{status.replace("_", " ")}</span></td>
                </tr>
              );
            })}
            {!visibleRows.length ? (
              <tr><td colSpan={11} className="empty-table-row">No statement rows in this view.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="form-actions bank-flow-actions">
        <button type="button" onClick={onBack}><ArrowLeft size={17} />Columns</button>
        <button className="primary-button" type="button" onClick={onValidate}>Validate payments<ArrowRight size={17} /></button>
      </div>
    </>
  );
}

export default PaymentReconciliationReview;
