import { RotateCcw } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";

function MpesaCallbackControl({ filters, integration, events = [], onFiltersChange, onRefresh, money }) {
  const rejectedEvents = events.filter((event) => event.status === "rejected");
  const postedEvents = events.filter((event) => event.status === "posted");
  const duplicateEvents = events.filter((event) => event.status === "duplicate");
  const postedTotal = postedEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0);

  return (
    <CollapsibleSection
      actions={
        <button type="button" onClick={onRefresh} title="Refresh M-Pesa callback activity">
          <RotateCcw size={16} />
          Refresh
        </button>
      }
      className="mpesa-callback-panel"
      defaultOpen={Boolean(integration?.enabled || rejectedEvents.length)}
      summary={
        integration?.enabled
          ? `${postedEvents.length.toLocaleString()} posted | ${rejectedEvents.length.toLocaleString()} need review`
          : "Statement reconciliation active"
      }
      title="M-Pesa Callback Control"
    >
      <div className="mpesa-callback-summary">
        <div>
          <span>Direct receipt posting</span>
          <strong>{integration?.enabled ? "Enabled" : "Not enabled"}</strong>
          <small>{integration?.enabled ? "Shared-token callback is guarded" : "Use the M-Pesa statement workflow"}</small>
        </div>
        <div>
          <span>Paybill configuration</span>
          <strong>{integration?.paybill_configured ? "Ready" : "Needs setup"}</strong>
          <small>{integration?.paybill_configured ? "Shortcode is checked before posting" : "Set the business paybill before enabling callbacks"}</small>
        </div>
        <div>
          <span>Rejected callbacks</span>
          <strong>{rejectedEvents.length.toLocaleString()}</strong>
          <small>Shown callback attempts only</small>
        </div>
        <div>
          <span>Posted value</span>
          <strong>{money(postedTotal)}</strong>
          <small>{duplicateEvents.length.toLocaleString()} duplicate notification(s)</small>
        </div>
      </div>
      <div className="mpesa-callback-filters">
        <label>
          Outcome
          <select value={filters?.status || ""} onChange={(event) => onFiltersChange("status", event.target.value)}>
            <option value="">All outcomes</option>
            <option value="rejected">Rejected only</option>
            <option value="posted">Posted only</option>
            <option value="duplicate">Duplicates only</option>
          </select>
        </label>
        <label>
          Recent attempts
          <select value={filters?.limit || "20"} onChange={(event) => onFiltersChange("limit", event.target.value)}>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <p className="muted">Callback outcomes confirm receipt posting only. Reconcile provider settlement separately from the M-Pesa statement.</p>
      </div>
      {events.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Outcome</th>
                <th>Transaction</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td><span className={`status status-${event.status}`}>{event.status}</span></td>
                  <td>{event.transaction_id || "-"}</td>
                  <td>{event.account_number || "-"}</td>
                  <td>{event.amount === null || event.amount === undefined ? "-" : money(event.amount)}</td>
                  <td>{event.failure_reason || event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No authenticated M-Pesa callback attempts have been recorded. Statement reconciliation remains available for controlled posting.</p>
      )}
    </CollapsibleSection>
  );
}

export default MpesaCallbackControl;
