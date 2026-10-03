import { ArrowUpRight, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "./EmptyState";
import FocusNotice from "./FocusNotice";
import StatusBadge from "./StatusBadge";
import TableControls, { useTableControls } from "./TableControls";
import { api } from "../services/api";
import useScopedDraft from "../utils/useScopedDraft";

const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");
const labelForDocument = (value) => String(value || "document").replace(/_/g, " ");
const createDeliveryExceptionFilters = () => ({ status: "all", days: 30 });

const deliveryCause = (row) => {
  const detail = String(row.error_message || "").toLowerCase();
  if (/not configured|provider is not configured|missing provider/.test(detail)) return "Provider setup";
  if (/delivery is disabled|delivery disabled|opted out/.test(detail)) return "Delivery opted out";
  if (/missing|does not have|invalid (email|phone|recipient)|recipient.*invalid/.test(detail)) return "Recipient details";
  if (row.status === "failed") return "Provider failure";
  return "Review required";
};

const retryPolicyFor = (row) => {
  const cause = deliveryCause(row);
  if (cause === "Delivery opted out") return "No retry until the customer changes this channel preference.";
  if (cause === "Recipient details") return "Correct the contact details, then send manually.";
  if (cause === "Provider setup") return "Restore provider configuration, then send manually.";
  if (cause === "Provider failure") return "Check the provider result, then send one deliberate retry.";
  return "Review the attempt before any manual resend.";
};

const recoveryTargetFor = (row) => {
  const customerId = Number(row.customer_id);
  const documentId = Number(row.document_id);
  if (deliveryCause(row) === "Delivery opted out") return null;
  if (row.document_type === "bill" && documentId) {
    return { label: "Open bill", target: { page: "bills", focus: "bill_detail", bill_id: documentId, label: "Bill delivery" } };
  }
  if (row.document_type === "receipt" && documentId) {
    return { label: "Open receipt", target: { page: "payments", focus: "receipt_detail", payment_id: documentId, label: "Receipt delivery" } };
  }
  if (row.document_type === "payment_arrangement" && customerId) {
    return { label: "Prepare reminder", target: { page: "communications", focus: "payment_plan_follow_up", customer_id: customerId, label: "Payment-plan reminder" } };
  }
  if (row.document_type === "standing_order" && customerId) {
    return { label: "Prepare reminder", target: { page: "communications", focus: "standing_order_follow_up", customer_id: customerId, label: "Standing-order reminder" } };
  }
  if (row.document_type === "disconnection_warning" && customerId) {
    return { label: "Review warning", target: { page: "communications", focus: "disconnection_warning", customer_id: customerId, label: "Formal warning" } };
  }
  return null;
};

function DeliveryExceptionPanel({ user, onClearNavigationIntent, onNavigate }) {
  const [filters, setFilters] = useScopedDraft(
    user,
    "delivery-exception-filters",
    createDeliveryExceptionFilters,
    { storage: "local" }
  );
  const status = filters.status || "all";
  const days = [7, 30, 90].includes(Number(filters.days)) ? Number(filters.days) : 30;
  const [payload, setPayload] = useState({ summary: {}, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tableStorageScope = `${user?.id || "anonymous"}:${user?.access_profile_id || "legacy"}`;

  const load = async (nextFilters = { status, days }) => {
    setLoading(true);
    setError("");
    try {
      setPayload(await api.communications.deliveryExceptions({ status: nextFilters.status, days: nextFilters.days, limit: 100 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = payload.rows || [];
  const table = useTableControls(rows, {
    pageSize: 15,
    storageKey: `delivery-exceptions:${tableStorageScope}`,
    searchFields: ["customer_name", "acc_number", "document_reference", "document_type", "channel", "recipient", "subject", "error_message"]
  });
  const summary = useMemo(() => payload.summary || {}, [payload.summary]);

  const changeStatus = (nextStatus) => {
    const nextFilters = { status: nextStatus, days };
    setFilters(nextFilters);
    load(nextFilters);
  };

  const changeDays = (nextDays) => {
    const nextFilters = { status, days: Number(nextDays) };
    setFilters(nextFilters);
    load(nextFilters);
  };

  return (
    <section className="page-stack delivery-exception-workspace">
      <FocusNotice
        title="Delivery exceptions"
        detail="Automatic retries are disabled. Review each outcome, correct contact or provider issues, then initiate at most one deliberate resend from the relevant workflow. Customer-disabled channels are not retryable until the preference changes."
        onClear={onClearNavigationIntent}
      />
      <section className="delivery-exception-summary" aria-label="Delivery exception totals">
        <div><span>Exceptions in {days} days</span><strong>{Number(summary.exception_count || 0).toLocaleString()}</strong></div>
        <div className={Number(summary.failed_count || 0) ? "needs-attention" : ""}><span>Failed</span><strong>{Number(summary.failed_count || 0).toLocaleString()}</strong></div>
        <div><span>Skipped</span><strong>{Number(summary.skipped_count || 0).toLocaleString()}</strong></div>
      </section>
      <section className="panel delivery-exception-panel">
        <div className="panel-heading">
          <div><h3>Delivery exception queue</h3><small>Latest {days} days, newest first</small></div>
          <button type="button" onClick={() => load()} disabled={loading}><RefreshCw size={14} />Refresh</button>
        </div>
        <div className="delivery-exception-toolbar">
          <label>
            Status
            <select value={status} onChange={(event) => changeStatus(event.target.value)} disabled={loading}>
              <option value="all">All exceptions</option>
              <option value="failed">Failed only</option>
              <option value="skipped">Skipped only</option>
            </select>
          </label>
          <label>
            Period
            <select value={days} onChange={(event) => changeDays(event.target.value)} disabled={loading}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <p>{error || (loading ? "Loading delivery attempts..." : "Open the customer account to correct contacts or review the document history.")}</p>
        </div>
        <TableControls table={table} label="delivery exceptions" placeholder="Search accounts, documents, contacts, or reasons" />
        <div className="table-wrap delivery-exception-table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Document</th><th>Channel</th><th>Recipient</th><th>Outcome</th><th>Cause</th><th>Retry policy</th><th>Provider detail</th><th>Logged</th><th>Next step</th></tr></thead>
            <tbody>
              {table.visibleRows.length ? table.visibleRows.map((row) => {
                const recoveryTarget = recoveryTargetFor(row);
                return <tr key={row.id}>
                  <td><strong>{row.customer_name || "Unknown customer"}</strong><small>{row.acc_number || "No account linked"}</small></td>
                  <td><strong>{row.document_reference || row.document_id}</strong><small>{labelForDocument(row.document_type)}</small></td>
                  <td><StatusBadge status={row.channel} /></td>
                  <td>{row.recipient || "-"}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><StatusBadge status={deliveryCause(row).toLowerCase().replace(/\s+/g, "_")} /><small>{deliveryCause(row)}</small></td>
                  <td><small>{retryPolicyFor(row)}</small></td>
                  <td>{row.error_message || row.subject || "No provider reason recorded"}</td>
                  <td>{dateTime(row.created_at)}</td>
                  <td><div className="delivery-exception-actions">
                    {recoveryTarget ? <button type="button" onClick={() => onNavigate?.(recoveryTarget.target)}><ArrowUpRight size={14} />{recoveryTarget.label}</button> : null}
                    {row.customer_id ? <button type="button" onClick={() => onNavigate?.({ page: "customers", focus: "customer_360", customer_id: row.customer_id, label: "Customer 360" })}><ExternalLink size={14} />Open account</button> : null}
                    {!recoveryTarget && !row.customer_id ? <span className="muted">Unavailable</span> : null}
                  </div></td>
                </tr>;
              }) : <EmptyTableRow colSpan={10} title={loading ? "Loading delivery exceptions" : "No delivery exceptions found"} detail={loading ? "" : "No failed or skipped delivery attempts were recorded in the selected window."} />}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default DeliveryExceptionPanel;
