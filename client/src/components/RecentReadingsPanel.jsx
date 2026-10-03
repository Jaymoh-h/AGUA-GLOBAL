import { Download, Gauge } from "lucide-react";
import CollapsibleSection from "./CollapsibleSection";
import { EmptyTableRow } from "./EmptyState";
import TableControls from "./TableControls";

export default function RecentReadingsPanel({
  customers,
  customerFilter,
  dateFromFilter,
  dateToFilter,
  meterRoleLabels,
  onCustomerFilterChange,
  onDateFromChange,
  onDateToChange,
  onEdit,
  onExport,
  error,
  loading,
  table
}) {
  return (
    <CollapsibleSection
      actions={<button type="button" onClick={onExport}><Download size={16} />Export</button>}
      defaultOpen
      icon={<Gauge size={18} />}
      summary={`${table.total.toLocaleString()} reading(s)`}
      title="Recent Readings"
    >
      <div className="table-toolbar">
        <label>
          Customer
          <select value={customerFilter} onChange={(event) => onCustomerFilterChange(event.target.value)}>
            <option value="">All customers</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.acc_number} - {customer.name}</option>)}
          </select>
        </label>
        <label>From<input value={dateFromFilter} onChange={(event) => onDateFromChange(event.target.value)} type="date" /></label>
        <label>To<input value={dateToFilter} onChange={(event) => onDateToChange(event.target.value)} type="date" /></label>
      </div>
      <TableControls table={table} label="readings" placeholder="Search readings" />
      {error ? <p className="form-message error">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Account</th><th>Meter</th><th>Role</th><th>Previous</th><th>Reading</th><th>Date</th><th>Reader</th><th>Actions</th></tr></thead>
          <tbody>
            {table.visibleRows.length ? table.visibleRows.map((reading) => (
              <tr key={reading.id}>
                <td>{reading.customer_name}</td>
                <td>{reading.acc_number}</td>
                <td>{reading.meter_number || "-"}</td>
                <td>{meterRoleLabels[reading.meter_role] || "Client billing"}{reading.source_billing_request_status ? <small>{reading.source_billing_request_status}</small> : null}</td>
                <td>{reading.previous_reading_value === null || reading.previous_reading_value === undefined ? "-" : Number(reading.previous_reading_value).toLocaleString()}<small>{reading.previous_reading_date?.slice(0, 10) || ""}</small></td>
                <td>{Number(reading.reading_value).toLocaleString()}</td>
                <td>{reading.reading_date?.slice(0, 10)}</td>
                <td>{reading.created_by_name || "-"}</td>
                <td><button type="button" onClick={() => onEdit(reading)}>Edit</button></td>
              </tr>
            )) : <EmptyTableRow colSpan={9} title={loading ? "Loading reading register" : "No readings found"} detail={loading ? "Retrieving the selected reading register page." : "Record readings or adjust the filters."} />}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
