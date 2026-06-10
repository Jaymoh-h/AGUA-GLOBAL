import { Edit2, FileUp, Gauge, PlugZap, Printer, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [printGeneratedAt, setPrintGeneratedAt] = useState("");
  const [printMode, setPrintMode] = useState("detail");

  const canConfigure = ["admin", "accountant"].includes(user?.role);
  const focusKey = navigationIntent?.page === "production" ? navigationIntent.focus : "";
  const hasProductionFocus = focusKey === "production_gap";

  const load = async () => {
    const [meterRows, rateRows, zoneRows, customerRows, topupRows, weekRows, reportRows, settingsRows] = await Promise.all([
      api.production.meters(),
      api.rates.list(),
      api.zones.list(),
      api.customers.list(),
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
    setReadingRows((current) => {
      const existing = new Map(current.map((row) => [Number(row.production_meter_id), row]));
      return meters
        .filter((meter) => meter.status === "active")
        .map((meter) => ({
          production_meter_id: meter.id,
          meter_number: meter.meter_number,
          label: meter.customer_name || meter.name || meter.meter_number,
          previous_reading_value: existing.get(Number(meter.id))?.previous_reading_value ?? null,
          previous_reading_date: existing.get(Number(meter.id))?.previous_reading_date ?? null,
          reading_value: existing.get(Number(meter.id))?.reading_value || "",
          notes: existing.get(Number(meter.id))?.notes || ""
        }));
    });
  }, [editingWeeklyId, meters]);

  useEffect(() => {
    if (!weeklyForm.reading_date) return undefined;
    let ignore = false;
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
              previous_reading_date: match.previous_reading_date
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
        if (!ignore) setCustomerMeters(rows.filter((meter) => meter.meter_role === "source_backup"));
      })
      .catch((err) => {
        if (!ignore) setMessage(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [meterForm.customer_id]);

  const setMeterField = (field, value) => setMeterForm((current) => ({ ...current, [field]: value }));
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

  const reportTotals = useMemo(() => {
    const rows = report.weeks || [];
    const electricityCost = rows.reduce((sum, row) => sum + Number(row.electricity_cost_used || 0), 0);
    const revenue = rows.reduce((sum, row) => sum + Number(row.total_revenue || 0), 0);
    const consumption = rows.reduce((sum, row) => sum + Number(row.total_consumption || 0), 0);
    const electricityUsed = rows.reduce((sum, row) => sum + Number(row.electricity_used || 0), 0);
    return {
      weekCount: rows.length,
      meterRowCount: rows.reduce((sum, row) => sum + Number(row.rows?.length || 0), 0),
      consumption,
      revenue,
      electricityUsed,
      electricityCost,
      costOfProductionRatio: revenue > 0 ? electricityCost / revenue : 0,
      costPerWaterUnit: consumption > 0 ? electricityCost / consumption : 0,
      electricityCostPerUnit: electricityUsed > 0 ? electricityCost / electricityUsed : 0
    };
  }, [report]);
  const reportPeriodLabel = `${report.from?.slice(0, 10) || reportFilters.from || "Beginning"} to ${
    report.to?.slice(0, 10) || reportFilters.to || "Today"
  }`;

  const submitMeter = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.production.createMeter({
        ...meterForm,
        zone_id: meterForm.zone_id || null,
        customer_id: meterForm.meter_type === "customer_source" ? Number(meterForm.customer_id) : null,
        meter_id: meterForm.meter_id || null,
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
            <form className="panel form-grid production-meter-form" onSubmit={submitMeter}>
              <div className="panel-heading">
                <h3>Production Meter</h3>
                <Gauge size={18} />
              </div>
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
                    <select value={meterForm.meter_id} onChange={(event) => setMeterField("meter_id", event.target.value)}>
                      <option value="">No linked meter</option>
                      {customerMeters.map((meter) => (
                        <option key={meter.id} value={meter.id}>{meter.meter_number}</option>
                      ))}
                    </select>
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
            </form>
          ) : null}

          {canConfigure ? (
            <form className="panel form-grid production-meter-form" onSubmit={submitReplacement}>
              <div className="panel-heading">
                <h3>Replace Source Meter</h3>
                <RotateCcw size={18} />
              </div>
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
            </form>
          ) : null}

          {canConfigure ? (
            <form className="panel form-grid production-topup-form" onSubmit={submitTopup}>
              <div className="panel-heading">
                <h3>Electricity Top-Up</h3>
                <PlugZap size={18} />
              </div>
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
            </form>
          ) : null}
        </div>
        ) : null}

        <div className="page-stack wide-panel production-primary-stack">
          <form className="panel production-weekly-form" onSubmit={submitWeekly}>
            <div className="panel-heading">
              <h3>{editingWeeklyId ? "Correct Weekly Reading" : "Weekly Monday Readings"}</h3>
              <div className="row-actions">
                {editingWeeklyId ? (
                  <button className="icon-button" type="button" onClick={cancelWeeklyEdit} title="Cancel correction">
                    <X size={15} />
                  </button>
                ) : null}
                <FileUp size={18} />
              </div>
            </div>
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
          </form>

          {!hasProductionFocus ? (
          <div className="panel production-report-panel">
            <div className="panel-heading">
              <h3>Production Report</h3>
              <div className="row-actions">
                <button type="button" onClick={() => printProductionReport("detail")} disabled={!report.weeks?.length}>
                  <Printer size={16} />
                  Print
                </button>
                <PlugZap size={18} />
              </div>
            </div>
            <div className="table-toolbar">
              <label>
                From
                <input value={reportFilters.from} onChange={(event) => setReportFilters((current) => ({ ...current, from: event.target.value }))} type="date" />
              </label>
              <label>
                To
                <input value={reportFilters.to} onChange={(event) => setReportFilters((current) => ({ ...current, to: event.target.value }))} type="date" />
              </label>
              <button type="button" onClick={refreshReport}>Refresh</button>
            </div>
            {report.weeks?.length ? (
              <div className="reading-context">
                <div>
                  <span>Total consumption</span>
                  <strong>{number(reportTotals.consumption)}</strong>
                </div>
                <div>
                  <span>Total revenue</span>
                  <strong>{money(reportTotals.revenue)}</strong>
                </div>
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
              </div>
            ) : null}
            <div className="table-wrap">
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
                  {report.weeks?.length ? (
                    report.weeks.flatMap((week) =>
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
                    <EmptyTableRow colSpan={6} title="No production report data" detail="Save weekly readings to generate monitoring results." />
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
          </div>
          ) : null}

          {!hasProductionFocus ? (
          <div className="panel production-meter-list">
            <div className="panel-heading">
              <h3>Production Meters</h3>
            </div>
            <TableControls table={meterTable} label="production meters" placeholder="Search meters" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Meter</th>
                    <th>Type</th>
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
                    <EmptyTableRow colSpan={6} title="No production meters" detail="Register source meters to start monitoring." />
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}

          {!hasProductionFocus ? (
          <div className="panel production-topup-list">
            <div className="panel-heading">
              <h3>Electricity Top-Ups</h3>
            </div>
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
          </div>
          ) : null}

          {!hasProductionFocus ? (
          <div className="panel production-weekly-history">
            <div className="panel-heading">
              <h3>Weekly History</h3>
            </div>
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
                            <button type="button" onClick={() => editWeeklyReading(week)} title="Correct weekly reading">
                              <Edit2 size={14} />
                            </button>
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
          </div>
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
                {report.weeks?.length ? (
                  report.weeks.map((week) => (
                    <tr className="production-week-summary" key={`print-week-${week.id}`}>
                      <td>{dateOnly(week.reading_date)}</td>
                      <td>{number(week.electricity_used)} kWh</td>
                      <td>{money(week.electricity_cost_used)}</td>
                      <td>
                        {money(week.electricity_cost_per_unit)} / kWh
                        <small>{electricityCostSourceLabel(week)}</small>
                      </td>
                      <td>Week total</td>
                      <td>{number(week.total_consumption)}</td>
                      <td>{money(week.total_revenue)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={7} title="No production report data" detail="Save weekly readings to generate monitoring results." />
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="production-print-week-list">
            {report.weeks?.length ? (
              report.weeks.map((week) => (
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
                          <td>{number(week.electricity_used)} kWh</td>
                          <td>{money(week.electricity_cost_used)}</td>
                          <td>
                            {money(week.electricity_cost_per_unit)} / kWh
                            <small>{electricityCostSourceLabel(week)}</small>
                          </td>
                          <td>{number(week.total_consumption)}</td>
                          <td>{money(week.total_revenue)}</td>
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
              ))
            ) : (
              <div className="table-wrap">
                <table>
                  <tbody>
                    <EmptyTableRow colSpan={6} title="No production report data" detail="Save weekly readings to generate monitoring results." />
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
