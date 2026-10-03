import ReportPanelHeading from "./ReportPanelHeading";

function ManagementRevenueReports({
  agingRows,
  agingTotals,
  billingRows,
  billingTotals,
  collectionsRows,
  collectionsTotals,
  date,
  isVisible,
  money,
  number,
  onPrint,
  routeRows,
  routeTotals
}) {
  const sectionClass = (name, key) => `panel management-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("management-section-billingSummary", "billingSummary")}>
        <ReportPanelHeading title="Billing Summary" printLabel="billing summary" onPrint={() => onPrint("billingSummary")} showSpreadsheet />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Bills</th>
                <th>Units</th>
                <th>Billed</th>
                <th>Paid</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {billingRows.map((row) => (
                <tr key={row.period_start}>
                  <td>{row.period_name}</td>
                  <td>{number(row.bill_count)}</td>
                  <td>{number(row.units_billed)}</td>
                  <td>{money(row.billed_amount)}</td>
                  <td>{money(row.paid_amount)}</td>
                  <td>{money(row.balance_amount)}</td>
                </tr>
              ))}
              {billingRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(billingTotals.bill_count)}</strong></td>
                  <td><strong>{number(billingTotals.units_billed)}</strong></td>
                  <td><strong>{money(billingTotals.billed_amount)}</strong></td>
                  <td><strong>{money(billingTotals.paid_amount)}</strong></td>
                  <td><strong>{money(billingTotals.balance_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-agingAnalysis", "agingAnalysis")}>
        <ReportPanelHeading title="Aging Analysis" printLabel="aging analysis" onPrint={() => onPrint("agingAnalysis")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Bills</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {agingRows.map((row) => (
                <tr key={row.bucket}>
                  <td>{row.bucket}</td>
                  <td>{number(row.bill_count)}</td>
                  <td>{money(row.balance_amount)}</td>
                </tr>
              ))}
              {agingRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(agingTotals.bill_count)}</strong></td>
                  <td><strong>{money(agingTotals.balance_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-collections", "collections")}>
        <ReportPanelHeading title="Collections" printLabel="collections" onPrint={() => onPrint("collections")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Channel</th>
                <th>Receipts</th>
                <th>Received</th>
                <th>Allocated</th>
              </tr>
            </thead>
            <tbody>
              {collectionsRows.map((row) => (
                <tr key={`${row.payment_date}-${row.payment_channel}`}>
                  <td>{date(row.payment_date)}</td>
                  <td>{row.payment_channel}</td>
                  <td>{number(row.receipt_count)}</td>
                  <td>{money(row.received_amount)}</td>
                  <td>{money(row.allocated_amount)}</td>
                </tr>
              ))}
              {collectionsRows.length ? (
                <tr className="muted-total">
                  <td colSpan="2"><strong>Total</strong></td>
                  <td><strong>{number(collectionsTotals.receipt_count)}</strong></td>
                  <td><strong>{money(collectionsTotals.received_amount)}</strong></td>
                  <td><strong>{money(collectionsTotals.allocated_amount)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-routeSummary", "routeSummary")}>
        <ReportPanelHeading title="Route Reading Summary" printLabel="route reading summary" onPrint={() => onPrint("routeSummary")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Customers</th>
                <th>With Readings</th>
                <th>Missing</th>
                <th>Latest Reading</th>
              </tr>
            </thead>
            <tbody>
              {routeRows.map((row) => (
                <tr key={row.zone_id}>
                  <td>{row.zone_name}</td>
                  <td>{number(row.customer_count)}</td>
                  <td>{number(row.customers_with_readings)}</td>
                  <td>{number(row.customers_without_readings)}</td>
                  <td>{date(row.latest_reading_date)}</td>
                </tr>
              ))}
              {routeRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(routeTotals.customer_count)}</strong></td>
                  <td><strong>{number(routeTotals.customers_with_readings)}</strong></td>
                  <td><strong>{number(routeTotals.customers_without_readings)}</strong></td>
                  <td>-</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ManagementRevenueReports;
