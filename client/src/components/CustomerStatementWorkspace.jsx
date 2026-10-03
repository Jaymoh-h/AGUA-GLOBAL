import { Printer } from "lucide-react";
import DocumentPrintHeader from "./DocumentPrintHeader";
import { EmptyTableRow } from "./EmptyState";

function CustomerStatementWorkspace({
  accountPositionLabel,
  business,
  canWrite,
  money,
  moneyAbs,
  onEndChange,
  onGenerate,
  onPrint,
  onStartChange,
  statement,
  statementCustomer,
  statementEnd,
  statementStart
}) {
  if (!statementCustomer) return null;

  return (
    <>
      {canWrite ? (
        <section className="panel full-span">
          <div className="panel-heading">
            <div>
              <h3>Customer Statement</h3>
              <p className="muted">{statementCustomer.acc_number} - {statementCustomer.name}</p>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => onGenerate("lifetime")}>Lifetime</button>
              <button type="button" onClick={onPrint} disabled={!statement}><Printer size={15} />Print</button>
            </div>
          </div>

          <div className="filter-bar statement-filter">
            <label>Start date<input value={statementStart} onChange={(event) => onStartChange(event.target.value)} type="date" /></label>
            <label>End date<input value={statementEnd} onChange={(event) => onEndChange(event.target.value)} type="date" /></label>
            <button className="primary-button" type="button" onClick={() => onGenerate("period")}>Generate</button>
          </div>

          {statement ? (
            <div className="statement-preview">
              <div className="stat-grid">
                <div className="stat-card"><span>Opening balance</span><strong>{money(statement.opening_balance)}</strong></div>
                <div className="stat-card"><span>Billed</span><strong>{money(statement.totals?.debit)}</strong></div>
                <div className="stat-card"><span>Paid</span><strong>{money(statement.totals?.credit)}</strong></div>
                <div className="stat-card"><span>{accountPositionLabel(statement.totals?.closing_balance)}</span><strong>{moneyAbs(statement.totals?.closing_balance)}</strong></div>
              </div>
              <StatementTable money={money} statement={statement} />
            </div>
          ) : null}
        </section>
      ) : null}

      {statement ? (
        <section className="panel print-surface report-print active-print-surface customer-statement-print">
          <DocumentPrintHeader
            businessSettings={business}
            dateLabel={statement.period.lifetime ? `Lifetime statement | Printed ${new Date().toLocaleDateString()}` : `${statement.period.start_date || "Start"} to ${statement.period.end_date || "End"}`}
            documentLabel="Customer statement"
            documentNumber={statement.customer.acc_number}
          />
          <div className="receipt-info-grid">
            <div><span>Customer</span><strong>{statement.customer.name}</strong></div>
            <div><span>Account</span><strong>{statement.customer.acc_number}</strong></div>
            <div><span>Zone</span><strong>{statement.customer.zone_name}</strong></div>
            <div><span>{accountPositionLabel(statement.totals.closing_balance)}</span><strong>{moneyAbs(statement.totals.closing_balance)}</strong></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
            <tbody>
              <tr><td>-</td><td>Opening</td><td>Opening balance</td><td>-</td><td>-</td><td>{money(statement.opening_balance)}</td></tr>
              {statement.transactions.map((row) => (
                <tr key={`print-${row.transaction_type}-${row.id}-${row.transaction_date}`}>
                  <td>{new Date(row.transaction_date).toLocaleDateString()}</td><td>{row.reference}</td><td>{row.description}</td>
                  <td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="receipt-total"><span>Totals</span><strong>Billed {money(statement.totals.debit)} | Paid {money(statement.totals.credit)} | {accountPositionLabel(statement.totals.closing_balance)} {moneyAbs(statement.totals.closing_balance)}</strong></div>
        </section>
      ) : null}
    </>
  );
}

function StatementTable({ money, statement }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
      <tbody>
        {statement.transactions.length ? statement.transactions.map((row) => (
          <tr key={`${row.transaction_type}-${row.id}-${row.transaction_date}`}>
            <td>{new Date(row.transaction_date).toLocaleDateString()}</td><td>{row.reference}</td><td>{row.description}</td>
            <td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.running_balance)}</td>
          </tr>
        )) : <EmptyTableRow colSpan={6} title="No statement activity" detail="No bill or payment activity in this period." />}
      </tbody>
    </table></div>
  );
}

export default CustomerStatementWorkspace;
