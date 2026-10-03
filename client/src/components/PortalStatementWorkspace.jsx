import { Download, FileText, Printer } from "lucide-react";
import DocumentPrintHeader from "./DocumentPrintHeader";
import { EmptyTableRow } from "./EmptyState";

function PortalStatementWorkspace({
  accountPositionLabel,
  data,
  date,
  filters,
  money,
  moneyAbs,
  onDownload,
  onFilterChange,
  onPreview,
  onPrint,
  printActive,
  statement
}) {
  return <div className={`panel portal-statement-panel ${printActive ? "active-print-surface" : ""}`}>
    <div className="panel-heading"><h3>Statement</h3><FileText size={18} /></div>
    <div className="statement-filter screen-only">
      <label>From<input value={filters.start_date} onChange={(event) => onFilterChange("start_date", event.target.value)} type="date" /></label>
      <label>To<input value={filters.end_date} onChange={(event) => onFilterChange("end_date", event.target.value)} type="date" /></label>
      <button type="button" onClick={onPreview}>Preview</button>
    </div>
    <div className="row-actions screen-only">
      <button type="button" onClick={onDownload}><Download size={16} />Statement PDF</button>
      <button type="button" onClick={onPrint}><Printer size={16} />Print statement</button>
    </div>
    {statement ? <StatementPreview accountPositionLabel={accountPositionLabel} business={data.business} date={date} money={money} moneyAbs={moneyAbs} statement={statement} /> : <div className="empty-state"><strong>Statement not loaded</strong><span>Preview or print to generate the current account statement.</span></div>}
  </div>;
}

function StatementPreview({ accountPositionLabel, business, date, money, moneyAbs, statement }) {
  const periodLabel = statement.period.lifetime ? "Lifetime" : `${statement.period.start_date || "Start"} to ${statement.period.end_date || "End"}`;
  return <>
    <DocumentPrintHeader businessSettings={business} dateLabel={statement.period.lifetime ? "Lifetime statement" : periodLabel} documentLabel="Account statement" documentNumber={statement.customer.acc_number} />
    <div className="receipt-title"><div><span>Statement</span><strong>{statement.customer.acc_number}</strong></div><div><span>Period</span><strong>{periodLabel}</strong></div></div>
    <div className="receipt-info-grid">
      <div><span>Customer</span><strong>{statement.customer.name}</strong></div><div><span>Zone</span><strong>{statement.customer.zone_name}</strong></div>
      <div><span>Opening balance</span><strong>{money(statement.opening_balance)}</strong></div><div><span>{accountPositionLabel(statement.totals.closing_balance)}</span><strong>{moneyAbs(statement.totals.closing_balance)}</strong></div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
      {statement.transactions.length ? statement.transactions.map((row, index) => <tr key={`${row.transaction_type}-${row.id}-${index}`}><td>{date(row.transaction_date)}</td><td>{row.reference}</td><td>{row.description}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.running_balance)}</td></tr>) : <EmptyTableRow colSpan={6} title="No statement activity" detail="No bills or payments were found for this period." />}
    </tbody></table></div>
    <div className="receipt-total"><span>Total debits</span><strong>{money(statement.totals.debit)}</strong></div>
    <div className="receipt-total muted-total"><span>Total credits</span><strong>{money(statement.totals.credit)}</strong></div>
  </>;
}

export default PortalStatementWorkspace;
