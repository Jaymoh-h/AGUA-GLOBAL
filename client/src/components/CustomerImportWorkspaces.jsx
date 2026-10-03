import { Download, FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import EntryPanel from "./EntryPanel";

function CustomerImportWorkspaces({
  canWrite,
  customerCsvText,
  customerImportReady,
  customerPreview,
  importing,
  onCommitCustomerImport,
  onCommitOpeningImport,
  onCustomerFile,
  onCustomerTemplate,
  onCustomerTextChange,
  onOpeningFile,
  onOpeningTemplate,
  onOpeningTextChange,
  onPreviewCustomerImport,
  onPreviewOpeningImport,
  openingCsvText,
  openingImportReady,
  openingPreview,
  show
}) {
  const [customerImportOpen, setCustomerImportOpen] = useState(false);
  const [openingBalanceImportOpen, setOpeningBalanceImportOpen] = useState(false);

  useEffect(() => {
    if (customerPreview) setCustomerImportOpen(true);
  }, [customerPreview]);

  useEffect(() => {
    if (openingPreview) setOpeningBalanceImportOpen(true);
  }, [openingPreview]);

  if (!canWrite || !show) return null;

  return (
    <>
      <EntryPanel
        actionLabel="Import customers"
        className="customer-import-entry-panel"
        disabled={importing}
        icon={<FileUp size={17} />}
        onOpenChange={setCustomerImportOpen}
        open={customerImportOpen}
        summary="Stage, validate, and review a customer batch"
        title="Bulk customer import"
      >
        <div className="form-grid">
          <div className="entry-form-context">
            <span>CSV columns: name, acc_number, rate_id or rate_name, zone_id or zone_name.</span>
          <button type="button" onClick={onCustomerTemplate}><Download size={16} />Template</button>
          </div>
        <label>CSV file<input type="file" accept=".csv,text/csv" onChange={onCustomerFile} /></label>
        <textarea value={customerCsvText} onChange={(event) => onCustomerTextChange(event.target.value)} rows="6" placeholder="name,acc_number,phone,email,rate_name,zone_name,deposit_amount,deposit_paid,opening_balance_amount,opening_balance_date" />
        <div className="row-actions">
          <button className="primary-button" type="button" onClick={onPreviewCustomerImport} disabled={importing || !customerCsvText.trim()}>Preview import</button>
          <button type="button" onClick={onCommitCustomerImport} disabled={importing || !customerImportReady}>Commit import</button>
        </div>
        {customerPreview ? <CustomerPreview rows={customerPreview.rows} /> : null}
        </div>
      </EntryPanel>

      <EntryPanel
        actionLabel="Correct opening balances"
        className="opening-balance-import-entry-panel"
        disabled={importing}
        icon={<FileUp size={17} />}
        onOpenChange={setOpeningBalanceImportOpen}
        open={openingBalanceImportOpen}
        summary="Correct migration balances before payment import"
        title="Opening balance overwrite"
      >
        <div className="form-grid">
          <div className="entry-form-context">
            <span>Match rows by account number before payment import.</span>
          <button type="button" onClick={onOpeningTemplate}><Download size={16} />Template</button>
          </div>
        <label>CSV file<input type="file" accept=".csv,text/csv" onChange={onOpeningFile} /></label>
        <textarea value={openingCsvText} onChange={(event) => onOpeningTextChange(event.target.value)} rows="5" placeholder="acc_number,opening_balance_amount,opening_balance_date" />
        <div className="row-actions">
          <button className="primary-button" type="button" onClick={onPreviewOpeningImport} disabled={importing || !openingCsvText.trim()}>Preview overwrite</button>
          <button type="button" onClick={onCommitOpeningImport} disabled={importing || !openingImportReady}>Commit overwrite</button>
        </div>
        {openingPreview ? <OpeningBalancePreview rows={openingPreview.rows} /> : null}
        </div>
      </EntryPanel>
    </>
  );
}

function CustomerPreview({ rows }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Row</th><th>Account</th><th>Name</th><th>Email</th><th>Rate</th><th>Zone</th><th>Deposit</th><th>Opening</th><th>Status</th></tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.rowNumber}>
          <td>{row.rowNumber}</td><td>{row.acc_number || "-"}</td><td>{row.name || "-"}</td><td>{row.email || "-"}</td><td>{row.rate_name || "-"}</td><td>{row.zone_name || "-"}</td>
          <td><strong>{Number(row.deposit_amount || 0).toLocaleString()}</strong><small>{row.deposit_paid ? "Paid" : "Not paid"}</small></td>
          <td><strong>{Number(row.opening_balance_amount || 0).toLocaleString()}</strong><small>{row.opening_balance_date || "-"}</small></td>
          <StatusCell row={row} />
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function OpeningBalancePreview({ rows }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Row</th><th>Account</th><th>Name</th><th>Previous</th><th>Corrected</th><th>Status</th></tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.rowNumber}>
          <td>{row.rowNumber}</td><td>{row.acc_number || "-"}</td><td>{row.name || "-"}</td>
          <td><strong>{Number(row.previous_opening_balance_amount || 0).toLocaleString()}</strong><small>{row.previous_opening_balance_date || "-"}</small></td>
          <td><strong>{Number(row.opening_balance_amount || 0).toLocaleString()}</strong><small>{row.opening_balance_date || "-"}</small></td>
          <StatusCell row={row} />
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function StatusCell({ row }) {
  return <td><span className={`status status-${row.status_label}`}>{row.status_label}</span>{[...row.errors, ...row.warnings].map((item) => <small key={item}>{item}</small>)}</td>;
}

export default CustomerImportWorkspaces;
