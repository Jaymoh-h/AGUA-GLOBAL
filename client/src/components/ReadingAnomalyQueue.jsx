import { AlertTriangle, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import { api } from "../services/api";

const units = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const percentage = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

function ReadingAnomalyQueue({ defaultOpen = false, onReview, periodStart }) {
  const [workspace, setWorkspace] = useState({ period: null, rows: [], threshold: 0.5, baseline_intervals: 3 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!periodStart) return undefined;
    let ignore = false;
    setLoading(true);
    setError("");

    api.readings
      .anomalies(periodStart)
      .then((result) => {
        if (!ignore) setWorkspace(result);
      })
      .catch((requestError) => {
        if (!ignore) setError(requestError.message || "Unable to load reading anomalies.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [periodStart, retryVersion]);

  const rows = workspace.rows || [];
  const summary = loading
    ? "Checking readings..."
    : `${rows.length.toLocaleString()} requiring review`;

  return (
    <CollapsibleSection
      actions={
        error ? (
          <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>
            Retry
          </button>
        ) : null
      }
      defaultOpen={defaultOpen}
      icon={<AlertTriangle size={18} />}
      summary={summary}
      title="Reading Anomalies"
    >
      <p className="panel-note">
        Read-only review queue for client-meter usage more than {percentage(workspace.threshold)} above or below the prior {workspace.baseline_intervals} intervals' average.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="table-wrap compact-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Meter</th>
              <th>Reading date</th>
              <th>Usage</th>
              <th>3-interval average</th>
              <th>Variance</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!loading && !rows.length ? (
              <EmptyTableRow
                colSpan={7}
                detail="Readings with fewer than three earlier intervals are excluded."
                title="No readings exceed the review threshold"
              />
            ) : null}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.customer_name}</strong>
                  <small>{row.acc_number}</small>
                </td>
                <td>{row.meter_number}</td>
                <td>{row.reading_date?.slice(0, 10)}</td>
                <td>{units(row.units_used)}</td>
                <td>{units(row.average_units)}</td>
                <td>
                  {percentage(row.variance_ratio)} {row.direction === "above_average" ? "above" : "below"}
                </td>
                <td>
                  <button type="button" onClick={() => onReview(row)}>
                    <Eye size={16} />
                    Review reading
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export default ReadingAnomalyQueue;
