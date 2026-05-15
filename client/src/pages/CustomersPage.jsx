import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

const blank = { name: "", phone: "", acc_number: "", rate_id: "", zone_id: "" };

function CustomersPage({ user }) {
  const [customers, setCustomers] = useState([]);
  const [rates, setRates] = useState([]);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const canWrite = ["admin", "accountant"].includes(user.role);

  const load = async () => {
    const [customerRows, rateRows, zoneRows] = await Promise.all([
      api.customers.list(),
      api.rates.list(),
      api.zones.list()
    ]);
    setCustomers(customerRows);
    setRates(rateRows);
    setZones(zoneRows);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    const duplicate = customers.find(
      (customer) =>
        customer.acc_number.toLowerCase() === form.acc_number.toLowerCase() && customer.id !== editingId
    );
    if (duplicate) {
      setMessage("That account number is already in use.");
      return;
    }

    const payload = {
      ...form,
      rate_id: Number(form.rate_id),
      zone_id: Number(form.zone_id)
    };
    try {
      if (editingId) {
        await api.customers.update(editingId, payload);
      } else {
        await api.customers.create(payload);
      }
      setForm(blank);
      setEditingId(null);
      await load();
      setMessage("Customer saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      acc_number: customer.acc_number || "",
      rate_id: customer.rate_id || "",
      zone_id: customer.zone_id || ""
    });
  };

  const remove = async (id) => {
    await api.customers.remove(id);
    await load();
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Customers</h2>
        </div>
      </header>

      <section className="workspace-grid">
        {canWrite ? (
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>{editingId ? "Edit Customer" : "Add Customer"}</h3>
            </div>
            <label>
              Name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
            </label>
            <label>
              Zone/location
              <select value={form.zone_id} onChange={(event) => setField("zone_id", event.target.value)} required>
                <option value="">Select zone/location</option>
                {zones
                  .filter((zone) => zone.is_active || Number(zone.id) === Number(form.zone_id))
                  .map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Account number
              <input value={form.acc_number} onChange={(event) => setField("acc_number", event.target.value)} required />
            </label>
            <label>
              Rate
              <select value={form.rate_id} onChange={(event) => setField("rate_id", event.target.value)} required>
                <option value="">Select rate</option>
                {rates
                  .filter((rate) => rate.is_active || Number(rate.id) === Number(form.rate_id))
                  .map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} - {Number(rate.amount).toLocaleString()}
                    </option>
                  ))}
              </select>
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <button className="primary-button" type="submit">
              {editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? "Save changes" : "Add customer"}
            </button>
          </form>
        ) : null}

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Customer List</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Location</th>
                  <th>Rate</th>
                  <th>Balance</th>
                  {canWrite ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                      <small>{customer.phone}</small>
                    </td>
                    <td>{customer.acc_number}</td>
                    <td>{customer.zone_name || customer.location}</td>
                    <td>
                      <strong>{customer.rate_name}</strong>
                      <small>{Number(customer.rate).toLocaleString()}</small>
                    </td>
                    <td>{Number(customer.balance_due || 0).toLocaleString()}</td>
                    {canWrite ? (
                      <td className="row-actions">
                        <button type="button" onClick={() => edit(customer)}>Edit</button>
                        {user.role === "admin" ? (
                          <button className="danger-button" type="button" onClick={() => remove(customer.id)} title="Delete customer">
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
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

export default CustomersPage;
