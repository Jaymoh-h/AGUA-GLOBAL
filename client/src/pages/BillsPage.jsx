import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

function BillsPage({ user }) {
  const [bills, setBills] = useState([]);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const canManage = ["admin", "accountant"].includes(user.role);

  const load = () => api.bills.list(status).then(setBills);

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, [status]);

  const markPaid = async (id) => {
    await api.bills.markStatus(id, "paid");
    await load();
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Bills</h2>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </header>

      {message ? <p className="form-note">{message}</p> : null}
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Month</th>
                <th>Units</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Status</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td>
                    <strong>{bill.customer_name}</strong>
                    <small>{bill.acc_number}</small>
                  </td>
                  <td>{bill.billing_month?.slice(0, 10)}</td>
                  <td>{Number(bill.units_used).toLocaleString()}</td>
                  <td>{Number(bill.rate).toLocaleString()}</td>
                  <td>{money(bill.amount)}</td>
                  <td>{money(bill.paid_amount)}</td>
                  <td>
                    <StatusBadge status={bill.status} />
                  </td>
                  {canManage ? (
                    <td>
                      {bill.status !== "paid" ? (
                        <button type="button" onClick={() => markPaid(bill.id)}>
                          <CheckCircle2 size={15} />
                          Mark paid
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default BillsPage;

