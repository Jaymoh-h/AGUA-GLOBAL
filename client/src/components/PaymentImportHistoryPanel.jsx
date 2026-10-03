import { FileUp } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";

function PaymentImportHistoryPanel({ batches = [], date, label, money }) {
  return (
    <CollapsibleSection
      icon={<FileUp size={18} />}
      summary={`${batches.length.toLocaleString()} recent batch(es)`}
      title="Recent Payment Imports"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>Source</th>
              <th>Rows</th>
              <th>Excluded</th>
              <th>Total</th>
              <th>Channels</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {batches.length ? (
              batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <strong>{batch.batch_reference}</strong>
                    <small>{batch.csv_sha256 ? `Fingerprint ${batch.csv_sha256.slice(0, 12)}` : "Legacy batch"}</small>
                  </td>
                  <td>{batch.source_name}</td>
                  <td>{`${Number(batch.imported_rows || 0).toLocaleString()} of ${Number(batch.total_rows || 0).toLocaleString()}`}</td>
                  <td>{Number(batch.excluded_rows || 0) ? `${Number(batch.excluded_rows).toLocaleString()} | ${money(batch.excluded_total)}` : "-"}</td>
                  <td>{money(batch.total_amount)}</td>
                  <td>
                    {Object.entries(batch.channel_summary || {}).length
                      ? Object.entries(batch.channel_summary).map(([channel, count]) => `${label(channel)}: ${count}`).join(", ")
                      : "-"}
                  </td>
                  <td>
                    {date(batch.created_at)}
                    <small>{batch.actor_name || "System"}</small>
                  </td>
                </tr>
              ))
            ) : (
              <EmptyTableRow colSpan={7} title="No payment imports recorded" detail="Committed payment batches will appear here with their immutable import summary." />
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default PaymentImportHistoryPanel;
