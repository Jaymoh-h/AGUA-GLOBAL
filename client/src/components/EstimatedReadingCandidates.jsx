import { Calculator, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import { api } from "../services/api";

const units = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function EstimatedReadingCandidates({ defaultOpen = false, onReview, periodStart }) {
  const [workspace, setWorkspace] = useState({ period: null, rows: [], baseline_intervals: 3 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!periodStart) return undefined;
    let ignore = false;
    setLoading(true);
    setError("");

    api.readings
      .estimationCandidates(periodStart)
      .then((result) => {
        if (!ignore) setWorkspace(result);
      })
      .catch((requestError) => {
        if (!ignore) setError(requestError.message || "Unable to load estimated-reading candidates.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [periodStart, retryVersion]);

  const rows = workspace.rows || [];
  const summary = loading ? "Checking missing readings..." : `${rows.length.toLocaleString()} candidates`;

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
      icon={<Calculator size={18} />}
      summary={summary}
      title="Estimated Reading Candidates"
    >
      <p className="panel-note">
        Field-verification suggestions for missing client-meter readings, based on the prior {workspace.baseline_intervals} usage intervals. Load a suggestion into the review form before deciding whether to submit it; suggestions never create a reading or bill automatically.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="table-wrap compact-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Meter</th>
              <th>Last reading</th>
              <th>Last reading date</th>
              <th>3-interval average</th>
              <th>Suggested reading</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!loading && !rows.length ? (
              <EmptyTableRow
                colSpan={7}
                detail="Candidates need three earlier usage intervals and no client-meter reading in the selected period."
                title="No estimated readings need review"
              />
            ) : null}
            {rows.map((row) => (
              <tr key={row.meter_id}>
                <td>
                  <strong>{row.customer_name}</strong>
                  <small>{row.acc_number}</small>
                </td>
                <td>{row.meter_number}</td>
                <td>{units(row.last_reading_value)}</td>
                <td>{row.last_reading_date?.slice(0, 10)}</td>
                <td>{units(row.average_units)}</td>
                <td>{units(row.suggested_reading_value)}</td>
                <td>
                  <button type="button" onClick={() => onReview?.(row)}>
                    <Eye size={16} />
                    Review suggestion
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

export default EstimatedReadingCandidates;
