import { Download, FileText, Plus, Save, Trash2 } from "lucide-react";
import AuditPanel from "./AuditPanel";
import EntryPanel from "./EntryPanel";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

function CustomerManagementWorkspace({
  accountPositionLabel,
  busy,
  canWrite,
  customerTable,
  deliveryFilter,
  deliveryPreferenceReason,
  editingId,
  entryOpen,
  form,
  money,
  moneyAbs,
  onCloseAccount,
  onDeliveryChannelChange,
  onEdit,
  onEntryOpenChange,
  onDeliveryFilterChange,
  onDeliveryPreferenceReasonChange,
  onExport,
  onFieldChange,
  onOpenServiceCharges,
  onOpenStatement,
  onRemove,
  onSelectCustomer,
  onStatusChange,
  onSubmit,
  onZoneChange,
  rates,
  statusFilter,
  userRole,
  zoneFilter,
  zones
}) {
  const hasEnabledDeliveryChannel = Boolean(
    form.email_delivery_enabled || form.sms_delivery_enabled || form.whatsapp_delivery_enabled
  );

  return (
    <section className="workspace-grid entry-led-workspace customer-register-workspace">
      {canWrite ? (
        <EntryPanel
          actionLabel="Add customer"
          className="customer-entry-panel"
          disabled={busy}
          onOpenChange={onEntryOpenChange}
          open={entryOpen}
          summary={editingId ? "Update account, billing, and delivery details" : "Create a billable customer account"}
          title={editingId ? "Edit customer account" : "Customer account entry"}
        >
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Name<input value={form.name} onChange={(event) => onFieldChange("name", event.target.value)} required /></label>
          <label>Phone<input value={form.phone} onChange={(event) => onFieldChange("phone", event.target.value)} /></label>
          <label>Email<input value={form.email} onChange={(event) => onFieldChange("email", event.target.value)} type="email" /></label>
          <label>
            Zone/location
            <select value={form.zone_id} onChange={(event) => onFieldChange("zone_id", event.target.value)} required>
              <option value="">Select zone/location</option>
              {zones.filter((zone) => zone.is_active || Number(zone.id) === Number(form.zone_id)).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
          <label>Account number<input value={form.acc_number} onChange={(event) => onFieldChange("acc_number", event.target.value)} required /></label>
          <label>
            Rate
            <select value={form.rate_id} onChange={(event) => onFieldChange("rate_id", event.target.value)} required>
              <option value="">Select rate</option>
              {rates.filter((rate) => rate.is_active || Number(rate.id) === Number(form.rate_id)).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} - {Number(rate.amount).toLocaleString()}</option>)}
            </select>
          </label>
          <label>Deposit amount<input value={form.deposit_amount} onChange={(event) => onFieldChange("deposit_amount", event.target.value)} type="number" min="0" /></label>
          <label className="checkbox-row"><input checked={Boolean(form.deposit_paid)} onChange={(event) => onFieldChange("deposit_paid", event.target.checked)} type="checkbox" />Deposit paid</label>
          <label>Opening balance<input value={form.opening_balance_amount} onChange={(event) => onFieldChange("opening_balance_amount", event.target.value)} type="number" step="0.01" /></label>
          <label>Opening balance date<input value={form.opening_balance_date} onChange={(event) => onFieldChange("opening_balance_date", event.target.value)} type="date" required={Number(form.opening_balance_amount || 0) !== 0} /></label>
          <label>
            Preferred delivery
            <select value={form.preferred_delivery_channel} onChange={(event) => onFieldChange("preferred_delivery_channel", event.target.value)}>
              <option value="email" disabled={hasEnabledDeliveryChannel && !form.email_delivery_enabled}>Email</option>
              <option value="sms" disabled={hasEnabledDeliveryChannel && !form.sms_delivery_enabled}>SMS</option>
              <option value="whatsapp" disabled={hasEnabledDeliveryChannel && !form.whatsapp_delivery_enabled}>WhatsApp</option>
            </select>
          </label>
          <label className="checkbox-row"><input checked={Boolean(form.email_delivery_enabled)} onChange={(event) => onDeliveryChannelChange("email", event.target.checked)} type="checkbox" />Email invoices</label>
          <label className="checkbox-row"><input checked={Boolean(form.sms_delivery_enabled)} onChange={(event) => onDeliveryChannelChange("sms", event.target.checked)} type="checkbox" />SMS invoices</label>
          <label className="checkbox-row"><input checked={Boolean(form.whatsapp_delivery_enabled)} onChange={(event) => onDeliveryChannelChange("whatsapp", event.target.checked)} type="checkbox" />WhatsApp invoices</label>
          {editingId ? <label>Delivery-preference change note<textarea value={deliveryPreferenceReason} onChange={(event) => onDeliveryPreferenceReasonChange(event.target.value)} maxLength={600} /></label> : null}
          {editingId ? <AuditPanel entityType="customer" entityId={editingId} title="Customer Audit" /> : null}
          <button className="primary-button" type="submit" disabled={busy}>{editingId ? <Save size={17} /> : <Plus size={17} />}{editingId ? "Save changes" : "Add customer"}</button>
        </form>
        </EntryPanel>
      ) : null}

      <div className="panel wide-panel register-panel customer-register-panel">
        <div className="panel-heading"><h3>Customer List</h3><button type="button" onClick={onExport}><Download size={16} />Export</button></div>
        <div className="table-toolbar">
          <label>Status<select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label>Zone<select value={zoneFilter} onChange={(event) => onZoneChange(event.target.value)}><option value="">All zones</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
          <label>Delivery<select value={deliveryFilter} onChange={(event) => onDeliveryFilterChange(event.target.value)}><option value="all">All delivery states</option><option value="ready">Ready</option><option value="needs_contact">Needs contact</option><option value="opted_out">Opted out</option></select></label>
        </div>
        <TableControls table={customerTable} label="customers" placeholder="Search customers" />
        <div className="table-wrap"><table className="mobile-record-table customer-record-table">
          <thead><tr><th>Name</th><th>Account</th><th>Location</th><th>Rate</th><th>Delivery</th><th>Deposit</th><th>Opening</th><th>Balance</th>{canWrite ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {customerTable.visibleRows.length ? customerTable.visibleRows.map((customer) => (
              <tr key={customer.id}>
                <td className="mobile-record-primary" data-label="Customer"><strong>{customer.name}</strong><small>{[customer.phone, customer.email].filter(Boolean).join(" | ")}</small></td>
                <td data-label="Account">{customer.acc_number}</td><td data-label="Location">{customer.zone_name || customer.location}</td>
                <td data-label="Rate"><strong>{customer.rate_name}</strong><small>{Number(customer.rate).toLocaleString()} | {customer.preferred_delivery_channel || "email"}</small></td>
                <td data-label="Delivery"><strong>{customer.delivery_state?.label || "-"}</strong><small>{customer.preferred_delivery_channel || "email"}</small></td>
                <td data-label="Deposit"><strong>{customer.deposit_paid ? "Paid" : "Not paid"}</strong><small>{Number(customer.deposit_amount || 0).toLocaleString()}</small></td>
                <td data-label="Opening"><strong>{money(customer.opening_balance_amount)}</strong><small>{customer.opening_balance_date ? new Date(customer.opening_balance_date).toLocaleDateString() : "-"}</small></td>
                <td data-label="Balance"><strong>{moneyAbs(customer.balance_due)}</strong><small>{accountPositionLabel(customer.balance_due)}</small></td>
                {canWrite ? <td className="row-actions mobile-record-actions" data-label="Actions">
                  <button type="button" onClick={() => onSelectCustomer(customer)}>View</button>
                  <button type="button" onClick={() => onEdit(customer)}>Edit</button>
                  <button type="button" onClick={() => onOpenStatement(customer)} title="Generate customer statement"><FileText size={15} />Statement</button>
                  <button type="button" onClick={() => onOpenServiceCharges(customer)} title="Manage customer service charges">Service Charges</button>
                  {userRole === "admin" ? <button className="danger-button" type="button" onClick={() => onRemove(customer)} title="Delete customer"><Trash2 size={15} /></button> : null}
                  {customer.status !== "inactive" ? <button type="button" onClick={() => onCloseAccount(customer)}>Close</button> : null}
                </td> : null}
              </tr>
            )) : <EmptyTableRow colSpan={canWrite ? 9 : 8} title="No customers found" detail="Add customers or adjust the filters." />}
          </tbody>
        </table></div>
      </div>
    </section>
  );
}

export default CustomerManagementWorkspace;
