import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";
import TableControls from "./TableControls";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function AccountingCloseSupportReports({
  date,
  depositRows,
  depositTable,
  depositTotals,
  expenseCategoryRows,
  expenseCategoryTotals,
  expenseRows,
  expenseTable,
  expenseTotals,
  isVisible,
  label,
  money,
  number,
  onPrint
}) {
  const sectionClass = (name, key, fullSpan = true) =>
    `${fullSpan ? "panel full-span" : "panel"} report-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("report-section-depositRegister", "depositRegister")}>
        <ReportPanelHeading title="Deposit Register" printLabel="deposit register" onPrint={() => onPrint("depositRegister")} />
        <TableControls table={depositTable} label="deposits" placeholder="Search deposits" />
        <div className="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Zone</th><th>Deposit</th><th>Status</th><th>Paid On</th></tr></thead>
          <tbody>
            {depositTable.total ? <>
              {depositRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.customer_name}<small>{row.acc_number}</small></td><td>{row.zone_name}</td><td>{money(row.deposit_amount)}</td>
                  <td>{row.deposit_paid ? "Paid" : "Unpaid"}</td><td>{date(row.deposit_paid_at)}</td>
                </tr>
              ))}
              <tr className="muted-total"><td colSpan="2"><strong>Total</strong></td><td><strong>{money(depositTotals.deposit_amount)}</strong></td><td colSpan="2">-</td></tr>
            </> : <EmptyRow colSpan={5} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-expensesCategory", "expensesCategory", false)}>
        <ReportPanelHeading title="Expenses By Category" printLabel="expenses by category" onPrint={() => onPrint("expensesCategory")} />
        <div className="table-wrap"><table>
          <thead><tr><th>Category</th><th>Entries</th><th>Amount</th></tr></thead>
          <tbody>
            {expenseCategoryRows.length ? expenseCategoryRows.map((row) => (
              <tr key={row.category}><td>{row.category}</td><td>{number(row.expense_count)}</td><td>{money(row.expense_amount)}</td></tr>
            )) : <EmptyRow colSpan={3} />}
            {expenseCategoryRows.length ? (
              <tr className="muted-total"><td><strong>Total</strong></td><td><strong>{number(expenseCategoryTotals.expense_count)}</strong></td><td><strong>{money(expenseCategoryTotals.expense_amount)}</strong></td></tr>
            ) : null}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-expenseRegister", "expenseRegister")}>
        <ReportPanelHeading title="Expense Register" printLabel="expense register" onPrint={() => onPrint("expenseRegister")} />
        <TableControls table={expenseTable} label="expenses" placeholder="Search expense register" />
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Channel</th><th>Reference</th><th>Recorded By</th><th>Amount</th></tr></thead>
          <tbody>
            {expenseTable.total ? <>
              {expenseRows.map((row) => (
                <tr key={row.id}>
                  <td>{date(row.expense_date)}</td><td>{row.category}</td><td>{row.vendor || "-"}</td><td>{row.description}</td>
                  <td>{label(row.payment_channel)}</td><td>{row.reference || row.receipt_number || "-"}</td><td>{row.recorded_by_name || "-"}</td><td>{money(row.amount)}</td>
                </tr>
              ))}
              <tr className="muted-total"><td colSpan="7"><strong>Total</strong></td><td><strong>{money(expenseTotals.amount)}</strong></td></tr>
            </> : <EmptyRow colSpan={8} />}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

export default AccountingCloseSupportReports;
