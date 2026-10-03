import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";

function ContractorPayablesReport({ agingRows, agingTotals, byStatusRows, byStatusTotals, label, money, number, totals }) {
  return (
    <>
      <div className="reading-context">
        <div>
          <span>Open invoices</span>
          <strong>{number(totals?.open_invoice_count)}</strong>
        </div>
        <div>
          <span>Open amount</span>
          <strong>{money(totals?.open_amount)}</strong>
        </div>
        <div>
          <span>Approved</span>
          <strong>{money(totals?.approved_amount)}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{money(totals?.overdue_amount)}</strong>
        </div>
        <div>
          <span>Posted this period</span>
          <strong>{money(totals?.posted_amount)}</strong>
        </div>
      </div>
      <div className="report-grid">
        <div className="panel">
          <ReportPanelHeading compact title="By Status" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Invoices</th>
                  <th>Amount</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {byStatusRows.length ? (
                  byStatusRows.map((row) => (
                    <tr key={row.status}>
                      <td>{label(row.status)}</td>
                      <td>{number(row.invoice_count)}</td>
                      <td>{money(row.invoice_amount)}</td>
                      <td>{money(row.overdue_amount)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={4} title="No records found" detail="This report has no rows for the current filters." />
                )}
                {byStatusRows.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(byStatusTotals.invoice_count)}</strong></td>
                    <td><strong>{money(byStatusTotals.invoice_amount)}</strong></td>
                    <td><strong>{money(byStatusTotals.overdue_amount)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <ReportPanelHeading compact title="Aging" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Invoices</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {agingRows.length ? (
                  agingRows.map((row) => (
                    <tr key={row.bucket}>
                      <td>{row.bucket}</td>
                      <td>{number(row.invoice_count)}</td>
                      <td>{money(row.invoice_amount)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={3} title="No records found" detail="This report has no rows for the current filters." />
                )}
                {agingRows.length ? (
                  <tr className="muted-total">
                    <td><strong>Total</strong></td>
                    <td><strong>{number(agingTotals.invoice_count)}</strong></td>
                    <td><strong>{money(agingTotals.invoice_amount)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default ContractorPayablesReport;
