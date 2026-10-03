import { Layers3, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EntryPanel from "../components/EntryPanel";
import { EmptyTableRow } from "../components/EmptyState";
import ReviewDialog from "../components/ReviewDialog";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [form, setForm] = useState(() => makeBlank());
  const [blocks, setBlocks] = useState([emptyBlock()]);
  const [editingId, setEditingId] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [, setMessage] = useToastMessage();
  const [saving, setSaving] = useState(false);
  const [tariffReview, setTariffReview] = useState(null);

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      setRates(await api.rates.list());
    } catch (err) {
      if (showState) setInitialError(err.message || "Tariff records could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
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
    setEntryOpen(false);
  };

  const payloadFromForm = () => ({
    ...form,
    amount: Number(form.amount),
    fixed_charge_amount: Number(form.fixed_charge_amount || 0),
    vat_rate: Number(form.vat_rate || 0),
    reconnection_fee_amount: Number(form.reconnection_fee_amount || 0)
  });

  const submit = (event) => {
    event.preventDefault();
    setTariffReview({
      action: editingId ? "update" : "create",
      payload: payloadFromForm(),
      blocks: form.tariff_type === "block" ? cleanBlocks(blocks) : []
    });
  };

  const saveBlocks = () => {
    if (!editingId) return;
    setTariffReview({
      action: "blocks",
      payload: payloadFromForm(),
      blocks: cleanBlocks(blocks)
    });
  };

  const closeTariffReview = () => {
    if (!saving) setTariffReview(null);
  };

  const confirmTariffReview = async (reviewNotes) => {
    if (!tariffReview) return;
    const { action, payload, blocks: reviewedBlocks } = tariffReview;
    setMessage("");
    setSaving(true);
    try {
      if (action === "blocks") {
        await api.rates.replaceBlocks(editingId, reviewedBlocks, payload.effective_from, reviewNotes);
        await load();
        setMessage("Tariff blocks saved.");
      } else {
        const saved = action === "update"
          ? await api.rates.update(editingId, { ...payload, review_notes: reviewNotes })
          : await api.rates.create({ ...payload, review_notes: reviewNotes });
        if (payload.tariff_type === "block") {
          await api.rates.replaceBlocks(saved.id, reviewedBlocks, payload.effective_from, reviewNotes);
        }
        resetForm();
        await load();
        setMessage("Tariff saved.");
      }
      setTariffReview(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (rate) => {
    setEditingId(rate.id);
    setEntryOpen(true);
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
  const tariffSummary = useMemo(
    () => ({
      active: rates.filter((rate) => rate.is_active).length,
      block: rates.filter((rate) => rate.tariff_type === "block").length,
      versions: rates.reduce((sum, rate) => sum + Number(rate.versions?.length || 0), 0),
      effectiveToday: rates.filter((rate) => dateOnly(rate.effective_from) === today()).length
    }),
    [rates]
  );

  if (initialLoading) {
    return <WorkspaceState detail="Retrieving tariff rules, effective dates, and version history." title="Preparing tariff control" />;
  }

  if (initialError) {
    return (
      <WorkspaceState
        detail={initialError}
        onRetry={() => load({ showState: true }).catch(() => {})}
        state="error"
        title="Tariff control could not load"
      />
    );
  }

  return (
    <section className="page-stack tariff-control-page">
      <header className="page-header tariff-control-header">
        <div>
          <p className="eyebrow">Reference Data</p>
          <h2>Tariff control</h2>
          <p>Maintain the pricing rules that drive every bill, with effective dates and version history kept visible.</p>
        </div>
      </header>

      <section className="tariff-control-metrics" aria-label="Tariff overview">
        <div><span>Active tariffs</span><strong>{tariffSummary.active}</strong><small>Available for billing</small></div>
        <div><span>Block tariffs</span><strong>{tariffSummary.block}</strong><small>Tiered consumption pricing</small></div>
        <div><span>Recorded versions</span><strong>{tariffSummary.versions}</strong><small>Historical pricing retained</small></div>
        <div className={tariffSummary.effectiveToday ? "needs-attention" : ""}><span>Effective today</span><strong>{tariffSummary.effectiveToday}</strong><small>{tariffSummary.effectiveToday ? "Review before issuing bills" : "No rate starts today"}</small></div>
      </section>

      <section className="workspace-grid entry-led-workspace tariff-control-workspace">
        <EntryPanel
          actionLabel="Add tariff"
          className="tariff-entry-panel"
          disabled={saving || Boolean(tariffReview)}
          icon={<Layers3 size={17} />}
          onOpenChange={(open) => (open ? setEntryOpen(true) : resetForm())}
          open={entryOpen}
          summary={editingId ? "Update pricing, tax, and effective dates" : "Create a billing price rule"}
          title={editingId ? "Edit tariff pricing" : "Tariff pricing entry"}
        >
          <form className="form-grid" onSubmit={submit}>
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
            <section className="entry-subsection form-grid">
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
            </section>
          ) : null}

          {editingId && selectedRate?.versions?.length ? (
            <section className="entry-subsection">
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
            </section>
          ) : null}
        </EntryPanel>

        <div className="panel wide-panel register-panel tariff-register-panel">
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
      <ReviewDialog
        open={Boolean(tariffReview)}
        eyebrow="Tariff pricing review"
        title={
          tariffReview?.action === "create"
            ? "Create tariff pricing rule"
            : tariffReview?.action === "blocks"
              ? "Update tariff block pricing"
              : "Save tariff pricing changes"
        }
        description="This changes the pricing rules used for future billing from the selected effective date. It does not recalculate or alter bills that have already been issued."
        confirmLabel={tariffReview?.action === "blocks" ? "Save block pricing" : "Save tariff pricing"}
        cancelLabel="Keep editing"
        reasonLabel="Pricing approval note"
        reasonPlaceholder="State the approved tariff decision, authority, or supporting evidence"
        busy={saving}
        busyLabel="Saving tariff..."
        onCancel={closeTariffReview}
        onConfirm={confirmTariffReview}
      >
        {tariffReview ? (
          <div className="reading-context">
            <div><span>Tariff</span><strong>{tariffReview.payload.name}</strong></div>
            <div><span>Change</span><strong>{tariffReview.action === "create" ? "New pricing rule" : tariffReview.action === "blocks" ? "Block pricing only" : "Pricing rule update"}</strong></div>
            <div><span>Effective from</span><strong>{dateOnly(tariffReview.payload.effective_from) || "-"}</strong></div>
            <div><span>Status</span><strong>{tariffReview.payload.is_active ? "Active for billing" : "Inactive"}</strong></div>
            <div><span>Tariff type</span><strong>{tariffReview.payload.tariff_type === "block" ? "Block tariff" : "Flat rate"}</strong></div>
            <div><span>Unit / fallback rate</span><strong>{money(tariffReview.payload.amount)}</strong></div>
            <div><span>Fixed charge</span><strong>{money(tariffReview.payload.fixed_charge_amount)}</strong></div>
            <div><span>VAT</span><strong>{tariffReview.payload.vat_enabled && !tariffReview.payload.vat_exempt ? `${Number(tariffReview.payload.vat_rate)}%` : "Off"}</strong></div>
            <div><span>Reconnection fee</span><strong>{money(tariffReview.payload.reconnection_fee_amount)}</strong></div>
            <div><span>Block rows</span><strong>{tariffReview.reviewedBlocks?.length || tariffReview.blocks.length}</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
    </section>
  );
}

export default RatesPage;
