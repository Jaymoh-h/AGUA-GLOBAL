function PaymentReconciliationHistory({ date, history, money }) {
  if (!history.length) return null;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Prepared</th>
            <th>Source</th>
            <th>Profile</th>
            <th>Rows</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item.id}>
              <td>{date(item.created_at)}</td>
              <td>{item.source}</td>
              <td>{item.profile}</td>
              <td>
                {item.rows}
                {item.ignored ? <small>{item.ignored} ignored</small> : null}
              </td>
              <td>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PaymentReconciliationHistory;
