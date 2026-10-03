import { ClipboardList, Eye, FileUp, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import { rowsToCsv } from "../utils/csvTemplate";
import useScopedDraft from "../utils/useScopedDraft";
import CollapsibleSection from "./CollapsibleSection";
import ReviewDialog from "./ReviewDialog";
import { useToastMessage } from "./ToastProvider";

const createBatchReadingDraft = () => ({
  readingDate: "",
  correctionReason: "",
  rows: []
});

const buildReadingCsv = (rows) =>
  rowsToCsv(
    [
      { header: "acc_number", value: (row) => row.acc_number },
      { header: "reading_date", value: (row) => row.reading_date },
      { header: "reading_value", value: (row) => row.reading_value },
      { header: "meter_number", value: (row) => row.meter_number },
      { header: "notes", value: (row) => row.notes }
    ],
    rows
  );

const rowLocalIssue = (row) => {
  if (Number(row.active_meter_count) > 1) return "Multiple active billing meters; use single entry.";
  if (
    row.reading_value !== "" &&
    row.previous_reading_value !== null &&
    row.previous_reading_value !== undefined &&
    Number(row.reading_value) < Number(row.previous_reading_value)
  ) {
    return "Below previous reading";
  }
  return "";
};

function BatchReadingSheet({ user, eligibility, onImported, onOpenChange, open }) {
  const [draft, setDraft, clearDraft] = useScopedDraft(user, "batch-reading-sheet", createBatchReadingDraft, { storage: "local" });
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewCsv, setPreviewCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tableRef = useRef(null);
  const [, setMessage] = useToastMessage();
  const rows = Array.isArray(draft.rows) ? draft.rows : [];
  const eligibleRows = Array.isArray(eligibility?.rows) ? eligibility.rows : [];
  const periodEnd = eligibility?.period?.periodEnd || "";
  const readingDate = draft.readingDate || periodEnd;
  const enteredRows = rows.filter((row) => row.reading_value !== "");
  const localErrorCount = enteredRows.filter((row) => Boolean(rowLocalIssue(row))).length;
  const issueCount = rows.filter((row) => Boolean(rowLocalIssue(row))).length;

  const visibleRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.acc_number, row.customer_name, row.zone_name, row.meter_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [filter, rows]);

  const resetPreview = () => {
    setPreview(null);
    setPreviewCsv("");
  };

  const showNetworkSafeMessage = (error) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMessage("You are offline. The reading sheet is saved on this device; reconnect before checking or importing it.");
      return;
    }
    setMessage(error.message);
  };

  const loadMissingCustomers = async () => {
    const nextDate = readingDate || periodEnd;
    setBusy(true);
    try {
      const currentEligibility = nextDate ? await api.readings.eligibleCustomers(nextDate) : eligibility;
      const currentRows = Array.isArray(currentEligibility?.rows) ? currentEligibility.rows : eligibleRows;
      const existing = new Map(rows.map((row) => [Number(row.customer_id), row]));
      const normalizedDate = currentEligibility?.period?.periodEnd || nextDate;
      const nextRows = currentRows.map((customer) => {
        const saved = existing.get(Number(customer.id));
        return {
          customer_id: customer.id,
          customer_name: customer.name,
          acc_number: customer.acc_number,
          zone_name: customer.zone_name || customer.location || "",
          active_meter_count: Number(customer.active_meter_count || 0),
          meter_number: customer.active_meter_number || "",
          previous_reading_date: customer.latest_reading_date?.slice(0, 10) || "",
          previous_reading_value: customer.latest_reading_value ?? null,
          reading_date: normalizedDate,
          reading_value: saved?.reading_value ?? "",
          notes: saved?.notes ?? ""
        };
      });
      setDraft((current) => ({ ...current, readingDate: normalizedDate, rows: nextRows }));
      resetPreview();
      setMessage(
        nextRows.length
          ? `Loaded ${nextRows.length} customer(s) awaiting a reading.`
          : "No active customer meters are awaiting a reading for this period."
      );
    } catch (error) {
      showNetworkSafeMessage(error);
    } finally {
      setBusy(false);
    }
  };

  const openLoadedSheet = async () => {
    await loadMissingCustomers();
    onOpenChange?.(true);
  };

  const updateRow = (customerId, field, value) => {
    setDraft((current) => ({
      ...current,
      rows: (current.rows || []).map((row) =>
        Number(row.customer_id) === Number(customerId) ? { ...row, [field]: value } : row
      )
    }));
    resetPreview();
  };

  const updateReadingDate = (value) => {
    setDraft((current) => ({
      ...current,
      readingDate: value,
      rows: (current.rows || []).map((row) => ({ ...row, reading_date: value }))
    }));
    resetPreview();
  };

  const moveReadingFocus = (event) => {
    if (!["Enter", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    const inputs = [...(tableRef.current?.querySelectorAll("input[data-batch-reading]") || [])].filter(
      (input) => !input.disabled
    );
    const currentIndex = inputs.indexOf(event.currentTarget);
    const offset = event.key === "ArrowUp" ? -1 : 1;
    const next = inputs[currentIndex + offset];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.select();
  };

  const resetSheet = () => {
    clearDraft();
    setFilter("");
    resetPreview();
    setMessage("Batch reading sheet cleared.");
  };

  const previewBatch = async () => {
    if (!enteredRows.length) {
      setMessage("Enter at least one current reading before previewing the batch.");
      return;
    }
    if (localErrorCount) {
      setMessage("Fix readings that are lower than their previous value before previewing the batch.");
      return;
    }

    const csv = buildReadingCsv(enteredRows);
    setBusy(true);
    try {
      const result = await api.readings.previewImport(csv);
      setPreview(result);
      setPreviewCsv(csv);
      setMessage(
        result.summary.invalid
          ? `${result.summary.invalid} batch row(s) need correction.`
          : `${result.summary.valid} batch reading(s) are ready to import.`
      );
    } catch (error) {
      showNetworkSafeMessage(error);
    } finally {
      setBusy(false);
    }
  };

  const commitBatch = async () => {
    if (!previewCsv || preview?.summary?.invalid) return;
    setBusy(true);
    try {
      const result = await api.readings.commitImport(previewCsv, draft.correctionReason || "");
      clearDraft();
      setPreview(null);
      setPreviewCsv("");
      setConfirmOpen(false);
      await onImported?.();
      setMessage(
        `Imported ${result.summary.imported} reading(s) and created ${result.summary.billsCreated} bill(s).`
      );
    } catch (error) {
      showNetworkSafeMessage(error);
    } finally {
      setBusy(false);
    }
  };

  const previewReady = preview?.rows?.length > 0 && preview.summary.invalid === 0;
  const summary = rows.length
    ? `${enteredRows.length.toLocaleString()} entered of ${rows.length.toLocaleString()} awaiting`
    : `${eligibleRows.length.toLocaleString()} customer(s) awaiting reading`;

  return (
    <>
      <CollapsibleSection
        actions={
          <div className="row-actions">
            <button type="button" onClick={openLoadedSheet} disabled={busy}>
              <ClipboardList size={16} />
              {rows.length ? "Refresh list" : "Load sheet"}
            </button>
            {rows.length ? (
              <button type="button" onClick={resetSheet} disabled={busy}>
                <RotateCcw size={16} />
                Clear
              </button>
            ) : null}
          </div>
        }
        className="batch-reading-panel"
        defaultOpen={open === undefined}
        icon={<ClipboardList size={18} />}
        onOpenChange={onOpenChange}
        open={open}
        summary={summary}
        title="Batch Reading Sheet"
      >
        {!rows.length ? (
          <div className="batch-reading-empty">
            <strong>Enter the month&apos;s readings directly in one sheet.</strong>
            <span>Load customers who are still missing a reading, then preview the batch before bills are created.</span>
            <button className="primary-button" type="button" onClick={openLoadedSheet} disabled={busy}>
              <ClipboardList size={17} />
              Load missing customers
            </button>
          </div>
        ) : (
          <>
            <div className="batch-reading-toolbar">
              <label>
                Reading date
                <input value={readingDate} onChange={(event) => updateReadingDate(event.target.value)} type="date" />
              </label>
              <label>
                Find account
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  type="search"
                  placeholder="Account, customer, zone, or meter"
                />
              </label>
              <div className="batch-reading-counts" aria-label="Batch reading progress">
                <span><strong>{enteredRows.length}</strong> entered</span>
                <span><strong>{rows.length - enteredRows.length}</strong> remaining</span>
                <span className={issueCount ? "has-errors" : ""}><strong>{issueCount}</strong> checks</span>
              </div>
            </div>

            <div className="table-wrap batch-reading-table" ref={tableRef}>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Customer</th>
                    <th>Meter</th>
                    <th>Previous</th>
                    <th>Current reading</th>
                    <th>Usage</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const localIssue = rowLocalIssue(row);
                    const usage =
                      row.reading_value === "" || row.previous_reading_value === null || row.previous_reading_value === undefined
                        ? null
                        : Number(row.reading_value) - Number(row.previous_reading_value);
                    return (
                      <tr className={localIssue ? "batch-reading-row-error" : ""} key={row.customer_id}>
                        <td><strong>{row.acc_number}</strong><small>{row.zone_name || "No zone"}</small></td>
                        <td>{row.customer_name}</td>
                        <td>
                          {Number(row.active_meter_count) > 1 ? "Needs selection" : row.meter_number || "Active meter"}
                          {Number(row.active_meter_count) > 1 ? <small>Use single entry</small> : null}
                        </td>
                        <td>
                          {row.previous_reading_value === null || row.previous_reading_value === undefined
                            ? "Baseline"
                            : Number(row.previous_reading_value).toLocaleString()}
                          <small>{row.previous_reading_date || "No earlier reading"}</small>
                        </td>
                        <td>
                          <input
                            aria-label={`Reading for ${row.customer_name}`}
                            data-batch-reading
                            value={row.reading_value}
                            onChange={(event) => updateRow(row.customer_id, "reading_value", event.target.value)}
                            onKeyDown={moveReadingFocus}
                            type="number"
                            min={row.previous_reading_value ?? 0}
                            inputMode="decimal"
                            placeholder="Enter value"
                            disabled={Number(row.active_meter_count) > 1}
                          />
                          {localIssue ? <small className="field-error">{localIssue}</small> : null}
                        </td>
                        <td>{usage === null ? "-" : usage.toLocaleString()}</td>
                        <td>
                          <input
                            aria-label={`Notes for ${row.customer_name}`}
                            value={row.notes}
                            onChange={(event) => updateRow(row.customer_id, "notes", event.target.value)}
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="batch-reading-reason">
              Correction reason
              <textarea
                value={draft.correctionReason || ""}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, correctionReason: event.target.value }));
                  resetPreview();
                }}
                rows="2"
                placeholder="Required only when the selected billing period is closed or locked"
              />
            </label>

            {preview ? (
              <div className="batch-reading-preview" aria-live="polite">
                <span><strong>{preview.summary.total}</strong> checked</span>
                <span><strong>{preview.summary.valid}</strong> valid</span>
                <span><strong>{preview.summary.billsExpected}</strong> bills expected</span>
                <span className={preview.summary.invalid ? "has-errors" : ""}>
                  <strong>{preview.summary.invalid}</strong> invalid
                </span>
              </div>
            ) : null}

            {preview?.summary?.invalid ? (
              <div className="batch-reading-errors">
                {preview.rows
                  .filter((row) => row.errors.length)
                  .map((row) => (
                    <p key={row.rowNumber}>
                      <strong>{row.acc_number || `Row ${row.rowNumber}`}</strong>
                      {row.errors.join(" ")}
                    </p>
                  ))}
              </div>
            ) : null}

            <div className="form-actions batch-reading-actions">
              <button className="primary-button" type="button" onClick={previewBatch} disabled={busy || !enteredRows.length}>
                <Eye size={17} />
                {busy ? "Checking..." : "Preview entered readings"}
              </button>
              <button type="button" onClick={() => setConfirmOpen(true)} disabled={busy || !previewReady}>
                <FileUp size={17} />
                Import validated batch
              </button>
            </div>
          </>
        )}
      </CollapsibleSection>

      <ReviewDialog
        open={confirmOpen}
        eyebrow="Billing impact"
        title="Import validated readings"
        description="This creates meter readings and generates the applicable customer bills."
        confirmLabel="Import readings"
        reasonLabel={null}
        busy={busy}
        busyLabel="Importing..."
        onCancel={() => !busy && setConfirmOpen(false)}
        onConfirm={commitBatch}
      >
        <div className="reading-context batch-reading-confirmation">
          <div><span>Readings</span><strong>{preview?.summary?.valid || 0}</strong></div>
          <div><span>Bills expected</span><strong>{preview?.summary?.billsExpected || 0}</strong></div>
          <div><span>Reading date</span><strong>{readingDate || "-"}</strong></div>
        </div>
      </ReviewDialog>
    </>
  );
}

export default BatchReadingSheet;
