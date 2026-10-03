import { AlertTriangle, ArrowUpRight, CircleDollarSign, MailWarning, UserRound } from "lucide-react";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

function CollectionsRecoveryQueue({ deliveryPayload, suspenseItems, onNavigate }) {
  const deliveryRows = Array.isArray(deliveryPayload?.rows) ? deliveryPayload.rows.slice(0, 4) : [];
  const heldSuspense = (Array.isArray(suspenseItems) ? suspenseItems : [])
    .filter((item) => item.status === "held")
    .slice(0, 4);
  const deliverySummary = deliveryPayload?.summary || {};
  const deliveryCount = Number(deliverySummary.exception_count || deliveryRows.length);
  const heldValue = heldSuspense.reduce((total, item) => total + Number(item.amount || 0), 0);

  return (
    <section className="collections-recovery-queue" aria-labelledby="collections-recovery-title">
      <div className="collections-section-heading">
        <div>
          <p className="eyebrow">Recovery control</p>
          <h2 id="collections-recovery-title">Exceptions that block collection</h2>
        </div>
        <span>Review required</span>
      </div>
      <p className="collections-recovery-intro">Delivery failures can block outreach and suspense can hide cash from the account balance. These lanes only surface evidence; sending, reapplying, or discarding remains a deliberate reviewed action.</p>
      <div className="collections-recovery-lanes">
        <section className="collections-recovery-lane" aria-labelledby="collection-delivery-title">
          <header>
            <span className="collections-recovery-icon delivery"><MailWarning size={17} /></span>
            <div>
              <small>Customer communication</small>
              <h3 id="collection-delivery-title">Delivery failures</h3>
            </div>
            <strong>{deliveryCount.toLocaleString()}</strong>
          </header>
          <p>{Number(deliverySummary.failed_count || 0).toLocaleString()} failed and {Number(deliverySummary.skipped_count || 0).toLocaleString()} skipped results in the last 90 days.</p>
          <div className="collections-recovery-list">
            {deliveryRows.length ? deliveryRows.map((row) => (
              <button key={row.id} type="button" onClick={() => onNavigate?.({ page: "customers", focus: "customer_360", customer_id: row.customer_id, label: "Delivery contact recovery" })}>
                <span><strong>{row.customer_name || "Unlinked customer"}</strong><small>{row.acc_number || row.document_reference || "No account reference"}</small></span>
                <span className="collections-recovery-detail"><small>{String(row.channel || "delivery").toUpperCase()} | {row.status || "review"}</small><b>{row.error_message || "Review delivery result"}</b></span>
                <ArrowUpRight size={15} />
              </button>
            )) : <div className="collections-recovery-empty"><AlertTriangle size={16} />No delivery failures are waiting.</div>}
          </div>
          <button className="collections-recovery-action" type="button" onClick={() => onNavigate?.({ page: "communications", focus: "document_delivery", label: "Delivery recovery" })}>Open delivery recovery <ArrowUpRight size={15} /></button>
        </section>

        <section className="collections-recovery-lane" aria-labelledby="collection-suspense-title">
          <header>
            <span className="collections-recovery-icon suspense"><CircleDollarSign size={17} /></span>
            <div>
              <small>Cash office</small>
              <h3 id="collection-suspense-title">Held suspense</h3>
            </div>
            <strong>{heldSuspense.length.toLocaleString()}</strong>
          </header>
          <p>{money(heldValue)} is awaiting a documented reapplication or discard decision.</p>
          <div className="collections-recovery-list">
            {heldSuspense.length ? heldSuspense.map((item) => (
              <button key={item.id} type="button" onClick={() => onNavigate?.({ page: "customers", focus: "customer_360", customer_id: item.customer_id, label: "Suspense account review" })}>
                <span><strong>{item.customer_name || item.receipt_number || `Suspense ${item.id}`}</strong><small>{item.acc_number || item.external_reference || "No account reference"}</small></span>
                <span className="collections-recovery-detail"><small>{item.payment_date?.slice(0, 10) || "Undated"}</small><b>{money(item.amount)}</b></span>
                <ArrowUpRight size={15} />
              </button>
            )) : <div className="collections-recovery-empty"><UserRound size={16} />No held suspense is waiting.</div>}
          </div>
          <button className="collections-recovery-action" type="button" onClick={() => onNavigate?.({ page: "payments", focus: "suspense_payments", label: "Suspense resolution" })}>Open suspense resolution <ArrowUpRight size={15} /></button>
        </section>
      </div>
    </section>
  );
}

export default CollectionsRecoveryQueue;
