import { ArrowLeft, Eye, FileUp } from "lucide-react";

function PaymentReconciliationValidation({
  bankReviewRows,
  importing,
  importPreview,
  importReady,
  money,
  onBack,
  onPreview,
  onRequestCommit,
  sourceName,
  statementRowStatus
}) {
  const readyRows = bankReviewRows.filter((row) => statementRowStatus(row) === "ready");
  const readyTotal = readyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const ignoredRows = bankReviewRows.filter((row) => row.ignored);
  const ignoredTotal = ignoredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="bank-flow-validation">
      <div className="reading-context">
        <div><span>Ready payments</span><strong>{readyRows.length}</strong></div>
        <div><span>Payment total</span><strong>{money(readyTotal)}</strong></div>
        <div><span>Excluded</span><strong>{ignoredRows.length}</strong><small>{money(ignoredTotal)}</small></div>
        <div><span>Source</span><strong>{sourceName || "Statement"}</strong></div>
      </div>
      {importPreview ? (
        <div className={`bank-flow-validation-result ${importPreview.summary.invalid ? "has-errors" : "is-ready"}`}>
          <strong>{importPreview.summary.invalid ? `${importPreview.summary.invalid} row(s) need attention` : `${importPreview.summary.valid} payment(s) validated`}</strong>
          <span>{money(importPreview.summary.totalAmount)}</span>
        </div>
      ) : null}
      <div className="form-actions bank-flow-actions">
        <button type="button" onClick={onBack} disabled={importing}><ArrowLeft size={17} />Matches</button>
        <button className="primary-button" type="button" onClick={onPreview} disabled={importing}><Eye size={17} />{importing ? "Validating..." : "Validate payments"}</button>
        <button type="button" onClick={onRequestCommit} disabled={!importReady || importing}><FileUp size={17} />Import payments</button>
      </div>
    </div>
  );
}

export default PaymentReconciliationValidation;
