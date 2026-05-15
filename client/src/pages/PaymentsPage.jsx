import { CircleDollarSign, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    method: "cash",
    reference: "",
    notes: ""
  });
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const selectedCustomer = customers.find((customer) => Number(customer.id) === Number(form.customer_id));
  const selectedBalance = Number(selectedCustomer?.balance_due || 0);

  const load = async () => {
    const [paymentRows, customerRows] = await Promise.all([api.payments.list(), api.customers.list()]);
    setPayments(paymentRows);
    setCustomers(customerRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (!editingId && selectedBalance <= 0) {
      setMessage("Selected customer has no unpaid balance.");
      return;
    }

    if (!editingId && Number(form.amount) > selectedBalance) {
      setMessage(`Payment exceeds selected customer's balance of ${money(selectedBalance)}.`);
      return;
    }

    try {
      let successMessage = editingId ? "Payment updated." : "Payment recorded.";
      if (editingId) {
        await api.payments.update(editingId, {
          amount: Number(form.amount),
          payment_date: form.payment_date,
          method: form.method,
          reference: form.reference,
          notes: form.notes
        });
      } else {
        const result = await api.payments.create({ ...form, customer_id: Number(form.customer_id), amount: Number(form.amount) });
        if (result.payments?.length > 1) {
          successMessage = `Payment recorded across ${result.payments.length} bills.`;
        }
      }
      setForm((current) => ({ ...current, customer_id: "", amount: "", reference: "", notes: "" }));
      setEditingId(null);
      await load();
      setMessage(successMessage);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (payment) => {
    setEditingId(payment.id);
    setForm({
      customer_id: payment.customer_id || "",
      amount: payment.amount || "",
      payment_date: payment.payment_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      method: payment.method || "cash",
      reference: payment.reference || "",
      notes: payment.notes || ""
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({
      customer_id: "",
      amount: "",
      payment_date: new Date().toISOString().slice(0, 10),
      method: "cash",
      reference: "",
      notes: ""
    });
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cash Office</p>
          <h2>Payments</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Payment" : "Record Payment"}</h3>
          </div>
          <label>
            Customer
            <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required disabled={Boolean(editingId)}>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.acc_number} - {customer.name} - balance {money(customer.balance_due)}
                </option>
              ))}
            </select>
          </label>
          {selectedCustomer ? (
            <div className="balance-note">
              <span>Available balance</span>
              <strong>{money(selectedBalance)}</strong>
            </div>
          ) : null}
          <label>
            Amount
            <input
              value={form.amount}
              onChange={(event) => setField("amount", event.target.value)}
              type="number"
              min="1"
              max={!editingId && selectedBalance > 0 ? selectedBalance : undefined}
              required
            />
          </label>
          <label>
            Date
            <input value={form.payment_date} onChange={(event) => setField("payment_date", event.target.value)} type="date" />
          </label>
          <label>
            Method
            <select value={form.method} onChange={(event) => setField("method", event.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="mobile_money">Mobile money</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>
          <label>
            Reference
            <input value={form.reference} onChange={(event) => setField("reference", event.target.value)} />
          </label>
          <label>
            Notes
            <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows="3" />
          </label>
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit">
            {editingId ? <Save size={17} /> : <CircleDollarSign size={17} />}
            {editingId ? "Save payment" : "Record payment"}
          </button>
          {editingId ? (
            <button type="button" onClick={cancelEdit}>
              Cancel edit
            </button>
          ) : null}
        </form>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Payment History</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.customer_name}</strong>
                      <small>{payment.acc_number}</small>
                    </td>
                    <td>{money(payment.amount)}</td>
                    <td>{payment.payment_date?.slice(0, 10)}</td>
                    <td>{payment.method}</td>
                    <td>{payment.reference || "-"}</td>
                    <td>
                      <button type="button" onClick={() => edit(payment)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

export default PaymentsPage;
