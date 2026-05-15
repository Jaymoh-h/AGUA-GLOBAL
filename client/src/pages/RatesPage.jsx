import { Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

const blank = { name: "", amount: "", description: "", is_active: true };

function RatesPage() {
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => api.rates.list().then(setRates);

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const payload = { ...form, amount: Number(form.amount) };
    try {
      if (editingId) {
        await api.rates.update(editingId, payload);
      } else {
        await api.rates.create(payload);
      }
      setForm(blank);
      setEditingId(null);
      await load();
      setMessage("Rate saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (rate) => {
    setEditingId(rate.id);
    setForm({
      name: rate.name || "",
      amount: rate.amount || "",
      description: rate.description || "",
      is_active: rate.is_active
    });
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reference Data</p>
          <h2>Rates</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Rate" : "Add Rate"}</h3>
          </div>
          <label>
            Rate name
            <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
          </label>
          <label>
            Amount
            <input value={form.amount} onChange={(event) => setField("amount", event.target.value)} type="number" min="0" required />
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows="3" />
          </label>
          <label className="checkbox-row">
            <input
              checked={form.is_active}
              onChange={(event) => setField("is_active", event.target.checked)}
              type="checkbox"
            />
            Active
          </label>
          {message ? <p className="form-note">{message}</p> : null}
          <button className="primary-button" type="submit">
            {editingId ? <Save size={17} /> : <Plus size={17} />}
            {editingId ? "Save changes" : "Add rate"}
          </button>
        </form>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Rate List</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.name}</td>
                    <td>{Number(rate.amount).toLocaleString()}</td>
                    <td>{rate.is_active ? "Active" : "Inactive"}</td>
                    <td>{rate.description || "-"}</td>
                    <td>
                      <button type="button" onClick={() => edit(rate)}>Edit</button>
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

export default RatesPage;

