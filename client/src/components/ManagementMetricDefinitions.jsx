import { ArrowRight, X } from "lucide-react";

const definitions = {
  "collection-rate": {
    formula: "Posted allocations against current-month payable bills / current-month payable bills issued.",
    period: "Current calendar month",
    owner: "Revenue office",
    scope: "Only payable bills and posted allocations count. Held bills, unallocated credit, and preview/import rows are excluded."
  },
  "arrears-exposure": {
    formula: "Total unpaid balance across payable bills.",
    period: "Current receivables register",
    owner: "Revenue office",
    scope: "Paid, held, draft, and preview bills are excluded. This is open customer exposure, not a forecast of recoverable cash."
  },
  "days-sales-outstanding": {
    formula: "Open payable receivables / payable billing issued in the trailing 90 days × 90.",
    period: "Rolling 90 days",
    owner: "Revenue office",
    scope: "Withheld when there is no payable billing base in the trailing 90 days."
  },
  "reading-completion": {
    formula: "Active client-billing accounts with a reading in the current month / active client-billing accounts required to read.",
    period: "Current billing month",
    owner: "Field operations",
    scope: "A suggestion or unreviewed customer submission does not count until a reading is saved."
  },
  "billing-blockers": {
    formula: "Current-month unbilled client readings + held bills + pending source-billing reviews.",
    period: "Current month, with held/source-review queues",
    owner: "Billing review",
    scope: "It is a work count, not a monetary leakage estimate; each item needs review before collection can be relied on."
  },
  "delivery-reliability": {
    formula: "Successful document deliveries / all delivery attempts.",
    period: "Trailing 14 days",
    owner: "Customer communications",
    scope: "Failed and skipped outcomes remain exceptions. No automatic retry is included in this measure."
  },
  "delivery-failures": {
    formula: "Document delivery attempts with failed or skipped outcomes.",
    period: "Trailing 14 days",
    owner: "Customer communications",
    scope: "A failure is a recovery queue signal. The metric does not send or retry any message automatically."
  },
  "accrual-margin": {
    formula: "Current-month payable bill value − recorded operating expenses; margin is net amount / payable bill value.",
    period: "Current calendar month",
    owner: "Finance control",
    scope: "This is an accrual operating view, not cash flow. Unrecorded liabilities and forecasts are excluded."
  },
  "budget-revenue": {
    formula: "Current-month payable bill value compared with the approved monthly revenue target.",
    period: "Current calendar month",
    owner: "Finance control",
    scope: "The target is operator-approved. It is shown separately from actual billing and does not change the actual measure."
  },
  "production-variance": {
    formula: "Production-source consumption captured in completed weekly readings − customer bill units issued.",
    period: "Selected report period",
    owner: "Production operations",
    scope: "Only saved production readings count. Missing weeks are not estimated, and a difference is a review signal rather than a confirmed leakage figure."
  },
  "maintenance-turnaround": {
    formula: "Average calendar days from reported date to resolved date for resolved maintenance requests.",
    period: "All resolved maintenance history",
    owner: "Field operations",
    scope: "Open, cancelled, and unresolved requests are excluded. This is elapsed resolution time, not an SLA compliance measure."
  },
  "approved-payroll-liability": {
    formula: "Net pay for payroll runs marked approved and overlapping the selected report period.",
    period: "Selected report period",
    owner: "Finance control",
    scope: "Draft, pending, paid, locked, and cancelled runs are excluded. Approval creates an internal liability; it does not initiate a payment."
  },
  "operating-liabilities": {
    formula: "Approved payroll liability + open contractor invoice value.",
    period: "Current open liability register",
    owner: "Finance control",
    scope: "The total is an exposure view. Payroll approval and supplier invoices do not initiate payment, and the underlying registers remain separately auditable."
  },
  "contractor-payables": {
    formula: "Total contractor invoice value in draft, submitted, or approved status.",
    period: "Current open invoice register",
    owner: "Finance control",
    scope: "Posted-to-expense, paid, rejected, and cancelled invoices are excluded. Draft and submitted invoices are open exposure, not yet approved payment commitments."
  }
};

function ManagementMetricDefinitions({ description, metrics, onClose, onNavigate, title = "Business-health definitions" }) {
  const visibleMetrics = (metrics || []).map((metric) => ({ ...metric, definition: definitions[metric.key] })).filter((metric) => metric.definition);

  if (!visibleMetrics.length) return null;

  return (
    <section className="metric-definition-sheet" aria-labelledby="metric-definition-title">
      <header className="metric-definition-header">
        <div>
          <p className="eyebrow">Metric basis</p>
          <h3 id="metric-definition-title">{title}</h3>
          <p>{description || "Values are actual operating records unless the definition explicitly identifies an approved target."}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Close metric definitions" aria-label="Close metric definitions"><X size={16} /></button>
      </header>
      <div className="metric-definition-list">
        {visibleMetrics.map((metric) => (
          <article key={metric.key}>
            <header><strong>{metric.label}</strong><span>{metric.value}</span></header>
            <dl>
              <div><dt>Formula</dt><dd>{metric.definition.formula}</dd></div>
              <div><dt>Period</dt><dd>{metric.definitionPeriod || metric.definition.period}</dd></div>
              <div><dt>Owner</dt><dd>{metric.definition.owner}</dd></div>
              <div><dt>Scope</dt><dd>{metric.definition.scope}</dd></div>
            </dl>
            {metric.target ? <button type="button" onClick={() => onNavigate?.(metric.target)}>Open underlying work <ArrowRight size={15} /></button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default ManagementMetricDefinitions;
