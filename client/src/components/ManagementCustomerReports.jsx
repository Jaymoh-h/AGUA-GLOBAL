import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";
import StatusBadge from "./StatusBadge";
import TableControls from "./TableControls";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function ManagementCustomerReports({
  balanceRows,
  balanceTable,
  balanceTotals,
  clientRows,
  clientTable,
  clientTotals,
  date,
  isVisible,
  money,
  moneyOrDash,
  number,
  onPrint,
  statusKey
}) {
  const sectionClass = (name, key) => `panel full-span management-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("management-section-clientFinancialSummary", "clientFinancialSummary")}>
        <ReportPanelHeading title="Client Financial Summary" printLabel="client financial summary" onPrint={() => onPrint("clientFinancialSummary")} />
        <TableControls table={clientTable} label="clients" placeholder="Search client finances" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Acc Number</th><th>Last Billed Period</th><th>Last Due Date</th><th>Last Payment Date</th>
                <th>Last Payment Amount</th><th>Current Outstanding</th><th>Open Bills</th><th>Months Unpaid</th><th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {clientTable.total ? clientRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.customer}</td>
                  <td>{row.acc_number}</td>
                  <td>{row.last_billed_period || "-"}</td>
                  <td>{date(row.last_due_date)}</td>
                  <td>{date(row.last_payment_date)}</td>
                  <td>{moneyOrDash(row.last_payment_amount)}</td>
                  <td>{money(row.current_outstanding)}</td>
                  <td>{number(row.open_bills)}</td>
                  <td>{number(row.months_unpaid)}</td>
                  <td><StatusBadge status={statusKey(row.payment_status)} /></td>
                </tr>
              )) : <EmptyRow colSpan={10} />}
              {clientTable.total ? (
                <tr className="muted-total">
                  <td colSpan="6"><strong>Total</strong></td>
                  <td><strong>{money(clientTotals.current_outstanding)}</strong></td>
                  <td><strong>{number(clientTotals.open_bills)}</strong></td>
                  <td>-</td><td>-</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-customerBalances", "customerBalances")}>
        <ReportPanelHeading title="Customer Balances" printLabel="customer balances" onPrint={() => onPrint("customerBalances")} />
        <TableControls table={balanceTable} label="customers" placeholder="Search balances" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Customer</th><th>Account</th><th>Zone</th><th>Open Bills</th><th>Oldest Due</th><th>Balance</th></tr>
            </thead>
            <tbody>
              {balanceTable.total ? balanceRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.acc_number}</td>
                  <td>{row.zone_name}</td>
                  <td>{number(row.open_bills)}</td>
                  <td>{date(row.oldest_due_date)}</td>
                  <td>{money(row.balance_due)}</td>
                </tr>
              )) : <EmptyRow colSpan={6} />}
              {balanceTable.total ? (
                <tr className="muted-total">
                  <td colSpan="3"><strong>Total</strong></td>
                  <td><strong>{number(balanceTotals.open_bills)}</strong></td>
                  <td>-</td>
                  <td><strong>{money(balanceTotals.balance_due)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ManagementCustomerReports;
