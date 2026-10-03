import StatusBadge from "./StatusBadge";

export default function CashFlowForecastPanel({ forecast, money, moneyOrDash, number, percent, sumRows }) {
  if (!forecast) return null;

  return (
    <section className="panel screen-only cash-flow-forecast-panel">
      <div className="panel-heading">
        <div>
          <h3>90-day cash outlook</h3>
          <p className="muted">A planning view based on the last {number(forecast.history_months)} complete month(s), not a cash commitment.</p>
        </div>
        <StatusBadge status={forecast.collection_rate === null ? "review" : "ready"} />
      </div>
      <div className="cash-flow-forecast-summary">
        <div><span>Historical collection rate</span><strong>{forecast.collection_rate === null ? "-" : percent(forecast.collection_rate)}</strong></div>
        <div><span>Scheduled plan coverage</span><strong>{money(sumRows(forecast.rows, "payment_plan_schedule"))}</strong></div>
        <div><span>Scheduled mandate coverage</span><strong>{money(sumRows(forecast.rows, "standing_order_schedule"))}</strong></div>
        <div><span>Operating cost per bill</span><strong>{moneyOrDash(forecast.efficiency?.cost_per_bill)}</strong></div>
        <div><span>Operating cost to collections</span><strong>{forecast.efficiency?.operating_cost_to_collections_ratio === null || forecast.efficiency?.operating_cost_to_collections_ratio === undefined ? "-" : percent(forecast.efficiency.operating_cost_to_collections_ratio)}</strong></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Expected billing</th><th>Baseline collections</th><th>Committed coverage</th><th>Projected collections</th><th>Projected expenses</th><th>Net cash</th></tr></thead>
          <tbody>
            {forecast.rows.map((row) => (
              <tr key={row.month_start}>
                <td><strong>{new Date(`${row.month_start}T00:00:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</strong></td>
                <td>{money(row.expected_billings)}</td><td>{money(row.baseline_collections)}</td>
                <td>{money(row.committed_coverage)}<small>Plans {money(row.payment_plan_schedule)} | mandates {money(row.standing_order_schedule)}</small></td>
                <td><strong>{money(row.projected_collections)}</strong></td><td>{money(row.projected_expenses)}</td>
                <td><strong className={Number(row.projected_net_cash) < 0 ? "form-error" : ""}>{money(row.projected_net_cash)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="cash-flow-assumptions"><summary>Forecast assumptions and efficiency basis</summary><ul>{forecast.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}<li>Operating cost per bill and operating cost to collections use all recorded operating expenses, not only expenses directly attributable to collections.</li></ul></details>
    </section>
  );
}
