import { FileUp, Save, X } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";

const optionalNumber = (value) => value === null || value === undefined || value === "" ? "-" : Number(value || 0).toLocaleString();
const dateOnly = (value) => value?.slice(0, 10) || "";
const previousContextLabels = {
  production_weekly_reading: "Production weekly",
  production_replacement_baseline: "Production replacement",
  linked_source_reading: "Linked source reading",
  linked_source_initial_reading: "Linked source initial",
  customer_source_fallback_reading: "Customer source fallback",
  customer_source_fallback_initial_reading: "Customer source initial fallback"
};

export default function ProductionWeeklyReadingsForm({ correctionReason, editingId, form, onCancelEdit, onCorrectionReasonChange, onFieldChange, onOpenChange, onRowChange, onSubmit, open, readingRows, weeklyContext }) {
  return (
    <CollapsibleSection
      actions={<>{editingId ? <button className="icon-button" type="button" onClick={onCancelEdit} title="Cancel correction"><X size={15} /></button> : null}<FileUp size={18} /></>}
      as="form"
      className="production-weekly-form"
      defaultOpen={open === undefined}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      summary={`${readingRows.length.toLocaleString()} meter row(s) | ${form.reading_date}`}
      title={editingId ? "Correct Weekly Reading" : "Weekly Monday Readings"}
    >
      <div className="form-grid">
        <label>Reading date<input value={form.reading_date} onChange={(event) => onFieldChange("reading_date", event.target.value)} type="date" required /></label>
        <label>Previous kWh balance<input value={optionalNumber(weeklyContext?.previous_week?.prepaid_kwh_balance)} readOnly /><small>{weeklyContext?.previous_week?.reading_date ? `Recorded ${dateOnly(weeklyContext.previous_week.reading_date)}` : "No prior weekly balance"}</small></label>
        <label>Current prepaid kWh balance<input value={form.prepaid_kwh_balance} onChange={(event) => onFieldChange("prepaid_kwh_balance", event.target.value)} type="number" min="0" step="0.01" required /></label>
        <label>Notes<textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} rows="2" /></label>
        {editingId ? <label>Correction reason<textarea value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} rows="2" required /></label> : null}
      </div>
      <div className="table-wrap"><table><thead><tr><th>Meter</th><th>Previous</th><th>Reading</th><th>Notes</th></tr></thead><tbody>
        {readingRows.length ? readingRows.map((row, index) => (
          <tr key={row.production_meter_id}>
            <td>{row.meter_number}<small>{row.label}</small></td>
            <td>{optionalNumber(row.previous_reading_value)}<small>{row.previous_reading_date ? dateOnly(row.previous_reading_date) : "No prior reading"}</small>{row.previous_context_source ? <small>{previousContextLabels[row.previous_context_source] || row.previous_context_source}</small> : null}</td>
            <td><input value={row.reading_value} onChange={(event) => onRowChange(index, "reading_value", event.target.value)} type="number" min="0" step="0.01" /></td>
            <td><input value={row.notes} onChange={(event) => onRowChange(index, "notes", event.target.value)} /></td>
          </tr>
        )) : <EmptyTableRow colSpan={4} title="No production meters" detail="Register production meters before entering weekly readings." />}
      </tbody></table></div>
      <button className="primary-button" type="submit" disabled={!readingRows.length}><Save size={17} />{editingId ? "Save correction" : "Save weekly readings"}</button>
    </CollapsibleSection>
  );
}
