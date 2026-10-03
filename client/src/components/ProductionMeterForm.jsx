import { Gauge, Save, X } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function ProductionMeterForm({
  customerMeters,
  customers,
  editingMeterId,
  form,
  meters,
  onCancel,
  onChange,
  onSubmit,
  rates,
  zones
}) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid production-meter-form"
      defaultOpen={Boolean(editingMeterId)}
      icon={<Gauge size={18} />}
      key={editingMeterId || "new"}
      onSubmit={onSubmit}
      summary={`${meters.filter((meter) => meter.status === "active").length.toLocaleString()} active meter(s)`}
      title={editingMeterId ? "Edit Production Meter" : "Production Meter"}
    >
      <label>
        Type
        <select value={form.meter_type} onChange={(event) => onChange("meter_type", event.target.value)} disabled={Boolean(editingMeterId)}>
          <option value="shared_source">Shared source</option>
          <option value="customer_source">Customer source</option>
        </select>
      </label>
      <label>Meter number<input value={form.meter_number} onChange={(event) => onChange("meter_number", event.target.value)} disabled={Boolean(editingMeterId)} required /></label>
      <label>Display name<input value={form.name} onChange={(event) => onChange("name", event.target.value)} /></label>
      <label>
        Zone
        <select value={form.zone_id} onChange={(event) => onChange("zone_id", event.target.value)}>
          <option value="">Select zone</option>
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
      </label>
      {form.meter_type === "customer_source" ? (
        <>
          <label>
            Linked customer
            <select value={form.customer_id} onChange={(event) => onChange("customer_id", event.target.value)} disabled={Boolean(editingMeterId)} required>
              <option value="">Select customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.acc_number} - {customer.name}</option>)}
            </select>
          </label>
          <label>
            Linked source meter
            <select value={form.meter_id} onChange={(event) => onChange("meter_id", event.target.value)} required>
              <option value="">Select exact source meter</option>
              {customerMeters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meter_number}</option>)}
            </select>
            {form.customer_id && !customerMeters.length ? <small>No active source meter is registered for this customer.</small> : null}
          </label>
        </>
      ) : (
        <label>
          Default tariff
          <select value={form.rate_id} onChange={(event) => onChange("rate_id", event.target.value)} required>
            <option value="">Select tariff</option>
            {rates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}
          </select>
        </label>
      )}
      <label>Notes<textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows="2" /></label>
      {editingMeterId ? (
        <label>
          Status
          <select value={form.status} onChange={(event) => onChange("status", event.target.value)}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="faulty">Faulty</option>
          </select>
        </label>
      ) : null}
      <button className="primary-button" type="submit"><Save size={17} />{editingMeterId ? "Save meter" : "Register meter"}</button>
      {editingMeterId ? <button type="button" onClick={onCancel}><X size={16} />Cancel</button> : null}
    </CollapsibleSection>
  );
}
