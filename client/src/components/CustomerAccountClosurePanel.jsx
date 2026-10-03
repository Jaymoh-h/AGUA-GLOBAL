function CustomerAccountClosurePanel({
  canWrite,
  customer,
  customers,
  busy,
  form,
  onCancel,
  onCloseAccount,
  onFieldChange
}) {
  if (!canWrite || !customer) return null;

  return (
    <section className="panel full-span form-grid">
      <div className="panel-heading">
        <div>
          <h3>Close Account</h3>
          <p className="muted">{customer.acc_number} - {customer.name}</p>
        </div>
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      <label>
        Settlement date
        <input value={form.settlement_date} onChange={(event) => onFieldChange("settlement_date", event.target.value)} type="date" disabled={busy} />
      </label>
      <label className="checkbox-row">
        <input checked={Boolean(form.apply_deposit)} onChange={(event) => onFieldChange("apply_deposit", event.target.checked)} type="checkbox" disabled={busy} />
        Apply paid deposit to outstanding bills first
      </label>
      {form.apply_deposit ? (
        <>
          <label>
            Remaining deposit
            <select value={form.deposit_remainder_action} onChange={(event) => onFieldChange("deposit_remainder_action", event.target.value)} disabled={busy}>
              <option value="refund">Refund as expense</option>
              <option value="transfer">Transfer to another customer</option>
              <option value="forfeit">Forfeit</option>
            </select>
          </label>
          {form.deposit_remainder_action === "transfer" ? (
            <label>
              Transfer to
              <select value={form.transfer_customer_id} onChange={(event) => onFieldChange("transfer_customer_id", event.target.value)} disabled={busy}>
                <option value="">Select customer</option>
                {customers
                  .filter((candidate) => Number(candidate.id) !== Number(customer.id))
                  .map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.acc_number} - {candidate.name}</option>)}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <label>
        Notes
        <textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} rows="3" placeholder="Reason for account closure" disabled={busy} />
      </label>
      <button className="primary-button" type="button" onClick={onCloseAccount} disabled={busy}>Review account closure</button>
    </section>
  );
}

export default CustomerAccountClosurePanel;
