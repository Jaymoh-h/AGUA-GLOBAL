import { Replace } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function MeterReplacementForm({ customers, form, meterRoleLabels, onChange, onOpenChange, onSubmit, open, replacementContext, restrictedPeriod }) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid reading-meter-replacement-form"
      defaultOpen={Boolean(replacementContext)}
      icon={<Replace size={18} />}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      summary={replacementContext?.activeMeter?.meter_number || "Select customer and meter"}
      title="Replace Meter"
    >
      <label>
        Customer
        <select value={form.customer_id} onChange={(event) => onChange("customer_id", event.target.value)} required>
          <option value="">Select customer</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.acc_number} - {customer.name}</option>)}
        </select>
      </label>
      {replacementContext?.availableMeters?.length ? (
        <label>
          Meter to replace
          <select value={form.old_meter_id} onChange={(event) => onChange("old_meter_id", event.target.value)} required>
            {replacementContext.availableMeters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meter_number} - {meterRoleLabels[meter.meter_role] || meter.meter_role}</option>)}
          </select>
        </label>
      ) : null}
      {replacementContext ? (
        <div className="reading-context">
          <div><span>Current meter</span><strong>{replacementContext.activeMeter?.meter_number || "-"}</strong></div>
          <div>
            <span>Latest reading</span>
            <strong>{replacementContext.previousReading ? Number(replacementContext.previousReading.reading_value).toLocaleString() : "No reading"}</strong>
            <small>{replacementContext.previousReading?.reading_date?.slice(0, 10) || "Record a final reading"}</small>
          </div>
          <div><span>Billing period</span><strong>{replacementContext.billingPeriod?.name}</strong><small>{replacementContext.billingPeriod?.status || "open"}</small></div>
        </div>
      ) : null}
      <label>Replacement date<input value={form.event_date} onChange={(event) => onChange("event_date", event.target.value)} type="date" required /></label>
      <label>Old final reading<input value={form.old_final_reading} onChange={(event) => onChange("old_final_reading", event.target.value)} type="number" min={replacementContext?.previousReading?.reading_value || 0} required /></label>
      <label>New meter number<input value={form.new_meter_number} onChange={(event) => onChange("new_meter_number", event.target.value)} required /></label>
      <label>New initial reading<input value={form.new_initial_reading} onChange={(event) => onChange("new_initial_reading", event.target.value)} type="number" min="0" required /></label>
      <label>
        Reason
        <textarea value={form.reason} onChange={(event) => onChange("reason", event.target.value)} rows="3" required={restrictedPeriod} placeholder={restrictedPeriod ? "Required for closed or locked periods" : ""} />
      </label>
      <button className="primary-button" type="submit"><Replace size={17} />Record replacement</button>
    </CollapsibleSection>
  );
}
