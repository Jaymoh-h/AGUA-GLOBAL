import { Plus, WandSparkles } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import StatusBadge from "./StatusBadge";

function MonthlyBudgetControl({
  attentionCount,
  budgetForm,
  budgetMessage,
  budgetRows,
  budgetSaving,
  canManage,
  currentBudget,
  monthLabel,
  money,
  monthlyForecastBaseline,
  number,
  onApplyForecastBaseline,
  onChange,
  onSave
}) {
  return (
    <section className="panel screen-only monthly-budget-panel">
      <div className="panel-heading">
        <div><h3>Monthly budget control</h3><p className="muted">Compare recorded revenue, posted collections, and operating costs against approved monthly targets.</p></div>
        <StatusBadge status={attentionCount ? "review" : "ready"} />
      </div>
      <div className="monthly-budget-summary">
        <div><span>Revenue targets behind</span><strong>{number(attentionCount)}</strong></div>
        <div><span>Current revenue variance</span><strong className={Number(currentBudget?.revenue_variance || 0) < 0 ? "form-error" : ""}>{currentBudget ? money(currentBudget.revenue_variance) : "-"}</strong></div>
        <div><span>Current collection variance</span><strong className={Number(currentBudget?.collection_variance || 0) < 0 ? "form-error" : ""}>{currentBudget ? money(currentBudget.collection_variance) : "-"}</strong></div>
        <div><span>Targets recorded</span><strong>{number(budgetRows.length)}</strong></div>
      </div>
      {canManage ? (
        <CollapsibleSection
          as="form"
          className="monthly-budget-entry-panel"
          defaultOpen={false}
          icon={<Plus size={17} />}
          onSubmit={onSave}
          summary={currentBudget ? `${monthLabel(currentBudget.budget_month)} target available` : "Set an approved monthly target"}
          title="Set monthly budget"
        >
          <div className="monthly-budget-form form-grid">
            <label>Month<input type="month" value={budgetForm.budget_month} onChange={(event) => onChange("budget_month", event.target.value)} required /></label>
            <label>Revenue target<input type="number" min="0" step="0.01" value={budgetForm.revenue_target} onChange={(event) => onChange("revenue_target", event.target.value)} required /></label>
            <label>Collection target<input type="number" min="0" step="0.01" value={budgetForm.collection_target} onChange={(event) => onChange("collection_target", event.target.value)} required /></label>
            <label>Operating expense budget<input type="number" min="0" step="0.01" value={budgetForm.operating_expense_budget} onChange={(event) => onChange("operating_expense_budget", event.target.value)} required /></label>
            <label className="monthly-budget-notes">Notes<textarea rows="2" value={budgetForm.notes} onChange={(event) => onChange("notes", event.target.value)} placeholder="Basis, assumptions, or approval reference" /></label>
            <div className="monthly-budget-actions">
              <button type="button" onClick={onApplyForecastBaseline} disabled={!monthlyForecastBaseline || budgetSaving} title={monthlyForecastBaseline ? "Load forecast figures into the budget form" : "A forecast is available only for the current three-month outlook"}><WandSparkles size={15} />Use forecast baseline</button>
              <button className="primary-button" type="submit" disabled={budgetSaving}>{budgetSaving ? "Saving..." : "Save monthly budget"}</button>
            </div>
          </div>
        </CollapsibleSection>
      ) : <p className="muted monthly-budget-read-only">Monthly targets are maintained by an administrator or accountant. This view remains read-only for oversight.</p>}
      {canManage ? <p className="muted monthly-budget-baseline-note">Forecast baseline uses the disclosed 90-day outlook. It does not save or approve a budget.</p> : null}
      {budgetMessage ? <p className={budgetMessage === "Monthly budget saved." ? "form-success" : budgetMessage.startsWith("Forecast baseline") ? "form-note" : "form-error"}>{budgetMessage}</p> : null}
      <div className="table-wrap monthly-budget-table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Collections</th><th>Operating costs</th><th>Revenue status</th><th>Notes</th></tr></thead>
          <tbody>
            {budgetRows.map((row) => (
              <tr key={row.id}>
                <td><strong>{monthLabel(row.budget_month)}</strong><small>Updated by {row.updated_by_name || row.created_by_name || "-"}</small></td>
                <td><small>Target {money(row.revenue_target)}</small><strong className={Number(row.revenue_variance) < 0 ? "form-error" : ""}>{money(row.revenue_actual)} ({money(row.revenue_variance)})</strong></td>
                <td><small>Target {money(row.collection_target)}</small><strong className={Number(row.collection_variance) < 0 ? "form-error" : ""}>{money(row.collection_actual)} ({money(row.collection_variance)})</strong></td>
                <td><small>Budget {money(row.operating_expense_budget)}</small><strong className={Number(row.operating_expense_variance) < 0 ? "form-error" : ""}>{money(row.operating_expense_actual)} ({money(row.operating_expense_variance)})</strong></td>
                <td><StatusBadge status={row.revenue_status === "behind" ? "review" : row.revenue_status === "planned" ? "planned" : "ready"} /></td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))}
            {!budgetRows.length ? <EmptyTableRow colSpan={6} title="No records found" detail="This report has no rows for the current filters." /> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default MonthlyBudgetControl;
