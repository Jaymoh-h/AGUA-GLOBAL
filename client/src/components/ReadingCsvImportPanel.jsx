import { Download, Eye, FileUp } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { downloadCsvTemplate } from "../utils/csvTemplate";

const headers = ["acc_number", "reading_date", "reading_value", "meter_number", "notes"];

export default function ReadingCsvImportPanel({
  csvText,
  importCorrectionReason,
  importPreview,
  importing,
  importReady,
  onCommit,
  onCsvChange,
  onFile,
  onOpenChange,
  onPreview,
  open
}) {
  return (
    <CollapsibleSection
      actions={<button type="button" onClick={() => downloadCsvTemplate("readings-import-template.csv", headers)}><Download size={16} />Template</button>}
      className="form-grid reading-csv-import-form"
      defaultOpen={Boolean(importPreview)}
      icon={<FileUp size={18} />}
      onOpenChange={onOpenChange}
      open={open}
      summary={importPreview ? `${importPreview.summary.valid} valid | ${importPreview.summary.invalid} invalid` : "Template and CSV upload"}
      title="Import Readings CSV"
    >
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={onFile} /></label>
      <label>
        CSV content
        <textarea value={csvText} onChange={(event) => onCsvChange(event.target.value)} rows="7" placeholder={"acc_number,reading_date,reading_value,notes\nAG-0001,2026-06-30,240,End month route reading"} />
      </label>
      <label>
        Correction reason
        <textarea value={importCorrectionReason} onChange={(event) => onCsvChange(undefined, event.target.value)} rows="2" placeholder="Required if imported readings touch closed or locked periods" />
      </label>
      <p className="muted">Required columns: acc_number or customer_id, reading_date, reading_value. Optional: meter_number, notes.</p>
      {importPreview ? (
        <div className="reading-context">
          <div><span>Total rows</span><strong>{importPreview.summary.total}</strong></div>
          <div><span>Valid</span><strong>{importPreview.summary.valid}</strong></div>
          <div><span>Bills expected</span><strong>{importPreview.summary.billsExpected}</strong></div>
        </div>
      ) : null}
      <button className="primary-button" type="button" onClick={onPreview} disabled={importing}><Eye size={17} />Preview CSV</button>
      <button type="button" onClick={onCommit} disabled={!importReady || importing}><FileUp size={17} />Import valid rows</button>
    </CollapsibleSection>
  );
}
