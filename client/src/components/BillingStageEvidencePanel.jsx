import { AlertTriangle, ArrowRight, Calculator, RefreshCw, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";
import { api } from "../services/api";

const number = (value) => Number(value || 0);
const date = (value) => String(value || "").slice(0, 10) || "-";
const units = (value) => number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

function EvidenceRows({ empty, rows, renderRow }) {
  if (!rows.length) return <p className="billing-stage-evidence-empty">{empty}</p>;
  return <div className="billing-stage-evidence-rows">{rows.slice(0, 5).map(renderRow)}</div>;
}

function BillingStageEvidencePanel({ onClose, onNavigate, period, stage }) {
  const [validation, setValidation] = useState({ anomalies: [], estimates: [], source: [] });
  const [delivery, setDelivery] = useState({ summary: {}, rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const periodStart = date(period?.period_start);
  const periodEnd = date(period?.period_end);

  useEffect(() => {
    if (!stage || !period?.id || !periodStart || periodStart === "-") return undefined;
    let ignore = false;
    setLoading(true);
    setError("");

    const request = stage === "validation"
      ? Promise.all([
          api.readings.anomalies(periodStart),
          api.readings.estimationCandidates(periodStart),
          api.billing.sourceBillingRequests.workspace(periodStart)
        ]).then(([anomalies, estimates, sourceWorkspace]) => ({
          anomalies: anomalies.rows || [],
          estimates: estimates.rows || [],
          source: (sourceWorkspace.rows || []).filter((row) => row.source_billing_request_status === "pending")
        }))
      : api.communications.deliveryExceptions({ billing_period_id: period.id, status: "all", days: 90, limit: 25 });

    request
      .then((result) => {
        if (ignore) return;
        if (stage === "validation") setValidation(result);
        else setDelivery(result);
      })
      .catch((requestError) => {
        if (!ignore) setError(requestError.message || "Unable to load billing-stage evidence.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [period?.id, periodStart, retryVersion, stage]);

  if (!stage || !period) return null;

  const openReadings = (focus, label) => onNavigate?.({
    page: "readings",
    focus,
    label,
    period_start: periodStart,
    period_end: periodEnd
  });
  const pendingSource = validation.source || [];
  const title = stage === "validation" ? "Validation evidence" : "Invoice delivery recovery";
  const detail = stage === "validation"
    ? "Review reading quality, estimation candidates, and source-side billing evidence before release. Nothing in this view creates a reading or changes a bill."
    : "Only bill delivery exceptions for this billing period are shown. A resend remains a deliberate action from the document recovery workflow.";

  return (
    <section className="billing-stage-evidence-panel" aria-labelledby="billing-stage-evidence-title">
      <header className="billing-stage-evidence-header">
        <div>
          <p className="eyebrow">{period.name}</p>
          <h3 id="billing-stage-evidence-title">{title}</h3>
          <p>{detail}</p>
        </div>
        <div className="row-actions">
          <button className="icon-button" type="button" title="Refresh stage evidence" onClick={() => setRetryVersion((value) => value + 1)} disabled={loading}>
            <RefreshCw size={16} />
          </button>
          <button className="icon-button" type="button" title="Close stage evidence" onClick={onClose} disabled={loading}>
            <X size={16} />
          </button>
        </div>
      </header>

      {error ? <div className="billing-stage-evidence-error"><strong>Evidence could not be loaded.</strong><span>{error}</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>Try again</button></div> : null}
      {loading ? <p className="muted">Loading period evidence...</p> : null}

      {!loading && !error && stage === "validation" ? (
        <>
          <div className="billing-stage-evidence-metrics" aria-label="Validation evidence totals">
            <div><span>Reading anomalies</span><strong>{validation.anomalies.length.toLocaleString()}</strong></div>
            <div><span>Estimate candidates</span><strong>{validation.estimates.length.toLocaleString()}</strong></div>
            <div><span>Pending source reviews</span><strong>{pendingSource.length.toLocaleString()}</strong></div>
          </div>
          <div className="billing-stage-evidence-list">
            <section>
              <div className="billing-stage-evidence-section-heading"><div><AlertTriangle size={16} /><strong>Reading anomalies</strong><small>Usage outside the review threshold.</small></div><button type="button" onClick={() => openReadings("reading_anomalies", "Reading anomalies")}>Open reading review <ArrowRight size={15} /></button></div>
              <EvidenceRows
                empty="No current-period readings exceed the anomaly threshold."
                rows={validation.anomalies}
                renderRow={(row) => <div className="billing-stage-evidence-row" key={row.id}><strong>{row.customer_name}</strong><span>{row.acc_number} | {row.meter_number}</span><small>{units(row.units_used)} units, {Math.round(number(row.variance_ratio) * 100)}% variance</small></div>}
              />
            </section>
            <section>
              <div className="billing-stage-evidence-section-heading"><div><Calculator size={16} /><strong>Estimated-reading candidates</strong><small>Field verification suggestions only.</small></div><button type="button" onClick={() => openReadings("estimated_readings", "Estimated reading candidates")}>Open candidates <ArrowRight size={15} /></button></div>
              <EvidenceRows
                empty="No estimate candidate has enough history for this period."
                rows={validation.estimates}
                renderRow={(row) => <div className="billing-stage-evidence-row" key={row.meter_id}><strong>{row.customer_name}</strong><span>{row.acc_number} | {row.meter_number}</span><small>Suggested {units(row.suggested_reading_value)} from a {units(row.average_units)}-unit average</small></div>}
              />
            </section>
            <section>
              <div className="billing-stage-evidence-section-heading"><div><Send size={16} /><strong>Source billing review</strong><small>Approval remains in the controlled source-billing workspace.</small></div><button type="button" onClick={() => openReadings("pending_source_billing", "Source billing reviews")}>Open source review <ArrowRight size={15} /></button></div>
              <EvidenceRows
                empty="No source-side billing approval is pending for this period."
                rows={pendingSource}
                renderRow={(row) => <div className="billing-stage-evidence-row" key={`${row.customer_id}-${row.source_meter_id}`}><strong>{row.customer_name}</strong><span>{row.acc_number} | {row.source_meter_number}</span><small>{units(row.source_units_used)} source units against {units(row.client_units_used)} client units</small></div>}
              />
            </section>
          </div>
        </>
      ) : null}

      {!loading && !error && stage === "delivery" ? (
        <>
          <div className="billing-stage-evidence-metrics" aria-label="Period delivery exception totals">
            <div><span>Exceptions</span><strong>{number(delivery.summary?.exception_count).toLocaleString()}</strong></div>
            <div><span>Failed</span><strong>{number(delivery.summary?.failed_count).toLocaleString()}</strong></div>
            <div><span>Skipped</span><strong>{number(delivery.summary?.skipped_count).toLocaleString()}</strong></div>
          </div>
          <div className="billing-stage-evidence-list">
            <section>
              <div className="billing-stage-evidence-section-heading"><div><Send size={16} /><strong>Bill delivery exceptions</strong><small>{delivery.rows?.length || 0} item(s) from {period.name}</small></div><button type="button" onClick={() => onNavigate?.({ page: "communications", focus: "document_delivery", label: "Delivery exceptions" })}>Open full recovery queue <ArrowRight size={15} /></button></div>
              <EvidenceRows
                empty="No failed or skipped bill delivery is recorded for this period."
                rows={delivery.rows || []}
                renderRow={(row) => <div className="billing-stage-evidence-row" key={row.id}><strong>{row.customer_name || row.document_reference}</strong><span>{row.acc_number || "No account"} | {row.document_reference || "Bill"}</span><small><StatusBadge status={row.status} /> {row.channel || "delivery"} | {row.error_message || "Review the recorded provider outcome."}</small></div>}
              />
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default BillingStageEvidencePanel;
