import { Banknote, CheckCircle2, Download, FileText, Lock, Save, Send } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import StatusBadge from "./StatusBadge";
import TableControls from "./TableControls";

function PayrollRunReviewPanel({
  lineDraft,
  lineTable,
  money,
  onDownloadPayslip,
  onEditLine,
  onExport,
  onSaveLine,
  onSetLineDraft,
  onStatusChange,
  selectedRun,
  summary,
  userRole
}) {
  const dateOnly = (value) => value?.slice(0, 10) || "-";
  const label = (value) => String(value || "-").replaceAll("_", " ");
  const editable = ["draft", "pending_approval"].includes(selectedRun?.status);
  const draftNetAmount = Number(lineDraft?.gross_amount || 0) + Number(lineDraft?.additions || 0) - Number(lineDraft?.deductions || 0);

  return (
    <>
      <CollapsibleSection
        actions={
          <>
            <button type="button" onClick={onExport} disabled={!selectedRun}>
              <Download size={16} />
              Export
            </button>
            <button type="button" onClick={() => onStatusChange("pending_approval")} disabled={!selectedRun || selectedRun.status !== "draft"}>
              <Send size={16} />
              Submit
            </button>
            {userRole === "admin" ? (
              <button type="button" onClick={() => onStatusChange("approved")} disabled={!selectedRun || !["draft", "pending_approval"].includes(selectedRun.status)}>
                <CheckCircle2 size={16} />
                Approve
              </button>
            ) : null}
            <button type="button" onClick={() => onStatusChange("paid")} disabled={!selectedRun || selectedRun.status !== "approved"}>
              <Banknote size={16} />
              Paid
            </button>
            <button type="button" onClick={() => onStatusChange("locked")} disabled={!selectedRun || selectedRun.status !== "paid"}>
              <Lock size={16} />
              Lock
            </button>
          </>
        }
        className="payroll-review-panel"
        defaultOpen
        summary={selectedRun ? `${label(selectedRun.status)} | ${money(summary.payable)} payable` : "Select a pay run"}
        title={selectedRun ? selectedRun.name : "Payroll Review"}
      >
        {selectedRun ? (
          <div className="reading-context payroll-run-context">
            <div><span>Period</span><strong>{dateOnly(selectedRun.period_start)} to {dateOnly(selectedRun.period_end)}</strong></div>
            <div><span>Status</span><strong>{label(selectedRun.status)}</strong></div>
            <div><span>Created by</span><strong>{selectedRun.created_by_name || "-"}</strong></div>
            <div><span>Approved by</span><strong>{selectedRun.approved_by_name || "-"}</strong></div>
          </div>
        ) : null}

        <TableControls table={lineTable} label="lines" placeholder="Search payroll lines" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payee</th><th>Type</th><th>Source</th><th>Basis</th><th>Units</th><th>Gross</th><th>Additions</th><th>Deductions</th><th>Net</th><th>Expense</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lineTable.visibleRows.length ? lineTable.visibleRows.map((line) => (
                <tr key={line.id}>
                  <td><strong>{line.name}</strong><small>{line.code || line.title || "-"}</small></td>
                  <td>{label(line.payee_type)}</td>
                  <td>{line.source_type === "manual_period" ? "Period" : "Recurring"}</td>
                  <td>{label(line.rate_basis)}</td>
                  <td>{Number(line.source_units || 0).toLocaleString()}</td>
                  <td>{money(line.gross_amount)}</td>
                  <td>{money(line.additions)}</td>
                  <td>{money(line.deductions)}</td>
                  <td>{money(line.net_amount)}</td>
                  <td>{line.expense_id ? `Expense #${line.expense_id}` : "-"}{line.expense_reference ? <small>{line.expense_reference}</small> : null}</td>
                  <td><StatusBadge status={line.status} /></td>
                  <td>
                    <button type="button" onClick={() => onEditLine(line)} disabled={!editable}>Edit</button>
                    <button type="button" onClick={() => onDownloadPayslip(line)}><FileText size={15} />Payslip</button>
                  </td>
                </tr>
              )) : <EmptyTableRow colSpan={12} title="No payroll lines found" detail="Create or open a payroll run." />}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {lineDraft ? (
        <CollapsibleSection
          as="form"
          className="form-grid payroll-line-editor"
          defaultOpen
          icon={<Save size={18} />}
          onSubmit={onSaveLine}
          summary={`${money(draftNetAmount)} net`}
          title={`Edit ${lineDraft.name}`}
        >
          <label>Units<input value={lineDraft.source_units} onChange={(event) => onSetLineDraft((current) => ({ ...current, source_units: event.target.value }))} type="number" min="0" /></label>
          <label>Gross<input value={lineDraft.gross_amount} onChange={(event) => onSetLineDraft((current) => ({ ...current, gross_amount: event.target.value }))} type="number" min="0" /></label>
          <label>Additions<input value={lineDraft.additions} onChange={(event) => onSetLineDraft((current) => ({ ...current, additions: event.target.value }))} type="number" min="0" /></label>
          <label>Deductions<input value={lineDraft.deductions} onChange={(event) => onSetLineDraft((current) => ({ ...current, deductions: event.target.value }))} type="number" min="0" /></label>
          <label>Notes<textarea value={lineDraft.notes} onChange={(event) => onSetLineDraft((current) => ({ ...current, notes: event.target.value }))} rows="2" /></label>
          <button className="primary-button" type="submit"><Save size={17} />Save line</button>
        </CollapsibleSection>
      ) : null}
    </>
  );
}

export default PayrollRunReviewPanel;
