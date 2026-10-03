import { Eraser, Gauge, Send } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls, { useTableControls } from "./TableControls";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const percent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;

export default function SourceBillingReviewPanel({
  focusKey,
  meterRoleLabels,
  onClearDraft,
  onFieldChange,
  onMeterSelectionChange,
  onPromoteBill,
  onPromoteCompetingBill,
  onReviewRequest,
  onSubmit,
  restrictedSourcePeriod,
  sourceContext,
  sourceForm,
  sourceRequests,
  sourceWorkspace,
  userRole
}) {
  const selectedRow = sourceWorkspace.rows?.find(
    (row) => Number(row.customer_id) === Number(sourceForm.customer_id) && Number(row.source_meter_id) === Number(sourceForm.meter_id)
  );
  const hasSavedEntry = [
    sourceForm.customer_id,
    sourceForm.meter_id,
    sourceForm.reading_value,
    sourceForm.previous_reading_value,
    sourceForm.fallback_reason,
    sourceForm.correction_reason
  ].some((value) => String(value || "").trim());
  const missingRows = (sourceWorkspace.rows || []).filter((row) => !row.source_reading_id);
  const readingOptions = selectedRow?.source_reading_id && !missingRows.some(
    (row) => Number(row.customer_id) === Number(selectedRow.customer_id) && Number(row.source_meter_id) === Number(selectedRow.source_meter_id)
  )
    ? [selectedRow, ...missingRows]
    : missingRows;
  const focusedRequests = focusKey === "pending_source_billing"
    ? sourceRequests.filter((request) => request.status === "pending")
    : sourceRequests;
  const sourceRequestTable = useTableControls(focusedRequests, {
    searchFields: ["customer_name", "acc_number", "meter_number", "status", "reason", "bill_number", "requested_by_name"]
  });
  const sourceWorkspaceTable = useTableControls(sourceWorkspace.rows || [], {
    searchFields: [
      "customer_name",
      "acc_number",
      "zone_name",
      "source_meter_number",
      "client_meter_number",
      "source_billing_request_status",
      "source_bill_number",
      "client_bill_number",
      "variance_units",
      "variance_percent"
    ]
  });

  return (
    <>
      <CollapsibleSection
        defaultOpen={focusKey === "pending_source_billing"}
        actions={hasSavedEntry ? (
          <button type="button" onClick={onClearDraft} title="Clear saved source entry">
            <Eraser size={16} />
            Clear entry
          </button>
        ) : null}
        icon={<Gauge size={18} />}
        summary={`${sourceWorkspace?.period?.name || "Selected period"} | ${missingRows.length.toLocaleString()} missing${hasSavedEntry ? " | saved entry" : ""}`}
        title="Source Meter Reading Entry"
      >
        <p className="muted">
          {sourceWorkspace?.period?.name || "Selected period"} source meters. Normal route readings stay separate from this source-side workflow.
        </p>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Source period date
            <input value={sourceForm.reading_date} onChange={(event) => onFieldChange("reading_date", event.target.value)} type="date" required />
          </label>
          <label>
            Source customer / meter
            <select
              value={sourceForm.customer_id && sourceForm.meter_id ? `${sourceForm.customer_id}:${sourceForm.meter_id}` : ""}
              onChange={(event) => onMeterSelectionChange(event.target.value)}
              required
            >
              <option value="">Select missing source meter</option>
              {readingOptions.map((row) => (
                <option key={`${row.customer_id}-${row.source_meter_id}`} value={`${row.customer_id}:${row.source_meter_id}`}>
                  {row.acc_number} - {row.customer_name} ({row.source_meter_number})
                </option>
              ))}
            </select>
            {!readingOptions.length ? <small>No source meters are missing readings for this period.</small> : null}
          </label>
          <label>
            Previous source reading
            <input
              value={sourceContext?.previousReading?.reading_value ?? selectedRow?.previous_source_reading_value ?? ""}
              readOnly
              placeholder="No earlier source reading"
            />
          </label>
          <label>
            Source end reading
            <input
              value={sourceForm.reading_value}
              onChange={(event) => onFieldChange("reading_value", event.target.value)}
              type="number"
              min={sourceContext?.previousReading?.reading_value || selectedRow?.previous_source_reading_value || 0}
              required
            />
          </label>
          <label>
            Source review note
            <textarea value={sourceForm.fallback_reason} onChange={(event) => onFieldChange("fallback_reason", event.target.value)} rows="2" placeholder="Optional note for the billing review" />
          </label>
          <label>
            Correction reason
            <textarea
              value={sourceForm.correction_reason}
              onChange={(event) => onFieldChange("correction_reason", event.target.value)}
              rows="2"
              required={restrictedSourcePeriod}
              placeholder={restrictedSourcePeriod ? "Required for closed or locked periods" : ""}
            />
          </label>
          {selectedRow?.source_reading_id ? (
            <p className="muted">This source meter already has a reading for the selected period. Use the review table below, or edit the reading from Recent Readings.</p>
          ) : null}
          <button className="primary-button" type="submit" disabled={Boolean(selectedRow?.source_reading_id)}>
            <Send size={17} />
            Submit source reading
          </button>
        </form>
        <div className="reading-context">
          <div><span>Source meters</span><strong>{Number(sourceWorkspace.rows?.length || 0).toLocaleString()}</strong></div>
          <div><span>Missing source readings</span><strong>{Number(missingRows.length || 0).toLocaleString()}</strong></div>
          <div><span>Selected client reading</span><strong>{selectedRow?.client_reading_id ? "Captured" : "-"}</strong></div>
          <div><span>Selected source review</span><strong>{selectedRow?.source_billing_request_status || "-"}</strong></div>
        </div>
        <TableControls table={sourceWorkspaceTable} label="source meters" placeholder="Search source workspace" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Source Meter</th><th>Source Reading</th><th>Client Reading</th><th>Comparison</th><th>Bills</th><th>Action</th></tr></thead>
            <tbody>
              {sourceWorkspaceTable.visibleRows.length ? sourceWorkspaceTable.visibleRows.map((row) => (
                <tr key={`${row.customer_id}-${row.source_meter_id}`}>
                  <td><strong>{row.customer_name}</strong><small>{row.acc_number}{row.zone_name ? ` | ${row.zone_name}` : ""}</small></td>
                  <td>{row.source_meter_number}<small>{meterRoleLabels.source_backup}</small></td>
                  <td>
                    {row.source_reading_id ? Number(row.source_reading_value || 0).toLocaleString() : "Missing"}
                    <small>{row.source_reading_date?.slice(0, 10) || (row.previous_source_reading_value === null || row.previous_source_reading_value === undefined ? "No earlier source reading" : `Previous ${Number(row.previous_source_reading_value).toLocaleString()}`)}</small>
                  </td>
                  <td>{row.client_reading_id ? Number(row.client_reading_value || 0).toLocaleString() : "Not captured"}<small>{row.client_meter_number || row.client_reading_date?.slice(0, 10) || ""}</small></td>
                  <td>
                    <strong>{row.variance_units === null || row.variance_units === undefined ? "-" : Number(row.variance_units || 0).toLocaleString()}</strong>
                    <small>Primary {Number(row.client_units_used || 0).toLocaleString()} | Source {Number(row.source_units_used || 0).toLocaleString()}</small>
                    <small>{row.variance_percent === null || row.variance_percent === undefined ? "Variance unavailable" : percent(row.variance_percent)}</small>
                  </td>
                  <td>
                    {row.source_bill_number ? <small>Source: {row.source_bill_number} | {row.source_bill_pay_status} | {money(row.source_bill_total)}</small> : <small>Source: none</small>}
                    {row.client_bill_number ? <small>Client: {row.client_bill_number} | {row.client_bill_pay_status} | {money(row.client_bill_total)}</small> : <small>Client: none</small>}
                  </td>
                  <td><button type="button" onClick={() => onMeterSelectionChange(`${row.customer_id}:${row.source_meter_id}`)}>{row.source_reading_id ? "Use meter" : "Enter reading"}</button></td>
                </tr>
              )) : <EmptyTableRow colSpan={7} title="No source meters found" detail="Customers with active source backup meters will appear here for source-side reading and bill review." />}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection defaultOpen={focusKey === "pending_source_billing"} icon={<Gauge size={18} />} summary={`${sourceRequestTable.filteredRows.length.toLocaleString()} record(s)`} title="Source Billing Review">
        <TableControls table={sourceRequestTable} label="source billing records" placeholder="Search source billing" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Meter</th><th>Period</th><th>Units</th><th>Amount</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {sourceRequestTable.visibleRows.length ? sourceRequestTable.visibleRows.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.customer_name}</strong><small>{request.acc_number}</small></td>
                  <td>{request.meter_number}<small>{meterRoleLabels[request.meter_role] || request.meter_role}</small></td>
                  <td>{request.billing_period_name || "-"}</td>
                  <td>{Number(request.units_used || 0).toLocaleString()}<small>{Number(request.previous_reading || 0).toLocaleString()} to {Number(request.current_reading || 0).toLocaleString()}</small></td>
                  <td>{money(request.amount)}</td>
                  <td>{request.reason}</td>
                  <td>
                    <span className={`status status-${request.status}`}>{request.status}</span>
                    <small>{request.bill_number ? `${request.bill_number} | ${request.bill_pay_status || "payable"}` : request.review_notes || request.requested_by_name || ""}</small>
                    {(request.competing_bills || []).map((bill) => <small key={bill.id}>{bill.bill_number}: {bill.bill_pay_status} | {money(bill.total_amount)}</small>)}
                  </td>
                  <td>
                    {request.status === "pending" && userRole === "admin" ? <div className="row-actions"><button type="button" onClick={() => onReviewRequest(request, "approve")}>Approve</button><button type="button" onClick={() => onReviewRequest(request, "reject")}>Reject</button></div>
                      : request.status === "approved" && userRole === "admin" ? <div className="row-actions">
                        {request.bill_id && request.bill_pay_status !== "payable" ? <button type="button" onClick={() => onPromoteBill(request.bill_id, request.bill_number || "Source bill")}>Promote source</button> : null}
                        {(request.competing_bills || []).some((bill) => bill.bill_pay_status !== "payable") ? <button type="button" onClick={() => onPromoteCompetingBill(request)}>Promote client</button> : null}
                      </div> : "-"}
                  </td>
                </tr>
              )) : <EmptyTableRow colSpan={8} title="No source billing records" detail="Source-side fallback bills and promotion choices will appear here." />}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </>
  );
}
