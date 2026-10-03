export default function ManagementPerformanceMetrics({ accountantTotals, highPriorityQualityCount, money, number, productionTotals, qualityIssueCount, totals }) {
  const productionAvailable = productionTotals.weekCount > 0;
  const productionGap = productionTotals.consumption - accountantTotals.unitsBilled;
  const productionGapLabel = `${productionGap > 0 ? "+" : productionGap < 0 ? "-" : ""}${number(Math.abs(productionGap))} units`;

  return (
    <section className="performance-reporting-metrics screen-only" aria-label="Management performance">
      <div>
        <span>Revenue billed</span>
        <strong>{money(totals.billed)}</strong>
        <small>Across the last 12 billing periods</small>
      </div>
      <div>
        <span>Cash collected</span>
        <strong>{money(totals.collected)}</strong>
        <small>{totals.billed ? `${((totals.collected / totals.billed) * 100).toFixed(1)}% of billed value` : "No billing total available"}</small>
      </div>
      <div className={totals.arrears ? "needs-attention" : ""}>
        <span>Open arrears</span>
        <strong>{money(totals.arrears)}</strong>
        <small>{number(totals.openCustomers)} customer accounts owing</small>
      </div>
      <div className={totals.maintenanceOverdue ? "needs-attention" : ""}>
        <span>Field work overdue</span>
        <strong>{number(totals.maintenanceOverdue)}</strong>
        <small>{number(totals.maintenanceUrgent)} urgent request{totals.maintenanceUrgent === 1 ? "" : "s"} active</small>
      </div>
      <div className={totals.maintenanceResolutionDays > 7 ? "needs-attention" : ""}>
        <span>Maintenance turnaround</span>
        <strong>{totals.maintenanceResolutionDays.toFixed(1)} days</strong>
        <small>{number(totals.maintenanceResolved30d)} request{totals.maintenanceResolved30d === 1 ? "" : "s"} resolved in 30 days</small>
      </div>
      <div className={productionAvailable && productionGap !== 0 ? "needs-attention" : ""}>
        <span>Output / billed variance</span>
        <strong>{productionAvailable ? productionGapLabel : "Awaiting data"}</strong>
        <small>{productionAvailable ? `${number(productionTotals.consumption)} output | ${number(accountantTotals.unitsBilled)} billed` : "No completed production week in this period"}</small>
      </div>
      <div className={accountantTotals.approvedPayrollLiability ? "needs-attention" : ""}>
        <span>Approved payroll liability</span>
        <strong>{money(accountantTotals.approvedPayrollLiability)}</strong>
        <small>{number(accountantTotals.approvedPayrollRuns)} approved run{accountantTotals.approvedPayrollRuns === 1 ? "" : "s"} awaiting payment</small>
      </div>
      <div className={accountantTotals.payables ? "needs-attention" : ""}>
        <span>Open contractor payables</span>
        <strong>{money(accountantTotals.payables)}</strong>
        <small>{money(accountantTotals.overduePayables)} past due</small>
      </div>
      <div className={qualityIssueCount ? "needs-attention" : ""}>
        <span>Data-quality findings</span>
        <strong>{number(qualityIssueCount)}</strong>
        <small>{number(highPriorityQualityCount)} high priority</small>
      </div>
    </section>
  );
}
