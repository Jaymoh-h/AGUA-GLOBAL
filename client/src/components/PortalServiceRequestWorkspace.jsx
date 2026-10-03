import { Eye, LifeBuoy, Paperclip, Send, X } from "lucide-react";
import { EmptyTableRow } from "./EmptyState";
import SupportingDocumentsPanel from "./SupportingDocumentsPanel";
import StatusBadge from "./StatusBadge";
import TableControls from "./TableControls";

function PortalServiceRequestWorkspace({
  bills,
  billingDispute,
  children,
  connectionRequest,
  currentDate,
  customerId,
  date,
  label,
  money,
  onBillingDisputeChange,
  onCategoryChange,
  onCloseRequest,
  onConnectionChange,
  onPaymentPlanChange,
  onRequestFieldChange,
  onSelectRequest,
  onSubmit,
  openBalance,
  paymentPlanProposal,
  requestForm,
  saving,
  selectedRequest,
  table
}) {
  const isStructuredRequest = ["payment_plan", "billing_dispute", "connection"].includes(requestForm.category);

  return (
    <>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="panel-heading">
          <h3>Submit Request</h3>
          <LifeBuoy size={18} />
        </div>
        <label>
          Category
          <select value={requestForm.category} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="leak">Leak</option>
            <option value="meter_fault">Meter fault</option>
            <option value="no_water">No water</option>
            <option value="low_pressure">Low pressure</option>
            <option value="water_quality">Water quality</option>
            <option value="connection">Connection</option>
            <option value="billing_support">Billing support</option>
            <option value="billing_dispute">Billing dispute</option>
            <option value="payment_plan">Payment plan</option>
            <option value="other">Other</option>
          </select>
        </label>

        {requestForm.category === "payment_plan" ? (
          <>
            <div className="portal-request-notice">
              <strong>Propose a payment plan</strong>
              <span>{openBalance > 0 ? `Current amount due: ${money(openBalance)}. This is a request only; staff will review and confirm any plan.` : "Staff can review your request, but a payment plan can only be approved for an outstanding payable balance."}</span>
            </div>
            <div className="payment-plan-proposal-fields">
              <label>
                Proposed instalment
                <input value={paymentPlanProposal.installment_amount} onChange={(event) => onPaymentPlanChange("installment_amount", event.target.value)} type="number" min="0.01" step="0.01" placeholder="0.00" required />
              </label>
              <label>
                Frequency
                <select value={paymentPlanProposal.frequency} onChange={(event) => onPaymentPlanChange("frequency", event.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label>
                Preferred first payment
                <input value={paymentPlanProposal.preferred_first_due_date} onChange={(event) => onPaymentPlanChange("preferred_first_due_date", event.target.value)} type="date" min={currentDate} required />
              </label>
            </div>
          </>
        ) : null}

        {requestForm.category === "billing_dispute" ? (
          <>
            <div className="portal-request-notice">
              <strong>Request a bill review</strong>
              <span>Select the bill and the issue you noticed. Submitting a dispute does not pause payment, change the bill, or adjust your balance. Staff will review the evidence and respond through the normal account process.</span>
            </div>
            <div className="payment-plan-proposal-fields">
              <label>
                Bill to review
                <select value={billingDispute.bill_id} onChange={(event) => onBillingDisputeChange("bill_id", event.target.value)} required>
                  <option value="">Select a payable bill</option>
                  {bills.map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.bill_number || `Bill ${bill.id}`} | {date(bill.billing_month)} | {money(bill.balance_amount)} balance
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What needs review?
                <select value={billingDispute.reason} onChange={(event) => onBillingDisputeChange("reason", event.target.value)} required>
                  <option value="usage">Usage charge</option>
                  <option value="meter_reading">Meter reading</option>
                  <option value="payment">Payment not reflected</option>
                  <option value="tariff">Tariff or rate</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          </>
        ) : null}

        {requestForm.category === "connection" ? (
          <>
            <div className="portal-request-notice">
              <strong>Request a connection inspection</strong>
              <span>Submit the site details needed for a field review. This request does not create a new account, install a meter, apply a charge, or change your current service.</span>
            </div>
            <div className="connection-request-fields">
              <label>
                Request type
                <select value={connectionRequest.request_type} onChange={(event) => onConnectionChange("request_type", event.target.value)} required>
                  <option value="new_connection">New connection</option>
                  <option value="service_extension">Service extension</option>
                  <option value="reconnection">Reconnection</option>
                  <option value="relocation">Meter or service relocation</option>
                </select>
              </label>
              <label>
                Site or location
                <input value={connectionRequest.site_location} onChange={(event) => onConnectionChange("site_location", event.target.value)} maxLength={240} placeholder="Plot, estate, road, or village" required />
              </label>
              <label>
                Nearest landmark
                <input value={connectionRequest.landmark} onChange={(event) => onConnectionChange("landmark", event.target.value)} maxLength={180} placeholder="Optional landmark" />
              </label>
              <label>
                Preferred inspection date
                <input value={connectionRequest.preferred_inspection_date} onChange={(event) => onConnectionChange("preferred_inspection_date", event.target.value)} type="date" min={currentDate} />
              </label>
              <label>
                Site access contact
                <input value={connectionRequest.access_contact_name} onChange={(event) => onConnectionChange("access_contact_name", event.target.value)} maxLength={120} placeholder="Name, if different" />
              </label>
              <label>
                Access contact phone
                <input value={connectionRequest.access_contact_phone} onChange={(event) => onConnectionChange("access_contact_phone", event.target.value)} maxLength={40} inputMode="tel" placeholder="Optional phone" />
              </label>
              <label className="wide">
                Access notes
                <textarea value={connectionRequest.access_notes} onChange={(event) => onConnectionChange("access_notes", event.target.value)} rows="2" maxLength={600} placeholder="Gate, access hours, directions, or site constraints" />
              </label>
            </div>
          </>
        ) : null}

        <label>
          Priority
          <select value={requestForm.priority} onChange={(event) => onRequestFieldChange("priority", event.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          {isStructuredRequest ? "Supporting details" : "Details"}
          <textarea
            value={requestForm.description}
            onChange={(event) => onRequestFieldChange("description", event.target.value)}
            rows="4"
            maxLength={2000}
            placeholder={requestForm.category === "payment_plan" ? "Explain what has affected payment and any terms you want staff to consider." : requestForm.category === "billing_dispute" ? "Describe the difference you noticed, relevant dates, and any payment or meter evidence staff should check." : requestForm.category === "connection" ? "Describe the service need, access considerations, and any information that will help the inspection team." : "Describe the issue, relevant dates, account details, and any useful notes."}
            required
          />
        </label>
        <p className="muted">Requests are sent to the operations team and will appear in your request history.</p>
        <button className="primary-button" type="submit" disabled={saving}>
          <Send size={17} />
          Submit request
        </button>
      </form>

      {children}

      <div className="panel">
        <div className="panel-heading"><h3>Service Requests</h3></div>
        <TableControls table={table} label="requests" placeholder="Search requests" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Request</th><th>Category</th><th>Status</th><th>Reported</th><th className="screen-only">Actions</th></tr></thead>
            <tbody>
              {table.visibleRows.length ? table.visibleRows.map((request) => (
                <tr key={request.id}>
                  <td>{request.request_number || `Request ${request.id}`}<small>{request.title}</small></td>
                  <td>{label(request.category)}</td>
                  <td><StatusBadge status={request.status} /></td>
                  <td>{date(request.reported_at)}</td>
                  <td className="screen-only">
                    <div className="row-actions">
                      <button className="icon-button" type="button" title="View request details" onClick={() => onSelectRequest(request)}><Eye size={16} /></button>
                      {request.source === "customer_portal" ? <button className="icon-button" type="button" title="View supporting documents" onClick={() => onSelectRequest(request)}><Paperclip size={16} /></button> : null}
                    </div>
                  </td>
                </tr>
              )) : <EmptyTableRow colSpan={5} title="No service requests yet" detail="Use the request form above to report leaks, meter faults, or supply concerns." />}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRequest ? (
        <div className="panel">
          <div className="panel-heading">
            <div><h3>{selectedRequest.request_number || `Request ${selectedRequest.id}`}</h3><small>{label(selectedRequest.category)} request</small></div>
            <button className="icon-button" type="button" onClick={onCloseRequest} title="Close supporting documents"><X size={16} /></button>
          </div>
          <div className="portal-profile-grid portal-request-detail">
            <div><span>Status</span><strong><StatusBadge status={selectedRequest.status} /></strong></div>
            <div><span>Priority</span><strong>{label(selectedRequest.priority)}</strong></div>
            <div><span>Submitted</span><strong>{date(selectedRequest.reported_at)}</strong></div>
            <div><span>Target date</span><strong>{date(selectedRequest.target_date)}</strong></div>
            {selectedRequest.resolved_at ? <div><span>Resolved</span><strong>{date(selectedRequest.resolved_at)}</strong></div> : null}
          </div>
          {selectedRequest.request_metadata?.payment_plan_proposal ? (
            <div className="portal-profile-grid portal-request-detail">
              <div><span>Proposed instalment</span><strong>{money(selectedRequest.request_metadata.payment_plan_proposal.installment_amount)}</strong></div>
              <div><span>Requested frequency</span><strong>{label(selectedRequest.request_metadata.payment_plan_proposal.frequency)}</strong></div>
              <div><span>Preferred first payment</span><strong>{date(selectedRequest.request_metadata.payment_plan_proposal.preferred_first_due_date)}</strong></div>
            </div>
          ) : null}
          {selectedRequest.request_metadata?.billing_dispute ? (
            <div className="portal-profile-grid portal-request-detail">
              <div><span>Bill under review</span><strong>{selectedRequest.request_metadata.billing_dispute.bill_number || `Bill ${selectedRequest.request_metadata.billing_dispute.bill_id}`}</strong></div>
              <div><span>Billing month</span><strong>{date(selectedRequest.request_metadata.billing_dispute.billing_month)}</strong></div>
              <div><span>Bill balance when submitted</span><strong>{money(selectedRequest.request_metadata.billing_dispute.balance_amount)}</strong></div>
              <div><span>Review requested</span><strong>{label(selectedRequest.request_metadata.billing_dispute.reason)}</strong></div>
            </div>
          ) : null}
          {selectedRequest.request_metadata?.connection_request ? (
            <div className="portal-profile-grid portal-request-detail">
              <div><span>Request type</span><strong>{label(selectedRequest.request_metadata.connection_request.request_type)}</strong></div>
              <div><span>Site or location</span><strong>{selectedRequest.request_metadata.connection_request.site_location}</strong></div>
              {selectedRequest.request_metadata.connection_request.landmark ? <div><span>Landmark</span><strong>{selectedRequest.request_metadata.connection_request.landmark}</strong></div> : null}
              {selectedRequest.request_metadata.connection_request.preferred_inspection_date ? <div><span>Preferred inspection</span><strong>{date(selectedRequest.request_metadata.connection_request.preferred_inspection_date)}</strong></div> : null}
              {selectedRequest.request_metadata.connection_request.access_contact_name ? <div><span>Access contact</span><strong>{selectedRequest.request_metadata.connection_request.access_contact_name}</strong></div> : null}
              {selectedRequest.request_metadata.connection_request.access_contact_phone ? <div><span>Access phone</span><strong>{selectedRequest.request_metadata.connection_request.access_contact_phone}</strong></div> : null}
              {selectedRequest.request_metadata.connection_request.access_notes ? <div><span>Access notes</span><strong>{selectedRequest.request_metadata.connection_request.access_notes}</strong></div> : null}
            </div>
          ) : null}
          {selectedRequest.customer_resolution_summary ? <div className="portal-request-description"><span>Outcome from the service team</span><p>{selectedRequest.customer_resolution_summary}</p></div> : null}
          <div className="portal-request-description"><span>Your submitted details</span><p>{selectedRequest.description || "No description was recorded for this request."}</p></div>
          {selectedRequest.source === "customer_portal" ? <p className="muted">Attach a meter photo, receipt, or other supporting evidence below.</p> : null}
          <SupportingDocumentsPanel entityType="maintenance_request" entityId={selectedRequest.id} customerId={customerId} />
        </div>
      ) : null}
    </>
  );
}

export default PortalServiceRequestWorkspace;
