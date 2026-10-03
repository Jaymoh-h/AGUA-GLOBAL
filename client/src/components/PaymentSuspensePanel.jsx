import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

function PaymentSuspensePanel({ admin, date, defaultOpen, heldCount, heldTotal, label, money, onDiscard, onReapply, table }) {
  return (
    <CollapsibleSection defaultOpen={defaultOpen} summary={`${heldCount.toLocaleString()} held | ${money(heldTotal)}`} title="Suspense Register">
      <TableControls table={table} label="suspense items" placeholder="Search suspense" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Receipt</th><th>Customer</th><th>Amount</th><th>Date</th><th>Reference</th><th>Reason</th><th>Status</th><th>Resolution</th><th>Actions</th></tr></thead>
          <tbody>
            {table.visibleRows.length ? table.visibleRows.map((item) => (
              <tr key={item.id}>
                <td>{item.receipt_number || `Suspense ${item.id}`}<small>Payment #{item.source_payment_id}</small></td>
                <td>{item.customer_name || "-"}<small>{item.acc_number || ""}</small></td>
                <td>{money(item.amount)}</td><td>{date(item.payment_date)}</td><td>{item.external_reference || "-"}</td><td>{item.reason}</td>
                <td><span className={`status status-${item.status}`}>{label(item.status)}</span></td>
                <td>{item.status === "reapplied" ? item.reapplied_receipt_number || `Payment ${item.reapplied_payment_id}` : null}{item.status === "discarded" ? item.discard_reason || "Discarded" : null}{item.status === "held" ? "Awaiting action" : null}</td>
                <td>{item.status === "held" ? <div className="row-actions"><button type="button" onClick={() => onReapply(item)}>Reapply</button>{admin ? <button type="button" onClick={() => onDiscard(item)}>Discard</button> : null}</div> : "-"}</td>
              </tr>
            )) : <EmptyTableRow colSpan={9} title="No suspense items found" detail="Voided payments awaiting action will appear here." />}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default PaymentSuspensePanel;
