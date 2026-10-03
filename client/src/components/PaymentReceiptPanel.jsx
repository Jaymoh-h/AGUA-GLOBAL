import { CircleDollarSign, Mail, MessageSquare, Printer, X } from "lucide-react";
import AuditPanel from "./AuditPanel";
import DocumentPrintHeader from "./DocumentPrintHeader";
import { EmptyTableRow } from "./EmptyState";

function PaymentReceiptPanel({
  businessSettings,
  date,
  label,
  onClose,
  onEmail,
  onPrint,
  onRecordAnother,
  onSms,
  positionLabel,
  positionMoney,
  receipt,
  receiptMoney,
  receiptRef
}) {
  if (!receipt) return null;

  const payment = receipt.payment;

  return (
    <div className="panel print-surface receipt-print payment-receipt-print" ref={receiptRef}>
      <div className="receipt-actions screen-only">
        <button type="button" onClick={onRecordAnother}>
          <CircleDollarSign size={17} />
          Record another
        </button>
        <button type="button" onClick={onPrint}>
          <Printer size={17} />
          Print receipt
        </button>
        <button type="button" onClick={() => onEmail(payment.id)}>
          <Mail size={17} />
          Email receipt
        </button>
        <button type="button" onClick={() => onSms(payment.id)}>
          <MessageSquare size={17} />
          SMS receipt
        </button>
        <button type="button" onClick={onClose} title="Close receipt">
          <X size={17} />
          Close
        </button>
      </div>

      <DocumentPrintHeader
        businessSettings={businessSettings}
        dateLabel={date(payment.payment_date)}
        documentLabel="Receipt"
        documentNumber={payment.receipt_number || `RCPT-${payment.id}`}
      />

      <div className="receipt-title">
        <div>
          <span>Receipt</span>
          <strong>{payment.receipt_number || `RCPT-${payment.id}`}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{date(payment.payment_date)}</strong>
        </div>
      </div>

      <div className="receipt-info-grid">
        <div>
          <span>Received From</span>
          <strong>{payment.received_from || payment.customer_name}</strong>
        </div>
        <div>
          <span>Customer</span>
          <strong>{payment.customer_name}</strong>
          <small>{payment.acc_number}</small>
        </div>
        <div>
          <span>Channel</span>
          <strong>{label(payment.payment_channel || payment.method)}</strong>
        </div>
        <div>
          <span>Reference</span>
          <strong>{payment.external_reference || payment.reference || "-"}</strong>
        </div>
      </div>

      <table className="receipt-table">
        <thead>
          <tr>
            <th>Bill</th>
            <th>Account</th>
            <th>Billing Month</th>
            <th>Bill Total</th>
            <th>Allocated</th>
            <th>Bill Balance</th>
          </tr>
        </thead>
        <tbody>
          {receipt.allocations.length ? (
            receipt.allocations.map((allocation) => (
              <tr key={allocation.id}>
                <td>{allocation.bill_number || `Bill ${allocation.bill_id}`}</td>
                <td>{allocation.allocation_customer_name || payment.customer_name}<small>{allocation.allocation_acc_number || payment.acc_number}</small></td>
                <td>{date(allocation.billing_month)}</td>
                <td>{receiptMoney(allocation.bill_total)}</td>
                <td>{receiptMoney(allocation.amount)}</td>
                <td>{receiptMoney(allocation.balance_amount)}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="6">No open bills. Full amount stored as customer credit.</td></tr>
          )}
        </tbody>
      </table>

      <div className="receipt-total"><span>Total received</span><strong>{receiptMoney(payment.amount)}</strong></div>
      <div className="receipt-total muted-total"><span>Allocated to bills</span><strong>{receiptMoney(payment.total_allocated_amount)}</strong></div>
      <div className="receipt-total muted-total"><span>Customer credit</span><strong>{receiptMoney(payment.unallocated_amount)}</strong></div>
      <div className="receipt-total muted-total"><span>{positionLabel(receipt.customerBalance)} after receipt</span><strong>{positionMoney(receipt.customerBalance)}</strong></div>

      <div className="receipt-footer">
        {businessSettings?.paybill_number ? <p>Paybill: {businessSettings.paybill_number}</p> : null}
        {businessSettings?.till_number ? <p>Till: {businessSettings.till_number}</p> : null}
        {businessSettings?.receipt_footer_note ? <p>{businessSettings.receipt_footer_note}</p> : null}
        <small>Recorded by {payment.recorded_by_name || "-"}</small>
      </div>
      <div className="screen-only">
        <div className="panel-heading compact-heading"><h3>Delivery History</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Channel</th><th>Recipient</th><th>Status</th><th>Sent By</th></tr></thead>
            <tbody>
              {receipt.delivery_logs?.length ? (
                receipt.delivery_logs.map((log) => (
                  <tr key={log.id}>
                    <td>{date(log.created_at)}</td>
                    <td>{log.channel}</td>
                    <td>{log.recipient}<small>{log.error_message || log.subject || ""}</small></td>
                    <td><span className={`status status-${log.status}`}>{log.status}</span></td>
                    <td>{log.sent_by_name || "-"}</td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={5} title="No delivery history" detail="Receipt delivery attempts will appear here." />
              )}
            </tbody>
          </table>
        </div>
        <AuditPanel entityType="payment" entityId={payment.id} title="Payment Audit" />
      </div>
    </div>
  );
}

export default PaymentReceiptPanel;
