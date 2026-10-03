import { Gauge, Save } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

export default function MeterRegistrationForm({ customers, form, onChange, onOpenChange, onSubmit, open }) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid reading-meter-registration-form"
      icon={<Gauge size={18} />}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      summary={`${customers.length.toLocaleString()} customer(s)`}
      title="Register Meter"
    >
      <label>
        Customer
        <select value={form.customer_id} onChange={(event) => onChange("customer_id", event.target.value)} required>
          <option value="">Select customer</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.acc_number} - {customer.name}</option>)}
        </select>
      </label>
      <label>
        Meter role
        <select value={form.meter_role} onChange={(event) => onChange("meter_role", event.target.value)}>
          <option value="source_backup">Source backup</option>
          <option value="client_billing">Client billing</option>
        </select>
      </label>
      <label>Meter number<input value={form.meter_number} onChange={(event) => onChange("meter_number", event.target.value)} required /></label>
      <label>Installed date<input value={form.installed_at} onChange={(event) => onChange("installed_at", event.target.value)} type="date" required /></label>
      <label>Initial reading<input value={form.initial_reading} onChange={(event) => onChange("initial_reading", event.target.value)} type="number" min="0" required /></label>
      <label>Notes<textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} rows="2" /></label>
      <button className="primary-button" type="submit"><Save size={17} />Register meter</button>
    </CollapsibleSection>
  );
}
