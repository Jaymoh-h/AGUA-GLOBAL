import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

function PaymentAdjustmentApprovalPanel({ admin, date, defaultOpen, label, money, onReview, pendingCount, pendingTotal, table }) {
  return (
    <CollapsibleSection defaultOpen={defaultOpen} summary={`${pendingCount.toLocaleString()} pending | ${money(pendingTotal)}`} title="Adjustment Approvals">
      <TableControls table={table} label="adjustments" placeholder="Search adjustments" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th><th>Reason</th><th>Status</th><th>Requested</th>{admin ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {table.visibleRows.map((adjustment) => (
              <tr key={adjustment.id}>
                <td><strong>{adjustment.customer_name}</strong><small>{adjustment.acc_number}</small></td>
                <td>{label(adjustment.adjustment_type)}</td><td>{money(adjustment.amount)}</td><td>{date(adjustment.adjustment_date)}</td><td>{adjustment.reason}</td>
                <td><span className={`status status-${adjustment.status}`}>{adjustment.status}</span>{adjustment.review_notes ? <small>{adjustment.review_notes}</small> : null}</td>
                <td>{adjustment.requested_by_name || "-"}</td>
                {admin ? <td>{adjustment.status === "pending" ? <div className="row-actions"><button type="button" onClick={() => onReview(adjustment, "approved")}>Review approval</button><button type="button" onClick={() => onReview(adjustment, "rejected")}>Review rejection</button></div> : adjustment.reviewed_by_name || "-"}</td> : null}
              </tr>
            ))}
            {!table.visibleRows.length ? <EmptyTableRow colSpan={admin ? 8 : 7} title="No adjustment requests found" detail="Manual credits and debits awaiting review will appear here." /> : null}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default PaymentAdjustmentApprovalPanel;
