import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, RotateCcw, SlidersHorizontal } from "lucide-react";
import EmptyState from "../components/EmptyState";
import ManagementMetricDefinitions from "../components/ManagementMetricDefinitions";
import StatusBadge from "../components/StatusBadge";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import useDashboardPreferences from "../utils/useDashboardPreferences";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const units = (value) => `${Number(value || 0).toLocaleString()} units`;
const percentOrDash = (value) => (value === null || value === undefined ? "-" : `${Math.round(Number(value) * 100)}%`);
const severityRank = { high: 0, medium: 1, low: 2 };
const severityWeight = { high: 900, medium: 500, low: 150 };

const priorityScore = (item) => {
  const severity = severityWeight[item.severity] || 0;
  const financialExposure = Math.min(Math.round(Number(item.amount || 0) / 100), 350);
  const workload = Math.min(Number(item.count || 0) * 12, 220);
  const serviceRisk = ["urgent_maintenance", "production_gap", "missing_readings"].includes(item.key) ? 160 : 0;
  const deliveryRisk = ["contact_gaps", "document_delivery"].includes(item.key) ? 110 : 0;
  return severity + financialExposure + workload + serviceRisk + deliveryRisk;
};

const priorityReason = (item) => {
  if (Number(item.amount || 0) > 0) return `${money(item.amount)} requires recovery attention`;
  if (["urgent_maintenance", "production_gap"].includes(item.key)) return "Service continuity needs review";
  if (["missing_readings", "unbilled_consumption", "held_bills"].includes(item.key)) return "Billing progress is blocked";
  if (["contact_gaps", "document_delivery"].includes(item.key)) return "Customer recovery is blocked";
  return `${Number(item.count || 0).toLocaleString()} item(s) need a decision`;
};

const roleDashboardLabels = {
  admin: "Business operations",
  accountant: "Billing and collections",
  meter_reader: "Field priorities",
  business_viewer: "Management overview"
};

function DashboardPage({ user, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [metricDefinitionsOpen, setMetricDefinitionsOpen] = useState(false);
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const { preferences, setPreference, resetPreferences } = useDashboardPreferences(user);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.dashboard());
    } catch (requestError) {
      setError(requestError.message || "The latest operational signals could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <WorkspaceState title="Preparing today’s control view" detail="Retrieving the latest operational signals and recovery queues." />;
  if (error) return <WorkspaceState state="error" title="Today’s control view could not load" detail={error} onRetry={load} />;
  if (!data) return <WorkspaceState state="error" title="Today’s control view is unavailable" detail="No operational data was returned. Retry when the service is available." onRetry={load} />;

  const actionCenter = data.actionCenter || { summary: {}, groups: [] };
  const actionItems = actionCenter.groups.flatMap((group) => group.items.map((item) => ({
    ...item,
    groupTitle: group.title,
    priorityScore: priorityScore(item),
    priorityReason: priorityReason(item)
  })));
  const sortedActions = [...actionItems].sort((left, right) => {
    const activeDifference = Number(right.count > 0) - Number(left.count > 0);
    if (activeDifference) return activeDifference;
    const priorityDifference = right.priorityScore - left.priorityScore;
    if (priorityDifference) return priorityDifference;
    const severityDifference = (severityRank[left.severity] ?? 3) - (severityRank[right.severity] ?? 3);
    if (severityDifference) return severityDifference;
    return Number(right.count || 0) - Number(left.count || 0);
  });
  const activeActions = sortedActions.filter((item) => Number(item.count || 0) > 0);
  const queueActions = preferences.showClearedChecks ? sortedActions : activeActions;
  const visibleActions = showAllPriorities ? queueActions : queueActions.slice(0, 7);
  const hiddenActionCount = Math.max(queueActions.length - visibleActions.length, 0);
  const actionByKey = Object.fromEntries(actionItems.map((item) => [item.key, item]));
  const todayLabel = new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const fieldSignals = user?.role === "meter_reader"
    ? [
        ["Active checks", actionCenter.summary?.total || 0, "Current work"],
        ["Critical", actionCenter.summary?.high || 0, "Need attention"],
        ["Missing readings", actionByKey.missing_readings?.count || 0, "Billing cycle"],
        ["Urgent maintenance", actionByKey.urgent_maintenance?.count || 0, "Field response"]
      ]
    : [];
  const collectionsItem = actionByKey.overdue_bills;
  const signalActions = activeActions.slice(0, 3);
  const performance = data.performance || null;
  const isFieldWorkspace = user?.role === "meter_reader";
  const canOperateManagementMetrics = ["admin", "accountant"].includes(user?.role);
  const businessControlMetrics = performance
    ? [
        ...(performance.collections
          ? [{
              key: "collection-rate",
              label: "Collection rate",
              value: percentOrDash(performance.collections.collection_rate),
              detail: `${money(performance.collections.collected_amount)} allocated of ${money(performance.collections.billed_amount)} issued`,
              target: canOperateManagementMetrics ? { page: "collections", focus: "arrears", label: "Collections" } : null
            }, {
              key: "arrears-exposure",
              label: "Arrears exposure",
              value: money(performance.collections.open_receivables),
              detail: `${Number(collectionsItem?.count || 0).toLocaleString()} overdue account(s) require recovery`,
              target: canOperateManagementMetrics ? { page: "collections", focus: "arrears", label: "Collections" } : null
            }]
          : []),
        {
          key: "reading-completion",
          label: "Reading completion",
          value: percentOrDash(performance.readings?.completion_rate),
          detail: `${Number(performance.readings?.completed_count || 0).toLocaleString()} of ${Number(performance.readings?.required_count || 0).toLocaleString()} active accounts`,
          target: canOperateManagementMetrics ? { page: "readings", focus: "missing_readings", label: "Missing readings" } : null
        },
        {
          key: "billing-blockers",
          label: "Billing blockers",
          value: Number(performance.billing?.blocker_count || 0).toLocaleString(),
          detail: `${Number(performance.billing?.unbilled_consumption_count || 0).toLocaleString()} unbilled readings | ${Number(performance.billing?.held_bill_count || 0).toLocaleString()} held bills | ${Number(performance.billing?.pending_source_billing_count || 0).toLocaleString()} source reviews`,
          target: canOperateManagementMetrics ? { page: "billing", label: "Billing readiness" } : null
        },
        ...(performance.deliveries
          ? [{
              key: "delivery-failures",
              label: "Delivery failures",
              value: Number(performance.deliveries.exception_count || 0).toLocaleString(),
              detail: `${percentOrDash(performance.deliveries.success_rate)} successful in the last 14 days`,
              target: canOperateManagementMetrics ? { page: "communications", focus: "document_delivery", label: "Delivery exceptions" } : null
            }]
          : []),
        ...(performance.margin
          ? [{
              key: "accrual-margin",
              label: "Accrual margin",
              value: percentOrDash(performance.margin.margin_rate),
              detail: `${money(performance.margin.net_amount)} after recorded operating expenses`,
              target: { page: "reports", label: "Financial reports" }
            }]
          : []),
      ]
    : [];
  const operations = performance?.operations;
  const productionVariance = Number(operations?.production?.variance_units || 0);
  const operatingControlMetrics = operations
    ? [
        {
          key: "production-variance",
          label: "Output / billed variance",
          value: Number(operations.production?.completed_week_count || 0)
            ? `${productionVariance > 0 ? "+" : productionVariance < 0 ? "-" : ""}${units(Math.abs(productionVariance))}`
            : "Awaiting data",
          detail: Number(operations.production?.completed_week_count || 0)
            ? `${units(operations.production?.output_units)} source output | ${units(operations.production?.billed_units)} billed`
            : "No saved production reading this month",
          definitionPeriod: "Current calendar month",
          target: canOperateManagementMetrics ? { page: "production", focus: "production_gap", label: "Production control" } : null
        },
        {
          key: "maintenance-turnaround",
          label: "Maintenance turnaround",
          value: `${Number(operations.maintenance?.avg_resolution_days || 0).toFixed(1)} days`,
          detail: `${Number(operations.maintenance?.active_count || 0).toLocaleString()} active | ${Number(operations.maintenance?.overdue_count || 0).toLocaleString()} overdue`,
          target: canOperateManagementMetrics ? { page: "maintenance", focus: "overdue_maintenance", label: "Maintenance work" } : null
        },
        {
          key: "operating-liabilities",
          label: "Operating liabilities",
          value: money(Number(operations.payroll_liability?.approved_amount || 0) + Number(operations.contractor_payables?.open_amount || 0)),
          detail: `${money(operations.payroll_liability?.approved_amount)} payroll | ${money(operations.contractor_payables?.open_amount)} suppliers`,
          definitionPeriod: "Current calendar month",
          target: canOperateManagementMetrics ? { page: "reports", focus: "cash_flow_forecast", label: "Finance control" } : null
        }
      ]
    : [];
  const todayMetrics = [...businessControlMetrics, ...operatingControlMetrics];
  const definitionMetrics = todayMetrics;

  return (
    <section className="ops-dashboard">
      <header className="cockpit-header">
        <div>
          <p className="eyebrow">{roleDashboardLabels[user?.role] || "Operations"}</p>
          <h1>Work that needs a decision.</h1>
          <p>{todayLabel} | {activeActions.length ? `${activeActions.length} active operational checks` : "No active operational exceptions"}</p>
        </div>
        <button className="cockpit-view-button" type="button" aria-expanded={preferencesOpen} onClick={() => setPreferencesOpen((current) => !current)}>
          <SlidersHorizontal size={16} />
          View
        </button>
      </header>

      {preferencesOpen ? (
        <section className="cockpit-preferences" aria-label="Today view preferences">
          <label><input type="checkbox" checked={preferences.showInsights} onChange={(event) => setPreference("showInsights", event.target.checked)} />Show operating pulse</label>
          <label><input type="checkbox" checked={preferences.showClearedChecks} onChange={(event) => setPreference("showClearedChecks", event.target.checked)} />Show cleared checks</label>
          <label><input type="checkbox" checked={preferences.compactPriorities} onChange={(event) => setPreference("compactPriorities", event.target.checked)} />Compact queue</label>
          <button type="button" onClick={resetPreferences}><RotateCcw size={14} />Reset</button>
        </section>
      ) : null}

      {fieldSignals.length ? (
        <section className="cockpit-signal-strip" aria-label="Field operational snapshot">
          {fieldSignals.map(([label, value, detail]) => <div key={label}><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>)}
        </section>
      ) : null}

      {todayMetrics.length ? (
        <section className="today-control-strip" aria-labelledby="today-control-title">
          <div className="today-control-heading">
            <div>
              <p className="eyebrow">Business control</p>
              <h2 id="today-control-title">Signals that change the next decision.</h2>
            </div>
            <div className="today-control-heading-actions">
              <small>{canOperateManagementMetrics ? "Each measure opens the work that can improve it." : "Measures are read-only in this workspace."}</small>
              <button className="icon-button" type="button" onClick={() => setMetricDefinitionsOpen((current) => !current)} title="Review metric definitions" aria-label="Review metric definitions" aria-expanded={metricDefinitionsOpen}><Info size={16} /></button>
            </div>
          </div>
          <div className="today-control-metrics">
            {todayMetrics.map((metric) => {
              const Tag = metric.target ? "button" : "div";
              return (
              <Tag
                key={metric.key}
                {...(metric.target
                  ? { type: "button", onClick: () => onNavigate?.(metric.target), title: `Open ${metric.target.label}` }
                  : {})}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
                {metric.target ? <ArrowRight aria-hidden="true" size={15} /> : null}
              </Tag>
              );
            })}
          </div>
          {metricDefinitionsOpen ? <ManagementMetricDefinitions metrics={definitionMetrics} onClose={() => setMetricDefinitionsOpen(false)} onNavigate={onNavigate} /> : null}
        </section>
      ) : null}

      <div className={`cockpit-grid${isFieldWorkspace ? " field-workspace" : ""}`}>
        <section className={`decision-queue${preferences.compactPriorities ? " compact" : ""}`} aria-labelledby="decision-queue-title">
          <div className="cockpit-section-heading">
            <div><p className="eyebrow">Priority queue</p><h2 id="decision-queue-title">Make the next move</h2></div>
            <div className="decision-queue-controls">
              <small>{preferences.showClearedChecks ? `${queueActions.length} checks` : `${queueActions.length} open`}</small>
              {hiddenActionCount ? <button type="button" onClick={() => setShowAllPriorities(true)}>Show {hiddenActionCount} more</button> : null}
              {showAllPriorities && queueActions.length > 7 ? <button type="button" onClick={() => setShowAllPriorities(false)}>Show top 7</button> : null}
              <StatusBadge status={activeActions.length ? (actionCenter.summary?.high ? "critical" : "review") : "resolved"} />
            </div>
          </div>
          {visibleActions.length ? (
            <div className="decision-list">
              {visibleActions.map((item, index) => {
                const active = Number(item.count || 0) > 0;
                const Icon = active ? AlertTriangle : CheckCircle2;
                return <article className={active ? `decision-item is-${item.severity || "low"}` : "decision-item is-clear"} key={item.key}>
                  <span className="decision-rank">{active ? String(index + 1).padStart(2, "0") : "-"}</span>
                  <span className="decision-icon"><Icon size={17} /></span>
                  <div className="decision-copy"><strong>{item.label}</strong><small>{item.priorityReason}</small><span>{item.groupTitle}</span></div>
                  <div className="decision-value"><strong>{Number(item.count || 0).toLocaleString()}</strong>{item.amount !== undefined ? <small>{money(item.amount)}</small> : null}</div>
                  {item.page && active ? <button type="button" onClick={() => onNavigate?.({ page: item.page, focus: item.key === "monthly_budget_variance" ? "monthly_budget" : item.key, label: item.label })} aria-label={`Open ${item.label}`}><ArrowRight size={16} /></button> : null}
                </article>;
              })}
            </div>
          ) : <EmptyState title="Nothing needs escalation" detail="The operational queue is clear for this workspace." />}
        </section>

        {!isFieldWorkspace ? <aside className="operational-signal-rail" aria-label="Operational signals">
          <div className="operational-signal-heading">
            <div><p className="eyebrow">Operational signals</p><h2>Where attention pays back.</h2></div>
            <span>{activeActions.length} open</span>
          </div>
          <button className="signal-receivables" type="button" onClick={() => onNavigate?.({ page: "collections", focus: "arrears" })}>
            <span>Open receivables</span>
            <strong>{money(data.summary.arrears)}</strong>
            <small>{Number(collectionsItem?.count || 0).toLocaleString()} overdue accounts</small>
            <ArrowRight size={16} />
          </button>
          <div className="operational-signal-list">
            {signalActions.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.({ page: item.page, focus: item.key === "monthly_budget_variance" ? "monthly_budget" : item.key, label: item.label })}
              >
                <span>Priority {index + 1} | {item.groupTitle}</span>
                <strong>{item.label}</strong>
                <small>{item.priorityReason}</small>
                <b>{item.amount !== undefined ? money(item.amount) : `${Number(item.count || 0).toLocaleString()} cases`}</b>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
            {!signalActions.length ? <p>No operational exceptions are open.</p> : null}
          </div>
        </aside> : null}
      </div>

      {preferences.showInsights && !isFieldWorkspace ? (
        <section className="operating-pulse" aria-label="Operating pulse">
          <div><p className="eyebrow">Operating pulse</p><h2>Read the business, then act.</h2><p>Revenue, billing readiness, and field exceptions are kept in one decision layer rather than separate dashboard cards.</p></div>
          <div className="pulse-list">
            {activeActions.slice(0, 3).map((item) => <div key={item.key}><span>{item.groupTitle}</span><strong>{item.label}</strong><small>{Number(item.count || 0).toLocaleString()} open</small></div>)}
            {!activeActions.length ? <div><span>Operations</span><strong>All current checks are clear</strong><small>Continue routine monitoring</small></div> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default DashboardPage;
