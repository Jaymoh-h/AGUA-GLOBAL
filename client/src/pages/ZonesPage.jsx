import { MapPin, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

const blank = { name: "", description: "", is_active: true };

function ZonesPage() {
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => api.zones.list().then(setZones);

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      if (editingId) {
        await api.zones.update(editingId, form);
      } else {
        await api.zones.create(form);
      }
      setForm(blank);
      setEditingId(null);
      await load();
      setMessage("Zone/location saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const edit = (zone) => {
    setEditingId(zone.id);
    setForm({
      name: zone.name || "",
      description: zone.description || "",
      is_active: zone.is_active
    });
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reference Data</p>
          <h2>Zones/Locations</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <form className="panel form-grid" onSubmit={submit}>
          <div className="panel-heading">
            <h3>{editingId ? "Edit Zone" : "Add Zone"}</h3>
            <MapPin size={18} />
          </div>
          <label>
            Zone/location name
            <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
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
            {editingId ? "Save changes" : "Add zone"}
          </button>
        </form>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Zone/Location List</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>{zone.name}</td>
                    <td>{zone.is_active ? "Active" : "Inactive"}</td>
                    <td>{zone.description || "-"}</td>
                    <td>
                      <button type="button" onClick={() => edit(zone)}>Edit</button>
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

export default ZonesPage;

