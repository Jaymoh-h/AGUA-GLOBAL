export default function DataQualityPanel({
  highPriorityCount,
  issueCount,
  label,
  number,
  onSelect,
  reviewableCount,
  selectedCheck,
  selectedColumns,
  selectedRecords,
  visibleChecks
}) {
  return (
    <div className="panel screen-only report-quality-panel">
      <div className="panel-heading">
        <div>
          <h3>Data Quality Checks</h3>
          <p className="muted">
            {issueCount
              ? `${number(issueCount)} finding(s), ${number(highPriorityCount)} high priority.`
              : "No active findings from the current checks."}
          </p>
        </div>
        {reviewableCount ? (
          <span className="status status-pending">{number(reviewableCount)} reviewable</span>
        ) : (
          <span className="status status-paid">clear</span>
        )}
      </div>
      <div className="report-catalog compact-report-catalog">
        {visibleChecks.map((check) => (
          <button
            className={selectedCheck?.key === check.key ? "report-catalog-item active" : "report-catalog-item"}
            disabled={!check.records?.length}
            key={check.key}
            onClick={() => onSelect(check.key)}
            type="button"
          >
            <strong>{check.label}</strong>
            <span>{label(check.severity)} | {number(check.count)} finding(s)</span>
            <small>{check.records?.length ? "Open review detail" : check.detail}</small>
          </button>
        ))}
        {!visibleChecks.length ? <p className="muted">No checks available.</p> : null}
      </div>
      {selectedCheck && selectedColumns.length ? (
        <div className="quality-detail-panel">
          <div className="panel-heading compact-heading">
            <div>
              <h3>{selectedCheck.label}</h3>
              <small>Showing up to {number(selectedRecords.length)} affected records for review.</small>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {selectedColumns.map(([column]) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {selectedRecords.length ? (
                  selectedRecords.map((row, index) => (
                    <tr key={`${selectedCheck.key}-${row.id || index}-${index}`}>
                      {selectedColumns.map(([column, value]) => <td key={column}>{value(row) || "-"}</td>)}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={selectedColumns.length} className="muted">No affected records returned for this check.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
