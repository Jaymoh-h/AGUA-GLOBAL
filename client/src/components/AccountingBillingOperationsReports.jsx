import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";
import TableControls from "./TableControls";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function AccountingBillingOperationsReports({
  billingRows,
  billingTable,
  billingTotals,
  date,
  isVisible,
  label,
  meterRows,
  meterTable,
  meterTotals,
  money,
  number,
  onPrint,
  percent,
  serviceRows,
  serviceTable,
  serviceTotals
}) {
  const sectionClass = (name, key) =>
    `panel full-span report-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("report-section-billingRegister", "billingRegister")}>
        <ReportPanelHeading title="Billing Register" printLabel="billing register" onPrint={() => onPrint("billingRegister")} showSpreadsheet />
        <TableControls table={billingTable} label="bills" placeholder="Search billing register" />
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Bill</th><th>Period</th><th>Customer</th><th>Zone</th><th>Units</th><th>Rate</th><th>Subtotal</th>
            <th>Fixed</th><th>Penalty</th><th>VAT</th><th>Adjustment</th><th>Total</th><th>Paid</th><th>Balance</th>
          </tr></thead>
          <tbody>
            {billingTable.total ? <>
              {billingRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.bill_number || `Bill ${row.id}`}<small>{date(row.due_date)}</small></td>
                  <td>{row.billing_period_name || date(row.billing_month)}</td>
                  <td>{row.customer_name}<small>{row.acc_number}</small></td>
                  <td>{row.zone_name}</td><td>{number(row.units_used)}</td><td>{money(row.rate)}</td>
                  <td>{money(row.subtotal_amount)}</td><td>{money(row.fixed_charge_amount)}</td><td>{money(row.penalty_amount)}</td>
                  <td>{money(row.vat_amount)}</td><td>{money(row.adjustment_amount)}</td><td>{money(row.billed_amount)}</td>
                  <td>{money(row.paid_amount)}</td><td>{money(row.balance_amount)}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="4"><strong>Total</strong></td><td><strong>{number(billingTotals.units_used)}</strong></td><td>-</td>
                <td><strong>{money(billingTotals.subtotal_amount)}</strong></td><td><strong>{money(billingTotals.fixed_charge_amount)}</strong></td>
                <td><strong>{money(billingTotals.penalty_amount)}</strong></td><td><strong>{money(billingTotals.vat_amount)}</strong></td>
                <td><strong>{money(billingTotals.adjustment_amount)}</strong></td><td><strong>{money(billingTotals.billed_amount)}</strong></td>
                <td><strong>{money(billingTotals.paid_amount)}</strong></td><td><strong>{money(billingTotals.balance_amount)}</strong></td>
              </tr>
            </> : <EmptyRow colSpan={14} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-serviceCharges", "serviceCharges")}>
        <ReportPanelHeading title="Customer Service Charges" printLabel="customer service charges" onPrint={() => onPrint("serviceCharges")} />
        <TableControls table={serviceTable} label="service charges" placeholder="Search service charges" />
        <div className="table-wrap"><table>
          <thead><tr><th>Charge</th><th>Customer</th><th>Type</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {serviceTable.total ? <>
              {serviceRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.charge_number || `Charge ${row.id}`}<small>{row.description}</small>{row.bill_number ? <small>Bill {row.bill_number}</small> : null}</td>
                  <td>{row.customer_name}<small>{row.acc_number} | {row.zone_name}</small></td>
                  <td>{label(row.charge_type)}</td>
                  <td>{date(row.charge_date)}<small>{row.due_date ? `Due ${date(row.due_date)}` : "-"}</small></td>
                  <td>{money(row.amount)}</td><td>{money(row.paid_amount)}</td><td>{money(row.balance_amount)}</td>
                  <td>{label(row.status === "payable" ? row.bill_status || row.status : row.status)}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="4"><strong>Total</strong></td><td><strong>{money(serviceTotals.amount)}</strong></td>
                <td><strong>{money(serviceTotals.paid_amount)}</strong></td><td><strong>{money(serviceTotals.balance_amount)}</strong></td>
                <td><strong>{number(serviceTotals.charge_count)} charges</strong></td>
              </tr>
            </> : <EmptyRow colSpan={8} />}
          </tbody>
        </table></div>
      </div>

      <div className={sectionClass("report-section-meterConsumptionComparison", "meterConsumptionComparison")}>
        <ReportPanelHeading title="Meter Consumption Comparison" printLabel="meter consumption comparison" onPrint={() => onPrint("meterConsumptionComparison")} />
        <TableControls table={meterTable} label="meter comparisons" placeholder="Search meter comparisons" />
        <div className="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Primary Meter</th><th>Second Meter</th><th>Primary Units</th><th>Second Units</th><th>Variance</th><th>Variance %</th><th>Bills</th><th>Status</th></tr></thead>
          <tbody>
            {meterTable.total ? <>
              {meterRows.map((row) => (
                <tr key={`${row.customer_id}-${row.source_meter_id}`}>
                  <td>{row.customer_name}<small>{row.acc_number} | {row.zone_name || "-"}</small></td>
                  <td>{row.client_meter_number || "-"}<small>{row.client_reading_date ? `Reading ${date(row.client_reading_date)}` : "No primary reading"}</small></td>
                  <td>{row.source_meter_number || "-"}<small>{row.source_reading_date ? `Reading ${date(row.source_reading_date)}` : "No second reading"}</small></td>
                  <td>{number(row.client_units_used)}</td><td>{number(row.source_units_used)}</td><td>{number(row.variance_units)}</td>
                  <td>{row.variance_percent === null || row.variance_percent === undefined ? "-" : percent(row.variance_percent)}</td>
                  <td><small>Primary: {row.client_bill_number || "-"} {row.client_bill_pay_status ? `| ${label(row.client_bill_pay_status)}` : ""}</small><small>Second: {row.source_bill_number || "-"} {row.source_bill_pay_status ? `| ${label(row.source_bill_pay_status)}` : ""}</small></td>
                  <td>{label(row.comparison_status)}</td>
                </tr>
              ))}
              <tr className="muted-total">
                <td colSpan="3"><strong>Total</strong></td><td><strong>{number(meterTotals.client_units_used)}</strong></td>
                <td><strong>{number(meterTotals.source_units_used)}</strong></td><td><strong>{number(meterTotals.variance_units)}</strong></td><td colSpan="3">-</td>
              </tr>
            </> : <EmptyRow colSpan={9} />}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

export default AccountingBillingOperationsReports;
