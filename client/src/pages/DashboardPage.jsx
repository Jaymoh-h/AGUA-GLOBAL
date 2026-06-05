import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import EmptyState from "../components/EmptyState";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const units = (value) => `${Number(value || 0).toLocaleString()} units`;

const severityLabel = {
  high: "critical",
  medium: "review",
  low: "watch"
};

const chartColors = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#64748b"];

const formatCompact = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(0)}K`;
  return number.toLocaleString();
};

const paddedChartMax = (dataMax) => {
  const max = Number(dataMax || 0);
  if (max <= 0) return 10;
  const headroom = max * 0.15;
  const roundedStep = 10 ** Math.max(0, Math.floor(Math.log10(max)) - 1);
  return Math.ceil((max + headroom) / roundedStep) * roundedStep;
};

const moneyTooltip = (value, name) => [money(value), String(name || "").replace("_", " ")];
const countTooltip = (value, name) => [Number(value || 0).toLocaleString(), String(name || "").replace("_", " ")];
const date = (value) => value?.slice(0, 10) || "";

const useLargeDashboardCharts = () => {
  const [isLarge, setIsLarge] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1200px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia("(min-width: 1200px)");
    const update = () => setIsLarge(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isLarge;
};

function DashboardPage({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const showLargeCharts = useLargeDashboardCharts();

  useEffect(() => {
    api.dashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Loading dashboard...</p>;

  const actionCenter = data.actionCenter || { summary: {}, groups: [] };
  const activeActionCount = Number(actionCenter.summary?.total || 0);
  const charts = data.charts || {};
  const billingTrend = charts.billingTrend || [];
  const receivablesAging = charts.receivablesAging || [];
  const maintenanceStatus = charts.maintenanceStatus || [];
  const zoneConsumption = charts.zoneConsumption || [];
  const collectionsByChannel = charts.collectionsByChannel || [];
  const productionTrend = charts.productionTrend || [];
  const concludedPeriod = charts.periods?.lastConcludedBillingPeriod || null;
  const concludedPeriodLabel = concludedPeriod?.name || [date(concludedPeriod?.period_start), date(concludedPeriod?.period_end)].filter(Boolean).join(" to ");
  const visibleBillingTrend = billingTrend.slice(-(showLargeCharts ? 12 : 6));
  const visibleProductionTrend = productionTrend.slice(-(showLargeCharts ? 13 : 8));

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Action Center</h2>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Needs attention" value={activeActionCount} detail="Active operational checks" />
        <StatCard label="Critical" value={actionCenter.summary?.high || 0} detail="Requires priority action" />
        <StatCard label="Water billed" value={units(data.summary.water_units_billed)} detail="From meter readings" />
        <StatCard label="Cash collected" value={money(data.summary.cash_collected)} detail="Posted payments" />
        <StatCard label="Bills due" value={data.summary.bills_due} detail="Unpaid or partial" />
        <StatCard label="Arrears" value={money(data.summary.arrears)} detail="Outstanding balance" />
      </div>

      <section className="dashboard-chart-grid">
        <div className="panel chart-panel dashboard-chart-wide">
          <div className="panel-heading">
            <div>
              <h3>Billing vs Collections</h3>
              <small>{showLargeCharts ? "Last 12 months" : "Last six months"}</small>
            </div>
          </div>
          {visibleBillingTrend.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleBillingTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, paddedChartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={11} width={44} />
                  <Tooltip formatter={moneyTooltip} />
                  <Legend />
                  <Line type="monotone" dataKey="billed_amount" name="Billed" stroke="#0f766e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="collected_amount" name="Collected" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No billing trend yet" detail="Billing and payment activity will appear here." />
          )}
        </div>

        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Receivables Aging</h3>
              <small>Outstanding payable balances</small>
            </div>
          </div>
          {receivablesAging.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receivablesAging} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, paddedChartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={11} width={44} />
                  <Tooltip formatter={moneyTooltip} />
                  <Bar dataKey="balance_amount" name="Balance" radius={[5, 5, 0, 0]} fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No arrears yet" detail="Open receivables will appear here." />
          )}
        </div>

        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Maintenance Workload</h3>
              <small>Requests by status</small>
            </div>
          </div>
          {maintenanceStatus.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={maintenanceStatus} dataKey="count" nameKey="label" innerRadius={54} outerRadius={84} paddingAngle={2}>
                    {maintenanceStatus.map((row, index) => (
                      <Cell key={row.label} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={countTooltip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No maintenance records" detail="Maintenance status will appear after requests are logged." />
          )}
        </div>

        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Consumption by Zone</h3>
              <small>{concludedPeriodLabel ? `Last concluded period: ${concludedPeriodLabel}` : "Current billing month"}</small>
            </div>
          </div>
          {zoneConsumption.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneConsumption} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, paddedChartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={11} width={44} />
                  <Tooltip formatter={countTooltip} />
                  <Legend />
                  <Bar dataKey="units_used" name="Units" radius={[5, 5, 0, 0]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No zone consumption yet" detail="Current-month billed units will appear here." />
          )}
        </div>

        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Collections by Channel</h3>
              <small>{concludedPeriodLabel ? `Receipts in ${concludedPeriodLabel}` : "Current month receipts"}</small>
            </div>
          </div>
          {collectionsByChannel.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={collectionsByChannel} dataKey="collected_amount" nameKey="label" innerRadius={54} outerRadius={84} paddingAngle={2}>
                    {collectionsByChannel.map((row, index) => (
                      <Cell key={row.label} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={moneyTooltip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No collections this month" detail="Posted receipts will appear by channel here." />
          )}
        </div>

        <div className="panel chart-panel dashboard-chart-wide">
          <div className="panel-heading">
            <div>
              <h3>Production Trend</h3>
              <small>{showLargeCharts ? "Latest quarter year" : "Latest 8 weeks"}</small>
            </div>
          </div>
          {visibleProductionTrend.length ? (
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleProductionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, paddedChartMax]} tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={11} width={44} />
                  <Tooltip formatter={moneyTooltip} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue_amount" name="Revenue" stroke="#0f766e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="electricity_cost" name="Electricity cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No production trend yet" detail="Weekly production readings will appear here." />
          )}
        </div>
      </section>

      <section className="action-center-grid">
        {actionCenter.groups?.length ? (
          actionCenter.groups.map((group) => (
            <div className="panel action-group-panel" key={group.key}>
              <div className="panel-heading">
                <div>
                  <h3>{group.title}</h3>
                  <small>{group.detail}</small>
                </div>
              </div>
              <div className="action-list">
                {group.items.map((item) => {
                  const isActive = Number(item.count || 0) > 0;
                  const BadgeIcon = isActive ? AlertTriangle : CheckCircle2;
                  return (
                    <article className={isActive ? "action-item active" : "action-item clear"} key={item.key}>
                      <div className="action-item-main">
                        <span className={`action-icon action-icon-${isActive ? item.severity : "clear"}`}>
                          <BadgeIcon size={15} />
                        </span>
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </div>
                      <div className="action-item-meta">
                        <span className="action-count">{Number(item.count || 0).toLocaleString()}</span>
                        {item.amount !== undefined ? <small>{money(item.amount)}</small> : null}
                        <StatusBadge status={isActive ? severityLabel[item.severity] || item.severity : "resolved"} />
                        {item.page ? (
                          <button className="action-open-button" type="button" onClick={() => onNavigate?.({ page: item.page, focus: item.key, label: item.label })}>
                            <ArrowRight size={14} />
                            <span>Open</span>
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="panel full-span">
            <EmptyState title="No action center checks" detail="Operational checks will appear here once the dashboard has data." />
          </div>
        )}
      </section>

    </section>
  );
}

export default DashboardPage;
