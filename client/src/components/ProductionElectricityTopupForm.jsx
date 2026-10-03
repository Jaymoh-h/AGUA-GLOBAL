import { PlugZap, Save } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function ProductionElectricityTopupForm({ form, onChange, onSubmit, topupCount }) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid production-topup-form"
      icon={<PlugZap size={18} />}
      onSubmit={onSubmit}
      summary={`${topupCount.toLocaleString()} top-up(s)`}
      title="Electricity Top-Up"
    >
      <label>Date<input value={form.topup_date} onChange={(event) => onChange("topup_date", event.target.value)} type="date" required /></label>
      <label>kWh units<input value={form.kwh_units} onChange={(event) => onChange("kwh_units", event.target.value)} type="number" min="0.01" step="0.01" required /></label>
      <label>Total cost<input value={form.total_cost} onChange={(event) => onChange("total_cost", event.target.value)} type="number" min="0.01" step="0.01" required /></label>
      <label>Reference<input value={form.reference} onChange={(event) => onChange("reference", event.target.value)} /></label>
      <label>Notes<textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows="2" /></label>
      <button className="primary-button" type="submit"><Save size={17} />Record top-up</button>
    </CollapsibleSection>
  );
}
