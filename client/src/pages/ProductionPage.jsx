import { useEffect, useMemo, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import ProductionElectricityTopupForm from "../components/ProductionElectricityTopupForm";
import ProductionMeterForm from "../components/ProductionMeterForm";
import ProductionMeterReplacementForm from "../components/ProductionMeterReplacementForm";
import ProductionRegistersPanel from "../components/ProductionRegistersPanel";
import ProductionReportPanel from "../components/ProductionReportPanel";
import ProductionReportPrintSurface from "../components/ProductionReportPrintSurface";
import ProductionWeeklyReadingsForm from "../components/ProductionWeeklyReadingsForm";
import ReviewDialog from "../components/ReviewDialog";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import { api } from "../services/api";
import { withPrintTitle } from "../utils/exportNames";
import useScopedDraft from "../utils/useScopedDraft";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const dateOnly = (value) => value?.slice(0, 10) || "";
const meterTypeLabels = {
  customer_source: "Customer source",
  shared_source: "Shared source"
};

const addDays = (dateValue, days) => {
  if (!dateValue) return new Date().toISOString().slice(0, 10);
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const nextWeeklyReadingDate = (weeks) => {
  const latest = [...(weeks || [])].sort((left, right) =>
    String(right.reading_date || "").localeCompare(String(left.reading_date || ""))
  )[0];
  return latest?.reading_date ? addDays(latest.reading_date, 7) : new Date().toISOString().slice(0, 10);
};
const blankMeterForm = () => ({
  meter_type: "shared_source",
  meter_number: "",
  name: "",
  zone_id: "",
  customer_id: "",
  meter_id: "",
  rate_id: "",
  notes: "",
  status: "active",
  editing_meter_id: ""
});
const blankReplacementForm = () => ({
  production_meter_id: "",
  event_date: new Date().toISOString().slice(0, 10),
  old_final_reading: "",
  new_meter_number: "",
  new_initial_reading: "0",
  reason: ""
});
const blankTopupForm = () => ({
  topup_date: new Date().toISOString().slice(0, 10),
  kwh_units: "",
  total_cost: "",
  reference: "",
  notes: ""
});

function ProductionPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [meters, setMeters] = useState([]);
  const [rates, setRates] = useState([]);
  const [zones, setZones] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerMeters, setCustomerMeters] = useState([]);
  const [topups, setTopups] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [report, setReport] = useState({ weeks: [] });
  const [businessSettings, setBusinessSettings] = useState(null);
  const [, setMessage] = useToastMessage();
  const [meterForm, setMeterForm, clearMeterDraft] = useScopedDraft(user, "production-meter", blankMeterForm);
  const [replacementForm, setReplacementForm, clearReplacementDraft] = useScopedDraft(
    user,
    "production-meter-replacement",
    blankReplacementForm
  );
  const [topupForm, setTopupForm, clearTopupDraft] = useScopedDraft(user, "production-electricity-topup", blankTopupForm);
  const [weeklyForm, setWeeklyForm] = useState({
    reading_date: new Date().toISOString().slice(0, 10),
    prepaid_kwh_balance: "",
    notes: ""
  });
  const [editingWeeklyId, setEditingWeeklyId] = useState(null);
  const [weeklyEntryOpen, setWeeklyEntryOpen] = useState(false);
  const [weeklyCorrectionReason, setWeeklyCorrectionReason] = useState("");
  const [rollbackReview, setRollbackReview] = useState(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [topupReviewOpen, setTopupReviewOpen] = useState(false);
  const [topupReviewBusy, setTopupReviewBusy] = useState(false);
  const [weeklyDateChanged, setWeeklyDateChanged] = useState(false);
  const [readingRows, setReadingRows] = useState([]);
  const [weeklyContext, setWeeklyContext] = useState(null);
  const [reportFilters, setReportFilters] = useState({
    from: "",
    to: new Date().toISOString().slice(0, 10)
  });
  const [selectedReportWeekId, setSelectedReportWeekId] = useState("");
  const [selectedReportMeterId, setSelectedReportMeterId] = useState("");
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [printMode, setPrintMode] = useState("detail");
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");

  const canConfigure = ["admin", "accountant"].includes(user?.role);
  const canRecordProduction = ["admin", "accountant", "meter_reader"].includes(user?.role);
  const focusKey = navigationIntent?.page === "production" ? navigationIntent.focus : "";
  const hasProductionFocus = focusKey === "production_gap";
  const editingMeterId = meterForm.editing_meter_id;

  useEffect(() => {
    if (hasProductionFocus) setWeeklyEntryOpen(true);
  }, [hasProductionFocus]);

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const [meterRows, rateRows, zoneRows, customerRows, topupRows, weekRows, reportRows, settingsRows] = await Promise.all([
        api.production.meters(),
        canConfigure ? api.rates.list() : Promise.resolve([]),
        canConfigure ? api.zones.list() : Promise.resolve([]),
        canConfigure ? api.customers.list() : Promise.resolve([]),
        api.production.topups(),
        api.production.weeklyReadings(),
        api.production.report(reportFilters),
        api.businessSettings.get().catch(() => null)
      ]);
      setMeters(meterRows);
      setRates(rateRows);
      setZones(zoneRows);
      setCustomers(customerRows);
      setTopups(topupRows);
      setWeeks(weekRows);
      setReport(reportRows);
      setBusinessSettings(settingsRows);
    } catch (err) {
      if (showState) setInitialError(err.message || "Production meters, readings, and control data could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (editingWeeklyId) return;
    if (weeklyDateChanged) return;
    setWeeklyForm((current) => ({ ...current, reading_date: nextWeeklyReadingDate(weeks) }));
  }, [editingWeeklyId, weeklyDateChanged, weeks]);

  useEffect(() => {
    if (editingWeeklyId) return;
    const contextRows = new Map(
      (weeklyContext?.readings || []).map((row) => [Number(row.production_meter_id), row])
    );
    setReadingRows((current) => {
      const existing = new Map(current.map((row) => [Number(row.production_meter_id), row]));
      return meters
        .filter((meter) => meter.status === "active")
        .map((meter) => {
          const previous = contextRows.get(Number(meter.id));
          const current = existing.get(Number(meter.id));
          return {
            production_meter_id: meter.id,
            meter_number: meter.meter_number,
            label: meter.customer_name || meter.name || meter.meter_number,
            previous_reading_value: previous?.previous_reading_value ?? current?.previous_reading_value ?? null,
            previous_reading_date: previous?.previous_reading_date ?? current?.previous_reading_date ?? null,
            previous_context_source: previous?.previous_context_source ?? current?.previous_context_source ?? null,
            reading_value: current?.reading_value || "",
            notes: current?.notes || ""
          };
        });
    });
  }, [editingWeeklyId, meters, weeklyContext]);

  useEffect(() => {
    if (!weeklyForm.reading_date) return undefined;
    let ignore = false;
    setWeeklyContext(null);
    api.production
      .readingContext(weeklyForm.reading_date)
      .then((context) => {
        if (ignore) return;
        setWeeklyContext(context);
        const contextRows = new Map(
          (context.readings || []).map((row) => [Number(row.production_meter_id), row])
        );
        setReadingRows((current) =>
          current.map((row) => {
            const match = contextRows.get(Number(row.production_meter_id));
            if (!match) return row;
            return {
              ...row,
              previous_reading_value: match.previous_reading_value,
              previous_reading_date: match.previous_reading_date,
              previous_context_source: match.previous_context_source
            };
          })
        );
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [weeklyForm.reading_date]);

  useEffect(() => {
    if (!meterForm.customer_id) {
      setCustomerMeters([]);
      return undefined;
    }
    let ignore = false;
    api.meters
      .list(meterForm.customer_id)
      .then((rows) => {
        if (!ignore) setCustomerMeters(rows.filter((meter) => meter.meter_role === "source_backup" && meter.status === "active"));
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [meterForm.customer_id]);

  useEffect(() => {
    if (meterForm.meter_type !== "customer_source") return;
    if (meterForm.meter_id || customerMeters.length !== 1) return;
    const [onlyMeter] = customerMeters;
    setMeterForm((current) => ({
      ...current,
      meter_id: String(onlyMeter.id),
      meter_number: current.meter_number || onlyMeter.meter_number
    }));
  }, [customerMeters, meterForm.meter_id, meterForm.meter_type]);

  const setMeterField = (field, value) =>
    setMeterForm((current) => {
      if (field === "customer_id") {
        return { ...current, customer_id: value, meter_id: "", meter_number: current.meter_number };
      }
      if (field === "meter_id") {
        const linkedMeter = customerMeters.find((meter) => Number(meter.id) === Number(value));
        return {
          ...current,
          meter_id: value,
          meter_number: current.meter_number || linkedMeter?.meter_number || ""
        };
      }
      if (field === "meter_type") {
        return {
          ...current,
          meter_type: value,
          customer_id: value === "customer_source" ? current.customer_id : "",
          meter_id: value === "customer_source" ? current.meter_id : "",
          rate_id: value === "shared_source" ? current.rate_id : ""
        };
      }
      return { ...current, [field]: value };
    });
  const setReplacementField = (field, value) => setReplacementForm((current) => ({ ...current, [field]: value }));
  const setTopupField = (field, value) => setTopupForm((current) => ({ ...current, [field]: value }));
  const setWeeklyField = (field, value) => {
    if (field === "reading_date") setWeeklyDateChanged(true);
    setWeeklyForm((current) => ({ ...current, [field]: value }));
  };

  const meterTable = useTableControls(meters, {
    searchFields: ["meter_number", "name", "meter_type", "customer_name", "acc_number", "zone_name", "rate_name"]
  });
  const topupTable = useTableControls(topups, {
    searchFields: ["topup_date", "kwh_units", "total_cost", "reference", "expense_id", "expense_reference", "notes"]
  });
  const weekTable = useTableControls(weeks, {
    searchFields: ["reading_date", "meter_count", "total_consumption", "total_revenue"]
  });

  useEffect(() => {
    if (!selectedReportWeekId) return;
    const exists = (report.weeks || []).some((week) => String(week.id) === String(selectedReportWeekId));
    if (!exists) setSelectedReportWeekId("");
  }, [report.weeks, selectedReportWeekId]);

  const reportWeeks = report.weeks || [];
  const selectedReportWeek = reportWeeks.find((week) => String(week.id) === String(selectedReportWeekId));
  const baseVisibleReportWeeks = selectedReportWeek ? [selectedReportWeek] : reportWeeks;
  const reportMeterOptions = useMemo(() => {
    const meterMap = new Map();
    for (const week of reportWeeks) {
      for (const row of week.rows || []) {
        const meterId = Number(row.production_meter_id);
        if (!meterId || meterMap.has(meterId)) continue;
        meterMap.set(meterId, {
          id: meterId,
          label: `${row.meter_number} - ${row.customer_name || row.meter_name || meterTypeLabels[row.meter_type] || "Production meter"}`
        });
      }
    }
    return [...meterMap.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [reportWeeks]);
  const selectedReportMeter = reportMeterOptions.find((meter) => String(meter.id) === String(selectedReportMeterId));
  const visibleReportWeeks = useMemo(
    () =>
      baseVisibleReportWeeks.map((week) => ({
        ...week,
        rows: selectedReportMeterId
          ? (week.rows || []).filter((row) => String(row.production_meter_id) === String(selectedReportMeterId))
          : week.rows || []
      })),
    [baseVisibleReportWeeks, selectedReportMeterId]
  );
  const reportWeekDates = reportWeeks.map((week) => dateOnly(week.reading_date)).filter(Boolean).sort();

  const reportTotals = useMemo(() => {
    const rows = visibleReportWeeks;
    const meterRows = rows.flatMap((row) => row.rows || []);
    const revenue = meterRows.reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0);
    const consumption = meterRows.reduce((sum, row) => sum + Number(row.consumption || 0), 0);
    const electricityCost = selectedReportMeterId ? 0 : rows.reduce((sum, row) => sum + Number(row.electricity_cost_used || 0), 0);
    const electricityUsed = selectedReportMeterId ? 0 : rows.reduce((sum, row) => sum + Number(row.electricity_used || 0), 0);
    return {
      weekCount: rows.length,
      meterRowCount: meterRows.length,
      consumption,
      revenue,
      electricityUsed,
      electricityCost,
      costOfProductionRatio: revenue > 0 ? electricityCost / revenue : 0,
      costPerWaterUnit: consumption > 0 ? electricityCost / consumption : 0,
      electricityCostPerUnit: electricityUsed > 0 ? electricityCost / electricityUsed : 0
    };
  }, [selectedReportMeterId, visibleReportWeeks]);
  const selectedReportWeekDate = selectedReportWeek ? dateOnly(selectedReportWeek.reading_date) : "";
  const reportPeriodLabel = selectedReportWeekDate
    ? `${selectedReportWeekDate} to ${selectedReportWeekDate}`
    : `${report.from?.slice(0, 10) || reportFilters.from || "Beginning"} to ${
        report.to?.slice(0, 10) || reportFilters.to || "Today"
      }`;

  const selectReportWeek = (week) => {
    const weekDate = dateOnly(week.reading_date);
    setSelectedReportWeekId(String(week.id));
    if (weekDate) {
      setReportFilters({ from: weekDate, to: weekDate });
    }
  };

  const showAllReportWeeks = () => {
    setSelectedReportWeekId("");
    if (reportWeekDates.length) {
      setReportFilters({
        from: reportWeekDates[0],
        to: reportWeekDates[reportWeekDates.length - 1]
      });
    }
  };
  const activeProductionMeters = meters.filter((meter) => meter.status === "active");
  const latestWeeklyReading = [...weeks].sort((left, right) =>
    String(right.reading_date || "").localeCompare(String(left.reading_date || ""))
  )[0];
  const readingGap = Math.max(activeProductionMeters.length - Number(latestWeeklyReading?.meter_count || 0), 0);

  const submitMeter = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      if (editingMeterId) {
        await api.production.updateMeter(editingMeterId, {
          name: meterForm.name,
          zone_id: meterForm.zone_id || null,
          meter_id: meterForm.meter_type === "customer_source" ? Number(meterForm.meter_id) : null,
          rate_id: meterForm.meter_type === "shared_source" ? Number(meterForm.rate_id) : null,
          notes: meterForm.notes,
          status: meterForm.status
        });
      } else {
        await api.production.createMeter({
          ...meterForm,
          zone_id: meterForm.zone_id || null,
          customer_id: meterForm.meter_type === "customer_source" ? Number(meterForm.customer_id) : null,
          meter_id: meterForm.meter_type === "customer_source" ? Number(meterForm.meter_id) : null,
          rate_id: meterForm.meter_type === "shared_source" ? Number(meterForm.rate_id) : null
        });
      }
      clearMeterDraft();
      await load();
      setMessage(editingMeterId ? "Production meter updated." : "Production meter registered.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const editMeter = (meter) => {
    setMeterForm({
      meter_type: meter.meter_type,
      meter_number: meter.meter_number || "",
      name: meter.name || "",
      zone_id: String(meter.zone_id || ""),
      customer_id: String(meter.customer_id || ""),
      meter_id: String(meter.meter_id || ""),
      rate_id: String(meter.rate_id || ""),
      notes: meter.notes || "",
      status: meter.status || "active",
      editing_meter_id: String(meter.id)
    });
    setMessage(`${meter.meter_number} loaded for editing.`);
  };

  const prefillReplacement = (meter) => {
    setReplacementForm((current) => ({
      ...current,
      production_meter_id: String(meter.id),
      new_meter_number: "",
      reason: `Replacement for ${meter.meter_number}`
    }));
  };

  const submitReplacement = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      if (!replacementForm.production_meter_id) throw new Error("Select the source meter being replaced.");
      await api.production.replaceMeter(replacementForm.production_meter_id, {
        event_date: replacementForm.event_date,
        old_final_reading: Number(replacementForm.old_final_reading),
        new_meter_number: replacementForm.new_meter_number.trim(),
        new_initial_reading: Number(replacementForm.new_initial_reading || 0),
        reason: replacementForm.reason
      });
      clearReplacementDraft();
      await load();
      setMessage("Source meter replacement recorded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const submitTopup = (event) => {
    event.preventDefault();
    setTopupReviewOpen(true);
  };

  const closeTopupReview = () => {
    if (!topupReviewBusy) setTopupReviewOpen(false);
  };

  const confirmTopupReview = async (reviewNotes) => {
    setMessage("");
    setTopupReviewBusy(true);
    try {
      await api.production.createTopup({
        ...topupForm,
        kwh_units: Number(topupForm.kwh_units),
        total_cost: Number(topupForm.total_cost),
        review_notes: reviewNotes
      });
      clearTopupDraft();
      await load();
      setTopupReviewOpen(false);
      setMessage("Electricity top-up recorded and posted to expenses.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setTopupReviewBusy(false);
    }
  };

  const submitWeekly = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const payloadRows = readingRows
        .filter((row) => row.reading_value !== "")
        .map((row) => ({
          production_meter_id: row.production_meter_id,
          reading_value: Number(row.reading_value),
          notes: row.notes
        }));
      if (editingWeeklyId && !weeklyCorrectionReason.trim()) {
        throw new Error("Correction reason is required.");
      }
      const payload = {
        ...weeklyForm,
        prepaid_kwh_balance: Number(weeklyForm.prepaid_kwh_balance),
        readings: payloadRows
      };
      if (editingWeeklyId) {
        await api.production.updateWeeklyReading(editingWeeklyId, {
          ...payload,
          correction_reason: weeklyCorrectionReason
        });
      } else {
        await api.production.createWeeklyReading(payload);
      }
      setWeeklyForm({
        reading_date: weeklyForm.reading_date,
        prepaid_kwh_balance: "",
        notes: ""
      });
      setEditingWeeklyId(null);
      setWeeklyEntryOpen(false);
      setWeeklyCorrectionReason("");
      setWeeklyDateChanged(false);
      setReadingRows((current) => current.map((row) => ({ ...row, reading_value: "", notes: "" })));
      await load();
      setMessage(editingWeeklyId ? "Weekly production reading corrected." : "Weekly production readings saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const refreshReport = async () => {
    setMessage("");
    try {
      const nextReport = await api.production.report(reportFilters);
      setReport(nextReport);
      return nextReport;
    } catch (err) {
      setMessage(err.message);
      return null;
    }
  };

  const printProductionReport = async (mode = "detail") => {
    if (!report.weeks?.length) return;
    const nextReport = await refreshReport();
    if (!nextReport?.weeks?.length) return;
    setPrintMode(mode);
    setPrintGeneratedAt(new Date().toISOString());
    window.setTimeout(
      () =>
        withPrintTitle(
          `${mode === "summary" ? "Production Weekly Summary" : "Production Report"} ${reportPeriodLabel}`,
          () => window.print(),
          businessSettings
        ),
      80
    );
  };

  const cancelWeeklyEdit = () => {
    setEditingWeeklyId(null);
    setWeeklyEntryOpen(false);
    setWeeklyCorrectionReason("");
    setWeeklyDateChanged(false);
    setWeeklyForm({
      reading_date: nextWeeklyReadingDate(weeks),
      prepaid_kwh_balance: "",
      notes: ""
    });
    setReadingRows((current) => current.map((row) => ({ ...row, reading_value: "", notes: "" })));
  };

  const editWeeklyReading = async (week) => {
    setMessage("");
    try {
      const detail = await api.production.getWeeklyReading(week.id);
      const savedRows = new Map(detail.readings.map((row) => [Number(row.production_meter_id), row]));
      const activeRows = meters
        .filter((meter) => meter.status === "active")
        .map((meter) => {
          const saved = savedRows.get(Number(meter.id));
          return {
            production_meter_id: meter.id,
            meter_number: meter.meter_number,
            label: meter.customer_name || meter.name || meter.meter_number,
            previous_reading_value: saved?.previous_reading_value ?? "",
            previous_reading_date: saved?.previous_reading_date ?? "",
            reading_value: saved?.reading_value ?? "",
            notes: saved?.notes || ""
          };
        });
      const activeMeterIds = new Set(activeRows.map((row) => Number(row.production_meter_id)));
      const inactiveSavedRows = detail.readings
        .filter((row) => !activeMeterIds.has(Number(row.production_meter_id)))
        .map((row) => ({
          production_meter_id: row.production_meter_id,
          meter_number: row.meter_number,
          label: row.customer_name || row.meter_name || meterTypeLabels[row.meter_type] || "Inactive meter",
          previous_reading_value: row.previous_reading_value ?? "",
          previous_reading_date: row.previous_reading_date ?? "",
          reading_value: row.reading_value ?? "",
          notes: row.notes || ""
        }));

      setEditingWeeklyId(detail.weekly.id);
      setWeeklyEntryOpen(true);
      setWeeklyCorrectionReason("");
      setWeeklyDateChanged(true);
      setWeeklyForm({
        reading_date: detail.weekly.reading_date?.slice(0, 10) || week.reading_date?.slice(0, 10),
        prepaid_kwh_balance: detail.weekly.prepaid_kwh_balance ?? "",
        notes: detail.weekly.notes || ""
      });
      setReadingRows([...activeRows, ...inactiveSavedRows]);
      setMessage("Editing weekly production reading. Save with a correction reason to recalculate this and later weeks.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const rollbackWeeklyReading = async (week) => {
    setRollbackReview(week);
  };

  const confirmWeeklyRollback = async (reason) => {
    if (!rollbackReview) return;
    setMessage("");
    setRollbackBusy(true);
    try {
      await api.production.rollbackWeeklyReading(rollbackReview.id, { correction_reason: reason });
      if (editingWeeklyId === rollbackReview.id) cancelWeeklyEdit();
      await load();
      setRollbackReview(null);
      setMessage("Weekly production reading rolled back and later weeks recalculated.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRollbackBusy(false);
    }
  };

  if (initialLoading) {
    return <WorkspaceState title="Preparing production control" detail="Retrieving source meters, weekly readings, energy costs, and production reporting." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Production control could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }

  return (
    <section className="page-stack production-control-page">
      <header className="page-header production-control-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Production control</h2>
          <p>Capture source performance, account for energy use, and surface loss before it affects revenue.</p>
        </div>
        <div className="production-control-context">
          <span>Next reading</span>
          <strong>{weeklyForm.reading_date || "Not scheduled"}</strong>
        </div>
      </header>

      {focusKey === "production_gap" ? (
        <FocusNotice
          title="Production reading gap"
          detail="Use the weekly reading form to capture the latest active source meter readings."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="production-control-metrics" aria-label="Production overview">
        <div>
          <span>Active source meters</span>
          <strong>{activeProductionMeters.length}</strong>
          <small>{meters.length - activeProductionMeters.length} inactive or replaced</small>
        </div>
        <div className={readingGap ? "needs-attention" : ""}>
          <span>Latest reading coverage</span>
          <strong>{latestWeeklyReading ? `${Number(latestWeeklyReading.meter_count || 0)}/${activeProductionMeters.length}` : "Not recorded"}</strong>
          <small>{readingGap ? `${readingGap} meter${readingGap === 1 ? "" : "s"} still missing` : "All active meters captured"}</small>
        </div>
        <div>
          <span>Reported water output</span>
          <strong>{number(reportTotals.consumption)}</strong>
          <small>{reportTotals.weekCount} reporting week{reportTotals.weekCount === 1 ? "" : "s"}</small>
        </div>
        <div>
          <span>Revenue from output</span>
          <strong>{money(reportTotals.revenue)}</strong>
          <small>{reportTotals.costOfProductionRatio ? `${(reportTotals.costOfProductionRatio * 100).toFixed(1)}% energy cost` : "Awaiting cost basis"}</small>
        </div>
        <div>
          <span>Energy top-ups</span>
          <strong>{topups.length}</strong>
          <small>{topups.length ? "Tracked for cost control" : "No purchase logged"}</small>
        </div>
      </section>

      <section className="workspace-grid production-workspace production-control-workspace">
        {!hasProductionFocus ? (
        <div className="page-stack production-setup-stack">
          {canConfigure ? (
            <ProductionMeterForm
              customerMeters={customerMeters}
              customers={customers}
              editingMeterId={editingMeterId}
              form={meterForm}
              meters={meters}
              onCancel={clearMeterDraft}
              onChange={setMeterField}
              onSubmit={submitMeter}
              rates={rates}
              zones={zones}
            />
          ) : null}
          {canConfigure ? (
            <ProductionMeterReplacementForm
              form={replacementForm}
              meterTypeLabels={meterTypeLabels}
              meters={meters}
              onChange={setReplacementField}
              onSubmit={submitReplacement}
            />
          ) : null}
          {canConfigure ? (
            <ProductionElectricityTopupForm
              form={topupForm}
              onChange={setTopupField}
              onSubmit={submitTopup}
              topupCount={topups.length}
            />
          ) : null}        </div>
        ) : null}

        <div className="page-stack wide-panel production-primary-stack">
          {canRecordProduction ? (
            <ProductionWeeklyReadingsForm
              correctionReason={weeklyCorrectionReason}
              editingId={editingWeeklyId}
              form={weeklyForm}
              onCancelEdit={cancelWeeklyEdit}
              onCorrectionReasonChange={setWeeklyCorrectionReason}
              onFieldChange={setWeeklyField}
              onOpenChange={setWeeklyEntryOpen}
              onRowChange={(index, field, value) =>
                setReadingRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
              }
              onSubmit={submitWeekly}
              open={weeklyEntryOpen}
              readingRows={readingRows}
              weeklyContext={weeklyContext}
            />
          ) : null}
          {!hasProductionFocus ? (
            <ProductionReportPanel
              meterTypeLabels={meterTypeLabels}
              onFilterChange={(field, value) => {
                setSelectedReportWeekId("");
                setReportFilters((current) => ({ ...current, [field]: value }));
              }}
              onMeterChange={setSelectedReportMeterId}
              onPrint={printProductionReport}
              onRefresh={refreshReport}
              onSelectWeek={selectReportWeek}
              onShowAllWeeks={showAllReportWeeks}
              report={report}
              reportFilters={reportFilters}
              reportMeterOptions={reportMeterOptions}
              reportPeriodLabel={reportPeriodLabel}
              reportTotals={reportTotals}
              selectedMeter={selectedReportMeter}
              selectedMeterId={selectedReportMeterId}
              selectedWeekId={selectedReportWeekId}
              visibleWeeks={visibleReportWeeks}
            />
          ) : null}
          {!hasProductionFocus ? (
            <ProductionRegistersPanel
              canConfigure={canConfigure}
              canRecordProduction={canRecordProduction}
              meterTable={meterTable}
              meterTypeLabels={meterTypeLabels}
              onEditMeter={editMeter}
              onEditWeekly={editWeeklyReading}
              onPrefillReplacement={prefillReplacement}
              onRollbackWeekly={rollbackWeeklyReading}
              topupTable={topupTable}
              weekTable={weekTable}
            />
          ) : null}
        </div>
      </section>
      <ProductionReportPrintSurface
        businessSettings={businessSettings}
        meterTypeLabels={meterTypeLabels}
        printGeneratedAt={printGeneratedAt}
        printMode={printMode}
        reportPeriodLabel={reportPeriodLabel}
        reportTotals={reportTotals}
        selectedMeter={selectedReportMeter}
        visibleWeeks={visibleReportWeeks}
      />
      <ReviewDialog
        open={topupReviewOpen}
        eyebrow="Electricity top-up review"
        title="Record top-up and operating expense"
        description="This records the electricity top-up, creates one linked operating expense, and updates production-cost reporting. It does not initiate or confirm an M-Pesa payment."
        confirmLabel="Record top-up and expense"
        cancelLabel="Keep editing"
        reasonLabel="Finance approval note"
        reasonPlaceholder="State the purchase evidence or decision basis for the audit trail"
        busy={topupReviewBusy}
        busyLabel="Recording top-up..."
        onCancel={closeTopupReview}
        onConfirm={confirmTopupReview}
      >
        <div className="reading-context">
          <div><span>Top-up date</span><strong>{dateOnly(topupForm.topup_date) || "-"}</strong></div>
          <div><span>Units</span><strong>{number(topupForm.kwh_units)} kWh</strong></div>
          <div><span>Total cost</span><strong>{money(topupForm.total_cost)}</strong></div>
          <div><span>Cost per kWh</span><strong>{Number(topupForm.kwh_units) > 0 ? money(Number(topupForm.total_cost || 0) / Number(topupForm.kwh_units)) : "-"}</strong></div>
          <div><span>Reference</span><strong>{topupForm.reference || "Generated on posting"}</strong></div>
        </div>
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(rollbackReview)}
        eyebrow="Production correction"
        title="Roll back weekly reading"
        description={
          rollbackReview
            ? `Roll back the reading for ${dateOnly(rollbackReview.reading_date)}. This will recalculate this week and every later production week.`
            : ""
        }
        confirmLabel="Roll back and recalculate"
        reasonLabel="Correction reason"
        reasonPlaceholder="Describe the error or operational correction"
        busy={rollbackBusy}
        danger
        onCancel={() => setRollbackReview(null)}
        onConfirm={confirmWeeklyRollback}
      />
    </section>
  );
}

export default ProductionPage;
