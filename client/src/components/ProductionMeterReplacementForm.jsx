import { RotateCcw } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function ProductionMeterReplacementForm({ form, meterTypeLabels, meters, onChange, onSubmit }) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid production-meter-form"
      defaultOpen={Boolean(form.production_meter_id)}
      icon={<RotateCcw size={18} />}
      onSubmit={onSubmit}
      summary={form.production_meter_id ? "Replacement in progress" : "Select active source meter"}
      title="Replace Source Meter"
    >
      <label>
        Existing source meter
        <select value={form.production_meter_id} onChange={(event) => onChange("production_meter_id", event.target.value)} required>
          <option value="">Select active meter</option>
          {meters.filter((meter) => meter.status === "active").map((meter) => <option key={meter.id} value={meter.id}>{meter.meter_number} - {meter.customer_name || meter.name || meterTypeLabels[meter.meter_type]}</option>)}
        </select>
      </label>
      <label>Replacement date<input value={form.event_date} onChange={(event) => onChange("event_date", event.target.value)} type="date" required /></label>
      <label>Old final reading<input value={form.old_final_reading} onChange={(event) => onChange("old_final_reading", event.target.value)} type="number" min="0" step="0.01" required /></label>
      <label>New meter number<input value={form.new_meter_number} onChange={(event) => onChange("new_meter_number", event.target.value)} required /></label>
      <label>New initial reading<input value={form.new_initial_reading} onChange={(event) => onChange("new_initial_reading", event.target.value)} type="number" min="0" step="0.01" required /></label>
      <label>Reason<textarea value={form.reason} onChange={(event) => onChange("reason", event.target.value)} rows="2" /></label>
      <button className="primary-button" type="submit"><RotateCcw size={17} />Record replacement</button>
    </CollapsibleSection>
  );
}
