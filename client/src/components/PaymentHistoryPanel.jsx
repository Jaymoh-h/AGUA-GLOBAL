import { CircleDollarSign, Download } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

function PaymentHistoryPanel({
  channelFilter,
  dateFromFilter,
  dateToFilter,
  defaultOpen,
  historyTotal,
  historyQuickView,
  label,
  loading,
  loadingReceipt,
  money,
  onChannelFilterChange,
  onDateFromFilterChange,
  onDateToFilterChange,
  onEdit,
  onEmail,
  onExport,
  onOpenReceipt,
  onQuickView,
  onSms,
  onVoid,
  table
}) {
  return (
    <CollapsibleSection
      actions={<button type="button" onClick={onExport}><Download size={16} />Export</button>}
      defaultOpen={defaultOpen}
      icon={<CircleDollarSign size={18} />}
      summary={`${table.total.toLocaleString()} payment(s) | ${money(historyTotal)}`}
      title="Payment History"
    >
      <div className="payment-history-quick-views" role="group" aria-label="Payment history quick views">
        {[
          ["today", "Today"],
          ["yesterday", "Yesterday"],
          ["week_to_date", "Week to date"],
          ["bank_today", "Bank today"],
          ["mpesa_today", "M-Pesa today"],
          ["all", "All history"]
        ].map(([key, viewLabel]) => (
          <button
            key={key}
            className={historyQuickView === key ? "active" : ""}
            type="button"
            aria-pressed={historyQuickView === key}
            onClick={() => onQuickView(key)}
          >
            {viewLabel}
          </button>
        ))}
      </div>
      <div className="table-toolbar">
        <label>
          Channel
          <select value={channelFilter} onChange={(event) => onChannelFilterChange(event.target.value)}>
            <option value="">All channels</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="mpesa_paybill">M-Pesa/paybill</option>
            <option value="manual_adjustment">Manual adjustment</option>
          </select>
        </label>
        <label>From<input value={dateFromFilter} onChange={(event) => onDateFromFilterChange(event.target.value)} type="date" /></label>
        <label>To<input value={dateToFilter} onChange={(event) => onDateToFilterChange(event.target.value)} type="date" /></label>
      </div>
      <TableControls table={table} label="payments" placeholder="Search payments" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th><th>Receipt</th><th>Amount</th><th>Date</th><th>Channel</th><th>Reference</th><th>Allocations</th><th>Credit</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleRows.length ? (
              table.visibleRows.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.customer_name}</strong><small>{payment.acc_number}</small>{payment.allocation_mode === "cross_account" ? <small>Split accounts: {payment.allocated_accounts || "-"}</small> : null}</td>
                  <td>{payment.receipt_number || "-"}</td>
                  <td>{money(payment.amount)}</td>
                  <td>{payment.payment_date?.slice(0, 10)}</td>
                  <td>{payment.payment_channel || payment.method}</td>
                  <td>{payment.external_reference || payment.reference || "-"}</td>
                  <td>{Number(payment.allocation_count || 0).toLocaleString()}<small>{payment.bill_numbers || ""}</small></td>
                  <td>{money(payment.unallocated_amount)}</td>
                  <td><span className={`status ${payment.status === "posted" ? "status-valid" : "status-rejected"}`}>{label(payment.status)}</span></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => onOpenReceipt(payment)} disabled={loadingReceipt}>Print</button>
                      <button type="button" onClick={() => onEmail(payment.id)}>Email</button>
                      <button type="button" onClick={() => onSms(payment.id)}>SMS</button>
                      {payment.status === "posted" ? <><button type="button" onClick={() => onEdit(payment)}>Edit</button><button type="button" onClick={() => onVoid(payment)}>Void</button></> : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyTableRow
                colSpan={10}
                title={loading ? "Loading payment history" : "No payments found"}
                detail={loading ? "Retrieving the selected payment register page." : "Record payments or adjust the filters."}
              />
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default PaymentHistoryPanel;
