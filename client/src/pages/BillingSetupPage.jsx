import { CalendarPlus, Eye, ReceiptText, Save } from "lucide-react";
import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;

function BillingSetupPage() {
  const [periods, setPeriods] = useState([]);
  const [settings, setSettings] = useState(null);
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [penaltyDate, setPenaltyDate] = useState(new Date().toISOString().slice(0, 10));
  const [penaltyPreview, setPenaltyPreview] = useState(null);
  const [penaltyBusy, setPenaltyBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [periodRows, settingsRow] = await Promise.all([
      api.billing.periods.list(),
      api.billing.settings.get()
    ]);
    setPeriods(periodRows);
    setSettings(settingsRow);
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const updateSettingsField = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const updated = await api.billing.settings.update({
        penalty_grace_days: Number(settings.penalty_grace_days || 0),
        penalty_type: settings.penalty_type,
        penalty_value: Number(settings.penalty_value || 0),
        deposit_required: Boolean(settings.deposit_required),
        default_deposit_amount: Number(settings.default_deposit_amount || 0)
      });
      setSettings(updated);
      setPenaltyPreview(null);
      setMessage("Billing settings saved.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const createPeriod = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await api.billing.periods.create({ period_start: periodStart, status: "open" });
      await load();
      setMessage("Billing period opened.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const updateStatus = async (id, status) => {
    setMessage("");
    try {
      await api.billing.periods.updateStatus(id, status);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const previewPenalties = async () => {
    setMessage("");
    setPenaltyBusy(true);
    try {
      const preview = await api.billing.penalties.preview(penaltyDate);
      setPenaltyPreview(preview);
      setMessage(
        preview.summary.enabled
          ? `${preview.summary.eligible_bills} bill(s) eligible for ${money(preview.summary.total_penalties)} in penalties.`
          : "Fixed penalties are disabled. Enable fixed penalties in settings before applying."
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setPenaltyBusy(false);
    }
  };

  const applyPenalties = async () => {
    setMessage("");
    setPenaltyBusy(true);
    try {
      const result = await api.billing.penalties.apply({
        application_date: penaltyDate,
        reason: `Penalty application for ${penaltyDate.slice(0, 7)}`
      });
      setPenaltyPreview(null);
      await load();
      setMessage(`Applied ${money(result.summary.total_penalties)} to ${result.summary.applied_bills} bill(s).`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setPenaltyBusy(false);
    }
  };
  const periodTable = useTableControls(periods, {
    searchFields: ["name", "period_start", "closing_date", "due_date", "status"]
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Billing Control</p>
          <h2>Billing Setup</h2>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="page-stack">
          {settings ? (
            <form className="panel form-grid" onSubmit={saveSettings}>
              <div className="panel-heading">
                <h3>Settings</h3>
              </div>
              <label>
                Due rule
                <input value="Last day of the following month" disabled />
              </label>
              <label>
                Penalty type
                <select
                  value={settings.penalty_type}
                  onChange={(event) => updateSettingsField("penalty_type", event.target.value)}
                >
                  <option value="none">Disabled</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label>
                Penalty amount
                <input
                  value={settings.penalty_value}
                  onChange={(event) => updateSettingsField("penalty_value", event.target.value)}
                  type="number"
                  min="0"
                />
              </label>
              <label>
                Grace days
                <input
                  value={settings.penalty_grace_days}
                  onChange={(event) => updateSettingsField("penalty_grace_days", event.target.value)}
                  type="number"
                  min="0"
                />
              </label>
              <label className="checkbox-row">
                <input
                  checked={Boolean(settings.deposit_required)}
                  onChange={(event) => updateSettingsField("deposit_required", event.target.checked)}
                  type="checkbox"
                />
                Require customer deposit
              </label>
              <label>
                Default deposit
                <input
                  value={settings.default_deposit_amount}
                  onChange={(event) => updateSettingsField("default_deposit_amount", event.target.value)}
                  type="number"
                  min="0"
                />
              </label>
              <button className="primary-button" type="submit">
                <Save size={17} />
                Save settings
              </button>
            </form>
          ) : null}

          <form className="panel form-grid" onSubmit={createPeriod}>
            <div className="panel-heading">
              <h3>Open Period</h3>
            </div>
            <label>
              Month
              <input value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} type="date" required />
            </label>
            <button className="primary-button" type="submit">
              <CalendarPlus size={17} />
              Open period
            </button>
          </form>

          <div className="panel form-grid">
            <div className="panel-heading">
              <h3>Penalty Automation</h3>
              <ReceiptText size={18} />
            </div>
            <label>
              Application date
              <input value={penaltyDate} onChange={(event) => setPenaltyDate(event.target.value)} type="date" />
            </label>
            <div className="reading-context">
              <div>
                <span>Mode</span>
                <strong>{settings?.penalty_type === "fixed" ? "Fixed amount" : "Disabled"}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{money(settings?.penalty_value)}</strong>
              </div>
              <div>
                <span>Grace days</span>
                <strong>{Number(settings?.penalty_grace_days || 0).toLocaleString()}</strong>
              </div>
            </div>
            {penaltyPreview ? (
              <div className="reading-context">
                <div>
                  <span>Eligible bills</span>
                  <strong>{Number(penaltyPreview.summary.eligible_bills || 0).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Total penalties</span>
                  <strong>{money(penaltyPreview.summary.total_penalties)}</strong>
                </div>
                <div>
                  <span>Penalty month</span>
                  <strong>{penaltyPreview.application_month}</strong>
                </div>
              </div>
            ) : null}
            <button type="button" onClick={previewPenalties} disabled={penaltyBusy}>
              <Eye size={17} />
              Preview penalties
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={applyPenalties}
              disabled={penaltyBusy || !penaltyPreview?.summary?.enabled || !penaltyPreview?.summary?.eligible_bills}
            >
              <ReceiptText size={17} />
              Apply previewed penalties
            </button>
          </div>
          {message ? <p className="form-note">{message}</p> : null}
        </div>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <h3>Billing Periods</h3>
          </div>
          <TableControls table={periodTable} label="periods" placeholder="Search periods" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Close</th>
                  <th>Due</th>
                  <th>Bills</th>
                  <th>Billed</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {periodTable.visibleRows.map((period) => (
                  <tr key={period.id}>
                    <td>
                      <strong>{period.name}</strong>
                      <small>{period.period_start?.slice(0, 10)}</small>
                    </td>
                    <td>{period.closing_date?.slice(0, 10)}</td>
                    <td>{period.due_date?.slice(0, 10)}</td>
                    <td>{Number(period.bill_count || 0).toLocaleString()}</td>
                    <td>{money(period.billed_total)}</td>
                    <td>{money(period.balance_total)}</td>
                    <td>
                      <StatusBadge status={period.status} />
                    </td>
                    <td>
                      <select value={period.status} onChange={(event) => updateStatus(period.id, event.target.value)}>
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                        <option value="locked">Locked</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {penaltyPreview?.rows?.length ? (
        <div className="panel">
          <div className="panel-heading">
            <h3>Penalty Preview</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Due</th>
                  <th>Balance</th>
                  <th>Penalty</th>
                  <th>Eligible From</th>
                </tr>
              </thead>
              <tbody>
                {penaltyPreview.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.bill_number || `Bill ${row.id}`}</td>
                    <td>
                      {row.customer_name}
                      <small>{row.acc_number}</small>
                    </td>
                    <td>{row.billing_period_name || row.billing_month?.slice(0, 10)}</td>
                    <td>{row.due_date?.slice(0, 10) || "-"}</td>
                    <td>{money(row.balance_amount)}</td>
                    <td>{money(row.penalty_to_apply)}</td>
                    <td>{row.penalty_eligible_at?.slice(0, 10) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default BillingSetupPage;
