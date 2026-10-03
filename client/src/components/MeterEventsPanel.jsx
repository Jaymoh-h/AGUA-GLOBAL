import { Edit3, Replace, Save } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls, { useTableControls } from "./TableControls";

export default function MeterEventsPanel({ eventForm, events, onCancelEdit, onEdit, onFieldChange, onSubmit, editingEventId }) {
  const eventTable = useTableControls(events, {
    searchFields: ["customer_name", "acc_number", "event_date", "old_meter_number", "new_meter_number", "reason"]
  });

  return (
    <CollapsibleSection
      defaultOpen={Boolean(editingEventId)}
      icon={<Replace size={18} />}
      summary={`${eventTable.filteredRows.length.toLocaleString()} event(s)`}
      title="Meter Events"
    >
      {editingEventId ? (
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Event date<input value={eventForm.event_date} onChange={(event) => onFieldChange("event_date", event.target.value)} type="date" required /></label>
          <label>Old final reading<input value={eventForm.old_final_reading} onChange={(event) => onFieldChange("old_final_reading", event.target.value)} type="number" min="0" required /></label>
          <label>New initial reading<input value={eventForm.new_initial_reading} onChange={(event) => onFieldChange("new_initial_reading", event.target.value)} type="number" min="0" required /></label>
          <label>Reason<textarea value={eventForm.reason} onChange={(event) => onFieldChange("reason", event.target.value)} rows="2" /></label>
          <label>Correction reason<textarea value={eventForm.correction_reason} onChange={(event) => onFieldChange("correction_reason", event.target.value)} rows="2" required /></label>
          <div className="row-actions">
            <button className="primary-button" type="submit"><Save size={17} />Save event</button>
            <button type="button" onClick={onCancelEdit}>Cancel</button>
          </div>
        </form>
      ) : null}
      <TableControls table={eventTable} label="events" placeholder="Search meter events" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Date</th><th>Old Meter</th><th>Old Final</th><th>New Meter</th><th>New Initial</th><th>Reason</th><th>Actions</th></tr></thead>
          <tbody>
            {eventTable.visibleRows.length ? eventTable.visibleRows.map((event) => (
              <tr key={event.id}>
                <td><strong>{event.customer_name}</strong><small>{event.acc_number}</small></td>
                <td>{event.event_date?.slice(0, 10)}</td>
                <td>{event.old_meter_number || "-"}</td>
                <td>{Number(event.old_final_reading || 0).toLocaleString()}</td>
                <td>{event.new_meter_number || "-"}</td>
                <td>{Number(event.new_initial_reading || 0).toLocaleString()}</td>
                <td>{event.reason || "-"}</td>
                <td><button type="button" onClick={() => onEdit(event)}><Edit3 size={15} />Edit</button></td>
              </tr>
            )) : <EmptyTableRow colSpan={8} title="No meter events found" detail="Meter replacements will appear here." />}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
