import { Download, Eye, FileUp } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

const exampleCsv = "acc_number,payment_date,amount,payment_channel,transaction_status,receipt_number,external_reference,received_from,notes\nAG-0001,2026-06-30,1500,mpesa_paybill,completed,MPESA-001,QWE123,Jane Wanjiku,June payment";

function PaymentCsvImportPanel({
  csvText,
  defaultOpen,
  importing,
  importPreview,
  importReady,
  money,
  onCsvChange,
  onFileChange,
  onPreview,
  onRequestCommit,
  onTemplate
}) {
  const summary = importPreview
    ? `${importPreview.summary.valid} valid of ${importPreview.summary.total} row(s) | ${money(importPreview.summary.totalAmount)}`
    : "Paste CSV or upload a file";

  return (
    <CollapsibleSection
      actions={
        <button type="button" onClick={onTemplate}>
          <Download size={16} />
          Template
        </button>
      }
      className="form-grid payment-import-panel"
      defaultOpen={defaultOpen}
      icon={<FileUp size={18} />}
      summary={summary}
      title="Import Payments CSV"
    >
      <label>
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
      </label>
      <label>
        CSV content
        <textarea
          value={csvText}
          onChange={(event) => onCsvChange(event.target.value)}
          rows="7"
          placeholder={exampleCsv}
        />
      </label>
      <p className="muted">
        Required columns: acc_number or customer_id, payment_date, amount. Bank and M-Pesa rows require external_reference. M-Pesa imports also require a completed transaction_status. Optional: payment_channel, receipt_number, received_from, bill_number, notes.
      </p>
      {importPreview ? (
        <div className="reading-context">
          <div>
            <span>Total rows</span>
            <strong>{importPreview.summary.total}</strong>
          </div>
          <div>
            <span>Valid</span>
            <strong>{importPreview.summary.valid}</strong>
          </div>
          <div>
            <span>Total amount</span>
            <strong>{money(importPreview.summary.totalAmount)}</strong>
          </div>
        </div>
      ) : null}
      <button className="primary-button" type="button" onClick={onPreview} disabled={importing}>
        <Eye size={17} />
        Preview CSV
      </button>
      <button type="button" onClick={onRequestCommit} disabled={!importReady || importing}>
        <FileUp size={17} />
        Import valid rows
      </button>
    </CollapsibleSection>
  );
}

export default PaymentCsvImportPanel;
