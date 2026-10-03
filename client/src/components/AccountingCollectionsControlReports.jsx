import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";
import TableControls from "./TableControls";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function AccountingCollectionsControlReports({
  agingRows,
  agingTable,
  agingTotals,
  allocationRows,
  allocationTable,
  allocationTotals,
  date,
  isVisible,
  label,
  money,
  number,
  onPrint,
  receiptRows,
  receiptTable,
  receiptTotals
}) {
  const sectionClass = (name, key) =>
    `panel full-span report-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("report-section-receiptRegister", "receiptRegister")}>
        <ReportPanelHeading title="Receipt Register" printLabel="receipt register" onPrint={() => onPrint("receiptRegister")} />
        <TableControls table={receiptTable} label="receipts" placeholder="Search receipts" />
        <div className="table-wrap"><table>
          <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Channel</th><th>Reference</th><th>Received</th><th>Allocated</th><th>Recorded By</th></tr></thead>
          <tbody>
            {receiptTable.total ? <>
              {receiptRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.receipt_number}</td><td>{date(row.payment_date)}</td>
                  <td>{row.customer_name}<small>{row.acc_number}</small></td>
                  <td>{label(row.payment_channel)}</td><td>{row.external_reference || "-"}</td>
                  <td>{money(row.amount)}</td><td>{money(row.total_allocated_amount)}</td><td>{row.recorded_by_name || "-"}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="5"><strong>Total</strong></td><td><strong>{money(receiptTotals.amount)}</strong></td>
                <td><strong>{money(receiptTotals.total_allocated_amount)}</strong></td><td>-</td>
              </tr>
            </> : <EmptyRow colSpan={8} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-allocationLedger", "allocationLedger")}>
        <ReportPanelHeading title="Payment Allocation Ledger" printLabel="payment allocation ledger" onPrint={() => onPrint("allocationLedger")} />
        <TableControls table={allocationTable} label="allocations" placeholder="Search allocations" />
        <div className="table-wrap"><table>
          <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Bill</th><th>Billing Month</th><th>Channel</th><th>Allocated</th></tr></thead>
          <tbody>
            {allocationTable.total ? <>
              {allocationRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.receipt_number}</td><td>{date(row.payment_date)}</td>
                  <td>{row.customer_name}<small>{row.acc_number}</small></td>
                  <td>{row.bill_number || "-"}</td><td>{date(row.billing_month)}</td><td>{label(row.payment_channel)}</td><td>{money(row.allocated_amount)}</td>
                </tr>
              ))}
              <tr className="muted-total"><td colSpan="6"><strong>Total</strong></td><td><strong>{money(allocationTotals.allocated_amount)}</strong></td></tr>
            </> : <EmptyRow colSpan={7} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-agingDetail", "agingDetail")}>
        <ReportPanelHeading title="Receivables Aging Detail" printLabel="aging detail" onPrint={() => onPrint("agingDetail")} />
        <TableControls table={agingTable} label="customers" placeholder="Search aging detail" />
        <div className="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Current</th><th>1-30</th><th>31-60</th><th>61-90</th><th>91 and over</th><th>Total</th></tr></thead>
          <tbody>
            {agingTable.total ? <>
              {agingRows.map((row) => (
                <tr key={row.customer_id}>
                  <td>{row.customer_name}<small>{row.acc_number} | {row.zone_name}</small><small>{number(row.open_bill_count)} bill(s), oldest due {date(row.oldest_due_date)}</small></td>
                  <td>{money(row.current_amount)}</td><td>{money(row.days_1_30_amount)}</td><td>{money(row.days_31_60_amount)}</td>
                  <td>{money(row.days_61_90_amount)}</td><td>{money(row.days_91_over_amount)}</td><td>{money(row.total_amount)}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td><strong>Total</strong><small>{number(agingTotals.open_bill_count)} open bill(s)</small></td>
                <td><strong>{money(agingTotals.current_amount)}</strong></td><td><strong>{money(agingTotals.days_1_30_amount)}</strong></td>
                <td><strong>{money(agingTotals.days_31_60_amount)}</strong></td><td><strong>{money(agingTotals.days_61_90_amount)}</strong></td>
                <td><strong>{money(agingTotals.days_91_over_amount)}</strong></td><td><strong>{money(agingTotals.total_amount)}</strong></td>
              </tr>
            </> : <EmptyRow colSpan={7} />}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

export default AccountingCollectionsControlReports;
