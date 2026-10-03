import { Camera, ScanLine, Save, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AuditPanel from "./AuditPanel";
import CollapsibleSection from "./CollapsibleSection";

export default function ReadingEntryForm({
  cancelEdit,
  editingId,
  form,
  meterRoleLabels,
  onChange,
  onCustomerChange,
  onOpenChange,
  onSubmit,
  open,
  readingContext,
  readingCustomerOptions,
  readingEligibility,
  readingReviewContext,
  restrictedReadingPeriod
}) {
  const isAnomalyReview = readingReviewContext?.type === "anomaly";
  const isEstimateReview = readingReviewContext?.type === "estimate";
  const [meterLookup, setMeterLookup] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const scannerVideoRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const scannerFrameRef = useRef(null);
  const scannerActiveRef = useRef(false);
  const meterMatches = useMemo(() => {
    const query = meterLookup.trim().toLowerCase();
    if (!query || editingId) return [];
    return readingCustomerOptions
      .filter((customer) => String(customer.active_meter_number || "").toLowerCase().includes(query))
      .slice(0, 6);
  }, [editingId, meterLookup, readingCustomerOptions]);

  const selectMeterMatch = (customer) => {
    const hasMultipleActiveMeters = Number(customer.active_meter_count || 0) > 1;
    onCustomerChange(
      String(customer.id),
      !hasMultipleActiveMeters && customer.active_meter_id ? String(customer.active_meter_id) : ""
    );
    setMeterLookup("");
  };

  const stopCameraScan = () => {
    scannerActiveRef.current = false;
    if (scannerFrameRef.current) window.cancelAnimationFrame(scannerFrameRef.current);
    scannerFrameRef.current = null;
    if (scannerStreamRef.current) scannerStreamRef.current.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    setScannerOpen(false);
  };

  useEffect(
    () => () => {
      scannerActiveRef.current = false;
      if (scannerFrameRef.current) window.cancelAnimationFrame(scannerFrameRef.current);
      if (scannerStreamRef.current) scannerStreamRef.current.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const handleCameraMeter = (value) => {
    const meterNumber = String(value || "").trim();
    if (!meterNumber) return;
    setMeterLookup(meterNumber);
    const exactMatch = readingCustomerOptions.find(
      (customer) => String(customer.active_meter_number || "").trim().toLowerCase() === meterNumber.toLowerCase()
    );
    stopCameraScan();
    if (exactMatch) selectMeterMatch(exactMatch);
  };

  const startCameraScan = async () => {
    const supportsCameraScan =
      typeof window !== "undefined" &&
      typeof window.BarcodeDetector === "function" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    setScannerError("");
    setScannerOpen(true);
    if (!supportsCameraScan) {
      setScannerError("Camera scanning is not supported in this browser. Type the meter number or use a handheld scanner instead.");
      return;
    }

    scannerActiveRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      if (!scannerActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      scannerStreamRef.current = stream;
      const video = scannerVideoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["code_128", "code_39", "code_93", "ean_13", "ean_8", "qr_code"] });
      const scanFrame = async () => {
        if (!scannerActiveRef.current || !scannerVideoRef.current) return;
        try {
          if (scannerVideoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const codes = await detector.detect(scannerVideoRef.current);
            if (codes[0]?.rawValue) {
              handleCameraMeter(codes[0].rawValue);
              return;
            }
          }
        } catch (_error) {
          // Keep the preview open so a transient detector frame error does not interrupt field work.
        }
        if (scannerActiveRef.current) scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
      };
      scannerFrameRef.current = window.requestAnimationFrame(scanFrame);
    } catch (_error) {
      scannerActiveRef.current = false;
      if (scannerStreamRef.current) scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
      setScannerError("Camera access was unavailable. Type the meter number or use a handheld scanner instead.");
    }
  };

  return (
    <CollapsibleSection
      as="form"
      className="form-grid"
      defaultOpen={open === undefined}
      icon={editingId ? <Save size={18} /> : <Send size={18} />}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      summary={editingId ? `Editing #${editingId}` : `${readingCustomerOptions.length.toLocaleString()} customer(s) awaiting reading`}
      title={editingId ? "Edit Reading" : "Submit Reading"}
    >
      {!editingId ? (
        <section className="reading-meter-lookup" aria-label="Meter number lookup">
          <label>
            Find by meter number
            <span className="reading-meter-lookup-input">
              <ScanLine size={17} aria-hidden="true" />
              <input
                value={meterLookup}
                onChange={(event) => setMeterLookup(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && meterMatches.length === 1) {
                    event.preventDefault();
                    selectMeterMatch(meterMatches[0]);
                  }
                }}
                placeholder="Type or scan the meter number"
                inputMode="text"
                autoComplete="off"
              />
              <button className="icon-button" type="button" title="Scan meter number with camera" onClick={startCameraScan}>
                <Camera size={16} aria-hidden="true" />
              </button>
            </span>
          </label>
          {meterLookup.trim() && !meterMatches.length ? <small>No eligible meter matches this period.</small> : null}
          {meterMatches.length ? (
            <div className="reading-meter-lookup-results">
              {meterMatches.map((customer) => (
                <button key={customer.id} type="button" onClick={() => selectMeterMatch(customer)}>
                  <span><strong>{customer.active_meter_number}</strong><small>{customer.acc_number} | {customer.name}</small></span>
                  <span>{Number(customer.active_meter_count || 0) > 1 ? "Select meter" : "Use meter"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {scannerOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={stopCameraScan}>
          <section className="modal-panel meter-scan-modal" role="dialog" aria-modal="true" aria-label="Scan meter number" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Field capture</p><h3>Scan meter number</h3></div>
              <button className="icon-button" type="button" title="Close camera scanner" onClick={stopCameraScan}><X size={17} /></button>
            </div>
            <video className="meter-scan-preview" ref={scannerVideoRef} muted playsInline />
            {scannerError ? <p className="panel-note needs-attention">{scannerError}</p> : null}
          </section>
        </div>
      ) : null}
      <label>
        Customer
        <select value={form.customer_id} onChange={(event) => onCustomerChange(event.target.value)} required>
          <option value="">
            {editingId ? "Select customer" : `Select missing customer (${readingEligibility?.period?.name || "period"})`}
          </option>
          {readingCustomerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.acc_number} - {customer.name}
              {customer.suggested_reading_date ? ` | ${customer.suggested_reading_date}` : ""}
            </option>
          ))}
        </select>
        {!editingId && !readingCustomerOptions.length ? <small>No active metered customers are missing readings for this period.</small> : null}
      </label>
      {readingContext ? (
        <div className="reading-context">
          <div>
            <span>Selected meter</span>
            <strong>{readingContext.activeMeter?.meter_number || "-"}</strong>
            <small>{meterRoleLabels[readingContext.activeMeter?.meter_role] || "Client billing"}</small>
          </div>
          <div>
            <span>Previous reading</span>
            <strong>{readingContext.previousReading ? Number(readingContext.previousReading.reading_value).toLocaleString() : "Baseline"}</strong>
            <small>{readingContext.previousReading?.reading_date?.slice(0, 10) || "No earlier reading"}</small>
          </div>
          <div>
            <span>Billing period</span>
            <strong>{readingContext.billingPeriod?.name}</strong>
            <small>{readingContext.billingPeriod?.status || "open"} | Due {readingContext.billingPeriod?.dueDate}</small>
          </div>
        </div>
      ) : null}
      {isAnomalyReview ? (
        <div className="panel-note needs-attention">
          <strong>Consumption anomaly under review</strong>
          <span>
            This reading used {Number(readingReviewContext.unitsUsed || 0).toLocaleString()} units, {Math.abs(Number(readingReviewContext.varianceRatio || 0) * 100).toFixed(1)}% {readingReviewContext.direction === "above_average" ? "above" : "below"} its prior average of {Number(readingReviewContext.averageUnits || 0).toLocaleString()} units. Confirm the field evidence and record a review note before saving.
          </span>
        </div>
      ) : null}
      {isEstimateReview ? (
        <div className="panel-note">
          <strong>Estimated-reading suggestion loaded</strong>
          <span>
            The suggested value uses {Number(readingReviewContext.intervalCount || 3).toLocaleString()} earlier usage intervals averaging {Number(readingReviewContext.averageUnits || 0).toLocaleString()} units. Verify it against field evidence before submitting; it does not submit automatically.
          </span>
        </div>
      ) : null}
      {readingContext?.availableMeters?.length ? (
        <label>
          Meter
          <select value={form.meter_id} onChange={(event) => onChange("meter_id", event.target.value)} required>
            {readingContext.availableMeters.map((meter) => (
              <option key={meter.id} value={meter.id}>
                {meter.meter_number} - {meterRoleLabels[meter.meter_role] || meter.meter_role}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Reading value
        <input value={form.reading_value} onChange={(event) => onChange("reading_value", event.target.value)} type="number" min={readingContext?.previousReading?.reading_value || form.previous_reading_value || 0} required />
      </label>
      {editingId && !readingContext?.previousReading ? (
        <label>
          Base reading for this bill
          <input value={form.previous_reading_value} onChange={(event) => onChange("previous_reading_value", event.target.value)} type="number" min="0" placeholder="Optional previous/base reading" />
        </label>
      ) : null}
      <label>
        Reading date
        <input value={form.reading_date} onChange={(event) => onChange("reading_date", event.target.value)} type="date" required />
        <small>{readingEligibility?.period?.name ? `Period closes ${readingEligibility.period.periodEnd}` : "Select any date in the billing month; the form uses the month-end reading day."}</small>
      </label>
      {isEstimateReview ? (
        <label>
          Field verification note
          <textarea
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            placeholder="Required: record the field evidence used to accept this suggested value"
            rows="2"
            required
          />
        </label>
      ) : null}
      {readingContext?.activeMeter?.meter_role === "source_backup" ? (
        <label>
          Source review note
          <textarea value={form.fallback_reason} onChange={(event) => onChange("fallback_reason", event.target.value)} rows="2" placeholder="Optional note for source-side billing review" />
        </label>
      ) : null}
      {editingId || restrictedReadingPeriod ? (
        <label>
          {isAnomalyReview ? "Anomaly review note" : "Correction reason"}
          <textarea value={form.correction_reason} onChange={(event) => onChange("correction_reason", event.target.value)} rows="2" required={restrictedReadingPeriod || isAnomalyReview} placeholder={isAnomalyReview ? "Required: explain the field verification or correction" : restrictedReadingPeriod ? "Required for closed or locked periods" : "Optional audit note"} />
        </label>
      ) : null}
      <button className="primary-button" type="submit">
        {editingId ? <Save size={17} /> : <Send size={17} />}
        {editingId ? "Save reading" : "Submit reading"}
      </button>
      {editingId ? <button type="button" onClick={cancelEdit}>Cancel edit</button> : null}
      {editingId ? <AuditPanel entityType="meter_reading" entityId={editingId} title="Reading Audit" /> : null}
    </CollapsibleSection>
  );
}
