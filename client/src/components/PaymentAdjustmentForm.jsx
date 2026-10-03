import CollapsibleSection from "./CollapsibleSection";

function PaymentAdjustmentForm({ customers, defaultOpen, form, money, onFieldChange, onSubmit, pendingCount, pendingTotal }) {
  return (
    <CollapsibleSection
      as="form"
      className="form-grid"
      defaultOpen={defaultOpen}
      onSubmit={onSubmit}
      summary={`${pendingCount.toLocaleString()} pending | ${money(pendingTotal)}`}
      title="Manual Credit/Debit"
    >
      <p className="muted">Accountants submit requests; admin approval posts the credit or debit.</p>
      <label>
        Customer
        <select value={form.customer_id} onChange={(event) => onFieldChange("customer_id", event.target.value)} required>
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.acc_number} - {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select value={form.adjustment_type} onChange={(event) => onFieldChange("adjustment_type", event.target.value)}>
          <option value="credit">Credit customer</option>
          <option value="debit">Debit customer</option>
        </select>
      </label>
      <label>
        Amount
        <input value={form.amount} onChange={(event) => onFieldChange("amount", event.target.value)} type="number" min="1" required />
      </label>
      <label>
        Date
        <input value={form.adjustment_date} onChange={(event) => onFieldChange("adjustment_date", event.target.value)} type="date" />
      </label>
      <label>
        Reason
        <textarea value={form.reason} onChange={(event) => onFieldChange("reason", event.target.value)} rows="3" required />
      </label>
      <button className="primary-button" type="submit">
        Submit for approval
      </button>
    </CollapsibleSection>
  );
}

export default PaymentAdjustmentForm;
