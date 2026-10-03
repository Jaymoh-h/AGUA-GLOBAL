import { Plus } from "lucide-react";
import { EmptyTableRow } from "./EmptyState";

function CustomerServiceChargesPanel({
  canWrite,
  busy,
  customer,
  form,
  loading,
  money,
  onCancel,
  onClose,
  onFieldChange,
  onSubmit,
  onWaive,
  charges,
  serviceChargeTypes,
  userRole
}) {
  if (!canWrite || !customer) return null;

  const typeLabel = (value) => serviceChargeTypes.find(([type]) => type === value)?.[1] || value;

  return (
    <section className="panel full-span form-grid">
      <div className="panel-heading">
        <div>
          <h3>Customer Service Charges</h3>
          <p className="muted">{customer.acc_number} - {customer.name}</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      <form className="form-grid nested-form" onSubmit={onSubmit}>
        <label>
          Charge type
          <select value={form.charge_type} onChange={(event) => onFieldChange("charge_type", event.target.value)}>
            {serviceChargeTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Amount<input value={form.amount} onChange={(event) => onFieldChange("amount", event.target.value)} type="number" min="0" step="0.01" required /></label>
        <label>Charge date<input value={form.charge_date} onChange={(event) => onFieldChange("charge_date", event.target.value)} type="date" required /></label>
        <label>Due date<input value={form.due_date} onChange={(event) => onFieldChange("due_date", event.target.value)} type="date" /></label>
        <label className="full-span">Description<input value={form.description} onChange={(event) => onFieldChange("description", event.target.value)} placeholder="Meter replacement fee, reconnection fee, inspection visit..." required /></label>
        <label className="full-span">Notes<textarea value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} rows="2" placeholder="Optional internal note" /></label>
        <button className="primary-button" type="submit" disabled={busy}><Plus size={17} />Post charge</button>
      </form>

      <div className="table-wrap full-span"><table>
        <thead><tr><th>Charge</th><th>Type</th><th>Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {charges.length ? charges.map((charge) => (
            <tr key={charge.id}>
              <td><strong>{charge.charge_number || `Charge ${charge.id}`}</strong><small>{charge.description}</small>{charge.bill_number ? <small>Bill {charge.bill_number}</small> : null}</td>
              <td>{typeLabel(charge.charge_type)}</td>
              <td>{new Date(charge.charge_date).toLocaleDateString()}<small>{charge.due_date ? `Due ${new Date(charge.due_date).toLocaleDateString()}` : "No due date"}</small></td>
              <td>{money(charge.amount)}</td><td>{money(charge.paid_amount)}</td><td>{money(charge.balance_amount)}</td>
              <td><span className={`status status-${charge.display_status || charge.status}`}>{String(charge.display_status || charge.status).replace("_", " ")}</span></td>
              <td className="row-actions">
                {charge.status === "payable" && Number(charge.paid_amount || 0) === 0 ? <>
                  <button type="button" onClick={() => onWaive(charge)} disabled={busy}>Waive</button>
                  {userRole === "admin" ? <button className="danger-button" type="button" onClick={() => onCancel(charge)} disabled={busy}>Cancel</button> : null}
                </> : <span className="muted">Locked</span>}
              </td>
            </tr>
          )) : <EmptyTableRow colSpan={8} title={loading ? "Loading service charges" : "No service charges"} detail="Customer service charges will appear here after they are posted." />}
        </tbody>
      </table></div>
    </section>
  );
}

export default CustomerServiceChargesPanel;
