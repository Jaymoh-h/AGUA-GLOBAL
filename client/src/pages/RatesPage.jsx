import { Layers3, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const today = () => new Date().toISOString().slice(0, 10);

const makeBlank = () => ({
  name: "",
  amount: "",
  tariff_type: "flat",
  effective_from: today(),
  fixed_charge_amount: 0,
  vat_enabled: false,
  vat_rate: 0,
  vat_exempt: false,
  reconnection_fee_amount: 0,
  exemption_notes: "",
  description: "",
  is_active: true
});

const emptyBlock = (sortOrder = 0) => ({
  min_units: sortOrder === 0 ? 0 : "",
  max_units: "",
  unit_rate: "",
  sort_order: sortOrder
});

const cleanBlocks = (blocks) =>
  blocks
    .filter((block) => block.min_units !== "" || block.max_units !== "" || block.unit_rate !== "")
    .map((block, index) => ({
      min_units: Number(block.min_units || 0),
      max_units: block.max_units === "" || block.max_units === null || block.max_units === undefined ? null : Number(block.max_units),
      unit_rate: Number(block.unit_rate || 0),
      sort_order: index
    }));

function RatesPage() {
  const [rates, setRates] = useState([]);
  const [form, setForm] = useState(() => makeBlank());
  const [blocks, setBlocks] = useState([emptyBlock()]);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.rates.list().then(setRates);

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const setBlockField = (index, field, value) => {
    setBlocks((current) =>
      current.map((block, blockIndex) => (blockIndex === index ? { ...block, [field]: value } : block))
    );
  };

  const resetForm = () => {
    setForm(makeBlank());
    setBlocks([emptyBlock()]);
    setEditingId(null);
  };

  const payloadFromForm = () => ({
    ...form,
    amount: Number(form.amount),
    fixed_charge_amount: Number(form.fixed_charge_amount || 0),
    vat_rate: Number(form.vat_rate || 0),
    reconnection_fee_amount: Number(form.reconnection_fee_amount || 0)
  });

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const payload = payloadFromForm();
      const saved = editingId ? await api.rates.update(editingId, payload) : await api.rates.create(payload);
      if (payload.tariff_type === "block") {
        await api.rates.replaceBlocks(saved.id, cleanBlocks(blocks), payload.effective_from);
      }
      resetForm();
      await load();
      setMessage("Tariff saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBlocks = async () => {
    if (!editingId) return;
    setMessage("");
    setSaving(true);
    try {
      await api.rates.replaceBlocks(editingId, cleanBlocks(blocks), form.effective_from);
      await load();
      setMessage("Tariff blocks saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (rate) => {
    setEditingId(rate.id);
    setForm({
      name: rate.name || "",
      amount: rate.amount || "",
      tariff_type: rate.tariff_type || "flat",
      effective_from: dateOnly(rate.effective_from) || today(),
      fixed_charge_amount: rate.fixed_charge_amount || 0,
      vat_enabled: Boolean(rate.vat_enabled),
      vat_rate: rate.vat_rate || 0,
      vat_exempt: Boolean(rate.vat_exempt),
      reconnection_fee_amount: rate.reconnection_fee_amount || 0,
      exemption_notes: rate.exemption_notes || "",
      description: rate.description || "",
      is_active: rate.is_active
    });
    setBlocks(rate.blocks?.length ? rate.blocks : [emptyBlock()]);
  };
  const rateTable = useTableControls(rates, {
    searchFields: ["name", "description", "tariff_type", "amount", "fixed_charge_amount", "vat_rate", "effective_from", "is_active"]
  });
  const selectedRate = rates.find((rate) => Number(rate.id) === Number(editingId));

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reference Data</p>
          <h2>Tariffs</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="page-stack">
          <form className="panel form-grid" onSubmit={submit}>
            <div className="panel-heading">
              <h3>{editingId ? "Edit Tariff" : "Add Tariff"}</h3>
              <Layers3 size={18} />
            </div>
            <label>
              Tariff name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} required />
            </label>
            <label>
              Tariff type
              <select value={form.tariff_type} onChange={(event) => setField("tariff_type", event.target.value)}>
                <option value="flat">Flat rate</option>
                <option value="block">Block tariff</option>
              </select>
            </label>
            <label>
              Effective from
              <input value={form.effective_from} onChange={(event) => setField("effective_from", event.target.value)} type="date" required />
            </label>
            <label>
              Flat / fallback unit rate
              <input value={form.amount} onChange={(event) => setField("amount", event.target.value)} type="number" min="0" step="0.01" required />
            </label>
            <label>
              Fixed charge
              <input
                value={form.fixed_charge_amount}
                onChange={(event) => setField("fixed_charge_amount", event.target.value)}
                type="number"
                min="0"
                step="0.01"
              />
            </label>
            <label>
              VAT rate
              <input value={form.vat_rate} onChange={(event) => setField("vat_rate", event.target.value)} type="number" min="0" max="100" step="0.01" />
            </label>
            <label>
              Reconnection fee
              <input
                value={form.reconnection_fee_amount}
                onChange={(event) => setField("reconnection_fee_amount", event.target.value)}
                type="number"
                min="0"
                step="0.01"
              />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows="3" />
            </label>
            <label>
              Exemption notes
              <textarea value={form.exemption_notes} onChange={(event) => setField("exemption_notes", event.target.value)} rows="2" />
            </label>
            <label className="checkbox-row">
              <input checked={form.vat_enabled} onChange={(event) => setField("vat_enabled", event.target.checked)} type="checkbox" />
              Apply VAT to this tariff
            </label>
            <label className="checkbox-row">
              <input checked={form.vat_exempt} onChange={(event) => setField("vat_exempt", event.target.checked)} type="checkbox" />
              VAT exempt
            </label>
            <label className="checkbox-row">
              <input checked={form.is_active} onChange={(event) => setField("is_active", event.target.checked)} type="checkbox" />
              Active
            </label>
            {message ? <p className="form-note">{message}</p> : null}
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={saving}>
                {editingId ? <Save size={17} /> : <Plus size={17} />}
                {editingId ? "Save changes" : "Add tariff"}
              </button>
              {editingId ? (
                <button type="button" onClick={resetForm} disabled={saving}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          {form.tariff_type === "block" ? (
            <div className="panel form-grid">
              <div className="panel-heading">
                <h3>Block Tariff Rows</h3>
                <Layers3 size={18} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>From units</th>
                      <th>To units</th>
                      <th>Unit rate</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((block, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            value={block.min_units}
                            onChange={(event) => setBlockField(index, "min_units", event.target.value)}
                            type="number"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            value={block.max_units ?? ""}
                            onChange={(event) => setBlockField(index, "max_units", event.target.value)}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="No cap"
                          />
                        </td>
                        <td>
                          <input
                            value={block.unit_rate}
                            onChange={(event) => setBlockField(index, "unit_rate", event.target.value)}
                            type="number"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index))}
                            disabled={blocks.length === 1}
                            title="Remove block"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setBlocks((current) => [...current, emptyBlock(current.length)])}>
                  <Plus size={17} />
                  Add block
                </button>
                {editingId ? (
                  <button type="button" onClick={saveBlocks} disabled={saving}>
                    <Save size={17} />
                    Save blocks
                  </button>
                ) : null}
              </div>
              <p className="muted">Leave the final "To units" blank for the open-ended block.</p>
            </div>
          ) : null}

          {editingId && selectedRate?.versions?.length ? (
            <div className="panel">
              <div className="panel-heading">
                <h3>Tariff History</h3>
                <Layers3 size={18} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Effective From</th>
                      <th>Type</th>
                      <th>Unit Rate</th>
                      <th>Fixed</th>
                      <th>VAT</th>
                      <th>Blocks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRate.versions.map((version) => (
                      <tr key={version.id}>
                        <td>{dateOnly(version.effective_from)}</td>
                        <td>{version.tariff_type || "flat"}</td>
                        <td>{money(version.amount)}</td>
                        <td>{money(version.fixed_charge_amount)}</td>
                        <td>{version.vat_enabled && !version.vat_exempt ? `${Number(version.vat_rate || 0)}%` : "Off"}</td>
                        <td>{version.blocks?.length || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Tariff List</h3>
          </div>
          <TableControls table={rateTable} label="tariffs" placeholder="Search tariffs" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Unit Rate</th>
                  <th>Effective From</th>
                  <th>Fixed</th>
                  <th>VAT</th>
                  <th>Reconnect</th>
                  <th>Status</th>
                  <th>Blocks</th>
                  <th>Versions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rateTable.visibleRows.length ? (
                  rateTable.visibleRows.map((rate) => (
                    <tr key={rate.id}>
                      <td>
                        {rate.name}
                        <small>{rate.description || "-"}</small>
                      </td>
                      <td>{rate.tariff_type || "flat"}</td>
                      <td>{money(rate.amount)}</td>
                      <td>{dateOnly(rate.effective_from) || "-"}</td>
                      <td>{money(rate.fixed_charge_amount)}</td>
                      <td>{rate.vat_enabled && !rate.vat_exempt ? `${Number(rate.vat_rate || 0)}%` : "Off"}</td>
                      <td>{money(rate.reconnection_fee_amount)}</td>
                      <td>{rate.is_active ? "Active" : "Inactive"}</td>
                      <td>{rate.blocks?.length || 0}</td>
                      <td>{rate.versions?.length || 0}</td>
                      <td>
                        <button type="button" onClick={() => edit(rate)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={11} title="No tariffs found" detail="Create a tariff or adjust the search." />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}

export default RatesPage;
