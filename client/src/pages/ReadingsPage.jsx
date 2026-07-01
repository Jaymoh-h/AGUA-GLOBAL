import { Download, Edit3, Eye, FileUp, Gauge, Replace, Save, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AuditPanel from "../components/AuditPanel";
import CollapsibleSection from "../components/CollapsibleSection";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import { api } from "../services/api";
import { downloadCsvRows, downloadCsvTemplate } from "../utils/csvTemplate";
import { namedExport } from "../utils/exportNames";

const readingImportHeaders = ["acc_number", "reading_date", "reading_value", "meter_number", "notes"];
const meterRoleLabels = {
  client_billing: "Client billing",
  source_backup: "Source backup",
  shared_source_monitoring: "Shared source monitoring"
};
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const percent = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;
const today = () => new Date().toISOString().slice(0, 10);

function ReadingsPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [customers, setCustomers] = useState([]);
  const [readings, setReadings] = useState([]);
  const [readingEligibility, setReadingEligibility] = useState(null);
  const [eligibleReadingCustomers, setEligibleReadingCustomers] = useState([]);
  const [meterEvents, setMeterEvents] = useState([]);
  const [sourceRequests, setSourceRequests] = useState([]);
  const [sourceWorkspace, setSourceWorkspace] = useState({ period: null, rows: [] });
  const [form, setForm] = useState({
    customer_id: "",
    meter_id: "",
    reading_value: "",
    previous_reading_value: "",
    reading_date: today(),
    fallback_reason: "",
    correction_reason: ""
  });
  const [sourceForm, setSourceForm] = useState({
    customer_id: "",
    meter_id: "",
    reading_value: "",
    previous_reading_value: "",
    reading_date: today(),
    fallback_reason: "",
    correction_reason: ""
  });
  const [meterForm, setMeterForm] = useState({
    customer_id: "",
    meter_number: "",
    meter_role: "source_backup",
    installed_at: today(),
    initial_reading: "0",
    notes: ""
  });
  const [replacementForm, setReplacementForm] = useState({
    customer_id: "",
    old_final_reading: "",
    new_meter_number: "",
    new_initial_reading: "0",
    event_date: today(),
    reason: ""
  });
  const [replacementContext, setReplacementContext] = useState(null);
  const [readingContext, setReadingContext] = useState(null);
  const [sourceContext, setSourceContext] = useState(null);
  const [csvText, setCsvText] = useState("acc_number,reading_date,reading_value,notes\n");
  const [importCorrectionReason, setImportCorrectionReason] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventForm, setEventForm] = useState({
    event_date: "",
    old_final_reading: "",
    new_initial_reading: "",
    reason: "",
    correction_reason: ""
  });
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [, setMessage] = useToastMessage();

  const load = async () => {
    const [customerRows, readingRows, eligibility, eventRows, sourceRows, sourceWorkspaceRows] = await Promise.all([
      api.customers.list(),
      api.readings.list(),
      api.readings.eligibleCustomers(form.reading_date),
      api.meters.events(),
      ["admin", "accountant"].includes(user?.role) ? api.billing.sourceBillingRequests.list() : Promise.resolve([]),
      ["admin", "accountant"].includes(user?.role)
        ? api.billing.sourceBillingRequests.workspace(sourceForm.reading_date)
        : Promise.resolve({ period: null, rows: [] })
    ]);
    setCustomers(customerRows);
    setReadings(readingRows);
    setReadingEligibility(eligibility);
    setEligibleReadingCustomers(eligibility.rows || []);
    setMeterEvents(eventRows);
    setSourceRequests(sourceRows);
    setSourceWorkspace(sourceWorkspaceRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    let ignore = false;
    api.readings
      .eligibleCustomers(form.reading_date)
      .then((eligibility) => {
        if (!ignore) {
          setReadingEligibility(eligibility);
          setEligibleReadingCustomers(eligibility.rows || []);
          if (!editingId && !form.customer_id && eligibility.period?.periodEnd && form.reading_date !== eligibility.period.periodEnd) {
            setForm((current) =>
              current.customer_id || current.reading_date === eligibility.period.periodEnd
                ? current
                : { ...current, reading_date: eligibility.period.periodEnd }
            );
          }
        }
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [form.reading_date, form.customer_id, editingId]);

  useEffect(() => {
    if (!["admin", "accountant"].includes(user?.role)) return undefined;
    let ignore = false;
    api.billing.sourceBillingRequests
      .workspace(sourceForm.reading_date)
      .then((workspace) => {
        if (!ignore) {
          setSourceWorkspace(workspace);
          if (!sourceForm.customer_id && workspace.period?.periodEnd && sourceForm.reading_date !== workspace.period.periodEnd) {
            setSourceForm((current) =>
              current.customer_id || current.reading_date === workspace.period.periodEnd
                ? current
                : { ...current, reading_date: workspace.period.periodEnd }
            );
          }
        }
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [sourceForm.reading_date, user?.role]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setSourceField = (field, value) => setSourceForm((current) => ({ ...current, [field]: value }));
  const selectReadingCustomer = (customerId) => {
    const eligible = eligibleReadingCustomers.find((customer) => Number(customer.id) === Number(customerId));
    setForm((current) => ({
      ...current,
      customer_id: customerId,
      meter_id: "",
      fallback_reason: "",
      reading_date: eligible?.suggested_reading_date || current.reading_date
    }));
  };
  const selectSourceWorkspaceRow = (row) => {
    setSourceForm((current) => ({
      ...current,
      customer_id: String(row.customer_id),
      meter_id: String(row.source_meter_id),
      reading_date: sourceWorkspace.period?.periodEnd || current.reading_date,
      fallback_reason: row.source_billing_reason || current.fallback_reason || ""
    }));
  };
  const setMeterField = (field, value) => setMeterForm((current) => ({ ...current, [field]: value }));
  const setReplacementField = (field, value) =>
    setReplacementForm((current) => ({ ...current, [field]: value }));
  const setEventField = (field, value) => setEventForm((current) => ({ ...current, [field]: value }));
  const restrictedReadingPeriod = ["closed", "locked"].includes(readingContext?.billingPeriod?.status);
  const restrictedSourcePeriod = ["closed", "locked"].includes(sourceContext?.billingPeriod?.status);
  const restrictedReplacementPeriod = ["closed", "locked"].includes(replacementContext?.billingPeriod?.status);

  const importReady = useMemo(
    () => importPreview?.rows?.length > 0 && importPreview.summary.invalid === 0,
    [importPreview]
  );

  useEffect(() => {
    let ignore = false;

    if (!form.customer_id || !form.reading_date) {
      setReadingContext(null);
      return undefined;
    }

    api.readings
      .context(form.customer_id, form.reading_date, form.meter_id)
      .then((context) => {
        if (!ignore) {
          setReadingContext(context);
          if (!form.meter_id && context.activeMeter?.id) {
            setForm((current) => (current.meter_id ? current : { ...current, meter_id: String(context.activeMeter.id) }));
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          setReadingContext(null);
          setMessage(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [form.customer_id, form.reading_date, form.meter_id]);

  useEffect(() => {
    let ignore = false;

    if (!sourceForm.customer_id || !sourceForm.reading_date || !sourceForm.meter_id) {
      setSourceContext(null);
      return undefined;
    }

    api.readings
      .context(sourceForm.customer_id, sourceForm.reading_date, sourceForm.meter_id)
      .then((context) => {
        if (!ignore) setSourceContext(context);
      })
      .catch((err) => {
        if (!ignore) {
          setSourceContext(null);
          setMessage(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [sourceForm.customer_id, sourceForm.reading_date, sourceForm.meter_id]);

  useEffect(() => {
    let ignore = false;

    if (!replacementForm.customer_id || !replacementForm.event_date) {
      setReplacementContext(null);
      return undefined;
    }

    api.readings
      .context(replacementForm.customer_id, replacementForm.event_date)
      .then((context) => {
        if (!ignore) {
          setReplacementContext(context);
          setReplacementForm((current) => {
            if (current.old_final_reading) return current;
            return {
              ...current,
              old_final_reading: context.previousReading?.reading_value || ""
            };
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setReplacementContext(null);
          setMessage(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [replacementForm.customer_id, replacementForm.event_date]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        meter_id: Number(form.meter_id || readingContext?.activeMeter?.id),
        reading_value: Number(form.reading_value),
        previous_reading_value: form.previous_reading_value === "" ? null : Number(form.previous_reading_value),
        reading_date: form.reading_date,
        fallback_reason: form.fallback_reason,
        correction_reason: form.correction_reason
      };
      const result = editingId
        ? await api.readings.update(editingId, payload)
        : await api.readings.create(payload);
      setForm({
        customer_id: "",
        meter_id: "",
        reading_value: "",
        previous_reading_value: "",
        reading_date: readingEligibility?.period?.periodEnd || today(),
        fallback_reason: "",
        correction_reason: ""
      });
      setReadingContext(null);
      setEditingId(null);
      await load();
      setMessage(
        editingId
          ? "Reading updated and bills recalculated."
          : result.sourceBillingRequest
            ? "Source-side reading submitted for admin billing approval."
            : result.bill
              ? "Reading submitted and bill generated."
              : "Baseline reading submitted."
      );
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (reading) => {
    setEditingId(reading.id);
    setForm({
      customer_id: reading.customer_id || "",
      meter_id: reading.meter_id || "",
      reading_value: reading.reading_value || "",
      previous_reading_value: reading.previous_reading_id ? "" : reading.previous_reading_value ?? "",
      reading_date: reading.reading_date?.slice(0, 10) || today(),
      fallback_reason: "",
      correction_reason: ""
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setReadingContext(null);
    setForm({
      customer_id: "",
      meter_id: "",
      reading_value: "",
      previous_reading_value: "",
      reading_date: readingEligibility?.period?.periodEnd || today(),
      fallback_reason: "",
      correction_reason: ""
    });
  };

  const submitSourceReading = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const result = await api.readings.create({
        customer_id: Number(sourceForm.customer_id),
        meter_id: Number(sourceForm.meter_id || sourceContext?.activeMeter?.id),
        reading_value: Number(sourceForm.reading_value),
        previous_reading_value: sourceForm.previous_reading_value === "" ? null : Number(sourceForm.previous_reading_value),
        reading_date: sourceForm.reading_date,
        fallback_reason: sourceForm.fallback_reason,
        correction_reason: sourceForm.correction_reason
      });
      setSourceForm({
        customer_id: "",
        meter_id: "",
        reading_value: "",
        previous_reading_value: "",
        reading_date: sourceWorkspace?.period?.periodEnd || today(),
        fallback_reason: "",
        correction_reason: ""
      });
      setSourceContext(null);
      await load();
      setMessage(
        result.sourceBillingRequest
          ? "Source reading submitted for billing review."
          : "Source reading submitted."
      );
    } catch (err) {
      setMessage(err.message);
    }
  };

  const submitMeter = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.meters.create({
        customer_id: Number(meterForm.customer_id),
        meter_number: meterForm.meter_number.trim(),
        meter_role: meterForm.meter_role,
        installed_at: meterForm.installed_at,
        initial_reading: Number(meterForm.initial_reading || 0),
        notes: meterForm.notes
      });
      setMeterForm({
        customer_id: "",
        meter_number: "",
        meter_role: "source_backup",
        installed_at: today(),
        initial_reading: "0",
        notes: ""
      });
      await load();
      setMessage("Meter registered.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const reviewSourceRequest = async (request, action) => {
    const reviewNotes = window.prompt(
      action === "approve" ? "Approval notes for this source-side bill:" : "Reason for rejecting this source-side bill:",
      action === "approve" ? request.reason || "" : ""
    );
    if (reviewNotes === null) return;
    setMessage("");
    try {
      await api.billing.sourceBillingRequests.review(request.id, {
        action,
        review_notes: reviewNotes.trim()
      });
      await load();
      setMessage(action === "approve" ? "Source-side bill approved and generated." : "Source-side billing request rejected.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const promoteBill = async (billId, label) => {
    const reason = window.prompt(`Reason for promoting ${label} for payment:`);
    if (!reason?.trim()) return;
    setMessage("");
    try {
      await api.bills.promote(billId, { correction_reason: reason.trim() });
      await load();
      setMessage(`${label} promoted for payment.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const promoteCompetingBill = (request) => {
    const competingBills = request.competing_bills || [];
    const candidates = competingBills.filter((bill) => bill.bill_pay_status !== "payable");
    if (!candidates.length) {
      setMessage("No held or superseded client bill is available to promote.");
      return;
    }
    const selected = window.prompt(
      `Bill to promote:\n${candidates
        .map((bill) => `${bill.id}: ${bill.bill_number} (${money(bill.total_amount)})`)
        .join("\n")}\n\nEnter bill ID:`,
      String(candidates[0].id)
    );
    if (selected === null) return;
    const bill = candidates.find((candidate) => Number(candidate.id) === Number(selected));
    if (!bill) {
      setMessage("Selected bill was not found in the comparison list.");
      return;
    }
    promoteBill(bill.id, bill.bill_number || `Bill ${bill.id}`);
  };

  const submitReplacement = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await api.meters.replace({
        customer_id: Number(replacementForm.customer_id),
        old_final_reading: Number(replacementForm.old_final_reading),
        new_meter_number: replacementForm.new_meter_number.trim(),
        new_initial_reading: Number(replacementForm.new_initial_reading || 0),
        event_date: replacementForm.event_date,
        reason: replacementForm.reason
      });
      setReplacementForm({
        customer_id: "",
        old_final_reading: "",
        new_meter_number: "",
        new_initial_reading: "0",
        event_date: today(),
        reason: ""
      });
      setReplacementContext(null);
      await load();
      setMessage("Meter replacement recorded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const editMeterEvent = (event) => {
    setEditingEventId(event.id);
    setEventForm({
      event_date: event.event_date?.slice(0, 10) || today(),
      old_final_reading: event.old_final_reading ?? "",
      new_initial_reading: event.new_initial_reading ?? "",
      reason: event.reason || "",
      correction_reason: ""
    });
  };

  const cancelMeterEventEdit = () => {
    setEditingEventId(null);
    setEventForm({
      event_date: "",
      old_final_reading: "",
      new_initial_reading: "",
      reason: "",
      correction_reason: ""
    });
  };

  const submitMeterEventEdit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.meters.updateEvent(editingEventId, {
        event_date: eventForm.event_date,
        old_final_reading: Number(eventForm.old_final_reading),
        new_initial_reading: Number(eventForm.new_initial_reading || 0),
        reason: eventForm.reason,
        correction_reason: eventForm.correction_reason
      });
      cancelMeterEventEdit();
      await load();
      setMessage("Meter event updated.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setImportPreview(null);
  };

  const previewImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const preview = await api.readings.previewImport(csvText);
      setImportPreview(preview);
      setMessage(
        preview.summary.invalid
          ? `${preview.summary.invalid} CSV row(s) need correction before import.`
          : `${preview.summary.valid} CSV row(s) ready to import.`
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };

  const commitImport = async () => {
    setMessage("");
    setImporting(true);
    try {
      const result = await api.readings.commitImport(csvText, importCorrectionReason);
      await load();
      setImportPreview(null);
      setMessage(`Imported ${result.summary.imported} reading(s) and created ${result.summary.billsCreated} bill(s).`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setImporting(false);
    }
  };
  const focusKey = navigationIntent?.page === "readings" ? navigationIntent.focus : "";
  const hasReadingFocus = ["missing_readings", "pending_source_billing"].includes(focusKey);
  const showReadingEntryStack = !hasReadingFocus || focusKey === "missing_readings";
  const showReadingForm = !hasReadingFocus || focusKey === "missing_readings";
  const showReadingSetupTools = !hasReadingFocus;
  const showSourceReview = !hasReadingFocus || focusKey === "pending_source_billing";
  const showReadingRegisters = !hasReadingFocus;
  const selectedCustomer = customers.find((customer) => Number(customer.id) === Number(form.customer_id));
  const selectedSourceWorkspaceRow = sourceWorkspace.rows?.find(
    (row) =>
      Number(row.customer_id) === Number(sourceForm.customer_id) &&
      Number(row.source_meter_id) === Number(sourceForm.meter_id)
  );
  const sourceRowsMissingReading = (sourceWorkspace.rows || []).filter((row) => !row.source_reading_id);
  const sourceReadingOptions =
    selectedSourceWorkspaceRow &&
    selectedSourceWorkspaceRow.source_reading_id &&
    !sourceRowsMissingReading.some(
      (row) =>
        Number(row.customer_id) === Number(selectedSourceWorkspaceRow.customer_id) &&
        Number(row.source_meter_id) === Number(selectedSourceWorkspaceRow.source_meter_id)
    )
      ? [selectedSourceWorkspaceRow, ...sourceRowsMissingReading]
      : sourceRowsMissingReading;
  const readingCustomerOptions = editingId
    ? customers
    : selectedCustomer && !eligibleReadingCustomers.some((customer) => Number(customer.id) === Number(selectedCustomer.id))
      ? [selectedCustomer, ...eligibleReadingCustomers]
      : eligibleReadingCustomers;
  const filteredReadings = readings.filter((reading) => {
    const dateValue = reading.reading_date?.slice(0, 10) || "";
    const customerMatch = !customerFilter || Number(reading.customer_id) === Number(customerFilter);
    const fromMatch = !dateFromFilter || dateValue >= dateFromFilter;
    const toMatch = !dateToFilter || dateValue <= dateToFilter;
    return customerMatch && fromMatch && toMatch;
  });
  const readingTable = useTableControls(filteredReadings, {
    searchFields: [
      "customer_name",
      "acc_number",
      "meter_number",
      "meter_role",
      "source_billing_request_status",
      "reading_value",
      "reading_date",
      "created_by_name"
    ]
  });
  const meterEventTable = useTableControls(meterEvents, {
    searchFields: ["customer_name", "acc_number", "event_date", "old_meter_number", "new_meter_number", "reason"]
  });
  const focusedSourceRequests = focusKey === "pending_source_billing"
    ? sourceRequests.filter((request) => request.status === "pending")
    : sourceRequests;
  const sourceRequestTable = useTableControls(focusedSourceRequests, {
    searchFields: ["customer_name", "acc_number", "meter_number", "status", "reason", "bill_number", "requested_by_name"]
  });
  const sourceWorkspaceTable = useTableControls(sourceWorkspace.rows || [], {
    searchFields: [
      "customer_name",
      "acc_number",
      "zone_name",
      "source_meter_number",
      "client_meter_number",
      "source_billing_request_status",
      "source_bill_number",
      "client_bill_number",
      "variance_units",
      "variance_percent"
    ]
  });
  const exportReadings = () => {
    downloadCsvRows(
      namedExport("meter-reading-register", "csv", [
        customerFilter
          ? customers.find((customer) => Number(customer.id) === Number(customerFilter))?.acc_number
          : "all-customers",
        dateFromFilter || "start",
        dateToFilter || "end"
      ]),
      [
        { header: "Customer", value: (row) => row.customer_name },
        { header: "Account", value: (row) => row.acc_number },
        { header: "Meter", value: (row) => row.meter_number },
        { header: "Previous", value: (row) => row.previous_reading_value },
        { header: "Reading", value: (row) => row.reading_value },
        { header: "Date", value: (row) => row.reading_date },
        { header: "Reader", value: (row) => row.created_by_name }
      ],
      readingTable.filteredRows
    );
  };
  const prepareReadingForCustomer = (customerId) => {
    selectReadingCustomer(String(customerId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Field Work</p>
          <h2>Meter Readings</h2>
        </div>
      </header>

      {focusKey === "missing_readings" ? (
        <FocusNotice
          title="Missing period readings"
          detail={`Showing active metered customers without a reading for ${readingEligibility?.period?.name || "the selected period"}.`}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "pending_source_billing" ? (
        <FocusNotice
          title="Source billing reviews"
          detail="Showing pending source-side billing records awaiting review."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="workspace-grid">
        {showReadingEntryStack ? (
        <div className="page-stack">
          {showReadingForm ? (
          <CollapsibleSection
            as="form"
            className="form-grid"
            defaultOpen={showReadingForm}
            icon={editingId ? <Save size={18} /> : <Send size={18} />}
            onSubmit={submit}
            summary={
              editingId
                ? `Editing #${editingId}`
                : `${readingCustomerOptions.length.toLocaleString()} customer(s) awaiting reading`
            }
            title={editingId ? "Edit Reading" : "Submit Reading"}
          >
            <label>
              Customer
              <select
                value={form.customer_id}
                onChange={(event) => selectReadingCustomer(event.target.value)}
                required
              >
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
              {!editingId && !readingCustomerOptions.length ? (
                <small>No active metered customers are missing readings for this period.</small>
              ) : null}
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
                  <strong>
                    {readingContext.previousReading
                      ? Number(readingContext.previousReading.reading_value).toLocaleString()
                      : "Baseline"}
                  </strong>
                  <small>{readingContext.previousReading?.reading_date?.slice(0, 10) || "No earlier reading"}</small>
                </div>
                <div>
                  <span>Billing period</span>
                  <strong>{readingContext.billingPeriod?.name}</strong>
                  <small>
                    {readingContext.billingPeriod?.status || "open"} | Due {readingContext.billingPeriod?.dueDate}
                  </small>
                </div>
              </div>
            ) : null}
            {readingContext?.availableMeters?.length ? (
              <label>
                Meter
                <select value={form.meter_id} onChange={(event) => setField("meter_id", event.target.value)} required>
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
              <input
                value={form.reading_value}
                onChange={(event) => setField("reading_value", event.target.value)}
                type="number"
                min={readingContext?.previousReading?.reading_value || form.previous_reading_value || 0}
                required
              />
            </label>
            {editingId && !readingContext?.previousReading ? (
              <label>
                Base reading for this bill
                <input
                  value={form.previous_reading_value}
                  onChange={(event) => setField("previous_reading_value", event.target.value)}
                  type="number"
                  min="0"
                  placeholder="Optional previous/base reading"
                />
              </label>
            ) : null}
            <label>
              Reading date
              <input value={form.reading_date} onChange={(event) => setField("reading_date", event.target.value)} type="date" required />
              <small>
                {readingEligibility?.period?.name
                  ? `Period closes ${readingEligibility.period.periodEnd}`
                  : "Select any date in the billing month; the form uses the month-end reading day."}
              </small>
            </label>
            {readingContext?.activeMeter?.meter_role === "source_backup" ? (
              <label>
                Source review note
                <textarea
                  value={form.fallback_reason}
                  onChange={(event) => setField("fallback_reason", event.target.value)}
                  rows="2"
                  placeholder="Optional note for source-side billing review"
                />
              </label>
            ) : null}
            {editingId || restrictedReadingPeriod ? (
              <label>
                Correction reason
                <textarea
                  value={form.correction_reason}
                  onChange={(event) => setField("correction_reason", event.target.value)}
                  rows="2"
                  required={restrictedReadingPeriod}
                  placeholder={restrictedReadingPeriod ? "Required for closed or locked periods" : "Optional audit note"}
                />
              </label>
            ) : null}
            <button className="primary-button" type="submit">
              {editingId ? <Save size={17} /> : <Send size={17} />}
              {editingId ? "Save reading" : "Submit reading"}
            </button>
            {editingId ? (
              <button type="button" onClick={cancelEdit}>
                Cancel edit
              </button>
            ) : null}
            {editingId ? <AuditPanel entityType="meter_reading" entityId={editingId} title="Reading Audit" /> : null}
          </CollapsibleSection>
          ) : null}

          {showReadingSetupTools && ["admin", "accountant"].includes(user?.role) ? (
          <CollapsibleSection
            as="form"
            className="form-grid"
            icon={<Gauge size={18} />}
            onSubmit={submitMeter}
            summary={`${customers.length.toLocaleString()} customer(s)`}
            title="Register Meter"
          >
            <label>
              Customer
              <select value={meterForm.customer_id} onChange={(event) => setMeterField("customer_id", event.target.value)} required>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Meter role
              <select value={meterForm.meter_role} onChange={(event) => setMeterField("meter_role", event.target.value)}>
                <option value="source_backup">Source backup</option>
                <option value="client_billing">Client billing</option>
              </select>
            </label>
            <label>
              Meter number
              <input value={meterForm.meter_number} onChange={(event) => setMeterField("meter_number", event.target.value)} required />
            </label>
            <label>
              Installed date
              <input value={meterForm.installed_at} onChange={(event) => setMeterField("installed_at", event.target.value)} type="date" required />
            </label>
            <label>
              Initial reading
              <input
                value={meterForm.initial_reading}
                onChange={(event) => setMeterField("initial_reading", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>
            <label>
              Notes
              <textarea value={meterForm.notes} onChange={(event) => setMeterField("notes", event.target.value)} rows="2" />
            </label>
            <button className="primary-button" type="submit">
              <Save size={17} />
              Register meter
            </button>
          </CollapsibleSection>
          ) : null}

          {showReadingSetupTools ? (
          <CollapsibleSection
            as="form"
            className="form-grid"
            defaultOpen={Boolean(replacementContext)}
            icon={<Replace size={18} />}
            onSubmit={submitReplacement}
            summary={replacementContext?.activeMeter?.meter_number || "Select customer and meter"}
            title="Replace Meter"
          >
            <label>
              Customer
              <select
                value={replacementForm.customer_id}
                onChange={(event) => setReplacementField("customer_id", event.target.value)}
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.acc_number} - {customer.name}
                  </option>
                ))}
              </select>
            </label>
            {replacementContext ? (
              <div className="reading-context">
                <div>
                  <span>Current meter</span>
                  <strong>{replacementContext.activeMeter?.meter_number || "-"}</strong>
                </div>
                <div>
                  <span>Latest reading</span>
                  <strong>
                    {replacementContext.previousReading
                      ? Number(replacementContext.previousReading.reading_value).toLocaleString()
                      : "No reading"}
                  </strong>
                  <small>{replacementContext.previousReading?.reading_date?.slice(0, 10) || "Record a final reading"}</small>
                </div>
                <div>
                  <span>Billing period</span>
                  <strong>{replacementContext.billingPeriod?.name}</strong>
                  <small>{replacementContext.billingPeriod?.status || "open"}</small>
                </div>
              </div>
            ) : null}
            <label>
              Replacement date
              <input
                value={replacementForm.event_date}
                onChange={(event) => setReplacementField("event_date", event.target.value)}
                type="date"
                required
              />
            </label>
            <label>
              Old final reading
              <input
                value={replacementForm.old_final_reading}
                onChange={(event) => setReplacementField("old_final_reading", event.target.value)}
                type="number"
                min={replacementContext?.previousReading?.reading_value || 0}
                required
              />
            </label>
            <label>
              New meter number
              <input
                value={replacementForm.new_meter_number}
                onChange={(event) => setReplacementField("new_meter_number", event.target.value)}
                required
              />
            </label>
            <label>
              New initial reading
              <input
                value={replacementForm.new_initial_reading}
                onChange={(event) => setReplacementField("new_initial_reading", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>
            <label>
              Reason
              <textarea
                value={replacementForm.reason}
                onChange={(event) => setReplacementField("reason", event.target.value)}
                rows="3"
                required={restrictedReplacementPeriod}
                placeholder={restrictedReplacementPeriod ? "Required for closed or locked periods" : ""}
              />
            </label>
            <button className="primary-button" type="submit">
              <Replace size={17} />
              Record replacement
            </button>
          </CollapsibleSection>
          ) : null}

          {showReadingSetupTools ? (
          <CollapsibleSection
            actions={
              <button
                type="button"
                onClick={() => downloadCsvTemplate("readings-import-template.csv", readingImportHeaders)}
              >
                <Download size={16} />
                Template
              </button>
            }
            className="form-grid"
            defaultOpen={Boolean(importPreview)}
            icon={<FileUp size={18} />}
            summary={importPreview ? `${importPreview.summary.valid} valid | ${importPreview.summary.invalid} invalid` : "Template and CSV upload"}
            title="Import Readings CSV"
          >
            <label>
              CSV file
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </label>
            <label>
              CSV content
              <textarea
                value={csvText}
                onChange={(event) => {
                  setCsvText(event.target.value);
                  setImportPreview(null);
                }}
                rows="7"
                placeholder={"acc_number,reading_date,reading_value,notes\nAG-0001,2026-06-30,240,End month route reading"}
              />
            </label>
            <label>
              Correction reason
              <textarea
                value={importCorrectionReason}
                onChange={(event) => setImportCorrectionReason(event.target.value)}
                rows="2"
                placeholder="Required if imported readings touch closed or locked periods"
              />
            </label>
            <p className="muted">
              Required columns: acc_number or customer_id, reading_date, reading_value. Optional: meter_number, notes.
            </p>
            {importPreview ? (
              <div className="reading-context">
                <div>
                  <span>Total rows</span>
                  <strong>{importPreview.summary.total}</strong>
                </div>
                <div>
                  <span>Valid</span>
                  <strong>{importPreview.summary.valid}</strong>
                </div>
                <div>
                  <span>Bills expected</span>
                  <strong>{importPreview.summary.billsExpected}</strong>
                </div>
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={previewImport} disabled={importing}>
              <Eye size={17} />
              Preview CSV
            </button>
            <button type="button" onClick={commitImport} disabled={!importReady || importing}>
              <FileUp size={17} />
              Import valid rows
            </button>
          </CollapsibleSection>
          ) : null}
        </div>
        ) : null}

        <div className="page-stack wide-panel">
          {focusKey === "missing_readings" ? (
            <CollapsibleSection
              defaultOpen
              icon={<Gauge size={18} />}
              summary={`${eligibleReadingCustomers.length.toLocaleString()} customer(s)`}
              title={`${readingEligibility?.period?.name || "Period"} Reading Gaps`}
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Account</th>
                      <th>Zone</th>
                      <th>Suggested Date</th>
                      <th>Latest Reading</th>
                      <th>Balance</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleReadingCustomers.length ? (
                      eligibleReadingCustomers.map((customer) => (
                        <tr key={customer.id}>
                          <td>{customer.name}</td>
                          <td>{customer.acc_number}</td>
                          <td>{customer.zone_name || customer.location || "-"}</td>
                          <td>{customer.suggested_reading_date || readingEligibility?.period?.periodEnd || "-"}</td>
                          <td>
                            {customer.latest_reading_value === null || customer.latest_reading_value === undefined
                              ? "Baseline"
                              : Number(customer.latest_reading_value).toLocaleString()}
                            <small>{customer.latest_reading_date?.slice(0, 10) || "No earlier reading"}</small>
                          </td>
                          <td>{money(customer.balance_due)}</td>
                          <td>
                            <button type="button" onClick={() => prepareReadingForCustomer(customer.id)}>
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow
                        colSpan={7}
                        title="No reading gaps"
                        detail="All active metered customers have a reading for this period."
                      />
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          ) : null}

          {showReadingRegisters && importPreview ? (
            <CollapsibleSection
              defaultOpen
              icon={<FileUp size={18} />}
              summary={`${importPreview.rows.length.toLocaleString()} row(s)`}
              title="CSV Preview"
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Account</th>
                      <th>Customer</th>
                      <th>Meter</th>
                      <th>Date</th>
                      <th>Reading</th>
                      <th>Previous</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.acc_number || "-"}</td>
                        <td>{row.customer_name || "-"}</td>
                        <td>{row.meter_number || "-"}</td>
                        <td>{row.reading_date || "-"}</td>
                        <td>{row.reading_value === "" ? "-" : Number(row.reading_value).toLocaleString()}</td>
                        <td>
                          {row.previous_reading_value === null || row.previous_reading_value === undefined
                            ? "-"
                            : Number(row.previous_reading_value).toLocaleString()}
                        </td>
                        <td>
                          <span className={`status status-${row.status}`}>{row.status}</span>
                          {[...row.errors, ...row.warnings].map((item) => (
                            <small key={item}>{item}</small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          ) : null}

          {showSourceReview && ["admin", "accountant"].includes(user?.role) ? (
          <>
          <CollapsibleSection
            defaultOpen={focusKey === "pending_source_billing"}
            icon={<Gauge size={18} />}
            summary={`${sourceWorkspace?.period?.name || "Selected period"} | ${sourceRowsMissingReading.length.toLocaleString()} missing`}
            title="Source Meter Reading Entry"
          >
            <p className="muted">
              {sourceWorkspace?.period?.name || "Selected period"} source meters. Normal route readings stay separate from this source-side workflow.
            </p>
            <form className="form-grid" onSubmit={submitSourceReading}>
              <label>
                Source period date
                <input
                  value={sourceForm.reading_date}
                  onChange={(event) => setSourceField("reading_date", event.target.value)}
                  type="date"
                  required
                />
              </label>
              <label>
                Source customer / meter
                <select
                  value={sourceForm.customer_id && sourceForm.meter_id ? `${sourceForm.customer_id}:${sourceForm.meter_id}` : ""}
                  onChange={(event) => {
                    if (!event.target.value) {
                      setSourceForm((current) => ({
                        ...current,
                        customer_id: "",
                        meter_id: "",
                        reading_value: "",
                        previous_reading_value: "",
                        fallback_reason: "",
                        correction_reason: ""
                      }));
                      return;
                    }
                    const [customerId, meterId] = event.target.value.split(":");
                    const row = (sourceWorkspace.rows || []).find(
                      (item) => Number(item.customer_id) === Number(customerId) && Number(item.source_meter_id) === Number(meterId)
                    );
                    if (row) selectSourceWorkspaceRow(row);
                  }}
                  required
                >
                  <option value="">Select missing source meter</option>
                  {sourceReadingOptions.map((row) => (
                    <option key={`${row.customer_id}-${row.source_meter_id}`} value={`${row.customer_id}:${row.source_meter_id}`}>
                      {row.acc_number} - {row.customer_name} ({row.source_meter_number})
                    </option>
                  ))}
                </select>
                {!sourceReadingOptions.length ? (
                  <small>No source meters are missing readings for this period.</small>
                ) : null}
              </label>
              <label>
                Previous source reading
                <input
                  value={
                    sourceContext?.previousReading?.reading_value ??
                    selectedSourceWorkspaceRow?.previous_source_reading_value ??
                    ""
                  }
                  readOnly
                  placeholder="No earlier source reading"
                />
              </label>
              <label>
                Source end reading
                <input
                  value={sourceForm.reading_value}
                  onChange={(event) => setSourceField("reading_value", event.target.value)}
                  type="number"
                  min={sourceContext?.previousReading?.reading_value || selectedSourceWorkspaceRow?.previous_source_reading_value || 0}
                  required
                />
              </label>
              <label>
                Source review note
                <textarea
                  value={sourceForm.fallback_reason}
                  onChange={(event) => setSourceField("fallback_reason", event.target.value)}
                  rows="2"
                  placeholder="Optional note for the billing review"
                />
              </label>
              <label>
                Correction reason
                <textarea
                  value={sourceForm.correction_reason}
                  onChange={(event) => setSourceField("correction_reason", event.target.value)}
                  rows="2"
                  required={restrictedSourcePeriod}
                  placeholder={restrictedSourcePeriod ? "Required for closed or locked periods" : ""}
                />
              </label>
              {selectedSourceWorkspaceRow?.source_reading_id ? (
                <p className="muted">
                  This source meter already has a reading for the selected period. Use the review table below, or edit the reading from Recent Readings.
                </p>
              ) : null}
              <button className="primary-button" type="submit" disabled={Boolean(selectedSourceWorkspaceRow?.source_reading_id)}>
                <Send size={17} />
                Submit source reading
              </button>
            </form>
            <div className="reading-context">
              <div>
                <span>Source meters</span>
                <strong>{Number(sourceWorkspace.rows?.length || 0).toLocaleString()}</strong>
              </div>
              <div>
                <span>Missing source readings</span>
                <strong>{Number(sourceRowsMissingReading.length || 0).toLocaleString()}</strong>
              </div>
              <div>
                <span>Selected client reading</span>
                <strong>{selectedSourceWorkspaceRow?.client_reading_id ? "Captured" : "-"}</strong>
              </div>
              <div>
                <span>Selected source review</span>
                <strong>{selectedSourceWorkspaceRow?.source_billing_request_status || "-"}</strong>
              </div>
            </div>
            <TableControls table={sourceWorkspaceTable} label="source meters" placeholder="Search source workspace" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Source Meter</th>
                    <th>Source Reading</th>
                    <th>Client Reading</th>
                    <th>Comparison</th>
                    <th>Bills</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceWorkspaceTable.visibleRows.length ? (
                    sourceWorkspaceTable.visibleRows.map((row) => (
                      <tr key={`${row.customer_id}-${row.source_meter_id}`}>
                        <td>
                          <strong>{row.customer_name}</strong>
                          <small>{row.acc_number}{row.zone_name ? ` | ${row.zone_name}` : ""}</small>
                        </td>
                        <td>
                          {row.source_meter_number}
                          <small>{meterRoleLabels.source_backup}</small>
                        </td>
                        <td>
                          {row.source_reading_id ? Number(row.source_reading_value || 0).toLocaleString() : "Missing"}
                          <small>
                            {row.source_reading_date?.slice(0, 10) ||
                              (row.previous_source_reading_value === null || row.previous_source_reading_value === undefined
                                ? "No earlier source reading"
                                : `Previous ${Number(row.previous_source_reading_value).toLocaleString()}`)}
                          </small>
                        </td>
                        <td>
                          {row.client_reading_id ? Number(row.client_reading_value || 0).toLocaleString() : "Not captured"}
                          <small>{row.client_meter_number || row.client_reading_date?.slice(0, 10) || ""}</small>
                        </td>
                        <td>
                          <strong>{row.variance_units === null || row.variance_units === undefined ? "-" : Number(row.variance_units || 0).toLocaleString()}</strong>
                          <small>
                            Primary {Number(row.client_units_used || 0).toLocaleString()} | Source {Number(row.source_units_used || 0).toLocaleString()}
                          </small>
                          <small>
                            {row.variance_percent === null || row.variance_percent === undefined ? "Variance unavailable" : percent(row.variance_percent)}
                          </small>
                        </td>
                        <td>
                          {row.source_bill_number ? (
                            <small>Source: {row.source_bill_number} | {row.source_bill_pay_status} | {money(row.source_bill_total)}</small>
                          ) : (
                            <small>Source: none</small>
                          )}
                          {row.client_bill_number ? (
                            <small>Client: {row.client_bill_number} | {row.client_bill_pay_status} | {money(row.client_bill_total)}</small>
                          ) : (
                            <small>Client: none</small>
                          )}
                        </td>
                        <td>
                          <button type="button" onClick={() => selectSourceWorkspaceRow(row)}>
                            {row.source_reading_id ? "Use meter" : "Enter reading"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow
                      colSpan={7}
                      title="No source meters found"
                      detail="Customers with active source backup meters will appear here for source-side reading and bill review."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            defaultOpen={focusKey === "pending_source_billing"}
            icon={<Gauge size={18} />}
            summary={`${sourceRequestTable.filteredRows.length.toLocaleString()} record(s)`}
            title="Source Billing Review"
          >
            <TableControls table={sourceRequestTable} label="source billing records" placeholder="Search source billing" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Meter</th>
                    <th>Period</th>
                    <th>Units</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRequestTable.visibleRows.length ? (
                    sourceRequestTable.visibleRows.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <strong>{request.customer_name}</strong>
                          <small>{request.acc_number}</small>
                        </td>
                        <td>
                          {request.meter_number}
                          <small>{meterRoleLabels[request.meter_role] || request.meter_role}</small>
                        </td>
                        <td>{request.billing_period_name || "-"}</td>
                        <td>
                          {Number(request.units_used || 0).toLocaleString()}
                          <small>
                            {Number(request.previous_reading || 0).toLocaleString()} to{" "}
                            {Number(request.current_reading || 0).toLocaleString()}
                          </small>
                        </td>
                        <td>{money(request.amount)}</td>
                        <td>{request.reason}</td>
                        <td>
                          <span className={`status status-${request.status}`}>{request.status}</span>
                          <small>
                            {request.bill_number
                              ? `${request.bill_number} | ${request.bill_pay_status || "payable"}`
                              : request.review_notes || request.requested_by_name || ""}
                          </small>
                          {(request.competing_bills || []).map((bill) => (
                            <small key={bill.id}>
                              {bill.bill_number}: {bill.bill_pay_status} | {money(bill.total_amount)}
                            </small>
                          ))}
                        </td>
                        <td>
                          {request.status === "pending" && user?.role === "admin" ? (
                            <div className="row-actions">
                              <button type="button" onClick={() => reviewSourceRequest(request, "approve")}>
                                Approve
                              </button>
                              <button type="button" onClick={() => reviewSourceRequest(request, "reject")}>
                                Reject
                              </button>
                            </div>
                          ) : request.status === "approved" && user?.role === "admin" ? (
                            <div className="row-actions">
                              {request.bill_id && request.bill_pay_status !== "payable" ? (
                                <button type="button" onClick={() => promoteBill(request.bill_id, request.bill_number || "Source bill")}>
                                  Promote source
                                </button>
                              ) : null}
                              {(request.competing_bills || []).some((bill) => bill.bill_pay_status !== "payable") ? (
                                <button type="button" onClick={() => promoteCompetingBill(request)}>
                                  Promote client
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow
                      colSpan={8}
                      title="No source billing records"
                      detail="Source-side fallback bills and promotion choices will appear here."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          </>
          ) : null}

          {showReadingRegisters ? (
          <CollapsibleSection
            actions={
              <button type="button" onClick={exportReadings}>
                  <Download size={16} />
                  Export
                </button>
            }
            defaultOpen
            icon={<Gauge size={18} />}
            summary={`${readingTable.filteredRows.length.toLocaleString()} reading(s)`}
            title="Recent Readings"
          >
            <div className="table-toolbar">
              <label>
                Customer
                <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
                  <option value="">All customers</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.acc_number} - {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} type="date" />
              </label>
              <label>
                To
                <input value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} type="date" />
              </label>
            </div>
            <TableControls table={readingTable} label="readings" placeholder="Search readings" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Account</th>
                    <th>Meter</th>
                    <th>Role</th>
                    <th>Previous</th>
                    <th>Reading</th>
                    <th>Date</th>
                    <th>Reader</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {readingTable.visibleRows.length ? (
                    readingTable.visibleRows.map((reading) => (
                      <tr key={reading.id}>
                        <td>{reading.customer_name}</td>
                        <td>{reading.acc_number}</td>
                        <td>{reading.meter_number || "-"}</td>
                        <td>
                          {meterRoleLabels[reading.meter_role] || "Client billing"}
                          {reading.source_billing_request_status ? (
                            <small>{reading.source_billing_request_status}</small>
                          ) : null}
                        </td>
                        <td>
                          {reading.previous_reading_value === null || reading.previous_reading_value === undefined
                            ? "-"
                            : Number(reading.previous_reading_value).toLocaleString()}
                          <small>{reading.previous_reading_date?.slice(0, 10) || ""}</small>
                        </td>
                        <td>{Number(reading.reading_value).toLocaleString()}</td>
                        <td>{reading.reading_date?.slice(0, 10)}</td>
                        <td>{reading.created_by_name || "-"}</td>
                        <td>
                          <button type="button" onClick={() => edit(reading)}>Edit</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={9} title="No readings found" detail="Record readings or adjust the filters." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}

          {showReadingRegisters ? (
          <CollapsibleSection
            defaultOpen={Boolean(editingEventId)}
            icon={<Replace size={18} />}
            summary={`${meterEventTable.filteredRows.length.toLocaleString()} event(s)`}
            title="Meter Events"
          >
            {editingEventId ? (
              <form className="form-grid" onSubmit={submitMeterEventEdit}>
                <label>
                  Event date
                  <input value={eventForm.event_date} onChange={(event) => setEventField("event_date", event.target.value)} type="date" required />
                </label>
                <label>
                  Old final reading
                  <input value={eventForm.old_final_reading} onChange={(event) => setEventField("old_final_reading", event.target.value)} type="number" min="0" required />
                </label>
                <label>
                  New initial reading
                  <input value={eventForm.new_initial_reading} onChange={(event) => setEventField("new_initial_reading", event.target.value)} type="number" min="0" required />
                </label>
                <label>
                  Reason
                  <textarea value={eventForm.reason} onChange={(event) => setEventField("reason", event.target.value)} rows="2" />
                </label>
                <label>
                  Correction reason
                  <textarea value={eventForm.correction_reason} onChange={(event) => setEventField("correction_reason", event.target.value)} rows="2" required />
                </label>
                <div className="row-actions">
                  <button className="primary-button" type="submit">
                    <Save size={17} />
                    Save event
                  </button>
                  <button type="button" onClick={cancelMeterEventEdit}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
            <TableControls table={meterEventTable} label="events" placeholder="Search meter events" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Old Meter</th>
                    <th>Old Final</th>
                    <th>New Meter</th>
                    <th>New Initial</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meterEventTable.visibleRows.length ? (
                    meterEventTable.visibleRows.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.customer_name}</strong>
                          <small>{event.acc_number}</small>
                        </td>
                        <td>{event.event_date?.slice(0, 10)}</td>
                        <td>{event.old_meter_number || "-"}</td>
                        <td>{Number(event.old_final_reading || 0).toLocaleString()}</td>
                        <td>{event.new_meter_number || "-"}</td>
                        <td>{Number(event.new_initial_reading || 0).toLocaleString()}</td>
                        <td>{event.reason || "-"}</td>
                        <td>
                          <button type="button" onClick={() => editMeterEvent(event)}>
                            <Edit3 size={15} />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={8} title="No meter events found" detail="Meter replacements will appear here." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}
        </div>
      </section>
    </section>
  );
}

export default ReadingsPage;
