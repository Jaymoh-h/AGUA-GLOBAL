import { Edit2, FileUp, Gauge, PlugZap, Printer, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import { api, assetUrl } from "../services/api";
import { withPrintTitle } from "../utils/exportNames";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const optionalNumber = (value) =>
  value === null || value === undefined || value === "" ? "-" : Number(value || 0).toLocaleString();
const dateOnly = (value) => value?.slice(0, 10) || "";
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "");
const meterTypeLabels = {
  customer_source: "Customer source",
  shared_source: "Shared source"
};
const previousContextLabels = {
  production_weekly_reading: "Production weekly",
  production_replacement_baseline: "Production replacement",
  linked_source_reading: "Linked source reading",
  linked_source_initial_reading: "Linked source initial",
  customer_source_fallback_reading: "Customer source fallback",
  customer_source_fallback_initial_reading: "Customer source initial fallback"
};

const electricityCostSourceLabel = (week) => {
  if (!week) return "";
  if (week.electricity_cost_source === "period_topups") return "This period's top-ups";
  if (week.electricity_cost_source === "last_topup") {
    return `Last top-up${week.electricity_cost_source_date ? ` on ${week.electricity_cost_source_date.slice(0, 10)}` : ""}`;
  }
  return "No top-up cost available";
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
  const [meterForm, setMeterForm] = useState({
    meter_type: "shared_source",
    meter_number: "",
    name: "",
    zone_id: "",
    customer_id: "",
    meter_id: "",
    rate_id: "",
    notes: ""
  });
  const [replacementForm, setReplacementForm] = useState({
    production_meter_id: "",
    event_date: new Date().toISOString().slice(0, 10),
    old_final_reading: "",
    new_meter_number: "",
    new_initial_reading: "0",
    reason: ""
  });
  const [topupForm, setTopupForm] = useState({
    topup_date: new Date().toISOString().slice(0, 10),
    kwh_units: "",
    total_cost: "",
    reference: "",
    notes: ""
  });
  const [weeklyForm, setWeeklyForm] = useState({
    reading_date: new Date().toISOString().slice(0, 10),
    prepaid_kwh_balance: "",
    notes: ""
  });
  const [editingWeeklyId, setEditingWeeklyId] = useState(null);
  const [weeklyCorrectionReason, setWeeklyCorrectionReason] = useState("");
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

  const canConfigure = ["admin", "accountant"].includes(user?.role);
  const canRecordProduction = ["admin", "accountant", "meter_reader"].includes(user?.role);
  const focusKey = navigationIntent?.page === "production" ? navigationIntent.focus : "";
  const hasProductionFocus = focusKey === "production_gap";

  const load = async () => {
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
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
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
  const reportWeekMeterTotals = (week) => ({
    consumption: (week.rows || []).reduce((sum, row) => sum + Number(row.consumption || 0), 0),
    revenue: (week.rows || []).reduce((sum, row) => sum + Number(row.revenue_amount || 0), 0)
  });

  const submitMeter = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.production.createMeter({
        ...meterForm,
        zone_id: meterForm.zone_id || null,
        customer_id: meterForm.meter_type === "customer_source" ? Number(meterForm.customer_id) : null,
        meter_id: meterForm.meter_type === "customer_source" ? Number(meterForm.meter_id) : null,
        rate_id: meterForm.meter_type === "shared_source" ? Number(meterForm.rate_id) : null
      });
      setMeterForm({
        meter_type: "shared_source",
        meter_number: "",
        name: "",
        zone_id: "",
        customer_id: "",
        meter_id: "",
        rate_id: "",
        notes: ""
      });
      await load();
      setMessage("Production meter registered.");
    } catch (err) {
      setMessage(err.message);
    }
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
      setReplacementForm({
        production_meter_id: "",
        event_date: new Date().toISOString().slice(0, 10),
        old_final_reading: "",
        new_meter_number: "",
        new_initial_reading: "0",
        reason: ""
      });
      await load();
      setMessage("Source meter replacement recorded.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const submitTopup = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.production.createTopup({
        ...topupForm,
        kwh_units: Number(topupForm.kwh_units),
        total_cost: Number(topupForm.total_cost)
      });
      setTopupForm({
        topup_date: new Date().toISOString().slice(0, 10),
        kwh_units: "",
        total_cost: "",
        reference: "",
        notes: ""
      });
      await load();
      setMessage("Electricity top-up recorded and posted to expenses.");
    } catch (err) {
      setMessage(err.message);
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
    const reason = window.prompt(`Reason for rolling back ${week.reading_date?.slice(0, 10)}?`);
    if (!reason?.trim()) return;
    setMessage("");
    try {
      await api.production.rollbackWeeklyReading(week.id, { correction_reason: reason });
      if (editingWeeklyId === week.id) cancelWeeklyEdit();
      await load();
      setMessage("Weekly production reading rolled back and later weeks recalculated.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Production Monitoring</h2>
        </div>
      </header>

      {focusKey === "production_gap" ? (
        <FocusNotice
          title="Production reading gap"
          detail="Use the weekly reading form to capture the latest active source meter readings."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <section className="workspace-grid production-workspace">
        {!hasProductionFocus ? (
        <div className="page-stack production-setup-stack">
          {canConfigure ? (
            <CollapsibleSection
              as="form"
              className="form-grid production-meter-form"
              icon={<Gauge size={18} />}
              onSubmit={submitMeter}
              summary={`${meters.filter((meter) => meter.status === "active").length.toLocaleString()} active meter(s)`}
              title="Production Meter"
            >
              <label>
                Type
                <select value={meterForm.meter_type} onChange={(event) => setMeterField("meter_type", event.target.value)}>
                  <option value="shared_source">Shared source</option>
                  <option value="customer_source">Customer source</option>
                </select>
              </label>
              <label>
                Meter number
                <input value={meterForm.meter_number} onChange={(event) => setMeterField("meter_number", event.target.value)} required />
              </label>
              <label>
                Display name
                <input value={meterForm.name} onChange={(event) => setMeterField("name", event.target.value)} />
              </label>
              <label>
                Zone
                <select value={meterForm.zone_id} onChange={(event) => setMeterField("zone_id", event.target.value)}>
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
              </label>
              {meterForm.meter_type === "customer_source" ? (
                <>
                  <label>
                    Linked customer
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
                    Linked source meter
                    <select value={meterForm.meter_id} onChange={(event) => setMeterField("meter_id", event.target.value)} required>
                      <option value="">Select exact source meter</option>
                      {customerMeters.map((meter) => (
                        <option key={meter.id} value={meter.id}>{meter.meter_number}</option>
                      ))}
                    </select>
                    {meterForm.customer_id && !customerMeters.length ? (
                      <small>No active source meter is registered for this customer.</small>
                    ) : null}
                  </label>
                </>
              ) : (
                <label>
                  Default tariff
                  <select value={meterForm.rate_id} onChange={(event) => setMeterField("rate_id", event.target.value)} required>
                    <option value="">Select tariff</option>
                    {rates.map((rate) => (
                      <option key={rate.id} value={rate.id}>{rate.name}</option>
                    ))}
                  </select>
                </label>
              )}
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

          {canConfigure ? (
            <CollapsibleSection
              as="form"
              className="form-grid production-meter-form"
              defaultOpen={Boolean(replacementForm.production_meter_id)}
              icon={<RotateCcw size={18} />}
              onSubmit={submitReplacement}
              summary={replacementForm.production_meter_id ? "Replacement in progress" : "Select active source meter"}
              title="Replace Source Meter"
            >
              <label>
                Existing source meter
                <select
                  value={replacementForm.production_meter_id}
                  onChange={(event) => setReplacementField("production_meter_id", event.target.value)}
                  required
                >
                  <option value="">Select active meter</option>
                  {meters
                    .filter((meter) => meter.status === "active")
                    .map((meter) => (
                      <option key={meter.id} value={meter.id}>
                        {meter.meter_number} - {meter.customer_name || meter.name || meterTypeLabels[meter.meter_type]}
                      </option>
                    ))}
                </select>
              </label>
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
                  min="0"
                  step="0.01"
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
                  step="0.01"
                  required
                />
              </label>
              <label>
                Reason
                <textarea value={replacementForm.reason} onChange={(event) => setReplacementField("reason", event.target.value)} rows="2" />
              </label>
              <button className="primary-button" type="submit">
                <RotateCcw size={17} />
                Record replacement
              </button>
            </CollapsibleSection>
          ) : null}

          {canConfigure ? (
            <CollapsibleSection
              as="form"
              className="form-grid production-topup-form"
              icon={<PlugZap size={18} />}
              onSubmit={submitTopup}
              summary={`${topups.length.toLocaleString()} top-up(s)`}
              title="Electricity Top-Up"
            >
              <label>
                Date
                <input value={topupForm.topup_date} onChange={(event) => setTopupField("topup_date", event.target.value)} type="date" required />
              </label>
              <label>
                kWh units
                <input value={topupForm.kwh_units} onChange={(event) => setTopupField("kwh_units", event.target.value)} type="number" min="0.01" step="0.01" required />
              </label>
              <label>
                Total cost
                <input value={topupForm.total_cost} onChange={(event) => setTopupField("total_cost", event.target.value)} type="number" min="0.01" step="0.01" required />
              </label>
              <label>
                Reference
                <input value={topupForm.reference} onChange={(event) => setTopupField("reference", event.target.value)} />
              </label>
              <label>
                Notes
                <textarea value={topupForm.notes} onChange={(event) => setTopupField("notes", event.target.value)} rows="2" />
              </label>
              <button className="primary-button" type="submit">
                <Save size={17} />
                Record top-up
              </button>
            </CollapsibleSection>
          ) : null}
        </div>
        ) : null}

        <div className="page-stack wide-panel production-primary-stack">
          {canRecordProduction ? (
          <CollapsibleSection
            actions={
              <>
                {editingWeeklyId ? (
                  <button className="icon-button" type="button" onClick={cancelWeeklyEdit} title="Cancel correction">
                    <X size={15} />
                  </button>
                ) : null}
                <FileUp size={18} />
              </>
            }
            as="form"
            className="production-weekly-form"
            defaultOpen
            onSubmit={submitWeekly}
            summary={`${readingRows.length.toLocaleString()} meter row(s) | ${weeklyForm.reading_date}`}
            title={editingWeeklyId ? "Correct Weekly Reading" : "Weekly Monday Readings"}
          >
            <div className="form-grid">
              <label>
                Reading date
                <input value={weeklyForm.reading_date} onChange={(event) => setWeeklyField("reading_date", event.target.value)} type="date" required />
              </label>
              <label>
                Previous kWh balance
                <input value={optionalNumber(weeklyContext?.previous_week?.prepaid_kwh_balance)} readOnly />
                <small>
                  {weeklyContext?.previous_week?.reading_date
                    ? `Recorded ${dateOnly(weeklyContext.previous_week.reading_date)}`
                    : "No prior weekly balance"}
                </small>
              </label>
              <label>
                Current prepaid kWh balance
                <input
                  value={weeklyForm.prepaid_kwh_balance}
                  onChange={(event) => setWeeklyField("prepaid_kwh_balance", event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Notes
                <textarea value={weeklyForm.notes} onChange={(event) => setWeeklyField("notes", event.target.value)} rows="2" />
              </label>
              {editingWeeklyId ? (
                <label>
                  Correction reason
                  <textarea
                    value={weeklyCorrectionReason}
                    onChange={(event) => setWeeklyCorrectionReason(event.target.value)}
                    rows="2"
                    required
                  />
                </label>
              ) : null}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Meter</th>
                    <th>Previous</th>
                    <th>Reading</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {readingRows.length ? (
                    readingRows.map((row, index) => (
                      <tr key={row.production_meter_id}>
                        <td>
                          {row.meter_number}
                          <small>{row.label}</small>
                        </td>
                        <td>
                          {optionalNumber(row.previous_reading_value)}
                          <small>{row.previous_reading_date ? dateOnly(row.previous_reading_date) : "No prior reading"}</small>
                          {row.previous_context_source ? (
                            <small>{previousContextLabels[row.previous_context_source] || row.previous_context_source}</small>
                          ) : null}
                        </td>
                        <td>
                          <input
                            value={row.reading_value}
                            onChange={(event) =>
                              setReadingRows((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, reading_value: event.target.value } : item
                                )
                              )
                            }
                            type="number"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            value={row.notes}
                            onChange={(event) =>
                              setReadingRows((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, notes: event.target.value } : item
                                )
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={4} title="No production meters" detail="Register production meters before entering weekly readings." />
                  )}
                </tbody>
              </table>
            </div>
            <button className="primary-button" type="submit" disabled={!readingRows.length}>
              <Save size={17} />
              {editingWeeklyId ? "Save correction" : "Save weekly readings"}
            </button>
          </CollapsibleSection>
          ) : null}

          {!hasProductionFocus ? (
          <CollapsibleSection
            actions={
              <>
                <button type="button" onClick={() => printProductionReport("detail")} disabled={!report.weeks?.length}>
                  <Printer size={16} />
                  Print
                </button>
                <PlugZap size={18} />
              </>
            }
            className="production-report-panel"
            defaultOpen
            summary={`${reportTotals.weekCount.toLocaleString()} week(s) | ${reportPeriodLabel}`}
            title="Production Report"
          >
            <div className="table-toolbar">
              <label>
                From
                <input
                  value={reportFilters.from}
                  onChange={(event) => {
                    setSelectedReportWeekId("");
                    setReportFilters((current) => ({ ...current, from: event.target.value }));
                  }}
                  type="date"
                />
              </label>
              <label>
                To
                <input
                  value={reportFilters.to}
                  onChange={(event) => {
                    setSelectedReportWeekId("");
                    setReportFilters((current) => ({ ...current, to: event.target.value }));
                  }}
                  type="date"
                />
              </label>
              <label>
                Meter
                <select value={selectedReportMeterId} onChange={(event) => setSelectedReportMeterId(event.target.value)}>
                  <option value="">All meters</option>
                  {reportMeterOptions.map((meter) => (
                    <option key={meter.id} value={meter.id}>
                      {meter.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={refreshReport}>Refresh</button>
            </div>
            {visibleReportWeeks.length && (!selectedReportMeter || reportTotals.meterRowCount) ? (
              <div className="reading-context">
                {selectedReportMeter ? (
                  <div>
                    <span>Selected meter</span>
                    <strong>{selectedReportMeter.label}</strong>
                  </div>
                ) : null}
                <div>
                  <span>Total consumption</span>
                  <strong>{number(reportTotals.consumption)}</strong>
                </div>
                <div>
                  <span>Total revenue</span>
                  <strong>{money(reportTotals.revenue)}</strong>
                </div>
                {selectedReportMeter ? (
                  <div>
                    <span>Meter history</span>
                    <strong>{reportTotals.meterRowCount.toLocaleString()} row(s)</strong>
                    <small>{reportTotals.weekCount} week(s) in range</small>
                  </div>
                ) : (
                  <>
                    <div>
                      <span>Electricity used</span>
                      <strong>{number(reportTotals.electricityUsed)} kWh</strong>
                    </div>
                    <div>
                      <span>Electricity cost</span>
                      <strong>{money(reportTotals.electricityCost)}</strong>
                    </div>
                    <div>
                      <span>Average cost basis</span>
                      <strong>{money(reportTotals.electricityCostPerUnit)} / kWh</strong>
                      <small>{reportTotals.weekCount} week(s), {reportTotals.meterRowCount} meter row(s)</small>
                    </div>
                    <div>
                      <span>Cost of production</span>
                      <strong>{(Number(reportTotals.costOfProductionRatio || 0) * 100).toFixed(2)}%</strong>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {report.weeks?.length ? (
              <div className="production-week-scroller screen-only" aria-label="Production report weeks">
                <button
                  className={!selectedReportWeekId ? "active" : ""}
                  type="button"
                  onClick={showAllReportWeeks}
                >
                  <strong>All weeks</strong>
                  <small>{report.weeks.length} week(s)</small>
                </button>
                {report.weeks.map((week) => (
                  <button
                    className={String(selectedReportWeekId) === String(week.id) ? "active" : ""}
                    type="button"
                    key={week.id}
                    onClick={() => selectReportWeek(week)}
                  >
                    <strong>{week.reading_date?.slice(0, 10)}</strong>
                    <small>
                      {selectedReportMeterId
                        ? (week.rows || []).filter((row) => String(row.production_meter_id) === String(selectedReportMeterId)).length
                        : week.rows.length} meter row(s)
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="table-wrap production-report-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Meter</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Consumption</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reportTotals.meterRowCount ? (
                    visibleReportWeeks.flatMap((week) =>
                      week.rows.map((row) => (
                        <tr key={`${week.id}-${row.id}`}>
                          <td>{week.reading_date?.slice(0, 10)}</td>
                          <td>
                            {row.meter_number}
                            <small>{row.customer_name || row.meter_name || meterTypeLabels[row.meter_type]}</small>
                          </td>
                          <td>{optionalNumber(row.previous_reading_value)}</td>
                          <td>{optionalNumber(row.reading_value)}</td>
                          <td>{Number(row.consumption || 0).toLocaleString()}</td>
                          <td>{money(row.revenue_amount)}</td>
                        </tr>
                      ))
                    )
                  ) : (
                    <EmptyTableRow colSpan={6} title="No production report data" detail="Save weekly readings or adjust the meter filter." />
                  )}
                </tbody>
              </table>
            </div>
            <div className="report-print-actions screen-only">
              <button type="button" onClick={() => printProductionReport("detail")} disabled={!report.weeks?.length}>
                <Printer size={16} />
                Print full report
              </button>
              <button type="button" onClick={() => printProductionReport("summary")} disabled={!report.weeks?.length}>
                <Printer size={16} />
                Print weekly summary
              </button>
            </div>
          </CollapsibleSection>
          ) : null}

          {!hasProductionFocus ? (
          <CollapsibleSection
            className="production-meter-list"
            summary={`${meterTable.filteredRows.length.toLocaleString()} meter(s)`}
            title="Production Meters"
          >
            <TableControls table={meterTable} label="production meters" placeholder="Search meters" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Meter</th>
                    <th>Type</th>
                    <th>Linked Source</th>
                    <th>Zone</th>
                    <th>Tariff</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meterTable.visibleRows.length ? (
                    meterTable.visibleRows.map((meter) => (
                      <tr key={meter.id}>
                        <td>
                          {meter.meter_number}
                          <small>{meter.customer_name || meter.name || "-"}</small>
                        </td>
                        <td>{meterTypeLabels[meter.meter_type] || meter.meter_type}</td>
                        <td>
                          {meter.linked_meter_number || "-"}
                          {meter.linked_meter_status ? (
                            <small>{meter.linked_meter_status === "active" ? "Linked active meter" : `Linked meter ${meter.linked_meter_status}`}</small>
                          ) : null}
                          {meter.linked_latest_reading_value !== null && meter.linked_latest_reading_value !== undefined ? (
                            <small>
                              Latest source {Number(meter.linked_latest_reading_value || 0).toLocaleString()} on {dateOnly(meter.linked_latest_reading_date)}
                            </small>
                          ) : null}
                        </td>
                        <td>{meter.zone_name || "-"}</td>
                        <td>{meter.rate_name || "-"}</td>
                        <td><span className={`status status-${meter.status}`}>{meter.status}</span></td>
                        <td>
                          {canConfigure && meter.status === "active" ? (
                            <button type="button" onClick={() => prefillReplacement(meter)}>
                              <RotateCcw size={14} />
                              Replace
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={7} title="No production meters" detail="Register source meters to start monitoring." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}

          {!hasProductionFocus ? (
          <CollapsibleSection
            className="production-topup-list"
            summary={`${topupTable.filteredRows.length.toLocaleString()} top-up(s)`}
            title="Electricity Top-Ups"
          >
            <TableControls table={topupTable} label="top-ups" placeholder="Search top-ups" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Units</th>
                    <th>Total Cost</th>
                    <th>Cost / Unit</th>
                    <th>Reference</th>
                    <th>Expense</th>
                  </tr>
                </thead>
                <tbody>
                  {topupTable.visibleRows.length ? (
                    topupTable.visibleRows.map((topup) => (
                      <tr key={topup.id}>
                        <td>{topup.topup_date?.slice(0, 10)}</td>
                        <td>{Number(topup.kwh_units || 0).toLocaleString()} kWh</td>
                        <td>{money(topup.total_cost)}</td>
                        <td>{money(topup.cost_per_unit)}</td>
                        <td>{topup.reference || "-"}</td>
                        <td>
                          {topup.expense_id ? `Expense #${topup.expense_id}` : "-"}
                          {topup.expense_reference ? <small>{topup.expense_reference}</small> : null}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={6} title="No top-ups recorded" detail="Record electricity purchases for production cost tracking." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}

          {!hasProductionFocus ? (
          <CollapsibleSection
            className="production-weekly-history"
            summary={`${weekTable.filteredRows.length.toLocaleString()} week(s)`}
            title="Weekly History"
          >
            <TableControls table={weekTable} label="weekly readings" placeholder="Search weeks" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Meters</th>
                    <th>Consumption</th>
                    <th>Revenue</th>
                    <th>kWh Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {weekTable.visibleRows.length ? (
                    weekTable.visibleRows.map((week) => (
                      <tr key={week.id}>
                        <td>{week.reading_date?.slice(0, 10)}</td>
                        <td>{week.meter_count}</td>
                        <td>{Number(week.total_consumption || 0).toLocaleString()}</td>
                        <td>{money(week.total_revenue)}</td>
                        <td>{Number(week.prepaid_kwh_balance || 0).toLocaleString()} kWh</td>
                        <td>
                          <div className="row-actions">
                            {canRecordProduction ? (
                              <button type="button" onClick={() => editWeeklyReading(week)} title="Correct weekly reading">
                                <Edit2 size={14} />
                              </button>
                            ) : null}
                            {canConfigure ? (
                              <button
                                className="danger-button"
                                type="button"
                                onClick={() => rollbackWeeklyReading(week)}
                                title="Roll back weekly reading"
                              >
                                <RotateCcw size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={6} title="No weekly readings" detail="Weekly monitoring entries will appear here." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}
        </div>
      </section>

      <section className="panel print-surface report-print active-print-surface production-report-print">
        <div className="report-print-header">
          {businessSettings?.logo_url ? (
            <img className="receipt-logo" src={assetUrl(businessSettings.logo_url)} alt="Business logo" />
          ) : (
            <div className="receipt-logo-mark">{businessSettings?.business_name?.slice(0, 2) || "AG"}</div>
          )}
          <div>
            <h3>{businessSettings?.business_name || "Water Billing"}</h3>
            {businessSettings?.legal_name ? <p>{businessSettings.legal_name}</p> : null}
            {businessSettings?.physical_address ? <p>{businessSettings.physical_address}</p> : null}
            <p>{[businessSettings?.phone, businessSettings?.email].filter(Boolean).join(" | ")}</p>
            {businessSettings?.tax_pin ? <p>PIN: {businessSettings.tax_pin}</p> : null}
          </div>
          <div className="report-print-meta">
            <span>Report</span>
            <strong>{printMode === "summary" ? "Production Weekly Summary" : "Production Report"}</strong>
            <small>{reportPeriodLabel}</small>
            {selectedReportMeter ? <small>{selectedReportMeter.label}</small> : null}
            <small>{printGeneratedAt ? `Generated ${dateTime(printGeneratedAt)}` : ""}</small>
          </div>
        </div>

        <div className="reading-context">
          <div>
            <span>Total consumption</span>
            <strong>{number(reportTotals.consumption)}</strong>
          </div>
          <div>
            <span>Total revenue</span>
            <strong>{money(reportTotals.revenue)}</strong>
          </div>
          {selectedReportMeter ? (
            <div>
              <span>Selected meter</span>
              <strong>{selectedReportMeter.label}</strong>
              <small>{reportTotals.meterRowCount} row(s)</small>
            </div>
          ) : (
            <>
              <div>
                <span>Electricity used</span>
                <strong>{number(reportTotals.electricityUsed)} kWh</strong>
              </div>
              <div>
                <span>Electricity cost</span>
                <strong>{money(reportTotals.electricityCost)}</strong>
              </div>
              <div>
                <span>Production cost</span>
                <strong>{(Number(reportTotals.costOfProductionRatio || 0) * 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>Cost / water unit</span>
                <strong>{money(reportTotals.costPerWaterUnit)}</strong>
              </div>
            </>
          )}
        </div>

        {printMode === "summary" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>kWh Used</th>
                  <th>Electricity Cost</th>
                  <th>Cost basis</th>
                  <th>Meter</th>
                  <th>Consumption</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {visibleReportWeeks.length && (!selectedReportMeter || reportTotals.meterRowCount) ? (
                  visibleReportWeeks
                    .filter((week) => !selectedReportMeter || week.rows.length)
                    .map((week) => {
                      const weekTotals = reportWeekMeterTotals(week);
                      return (
                        <tr className="production-week-summary" key={`print-week-${week.id}`}>
                          <td>{dateOnly(week.reading_date)}</td>
                          <td>{selectedReportMeter ? "-" : `${number(week.electricity_used)} kWh`}</td>
                          <td>{selectedReportMeter ? "-" : money(week.electricity_cost_used)}</td>
                          <td>
                            {selectedReportMeter ? "Meter filter" : `${money(week.electricity_cost_per_unit)} / kWh`}
                            <small>{selectedReportMeter ? selectedReportMeter.label : electricityCostSourceLabel(week)}</small>
                          </td>
                          <td>{selectedReportMeter ? selectedReportMeter.label : "Week total"}</td>
                          <td>{number(weekTotals.consumption)}</td>
                          <td>{money(weekTotals.revenue)}</td>
                        </tr>
                      );
                    })
                ) : (
                  <EmptyTableRow colSpan={7} title="No production report data" detail="Save weekly readings or adjust the meter filter." />
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-print-week-list">
            {visibleReportWeeks.length && (!selectedReportMeter || reportTotals.meterRowCount) ? (
              visibleReportWeeks
                .filter((week) => !selectedReportMeter || week.rows.length)
                .map((week) => {
                  const weekTotals = reportWeekMeterTotals(week);
                  return (
                <div className="production-print-week" key={`full-print-week-${week.id}`}>
                  <div className="table-wrap">
                    <table className="production-week-summary-table">
                      <thead>
                        <tr>
                          <th>Week</th>
                          <th>kWh Used</th>
                          <th>Electricity Cost</th>
                          <th>Cost basis</th>
                          <th>Consumption</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="production-week-summary">
                          <td>{dateOnly(week.reading_date)}</td>
                          <td>{selectedReportMeter ? "-" : `${number(week.electricity_used)} kWh`}</td>
                          <td>{selectedReportMeter ? "-" : money(week.electricity_cost_used)}</td>
                          <td>
                            {selectedReportMeter ? "Meter filter" : `${money(week.electricity_cost_per_unit)} / kWh`}
                            <small>{selectedReportMeter ? selectedReportMeter.label : electricityCostSourceLabel(week)}</small>
                          </td>
                          <td>{number(weekTotals.consumption)}</td>
                          <td>{money(weekTotals.revenue)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="table-wrap">
                    <table className="production-meter-detail-table">
                      <thead>
                        <tr>
                          <th>Week</th>
                          <th>Meter</th>
                          <th>Previous</th>
                          <th>Current</th>
                          <th>Consumption</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.rows.map((row) => (
                          <tr key={`print-${week.id}-${row.id}`}>
                            <td>{dateOnly(week.reading_date)}</td>
                            <td>
                              {row.meter_number}
                              <small>{row.customer_name || row.meter_name || meterTypeLabels[row.meter_type]}</small>
                            </td>
                            <td>{optionalNumber(row.previous_reading_value)}</td>
                            <td>{optionalNumber(row.reading_value)}</td>
                            <td>{number(row.consumption)}</td>
                            <td>{money(row.revenue_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                  );
                })
            ) : (
              <div className="table-wrap">
                <table>
                  <tbody>
                    <EmptyTableRow colSpan={6} title="No production report data" detail="Save weekly readings or adjust the meter filter." />
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="report-print-footer">
          {businessSettings?.report_footer_note ? <p>{businessSettings.report_footer_note}</p> : null}
          <small>
            {businessSettings?.business_name || "Water Billing"}{" "}
            {printMode === "summary" ? "production weekly summary" : "production report"} | {reportPeriodLabel}
          </small>
        </div>
      </section>
    </section>
  );
}

export default ProductionPage;
