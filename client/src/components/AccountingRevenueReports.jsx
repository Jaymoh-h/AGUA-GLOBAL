import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function AccountingRevenueReports({
  billingByStatusRows,
  billingByStatusTotals,
  billingByZoneRows,
  billingByZoneTotals,
  collectionsByChannelRows,
  collectionsByChannelTotals,
  isVisible,
  label,
  money,
  number,
  onPrint
}) {
  const sectionClass = (name, key, fullSpan = false) =>
    `${fullSpan ? "panel full-span" : "panel"} report-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("report-section-billingStatus", "billingStatus")}>
        <ReportPanelHeading title="Billing By Status" printLabel="billing by status" onPrint={() => onPrint("billingStatus")} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>Bills</th><th>Billed</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {billingByStatusRows.length ? billingByStatusRows.map((row) => (
                <tr key={row.status}>
                  <td>{label(row.status)}</td>
                  <td>{number(row.bill_count)}</td>
                  <td>{money(row.billed_amount)}</td>
                  <td>{money(row.paid_amount)}</td>
                  <td>{money(row.balance_amount)}</td>
                </tr>
              )) : <EmptyRow colSpan={5} />}
              {billingByStatusRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(billingByStatusTotals.bill_count)}</strong></td>
                  <td><strong>{money(billingByStatusTotals.billed_amount)}</strong></td>
                  <td><strong>{money(billingByStatusTotals.paid_amount)}</strong></td>
                  <td><strong>{money(billingByStatusTotals.balance_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("report-section-collectionsChannel", "collectionsChannel")}>
        <ReportPanelHeading title="Collections By Channel" printLabel="collections by channel" onPrint={() => onPrint("collectionsChannel")} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Channel</th><th>Receipts</th><th>Received</th><th>Allocated</th><th>Unallocated</th></tr></thead>
            <tbody>
              {collectionsByChannelRows.length ? collectionsByChannelRows.map((row) => (
                <tr key={row.payment_channel}>
                  <td>{label(row.payment_channel)}</td>
                  <td>{number(row.receipt_count)}</td>
                  <td>{money(row.received_amount)}</td>
                  <td>{money(row.allocated_amount)}</td>
                  <td>{money(row.unallocated_amount)}</td>
                </tr>
              )) : <EmptyRow colSpan={5} />}
              {collectionsByChannelRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(collectionsByChannelTotals.receipt_count)}</strong></td>
                  <td><strong>{money(collectionsByChannelTotals.received_amount)}</strong></td>
                  <td><strong>{money(collectionsByChannelTotals.allocated_amount)}</strong></td>
                  <td><strong>{money(collectionsByChannelTotals.unallocated_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("report-section-billingZone", "billingZone", true)}>
        <ReportPanelHeading title="Billing By Zone" printLabel="billing by zone" onPrint={() => onPrint("billingZone")} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Zone</th><th>Bills</th><th>Units</th><th>Billed</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              {billingByZoneRows.length ? billingByZoneRows.map((row) => (
                <tr key={row.zone_id}>
                  <td>{row.zone_name}</td>
                  <td>{number(row.bill_count)}</td>
                  <td>{number(row.units_billed)}</td>
                  <td>{money(row.billed_amount)}</td>
                  <td>{money(row.paid_amount)}</td>
                  <td>{money(row.balance_amount)}</td>
                </tr>
              )) : <EmptyRow colSpan={6} />}
              {billingByZoneRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(billingByZoneTotals.bill_count)}</strong></td>
                  <td><strong>{number(billingByZoneTotals.units_billed)}</strong></td>
                  <td><strong>{money(billingByZoneTotals.billed_amount)}</strong></td>
                  <td><strong>{money(billingByZoneTotals.paid_amount)}</strong></td>
                  <td><strong>{money(billingByZoneTotals.balance_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default AccountingRevenueReports;
