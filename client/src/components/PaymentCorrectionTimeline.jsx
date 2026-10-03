import { ReceiptText } from "lucide-react";

const EVENT_LABELS = {
  corrected: "Corrected",
  voided: "Voided",
  reapplied: "Reapplied",
  discarded: "Discarded"
};

const moneyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? moneyFormatter.format(amount) : "-";
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-KE");
}

function eventType(event) {
  const rawType = String(event.event_type || event.type || event.action || "").toLowerCase();
  return Object.keys(EVENT_LABELS).find((type) => rawType.includes(type)) || rawType;
}

function paymentId(event) {
  if (eventType(event) === "reapplied") return event.related_payment_id || event.payment_id || null;
  return event.payment_id || event.related_payment_id || null;
}

function receiptIdentity(event) {
  const receipt = eventType(event) === "reapplied"
    ? event.related_receipt_number || event.reapplied_receipt_number || event.receipt_number
    : event.receipt_number || event.reapplied_receipt_number;
  if (receipt) return receipt;

  const suspenseId = event.suspense_id || event.suspense_item_id || event.payment_suspense_id;
  return suspenseId ? `Suspense #${suspenseId}` : "-";
}

export default function PaymentCorrectionTimeline({ events = [], loading = false, onViewReceipt }) {
  const rows = Array.isArray(events) ? events : [];

  if (!loading && rows.length === 0) {
    return (
      <div className="payment-correction-timeline-empty" role="status">
        No recent payment corrections.
      </div>
    );
  }

  return (
    <div className="payment-correction-timeline" aria-busy={loading}>
      <div className="table-wrap payment-correction-timeline-scroll">
        <table className="payment-correction-timeline-table">
          <caption className="sr-only">Recent payment correction activity</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Receipt</th>
              <th scope="col">Amount</th>
              <th scope="col">Reason</th>
              <th scope="col">Actor</th>
              <th scope="col">Date and time</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr className="payment-correction-timeline-loading">
                <td colSpan="7" role="status">Loading payment corrections...</td>
              </tr>
            ) : (
              rows.map((event, index) => {
                const type = eventType(event);
                const receipt = receiptIdentity(event);
                const relatedPaymentId = paymentId(event);
                const rowKey = event.id || event.event_id || `${type}-${relatedPaymentId || "suspense"}-${index}`;

                return (
                  <tr className={`payment-correction-event payment-correction-event-${type || "unknown"}`} key={rowKey}>
                    <td data-label="Event">
                      <span className="payment-correction-event-type">{EVENT_LABELS[type] || "Payment event"}</span>
                    </td>
                    <td data-label="Receipt">
                      <span className="payment-correction-receipt-number">{receipt}</span>
                    </td>
                    <td className="payment-correction-amount" data-label="Amount">
                      {formatAmount(event.amount ?? event.payment_amount)}
                    </td>
                    <td className="payment-correction-reason" data-label="Reason">
                      {event.audit_reason || event.correction_reason || event.reason || event.discard_reason || "-"}
                    </td>
                    <td data-label="Actor">{event.actor_name || event.actor || event.created_by_name || "System"}</td>
                    <td data-label="Date and time">
                      <time dateTime={event.created_at || event.event_at || event.updated_at || undefined}>
                        {formatDateTime(event.created_at || event.event_at || event.updated_at)}
                      </time>
                    </td>
                    <td className="payment-correction-actions">
                      {relatedPaymentId && typeof onViewReceipt === "function" ? (
                        <button
                          className="payment-correction-view-receipt"
                          type="button"
                          onClick={() => onViewReceipt(relatedPaymentId)}
                          aria-label={`View receipt ${receipt === "-" ? relatedPaymentId : receipt}`}
                        >
                          <ReceiptText size={16} aria-hidden="true" />
                          <span>View receipt</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
