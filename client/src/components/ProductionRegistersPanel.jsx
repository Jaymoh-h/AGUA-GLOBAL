import { Edit2, RotateCcw } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => value?.slice(0, 10) || "";

export default function ProductionRegistersPanel({
  canConfigure,
  canRecordProduction,
  meterTable,
  meterTypeLabels,
  onEditMeter,
  onEditWeekly,
  onPrefillReplacement,
  onRollbackWeekly,
  topupTable,
  weekTable
}) {
  return (
    <>
      <CollapsibleSection className="production-meter-list" summary={`${meterTable.filteredRows.length.toLocaleString()} meter(s)`} title="Production Meters">
        <TableControls table={meterTable} label="production meters" placeholder="Search meters" />
        <div className="table-wrap"><table><thead><tr><th>Meter</th><th>Type</th><th>Linked Source</th><th>Zone</th><th>Tariff</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {meterTable.visibleRows.length ? meterTable.visibleRows.map((meter) => (
            <tr key={meter.id}>
              <td>{meter.meter_number}<small>{meter.customer_name || meter.name || "-"}</small></td>
              <td>{meterTypeLabels[meter.meter_type] || meter.meter_type}</td>
              <td>
                {meter.linked_meter_number || "-"}
                {meter.linked_meter_status ? <small>{meter.linked_meter_status === "active" ? "Linked active meter" : `Linked meter ${meter.linked_meter_status}`}</small> : null}
                {meter.linked_latest_reading_value !== null && meter.linked_latest_reading_value !== undefined ? <small>Latest source {Number(meter.linked_latest_reading_value || 0).toLocaleString()} on {dateOnly(meter.linked_latest_reading_date)}</small> : null}
              </td>
              <td>{meter.zone_name || "-"}</td><td>{meter.rate_name || "-"}</td><td><span className={`status status-${meter.status}`}>{meter.status}</span></td>
              <td>{canConfigure && !["replaced", "removed"].includes(meter.status) ? <div className="row-actions"><button type="button" onClick={() => onEditMeter(meter)} title="Edit production meter"><Edit2 size={14} />Edit</button>{meter.status === "active" ? <button type="button" onClick={() => onPrefillReplacement(meter)}><RotateCcw size={14} />Replace</button> : null}</div> : "-"}</td>
            </tr>
          )) : <EmptyTableRow colSpan={7} title="No production meters" detail="Register source meters to start monitoring." />}
        </tbody></table></div>
      </CollapsibleSection>

      <CollapsibleSection className="production-topup-list" summary={`${topupTable.filteredRows.length.toLocaleString()} top-up(s)`} title="Electricity Top-Ups">
        <TableControls table={topupTable} label="top-ups" placeholder="Search top-ups" />
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Units</th><th>Total Cost</th><th>Cost / Unit</th><th>Reference</th><th>Expense</th></tr></thead><tbody>
          {topupTable.visibleRows.length ? topupTable.visibleRows.map((topup) => <tr key={topup.id}><td>{topup.topup_date?.slice(0, 10)}</td><td>{Number(topup.kwh_units || 0).toLocaleString()} kWh</td><td>{money(topup.total_cost)}</td><td>{money(topup.cost_per_unit)}</td><td>{topup.reference || "-"}</td><td>{topup.expense_id ? `Expense #${topup.expense_id}` : "-"}{topup.expense_reference ? <small>{topup.expense_reference}</small> : null}</td></tr>) : <EmptyTableRow colSpan={6} title="No top-ups recorded" detail="Record electricity purchases for production cost tracking." />}
        </tbody></table></div>
      </CollapsibleSection>

      <CollapsibleSection className="production-weekly-history" summary={`${weekTable.filteredRows.length.toLocaleString()} week(s)`} title="Weekly History">
        <TableControls table={weekTable} label="weekly readings" placeholder="Search weeks" />
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Meters</th><th>Consumption</th><th>Revenue</th><th>kWh Balance</th><th>Actions</th></tr></thead><tbody>
          {weekTable.visibleRows.length ? weekTable.visibleRows.map((week) => <tr key={week.id}><td>{week.reading_date?.slice(0, 10)}</td><td>{week.meter_count}</td><td>{Number(week.total_consumption || 0).toLocaleString()}</td><td>{money(week.total_revenue)}</td><td>{Number(week.prepaid_kwh_balance || 0).toLocaleString()} kWh</td><td><div className="row-actions">{canRecordProduction ? <button type="button" onClick={() => onEditWeekly(week)} title="Correct weekly reading"><Edit2 size={14} /></button> : null}{canConfigure ? <button className="danger-button" type="button" onClick={() => onRollbackWeekly(week)} title="Roll back weekly reading"><RotateCcw size={14} /></button> : null}</div></td></tr>) : <EmptyTableRow colSpan={6} title="No weekly readings" detail="Weekly monitoring entries will appear here." />}
        </tbody></table></div>
      </CollapsibleSection>
    </>
  );
}
