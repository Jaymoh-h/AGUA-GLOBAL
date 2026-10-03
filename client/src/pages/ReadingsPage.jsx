import { FileUp, Gauge, Replace, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import BatchReadingSheet from "../components/BatchReadingSheet";
import CollapsibleSection from "../components/CollapsibleSection";
import CustomerReadingSubmissionQueue from "../components/CustomerReadingSubmissionQueue";
import EstimatedReadingCandidates from "../components/EstimatedReadingCandidates";
import ReadingRunMetrics from "../components/ReadingRunMetrics";
import FocusNotice from "../components/FocusNotice";
import MeterRegistrationForm from "../components/MeterRegistrationForm";
import MeterReplacementForm from "../components/MeterReplacementForm";
import MeterEventsPanel from "../components/MeterEventsPanel";
import ReadingAnomalyQueue from "../components/ReadingAnomalyQueue";
import ReadingEntryForm from "../components/ReadingEntryForm";
import ReadingCsvImportPanel from "../components/ReadingCsvImportPanel";
import ReadingCsvPreview from "../components/ReadingCsvPreview";
import ReadingGapsPanel from "../components/ReadingGapsPanel";
import ReadingReviewDialogs from "../components/ReadingReviewDialogs";
import RecentReadingsPanel from "../components/RecentReadingsPanel";
import SourceBillingReviewPanel from "../components/SourceBillingReviewPanel";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import WorkspaceActionMenu from "../components/WorkspaceActionMenu";
import WorkspaceSideSheet from "../components/WorkspaceSideSheet";
import { api } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";
import { namedExport } from "../utils/exportNames";
import useScopedDraft from "../utils/useScopedDraft";
import useReadingRegister from "../hooks/useReadingRegister";
import useReadingsWorkspaceData from "../hooks/useReadingsWorkspaceData";

const meterRoleLabels = {
  client_billing: "Client billing",
  source_backup: "Source backup",
  shared_source_monitoring: "Shared source monitoring"
};
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);
const createSourceBillingDraft = () => ({
  customer_id: "",
  meter_id: "",
  reading_value: "",
  previous_reading_value: "",
  reading_date: today(),
  fallback_reason: "",
  correction_reason: ""
});

function ReadingsPage({ user, navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [form, setForm] = useState({
    customer_id: "",
    meter_id: "",
    reading_value: "",
    previous_reading_value: "",
    reading_date: today(),
    notes: "",
    fallback_reason: "",
    correction_reason: ""
  });
  const [sourceForm, setSourceForm, clearSourceDraft] = useScopedDraft(
    user,
    "source-billing-entry",
    createSourceBillingDraft,
    { storage: "local" }
  );
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
    old_meter_id: "",
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
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [readingEntryOpen, setReadingEntryOpen] = useState(false);
  const [activeWorkspaceAction, setActiveWorkspaceAction] = useState("");
  const [readingReviewContext, setReadingReviewContext] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [sourceReviewDialog, setSourceReviewDialog] = useState(null);
  const [promotionDialog, setPromotionDialog] = useState(null);
  const [reviewActionBusy, setReviewActionBusy] = useState(false);
  const reviewActionLock = useRef(false);
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
  const {
    customers,
    eligibleReadingCustomers,
    initialError,
    initialLoading,
    load,
    meterEvents,
    readingEligibility,
    readings,
    setEligibleReadingCustomers,
    setReadingEligibility,
    setSourceWorkspace,
    sourceRequests,
    sourceWorkspace
  } = useReadingsWorkspaceData({
    readingDate: form.reading_date,
    role: user?.role,
    sourceReadingDate: sourceForm.reading_date
  });

  useEffect(() => {
    if (navigationIntent?.page !== "readings") return;
    if (navigationIntent.focus === "capture_reading" && navigationIntent.customer_id) {
      const customer = customers.find((row) => Number(row.id) === Number(navigationIntent.customer_id));
      if (customer) {
        setReadingReviewContext(null);
        setForm((current) => ({ ...current, customer_id: String(customer.id), meter_id: "", reading_value: "", previous_reading_value: "", fallback_reason: "", correction_reason: "" }));
      }
    }
    if (navigationIntent.focus === "unbilled_consumption") {
      if (navigationIntent.customer_id) setCustomerFilter(String(navigationIntent.customer_id));
      if (navigationIntent.period_start) setDateFromFilter(navigationIntent.period_start);
      if (navigationIntent.period_end) setDateToFilter(navigationIntent.period_end);
    }
    if (navigationIntent.period_end && !editingId) {
      setForm((current) => current.reading_date === navigationIntent.period_end ? current : { ...current, reading_date: navigationIntent.period_end });
      setSourceForm((current) => current.reading_date === navigationIntent.period_end ? current : { ...current, reading_date: navigationIntent.period_end });
    }
  }, [customers, editingId, navigationIntent]);

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
  const selectReadingCustomer = (customerId, meterId = "") => {
    setReadingReviewContext(null);
    const eligible = eligibleReadingCustomers.find((customer) => Number(customer.id) === Number(customerId));
    setForm((current) => ({
      ...current,
      customer_id: customerId,
      meter_id: meterId ? String(meterId) : "",
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
    setReplacementForm((current) =>
      field === "customer_id"
        ? { ...current, customer_id: value, old_meter_id: "", old_final_reading: "" }
        : { ...current, [field]: value }
    );
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
      .context(replacementForm.customer_id, replacementForm.event_date, replacementForm.old_meter_id)
      .then((context) => {
        if (!ignore) {
          setReplacementContext(context);
          setReplacementForm((current) => {
            const nextMeterId = current.old_meter_id || String(context.activeMeter?.id || "");
            if (current.old_final_reading && current.old_meter_id === nextMeterId) return current;
            return {
              ...current,
              old_meter_id: nextMeterId,
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
  }, [replacementForm.customer_id, replacementForm.event_date, replacementForm.old_meter_id]);

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
        notes: form.notes.trim(),
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
        notes: "",
        fallback_reason: "",
        correction_reason: ""
      });
      setReadingContext(null);
      setEditingId(null);
      setReadingEntryOpen(false);
      setReadingReviewContext(null);
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

  const edit = (reading, reviewContext = null) => {
    setEditingId(reading.id);
    setReadingEntryOpen(true);
    setReadingReviewContext(reviewContext);
    setForm({
      customer_id: reading.customer_id || "",
      meter_id: reading.meter_id || "",
      reading_value: reading.reading_value || "",
      previous_reading_value: reading.previous_reading_id ? "" : reading.previous_reading_value ?? "",
      reading_date: reading.reading_date?.slice(0, 10) || today(),
      notes: reading.notes || "",
      fallback_reason: "",
      correction_reason: ""
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setReadingEntryOpen(false);
    setReadingReviewContext(null);
    setReadingContext(null);
    setForm({
      customer_id: "",
      meter_id: "",
      reading_value: "",
      previous_reading_value: "",
      reading_date: readingEligibility?.period?.periodEnd || today(),
      notes: "",
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
      clearSourceDraft();
      setSourceForm((current) => ({ ...current, reading_date: sourceWorkspace?.period?.periodEnd || today() }));
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

  const reviewSourceRequest = (request, action) => {
    if (reviewActionBusy) return;
    setSourceReviewDialog({ request, action });
  };
  const selectSourceMeter = (value) => {
    if (!value) {
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
    const [customerId, meterId] = value.split(":");
    const row = (sourceWorkspace.rows || []).find(
      (item) => Number(item.customer_id) === Number(customerId) && Number(item.source_meter_id) === Number(meterId)
    );
    if (row) selectSourceWorkspaceRow(row);
  };

  const clearSourceEntry = () => {
    clearSourceDraft();
    setSourceContext(null);
    setMessage("Saved source entry cleared.");
  };

  const submitSourceReview = async (reviewNotes) => {
    if (!sourceReviewDialog || reviewActionBusy || reviewActionLock.current) return;
    const { request, action } = sourceReviewDialog;
    if (action === "reject" && !reviewNotes) return;

    setMessage("");
    reviewActionLock.current = true;
    setReviewActionBusy(true);
    try {
      await api.billing.sourceBillingRequests.review(request.id, {
        action,
        review_notes: reviewNotes
      });
      await load();
      setSourceReviewDialog(null);
      setMessage(action === "approve" ? "Source-side bill approved and generated." : "Source-side billing request rejected.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      reviewActionLock.current = false;
      setReviewActionBusy(false);
    }
  };

  const promoteBill = (billId, label) => {
    if (reviewActionBusy) return;
    setPromotionDialog({
      mode: "single",
      selectedBillId: String(billId),
      candidates: [{ id: billId, bill_number: label }]
    });
  };

  const submitBillPromotion = async (reason) => {
    if (!promotionDialog || reviewActionBusy || reviewActionLock.current || !reason) return;
    const bill = promotionDialog.candidates.find(
      (candidate) => String(candidate.id) === String(promotionDialog.selectedBillId)
    );
    if (!bill) {
      setMessage("Select a bill from the comparison list before continuing.");
      return;
    }

    const label = bill.bill_number || `Bill ${bill.id}`;
    setMessage("");
    reviewActionLock.current = true;
    setReviewActionBusy(true);
    try {
      await api.bills.promote(bill.id, { correction_reason: reason });
      await load();
      setPromotionDialog(null);
      setMessage(`${label} promoted for payment.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      reviewActionLock.current = false;
      setReviewActionBusy(false);
    }
  };

  const promoteCompetingBill = (request) => {
    const competingBills = request.competing_bills || [];
    const candidates = competingBills.filter((bill) => bill.bill_pay_status !== "payable");
    if (!candidates.length) {
      setMessage("No held or superseded client bill is available to promote.");
      return;
    }
    if (reviewActionBusy) return;
    setPromotionDialog({
      mode: "competing",
      selectedBillId: String(candidates[0].id),
      candidates
    });
  };

  const submitReplacement = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await api.meters.replace({
        customer_id: Number(replacementForm.customer_id),
        old_meter_id: Number(replacementForm.old_meter_id || replacementContext?.activeMeter?.id),
        old_final_reading: Number(replacementForm.old_final_reading),
        new_meter_number: replacementForm.new_meter_number.trim(),
        new_initial_reading: Number(replacementForm.new_initial_reading || 0),
        event_date: replacementForm.event_date,
        reason: replacementForm.reason
      });
      setReplacementForm({
        customer_id: "",
        old_meter_id: "",
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
  const returnTarget = navigationIntent?.page === "readings" ? navigationIntent.return_target : null;
  const readingEntryIntent = ["missing_readings", "estimated_readings", "capture_reading"].includes(focusKey);
  const hasReadingFocus = ["missing_readings", "pending_source_billing", "pending_customer_readings", "reading_anomalies", "estimated_readings", "capture_reading"].includes(focusKey);
  const showCustomerReadingSubmissions = !hasReadingFocus || focusKey === "pending_customer_readings";
  const showReadingForm = !hasReadingFocus || focusKey === "missing_readings" || focusKey === "estimated_readings" || focusKey === "capture_reading";
  const showReadingSetupTools = !hasReadingFocus || ["reading_anomalies", "estimated_readings"].includes(focusKey);
  const showSourceReview = !hasReadingFocus || focusKey === "pending_source_billing";
  const showReadingRegisters = !hasReadingFocus;
  useEffect(() => {
    if (readingEntryIntent) setReadingEntryOpen(true);
  }, [readingEntryIntent]);
  useEffect(() => {
    if (focusKey === "missing_readings") setBatchSheetOpen(true);
  }, [focusKey]);
  const selectedCustomer = customers.find((customer) => Number(customer.id) === Number(form.customer_id));
  const sourceRowsMissingReading = (sourceWorkspace.rows || []).filter((row) => !row.source_reading_id);
  const readingCustomerOptions = editingId
    ? customers
    : selectedCustomer && !eligibleReadingCustomers.some((customer) => Number(customer.id) === Number(selectedCustomer.id))
      ? [selectedCustomer, ...eligibleReadingCustomers]
      : eligibleReadingCustomers;
  const readingTable = useReadingRegister({
    customerId: customerFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
    refreshKey: readings
  });
  if (initialLoading) {
    return <WorkspaceState title="Preparing field readings" detail="Retrieving the reading run, eligible accounts, meter events, and source controls." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Field readings could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }
  const exportReadings = async () => {
    try {
      const rows = await api.readings.registerAll(readingTable.requestParams);
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
        rows
      );
    } catch (err) {
      setMessage(err.message || "Reading register export could not be prepared.");
    }
  };
  const prepareReadingForCustomer = (customerId) => {
    setReadingEntryOpen(true);
    selectReadingCustomer(String(customerId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reviewAnomaly = (reading) => {
    edit(reading, {
      type: "anomaly",
      averageUnits: reading.average_units,
      direction: reading.direction,
      unitsUsed: reading.units_used,
      varianceRatio: reading.variance_ratio
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reviewEstimatedCandidate = (candidate) => {
    setEditingId(null);
    setReadingEntryOpen(true);
    setReadingReviewContext({
      type: "estimate",
      averageUnits: candidate.average_units,
      suggestedReadingValue: candidate.suggested_reading_value,
      intervalCount: candidate.interval_count
    });
    setForm((current) => ({
      ...current,
      customer_id: String(candidate.customer_id),
      meter_id: String(candidate.meter_id),
      reading_value: String(candidate.suggested_reading_value),
      previous_reading_value: "",
      reading_date: readingEligibility?.period?.periodEnd || current.reading_date,
      notes: "",
      fallback_reason: "",
      correction_reason: ""
    }));
    setMessage(`Suggested reading loaded for ${candidate.acc_number}. Verify it against the field reading before submitting.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="page-stack reading-operations-page">
      <header className="page-header reading-operations-header">
        <div>
          <p className="eyebrow">Field Work</p>
          <h2>Finish the reading run.</h2>
          <p>Load the remaining accounts, validate consumption changes, and send only clean readings into billing.</p>
        </div>
        <div className="reading-period-label">
          <small>Active billing period</small>
          <strong>{readingEligibility?.period?.name || "Loading period"}</strong>
          <span>{readingEligibility?.period?.periodEnd || ""}</span>
        </div>
        <div className="page-header-actions">
          {showReadingForm ? <button className="primary-button" type="button" onClick={() => { setReadingEntryOpen(true); setActiveWorkspaceAction("capture"); }}><Send size={16} />Capture reading</button> : null}
          <WorkspaceActionMenu
            actions={[
              { key: "batch", label: "Batch reading sheet", detail: "Route entry", icon: FileUp, hidden: !showReadingSetupTools, onSelect: () => { setBatchSheetOpen(true); setActiveWorkspaceAction("batch"); } },
              { key: "meter", label: "Register meter", detail: "Meter setup", icon: Gauge, hidden: !showReadingSetupTools || !["admin", "accountant"].includes(user?.role), onSelect: () => setActiveWorkspaceAction("meter") },
              { key: "replace", label: "Replace meter", detail: "Meter event", icon: Replace, hidden: !showReadingSetupTools, onSelect: () => setActiveWorkspaceAction("replace") },
              { key: "import", label: "Import readings CSV", detail: "Bulk import", icon: FileUp, hidden: !showReadingSetupTools, onSelect: () => setActiveWorkspaceAction("import") }
            ]}
          />
        </div>
      </header>

      <ReadingRunMetrics
        missingSourceReadings={sourceRowsMissingReading.length}
        pendingSourceReviews={sourceRequests.filter((request) => request.status === "pending").length}
        readingCount={readingTable.total}
        remainingReadings={eligibleReadingCustomers.length}
      />

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
      {focusKey === "capture_reading" ? (
        <FocusNotice
          title="Capture reading for selected account"
          detail="The account is prefilled. Confirm the active meter and prior-reading context before saving a billable reading."
          actionLabel={returnTarget ? "Return to account" : undefined}
          onAction={returnTarget ? () => onNavigate?.(returnTarget) : undefined}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "unbilled_consumption" ? (
        <FocusNotice
          title="Unbilled consumption"
          detail="Showing the linked meter reading so its bill-generation exception can be resolved without estimating a charge."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "pending_customer_readings" ? (
        <FocusNotice
          title="Customer meter readings"
          detail="Showing customer-submitted readings that need verification before billing."
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "reading_anomalies" ? (
        <FocusNotice
          title="Reading anomalies"
          detail={`Showing readings outside the expected-usage threshold for ${readingEligibility?.period?.name || "the selected period"}.`}
          onClear={onClearNavigationIntent}
        />
      ) : null}
      {focusKey === "estimated_readings" ? (
        <FocusNotice
          title="Estimated reading candidates"
          detail={`Showing field-verification suggestions for missing readings in ${readingEligibility?.period?.name || "the selected period"}. Suggestions never create readings automatically.`}
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="workspace-grid reading-operations-workspace">
        {showReadingSetupTools ? (
          <ReadingAnomalyQueue defaultOpen={focusKey === "reading_anomalies"} onReview={reviewAnomaly} periodStart={readingEligibility?.period?.periodStart} />
        ) : null}

        {showReadingSetupTools ? (
          <EstimatedReadingCandidates
            defaultOpen={focusKey === "estimated_readings"}
            onReview={reviewEstimatedCandidate}
            periodStart={readingEligibility?.period?.periodStart}
          />
        ) : null}

        {showCustomerReadingSubmissions ? <CustomerReadingSubmissionQueue onReviewed={load} /> : null}

        <div className="page-stack wide-panel">
          {focusKey === "missing_readings" ? (
            <ReadingGapsPanel
              customers={eligibleReadingCustomers}
              onSelectCustomer={prepareReadingForCustomer}
              readingEligibility={readingEligibility}
            />
          ) : null}
          {showReadingRegisters && importPreview ? <ReadingCsvPreview preview={importPreview} /> : null}
          {showSourceReview && ["admin", "accountant"].includes(user?.role) ? (
            <SourceBillingReviewPanel
              focusKey={focusKey}
              meterRoleLabels={meterRoleLabels}
              onFieldChange={setSourceField}
              onClearDraft={clearSourceEntry}
              onMeterSelectionChange={selectSourceMeter}
              onPromoteBill={promoteBill}
              onPromoteCompetingBill={promoteCompetingBill}
              onReviewRequest={reviewSourceRequest}
              onSubmit={submitSourceReading}
              restrictedSourcePeriod={restrictedSourcePeriod}
              sourceContext={sourceContext}
              sourceForm={sourceForm}
              sourceRequests={sourceRequests}
              sourceWorkspace={sourceWorkspace}
              userRole={user?.role}
            />
          ) : null}
          {showReadingRegisters ? (
            <RecentReadingsPanel
              customers={customers}
              customerFilter={customerFilter}
              dateFromFilter={dateFromFilter}
              dateToFilter={dateToFilter}
              meterRoleLabels={meterRoleLabels}
              onCustomerFilterChange={setCustomerFilter}
              onDateFromChange={setDateFromFilter}
              onDateToChange={setDateToFilter}
              onEdit={edit}
              onExport={exportReadings}
              error={readingTable.error}
              loading={readingTable.loading}
              table={readingTable}
            />
          ) : null}
          {showReadingRegisters ? (
            <MeterEventsPanel
              editingEventId={editingEventId}
              eventForm={eventForm}
              events={meterEvents}
              onCancelEdit={cancelMeterEventEdit}
              onEdit={editMeterEvent}
              onFieldChange={setEventField}
              onSubmit={submitMeterEventEdit}
            />
          ) : null}        </div>
      </section>
      <WorkspaceSideSheet
        onClose={() => { setActiveWorkspaceAction(""); setReadingEntryOpen(false); setBatchSheetOpen(false); }}
        open={Boolean(activeWorkspaceAction)}
        title={
          activeWorkspaceAction === "capture" ? "Capture meter reading" :
          activeWorkspaceAction === "batch" ? "Batch reading sheet" :
          activeWorkspaceAction === "meter" ? "Register meter" :
          activeWorkspaceAction === "replace" ? "Replace meter" : "Import readings CSV"
        }
      >
        {activeWorkspaceAction === "capture" && showReadingForm ? (
          <ReadingEntryForm
            cancelEdit={cancelEdit}
            editingId={editingId}
            form={form}
            meterRoleLabels={meterRoleLabels}
            onChange={setField}
            onCustomerChange={selectReadingCustomer}
            onOpenChange={(open) => { setReadingEntryOpen(open); if (!open) setActiveWorkspaceAction(""); }}
            onSubmit={submit}
            open={readingEntryOpen}
            readingContext={readingContext}
            readingCustomerOptions={readingCustomerOptions}
            readingEligibility={readingEligibility}
            readingReviewContext={readingReviewContext}
            restrictedReadingPeriod={restrictedReadingPeriod}
          />
        ) : null}
        {activeWorkspaceAction === "batch" ? (
          <BatchReadingSheet
            user={user}
            eligibility={readingEligibility}
            onImported={async () => { await load(); setBatchSheetOpen(false); setActiveWorkspaceAction(""); }}
            onOpenChange={(open) => { setBatchSheetOpen(open); if (!open) setActiveWorkspaceAction(""); }}
            open={batchSheetOpen}
          />
        ) : null}
        {activeWorkspaceAction === "meter" ? <MeterRegistrationForm customers={customers} form={meterForm} onChange={setMeterField} onOpenChange={(open) => !open && setActiveWorkspaceAction("")} onSubmit={submitMeter} open /> : null}
        {activeWorkspaceAction === "replace" ? <MeterReplacementForm customers={customers} form={replacementForm} meterRoleLabels={meterRoleLabels} onChange={setReplacementField} onOpenChange={(open) => !open && setActiveWorkspaceAction("")} onSubmit={submitReplacement} open replacementContext={replacementContext} restrictedPeriod={restrictedReplacementPeriod} /> : null}
        {activeWorkspaceAction === "import" ? <ReadingCsvImportPanel csvText={csvText} importCorrectionReason={importCorrectionReason} importPreview={importPreview} importing={importing} importReady={importReady} onCommit={commitImport} onCsvChange={(value, correctionReason) => { if (value !== undefined) { setCsvText(value); setImportPreview(null); } else { setImportCorrectionReason(correctionReason); } }} onFile={handleCsvFile} onOpenChange={(open) => !open && setActiveWorkspaceAction("")} onPreview={previewImport} open /> : null}
      </WorkspaceSideSheet>
      <ReadingReviewDialogs
        money={money}
        promotionDialog={promotionDialog}
        reviewActionBusy={reviewActionBusy}
        sourceReviewDialog={sourceReviewDialog}
        onCancelPromotion={() => !reviewActionBusy && setPromotionDialog(null)}
        onCancelSourceReview={() => !reviewActionBusy && setSourceReviewDialog(null)}
        onPromotionCandidateChange={(selectedBillId) =>
          setPromotionDialog((current) => ({ ...current, selectedBillId }))
        }
        onSubmitPromotion={submitBillPromotion}
        onSubmitSourceReview={submitSourceReview}
      />
    </section>
  );
}

export default ReadingsPage;
