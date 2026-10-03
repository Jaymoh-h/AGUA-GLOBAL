import ReportPanelHeading from "./ReportPanelHeading";

function ProfitStatement({ money, onPrint, percent, statement, title, variant }) {
  return (
    <div className={`panel profit-loss-statement profit-loss-statement-${variant}`}>
      <ReportPanelHeading compact title={title} printLabel={title.toLowerCase()} onPrint={onPrint} />
      <div className="reading-context">
        <div>
          <span>Revenue</span>
          <strong>{money(statement.totals?.revenue)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong>{money(statement.totals?.expenses)}</strong>
        </div>
        <div>
          <span>Net profit</span>
          <strong>{money(statement.totals?.net_profit)}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>{percent(statement.totals?.margin)}</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="muted-total">
              <td colSpan="2">Revenue</td>
            </tr>
            {statement.revenue_lines?.map((row) => (
              <tr key={`revenue-${title}-${row.label}`}>
                <td>
                  {row.label}
                  {row.detail ? <small>{row.detail}</small> : null}
                </td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
            <tr className="muted-total">
              <td colSpan="2">Expenses</td>
            </tr>
            {statement.expense_lines?.length ? (
              statement.expense_lines.map((row) => (
                <tr key={`expense-${title}-${row.label}`}>
                  <td>
                    {row.label}
                    {row.detail ? <small>{row.detail}</small> : null}
                  </td>
                  <td>{money(row.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>No expenses recorded</td>
                <td>{money(0)}</td>
              </tr>
            )}
            {statement.notes?.length ? (
              <>
                <tr className="muted-total">
                  <td colSpan="2">Notes</td>
                </tr>
                {statement.notes.map((row) => (
                  <tr key={`note-${title}-${row.label}`}>
                    <td>
                      {row.label}
                      {row.detail ? <small>{row.detail}</small> : null}
                    </td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProfitStatement;
