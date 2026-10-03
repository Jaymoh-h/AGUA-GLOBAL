import { EmptyTableRow } from "./EmptyState";
import ReportPanelHeading from "./ReportPanelHeading";

const EmptyRow = ({ colSpan }) => (
  <EmptyTableRow colSpan={colSpan} title="No records found" detail="This report has no rows for the current filters." />
);

function ManagementMaintenanceReports({
  assigneeTotals,
  byAssigneeRows,
  byCategoryRows,
  byStatusRows,
  byZoneRows,
  categoryTotals,
  isVisible,
  label,
  number,
  onPrint,
  statusTotals,
  zoneTotals
}) {
  const sectionClass = (name, key) => `panel management-section ${name}${isVisible(key) ? "" : " report-section-collapsed"}`;

  return (
    <>
      <div className={sectionClass("management-section-maintenanceStatus", "maintenanceStatus")}>
        <ReportPanelHeading title="Maintenance Status" printLabel="maintenance status" onPrint={() => onPrint("maintenanceStatus")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Status</th><th>Requests</th><th>Urgent</th><th>Overdue</th></tr>
            </thead>
            <tbody>
              {byStatusRows.length ? byStatusRows.map((row) => (
                <tr key={row.status}>
                  <td>{label(row.status)}</td>
                  <td>{number(row.request_count)}</td>
                  <td>{number(row.urgent_count)}</td>
                  <td>{number(row.overdue_count)}</td>
                </tr>
              )) : <EmptyRow colSpan={4} />}
              {byStatusRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(statusTotals.request_count)}</strong></td>
                  <td><strong>{number(statusTotals.urgent_count)}</strong></td>
                  <td><strong>{number(statusTotals.overdue_count)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-maintenanceCategory", "maintenanceCategory")}>
        <ReportPanelHeading title="Maintenance By Category" printLabel="maintenance by category" onPrint={() => onPrint("maintenanceCategory")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Category</th><th>Active</th><th>Urgent</th><th>Overdue</th></tr>
            </thead>
            <tbody>
              {byCategoryRows.length ? byCategoryRows.map((row) => (
                <tr key={row.category}>
                  <td>{label(row.category)}</td>
                  <td>{number(row.request_count)}</td>
                  <td>{number(row.urgent_count)}</td>
                  <td>{number(row.overdue_count)}</td>
                </tr>
              )) : <EmptyRow colSpan={4} />}
              {byCategoryRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(categoryTotals.request_count)}</strong></td>
                  <td><strong>{number(categoryTotals.urgent_count)}</strong></td>
                  <td><strong>{number(categoryTotals.overdue_count)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-maintenanceZone", "maintenanceZone")}>
        <ReportPanelHeading title="Maintenance By Zone" printLabel="maintenance by zone" onPrint={() => onPrint("maintenanceZone")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Zone</th><th>Active</th><th>Urgent</th><th>Overdue</th></tr>
            </thead>
            <tbody>
              {byZoneRows.length ? byZoneRows.map((row) => (
                <tr key={row.zone_name}>
                  <td>{row.zone_name}</td>
                  <td>{number(row.request_count)}</td>
                  <td>{number(row.urgent_count)}</td>
                  <td>{number(row.overdue_count)}</td>
                </tr>
              )) : <EmptyRow colSpan={4} />}
              {byZoneRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(zoneTotals.request_count)}</strong></td>
                  <td><strong>{number(zoneTotals.urgent_count)}</strong></td>
                  <td><strong>{number(zoneTotals.overdue_count)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className={sectionClass("management-section-maintenanceAssignee", "maintenanceAssignee")}>
        <ReportPanelHeading title="Maintenance Assignment" printLabel="maintenance assignment" onPrint={() => onPrint("maintenanceAssignee")} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Assigned To</th><th>Active</th><th>Open</th><th>In Progress</th><th>Overdue</th></tr>
            </thead>
            <tbody>
              {byAssigneeRows.length ? byAssigneeRows.map((row) => (
                <tr key={row.assigned_to_name}>
                  <td>{row.assigned_to_name}</td>
                  <td>{number(row.request_count)}</td>
                  <td>{number(row.open_count)}</td>
                  <td>{number(row.in_progress_count)}</td>
                  <td>{number(row.overdue_count)}</td>
                </tr>
              )) : <EmptyRow colSpan={5} />}
              {byAssigneeRows.length ? (
                <tr className="muted-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{number(assigneeTotals.request_count)}</strong></td>
                  <td><strong>{number(assigneeTotals.open_count)}</strong></td>
                  <td><strong>{number(assigneeTotals.in_progress_count)}</strong></td>
                  <td><strong>{number(assigneeTotals.overdue_count)}</strong></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ManagementMaintenanceReports;
