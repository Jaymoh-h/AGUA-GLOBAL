import { PlugZap, Printer } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const number = (value) => Number(value || 0).toLocaleString();
const optionalNumber = (value) => value === null || value === undefined || value === "" ? "-" : Number(value || 0).toLocaleString();

export default function ProductionReportPanel({
  meterTypeLabels,
  onFilterChange,
  onMeterChange,
  onPrint,
  onRefresh,
  onSelectWeek,
  onShowAllWeeks,
  report,
  reportFilters,
  reportMeterOptions,
  reportPeriodLabel,
  reportTotals,
  selectedMeter,
  selectedMeterId,
  selectedWeekId,
  visibleWeeks
}) {
  const hasRows = visibleWeeks.length && (!selectedMeter || reportTotals.meterRowCount);
  return (
    <CollapsibleSection
      actions={<><button type="button" onClick={() => onPrint("detail")} disabled={!report.weeks?.length}><Printer size={16} />Print</button><PlugZap size={18} /></>}
      className="production-report-panel"
      defaultOpen={false}
      summary={`${reportTotals.weekCount.toLocaleString()} week(s) | ${reportPeriodLabel}`}
      title="Production Report"
    >
      <div className="table-toolbar">
        <label>From<input value={reportFilters.from} onChange={(event) => onFilterChange("from", event.target.value)} type="date" /></label>
        <label>To<input value={reportFilters.to} onChange={(event) => onFilterChange("to", event.target.value)} type="date" /></label>
        <label>
          Meter
          <select value={selectedMeterId} onChange={(event) => onMeterChange(event.target.value)}>
            <option value="">All meters</option>
            {reportMeterOptions.map((meter) => <option key={meter.id} value={meter.id}>{meter.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      {hasRows ? (
        <div className="reading-context">
          {selectedMeter ? <div><span>Selected meter</span><strong>{selectedMeter.label}</strong></div> : null}
          <div><span>Total consumption</span><strong>{number(reportTotals.consumption)}</strong></div>
          <div><span>Total revenue</span><strong>{money(reportTotals.revenue)}</strong></div>
          {selectedMeter ? <div><span>Meter history</span><strong>{reportTotals.meterRowCount.toLocaleString()} row(s)</strong><small>{reportTotals.weekCount} week(s) in range</small></div> : <>
            <div><span>Electricity used</span><strong>{number(reportTotals.electricityUsed)} kWh</strong></div>
            <div><span>Electricity cost</span><strong>{money(reportTotals.electricityCost)}</strong></div>
            <div><span>Average cost basis</span><strong>{money(reportTotals.electricityCostPerUnit)} / kWh</strong><small>{reportTotals.weekCount} week(s), {reportTotals.meterRowCount} meter row(s)</small></div>
            <div><span>Cost of production</span><strong>{(Number(reportTotals.costOfProductionRatio || 0) * 100).toFixed(2)}%</strong></div>
          </>}
        </div>
      ) : null}
      {report.weeks?.length ? (
        <div className="production-week-scroller screen-only" aria-label="Production report weeks">
          <button className={!selectedWeekId ? "active" : ""} type="button" onClick={onShowAllWeeks}><strong>All weeks</strong><small>{report.weeks.length} week(s)</small></button>
          {report.weeks.map((week) => <button className={String(selectedWeekId) === String(week.id) ? "active" : ""} type="button" key={week.id} onClick={() => onSelectWeek(week)}><strong>{week.reading_date?.slice(0, 10)}</strong><small>{selectedMeterId ? (week.rows || []).filter((row) => String(row.production_meter_id) === String(selectedMeterId)).length : week.rows.length} meter row(s)</small></button>)}
        </div>
      ) : null}
      <div className="table-wrap production-report-table-wrap"><table><thead><tr><th>Week</th><th>Meter</th><th>Previous</th><th>Current</th><th>Consumption</th><th>Revenue</th></tr></thead><tbody>
        {reportTotals.meterRowCount ? visibleWeeks.flatMap((week) => week.rows.map((row) => <tr key={`${week.id}-${row.id}`}><td>{week.reading_date?.slice(0, 10)}</td><td>{row.meter_number}<small>{row.customer_name || row.meter_name || meterTypeLabels[row.meter_type]}</small></td><td>{optionalNumber(row.previous_reading_value)}</td><td>{optionalNumber(row.reading_value)}</td><td>{number(row.consumption)}</td><td>{money(row.revenue_amount)}</td></tr>)) : <EmptyTableRow colSpan={6} title="No production report data" detail="Save weekly readings or adjust the meter filter." />}
      </tbody></table></div>
      <div className="report-print-actions screen-only"><button type="button" onClick={() => onPrint("detail")} disabled={!report.weeks?.length}><Printer size={16} />Print full report</button><button type="button" onClick={() => onPrint("summary")} disabled={!report.weeks?.length}><Printer size={16} />Print weekly summary</button></div>
    </CollapsibleSection>
  );
}
