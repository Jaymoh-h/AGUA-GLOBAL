import { Gauge, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

function ReadingsPage() {
  const [customers, setCustomers] = useState([]);
  const [readings, setReadings] = useState([]);
  const [form, setForm] = useState({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [customerRows, readingRows] = await Promise.all([api.customers.list(), api.readings.list()]);
    setCustomers(customerRows);
    setReadings(readingRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        reading_value: Number(form.reading_value),
        reading_date: form.reading_date
      };
      const result = editingId
        ? await api.readings.update(editingId, payload)
        : await api.readings.create(payload);
      setForm({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
      setEditingId(null);
      await load();
      setMessage(editingId ? "Reading updated and bills recalculated." : result.bill ? "Reading submitted and bill generated." : "Baseline reading submitted.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (reading) => {
    setEditingId(reading.id);
    setForm({
      customer_id: reading.customer_id || "",
      reading_value: reading.reading_value || "",
      reading_date: reading.reading_date?.slice(0, 10) || new Date().toISOString().slice(0, 10)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ customer_id: "", reading_value: "", reading_date: new Date().toISOString().slice(0, 10) });
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Field Work</p>
          <h2>Meter Readings</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Reading" : "Submit Reading"}</h3>
          </div>
          <label>
            Customer
            <select value={form.customer_id} onChange={(event) => setField("customer_id", event.target.value)} required>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.acc_number} - {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reading value
            <input
              value={form.reading_value}
              onChange={(event) => setField("reading_value", event.target.value)}
              type="number"
              min="0"
              required
            />
          </label>
          <label>
            Reading date
            <input value={form.reading_date} onChange={(event) => setField("reading_date", event.target.value)} type="date" required />
          </label>
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit">
            {editingId ? <Save size={17} /> : <Send size={17} />}
            {editingId ? "Save reading" : "Submit reading"}
          </button>
          {editingId ? (
            <button type="button" onClick={cancelEdit}>
              Cancel edit
            </button>
          ) : null}
        </form>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Recent Readings</h3>
            <Gauge size={18} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Account</th>
                  <th>Reading</th>
                  <th>Date</th>
                  <th>Reader</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.id}>
                    <td>{reading.customer_name}</td>
                    <td>{reading.acc_number}</td>
                    <td>{Number(reading.reading_value).toLocaleString()}</td>
                    <td>{reading.reading_date?.slice(0, 10)}</td>
                    <td>{reading.created_by_name || "-"}</td>
                    <td>
                      <button type="button" onClick={() => edit(reading)}>Edit</button>
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

export default ReadingsPage;
