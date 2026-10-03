import { ArrowRight, FileWarning, Gauge, ReceiptText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { EmptyTableRow } from "./EmptyState";
import StatusBadge from "./StatusBadge";
import TableControls, { useTableControls } from "./TableControls";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

const issueMeta = {
  unbilled_consumption: { label: "Unbilled consumption", status: "critical", Icon: Gauge },
  held_bill: { label: "Held bill", status: "critical", Icon: ReceiptText },
  missing_reading: { label: "Missing reading", status: "review", Icon: FileWarning }
};

function RevenueAssurancePanel({ assurance, busy, onRefresh, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const rows = assurance?.rows || [];
  const visibleRows = filter === "all" ? rows : rows.filter((row) => row.issue_type === filter);
  const table = useTableControls(visibleRows, {
    searchFields: ["customer_name", "acc_number", "zone_name", "meter_number", "bill_number", "issue_type"]
  });
  const summary = assurance?.summary || {};

  const openIssue = (row) => {
    if (row.issue_type === "held_bill") {
      onNavigate?.({ page: "bills", focus: "held_bills", label: "Held bills" });
      return;
    }
    onNavigate?.({
      page: "readings",
      focus: row.issue_type === "unbilled_consumption" ? "unbilled_consumption" : "missing_readings",
      customer_id: row.customer_id,
      period_start: assurance?.period?.period_start,
      period_end: assurance?.period?.period_end,
      label: issueMeta[row.issue_type]?.label || "Reading review"
    });
  };

  return (
    <section className="revenue-assurance-panel" aria-labelledby="revenue-assurance-title">
      <header className="revenue-assurance-header">
        <div>
          <p className="eyebrow">Revenue assurance</p>
          <h3 id="revenue-assurance-title">Find consumption that is not yet collectible.</h3>
          <p>Observed meter units and generated held bills are shown separately so the recovery action stays clear.</p>
        </div>
        <button className="icon-button" type="button" title="Refresh revenue assurance" onClick={onRefresh} disabled={busy}>
          <RefreshCw size={16} />
        </button>
      </header>

      {!assurance ? <p className="muted">Loading period assurance...</p> : <>
        <div className="revenue-assurance-metrics" aria-label="Revenue assurance snapshot">
          <div><small>Unbilled consumption</small><strong>{Number(summary.unbilled_consumption_count || 0).toLocaleString()}</strong><span>{Number(summary.unbilled_units || 0).toLocaleString()} verified units</span></div>
          <div><small>Held bill value</small><strong>{money(summary.held_bill_value)}</strong><span>{Number(summary.held_bill_count || 0).toLocaleString()} generated bills not payable</span></div>
          <div><small>Missing readings</small><strong>{Number(summary.missing_reading_count || 0).toLocaleString()}</strong><span>Accounts without a period reading</span></div>
          <div><small>Recovery queue</small><strong>{Number(summary.actionable_count || 0).toLocaleString()}</strong><span>Accounts requiring a next step</span></div>
        </div>

        <div className="revenue-assurance-toolbar">
          <div role="group" aria-label="Revenue assurance filter">
            {[
              ["all", `All ${Number(summary.actionable_count || 0).toLocaleString()}`],
              ["unbilled_consumption", `Unbilled ${Number(summary.unbilled_consumption_count || 0).toLocaleString()}`],
              ["held_bill", `Held ${Number(summary.held_bill_count || 0).toLocaleString()}`],
              ["missing_reading", `Missing ${Number(summary.missing_reading_count || 0).toLocaleString()}`]
            ].map(([value, label]) => <button className={filter === value ? "active" : ""} type="button" key={value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          <span>{assurance.period?.name || "Billing period"}</span>
        </div>
        <TableControls table={table} label="assurance items" placeholder="Find an account, meter, or bill" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Issue</th><th>Account</th><th>Evidence</th><th>Recovery status</th><th>Action</th></tr></thead>
            <tbody>
              {table.visibleRows.length ? table.visibleRows.map((row) => {
                const meta = issueMeta[row.issue_type] || issueMeta.missing_reading;
                const Icon = meta.Icon;
                return <tr key={`${row.issue_type}-${row.customer_id}-${row.reading_id || row.bill_id || row.meter_id}`}>
                  <td><span className="revenue-assurance-issue"><Icon size={15} /><strong>{meta.label}</strong></span><StatusBadge status={meta.status} /></td>
                  <td><strong>{row.customer_name}</strong><small>{row.acc_number} | {row.zone_name || "Unzoned"}</small></td>
                  <td>{row.issue_type === "unbilled_consumption" ? <><strong>{Number(row.units_used || 0).toLocaleString()} units</strong><small>{row.meter_number} | reading {row.reading_value}</small></> : row.issue_type === "held_bill" ? <><strong>{row.bill_number || "Held bill"}</strong><small>{money(row.amount)} | {Number(row.units_used || 0).toLocaleString()} units</small></> : <><strong>{row.meter_number || "Active meter"}</strong><small>No period reading recorded</small></>}</td>
                  <td><small>{row.issue_type === "unbilled_consumption" ? "Reading exists but no bill links to it." : row.issue_type === "held_bill" ? "Bill exists but is not yet payable." : "Capture the reading before bill generation."}</small></td>
                  <td><button type="button" onClick={() => openIssue(row)}>{row.issue_type === "held_bill" ? "Review bill" : "Review reading"}<ArrowRight size={15} /></button></td>
                </tr>;
              }) : <EmptyTableRow title="No assurance items match this view" detail="This period has no matching revenue-recovery exceptions." colSpan={5} />}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}

export default RevenueAssurancePanel;
