import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";

function PortalAccountSnapshot({
  accountPositionLabel,
  activeRequests,
  consumptionPaymentTrend,
  consumptionPaymentTrendMax,
  consumptionTrendMax,
  data,
  date,
  formatCompact,
  hasConsumptionData,
  label,
  money,
  moneyAbs,
  moneyTooltip,
  number,
  openBalance,
  unitsTooltip,
  usageBenchmark,
  usagePosition,
  usageVariance
}) {
  return (
    <>
      <div className="stat-grid portal-account-metrics">
        <StatCard label={accountPositionLabel(openBalance)} value={moneyAbs(openBalance)} detail="Net account position" />
        <StatCard label="Open bills" value={number(data.summary.open_bills)} detail="Unpaid or partial bills" />
        <StatCard label="Available credit" value={money(data.summary.credit_balance)} detail="Auto-applies to new bills" />
        <StatCard label="Open requests" value={number(activeRequests)} detail="Service requests in progress" />
      </div>

      {data.paymentArrangement ? <div className="panel portal-payment-plan-panel">
        <div className="panel-heading"><div><h3>Payment plan</h3><small>{data.paymentArrangement.arrangement_number}</small></div><StatusBadge status={data.paymentArrangement.performance_status} /></div>
        <div className="portal-profile-grid">
          <div><span>Agreed amount</span><strong>{money(data.paymentArrangement.agreed_amount)}</strong></div>
          <div><span>Instalment</span><strong>{money(data.paymentArrangement.installment_amount)}</strong><small>{label(data.paymentArrangement.frequency)}</small></div>
          <div><span>Next due</span><strong>{date(data.paymentArrangement.next_due_date)}</strong></div>
          <div><span>Plan standing</span><strong>{label(data.paymentArrangement.performance_status)}</strong><small>{Number(data.paymentArrangement.shortfall_amount || 0) ? `Shortfall ${money(data.paymentArrangement.shortfall_amount)}` : "Payments are on schedule"}</small></div>
        </div>
      </div> : null}

      <TrendPanel
        data={consumptionPaymentTrend}
        emptyDetail="Bills and payments will appear here once posted."
        emptyTitle="No billing trend yet"
        formatter={moneyTooltip}
        max={consumptionPaymentTrendMax}
        series={[{ dataKey: "billed_amount", name: "Billed", stroke: "#0f766e" }, { dataKey: "paid_amount", name: "Paid", stroke: "#2563eb" }]}
        subtitle="Last six months"
        title="Billing vs Payments"
        tickFormatter={formatCompact}
      />
      <TrendPanel
        data={hasConsumptionData ? consumptionPaymentTrend : []}
        emptyDetail="Usage appears here after a meter reading has been reviewed and billed."
        emptyTitle="No verified consumption yet"
        formatter={unitsTooltip}
        max={consumptionTrendMax}
        series={[{ dataKey: "units_used", name: "Water used", stroke: "#d97706" }]}
        subtitle="Verified billable consumption over the last six months"
        title="Your Water Use"
      />

      <div className="panel portal-usage-benchmark">
        <div className="panel-heading"><div><h3>Similar accounts</h3><small>Recent billed usage, matched by tariff and zone</small></div></div>
        {usageBenchmark?.available ? <div className="portal-profile-grid">
          <div><span>Your monthly average</span><strong>{number(usageBenchmark.customer_average_units)} units</strong><small>Last {usageBenchmark.period_months} months</small></div>
          <div><span>Similar account median</span><strong>{number(usageBenchmark.peer_median_units)} units</strong><small>{usageBenchmark.comparison_group}</small></div>
          <div><span>Your position</span><strong>{usagePosition === "in line" ? "In line" : `${Math.abs(usageVariance).toFixed(1)}% ${usagePosition}`}</strong><small>Compared with the typical matched account</small></div>
        </div> : <EmptyState title="Comparison not ready yet" detail="It will appear after enough similar accounts have verified billed usage." />}
      </div>

      <div className="panel portal-profile-panel portal-account-panel">
        <div className="panel-heading"><h3>Account Summary</h3></div>
        <div className="portal-profile-grid">
          <div><span>Account</span><strong>{data.customer.acc_number}</strong></div>
          <div><span>Phone</span><strong>{data.customer.phone || "-"}</strong></div>
          <div><span>Zone</span><strong>{data.customer.zone_name}</strong></div>
          <div><span>Tariff</span><strong>{data.customer.rate_name}</strong><small>{money(data.customer.rate_amount)}</small></div>
          <div><span>Deposit</span><strong>{data.customer.deposit_paid ? "Paid" : "Not paid"}</strong><small>{money(data.customer.deposit_amount)}</small></div>
          <div><span>Latest Reading</span><strong>{data.latestReading ? number(data.latestReading.reading_value) : "-"}</strong><small>{data.latestReading ? `${data.latestReading.meter_number || "Meter"} | ${date(data.latestReading.reading_date)}` : "No reading yet"}</small></div>
          <div><span>Account Status</span><strong>{label(data.customer.status)}</strong></div>
          <div><span>Total Paid</span><strong>{money(data.summary.lifetime_paid)}</strong></div>
          <div><span>Customer Credit</span><strong>{money(data.summary.credit_balance)}</strong></div>
        </div>
      </div>
    </>
  );
}

function TrendPanel({ data, emptyDetail, emptyTitle, formatter, max, series, subtitle, tickFormatter, title }) {
  return <div className="panel chart-panel portal-trend-panel">
    <div className="panel-heading"><div><h3>{title}</h3><small>{subtitle}</small></div></div>
    {data.length ? <div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
      <YAxis domain={[0, max]} tickFormatter={tickFormatter} tickLine={false} axisLine={false} fontSize={11} width={44} />
      <Tooltip formatter={formatter} /><Legend />
      {series.map((line) => <Line key={line.dataKey} type="monotone" {...line} strokeWidth={2} dot={false} />)}
    </LineChart></ResponsiveContainer></div> : <EmptyState title={emptyTitle} detail={emptyDetail} />}
  </div>;
}

function EmptyState({ detail, title }) {
  return <div className="empty-state"><strong>{title}</strong><span>{detail}</span></div>;
}

export default PortalAccountSnapshot;
