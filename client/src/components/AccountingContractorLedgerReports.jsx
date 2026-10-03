import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";
import TableControls from "./TableControls";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function AccountingContractorLedgerReports({
  balanceRows,
  balanceTable,
  balanceTotals,
  date,
  invoiceRows,
  invoiceTable,
  invoiceTotals,
  isVisible,
  label,
  money,
  number,
  onPrint
}) {
  const sectionClass = (name, key) =>
    `panel full-span report-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("report-section-contractorBalances", "contractorBalances")}>
        <ReportPanelHeading title="Contractor Balances" printLabel="contractor balances" onPrint={() => onPrint("contractorBalances")} />
        <TableControls table={balanceTable} label="contractors" placeholder="Search contractor balances" />
        <div className="table-wrap"><table>
          <thead><tr><th>Contractor</th><th>Contact</th><th>Open Invoices</th><th>Oldest Due</th><th>Open Amount</th><th>Overdue</th></tr></thead>
          <tbody>
            {balanceTable.total ? <>
              {balanceRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.contractor_name}<small>{row.tax_pin || "-"}</small></td>
                  <td>{row.phone || "-"}<small>{row.email || "-"}</small></td>
                  <td>{number(row.open_invoice_count)}</td><td>{date(row.oldest_due_date)}</td><td>{money(row.open_amount)}</td>
                  <td>{money(row.overdue_amount)}<small>{number(row.overdue_invoice_count)} invoice(s)</small></td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="2"><strong>Total</strong></td><td><strong>{number(balanceTotals.open_invoice_count)}</strong></td><td>-</td>
                <td><strong>{money(balanceTotals.open_amount)}</strong></td><td><strong>{money(balanceTotals.overdue_amount)}</strong><small>{number(balanceTotals.overdue_invoice_count)} invoice(s)</small></td>
              </tr>
            </> : <EmptyRow colSpan={6} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-contractorInvoiceRegister", "contractorInvoiceRegister")}>
        <ReportPanelHeading title="Contractor Invoice Register" printLabel="contractor invoice register" onPrint={() => onPrint("contractorInvoiceRegister")} />
        <TableControls table={invoiceTable} label="contractor invoices" placeholder="Search contractor invoices" />
        <div className="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Contractor</th><th>Dates</th><th>Category</th><th>Subtotal</th><th>VAT</th><th>Total</th><th>Status</th><th>Expense</th><th>Documents</th></tr></thead>
          <tbody>
            {invoiceTable.total ? <>
              {invoiceRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.invoice_number}<small>{row.description}</small></td>
                  <td>{row.contractor_name}<small>{row.contractor_tax_pin || "-"}</small></td>
                  <td>{date(row.invoice_date)}<small>Due {date(row.due_date)}</small></td>
                  <td>{row.category}</td><td>{money(row.subtotal_amount)}</td><td>{money(row.vat_amount)}</td><td>{money(row.total_amount)}</td>
                  <td>{label(row.status)}</td><td>{row.expense_id ? `Expense #${row.expense_id}` : "-"}</td><td>{number(row.document_count)}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="4"><strong>Total</strong></td><td><strong>{money(invoiceTotals.subtotal_amount)}</strong></td>
                <td><strong>{money(invoiceTotals.vat_amount)}</strong></td><td><strong>{money(invoiceTotals.total_amount)}</strong></td><td colSpan="2">-</td><td><strong>{number(invoiceTotals.document_count)}</strong></td>
              </tr>
            </> : <EmptyRow colSpan={10} />}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

export default AccountingContractorLedgerReports;
