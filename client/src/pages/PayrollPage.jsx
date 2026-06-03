import { Banknote, CalendarDays, CheckCircle2, Download, Lock, Plus, Save, Send, UserMinus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import ToastMessage, { toastTypeFromMessage } from "../components/ToastMessage";
import { api } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";

const payeeTypes = ["employee", "casual", "contractor", "subscription"];
const recurringPayeeTypes = ["employee", "subscription"];
const periodOnlyPayeeTypes = ["casual", "contractor"];
const rateBases = ["monthly", "daily", "hourly", "invoice", "subscription"];
const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => value?.slice(0, 10) || "-";
const label = (value) => String(value || "-").replaceAll("_", " ");
const today = new Date().toISOString().slice(0, 10);
const firstDay = today.slice(0, 8) + "01";

const readDefaultUnits = (metadata) => {
  const units = Number(metadata?.default_units);
  return Number.isFinite(units) && units >= 0 ? units : "";
};

function PayrollPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [payees, setPayees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [payeeForm, setPayeeForm] = useState({
    payee_type: "employee",
    name: "",
    code: "",
    title: "",
    rate_amount: "",
    rate_basis: "monthly",
    default_additions: "",
    default_deductions: "",
    payment_channel: "bank",
    default_units: "",
    start_date: today
  });
  const [periodPayeeForm, setPeriodPayeeForm] = useState({
    payee_type: "casual",
    name: "",
    code: "",
    title: "",
    rate_amount: "",
    rate_basis: "daily",
    source_units: "",
    additions: "",
    deductions: "",
    payment_channel: "mpesa_paybill",
    notes: ""
  });
  const [runForm, setRunForm] = useState({
    name: "",
    period_start: firstDay,
    period_end: today,
    payee_type: "",
    notes: ""
  });
  const [lineDraft, setLineDraft] = useState(null);

  const recurringPayees = useMemo(
    () =>
      payees.filter(
        (payee) => payee.recurrence_type === "recurring" && (!typeFilter || payee.payee_type === typeFilter)
      ),
    [payees, typeFilter]
  );
  const periodOnlyPayees = useMemo(
    () =>
      payees.filter(
        (payee) => payee.recurrence_type === "period_only" && (!typeFilter || payee.payee_type === typeFilter)
      ),
    [payees, typeFilter]
  );
  const visibleLines = useMemo(
    () => (selectedRun?.lines || []).filter((line) => !typeFilter || line.payee_type === typeFilter),
    [selectedRun, typeFilter]
  );
  const payeeTable = useTableControls(recurringPayees, {
    searchFields: ["name", "code", "title", "payee_type", "rate_basis", "status"]
  });
  const periodPayeeTable = useTableControls(periodOnlyPayees, {
    searchFields: ["name", "code", "title", "payee_type", "rate_basis", "status"]
  });
  const lineTable = useTableControls(visibleLines, {
    searchFields: ["name", "code", "title", "payee_type", "status"]
  });

  const summary = useMemo(() => {
    const lines = selectedRun?.lines || [];
    const pending = lines.filter((line) => ["draft", "pending_approval"].includes(line.status)).length;
    const posted = lines.filter((line) => line.expense_id).length;
    const manual = lines.filter((line) => line.source_type === "manual_period").length;
    return {
      payable: selectedRun?.total_net || 0,
      gross: selectedRun?.total_gross || 0,
      deductions: selectedRun?.total_deductions || 0,
      payees: lines.length,
      pending,
      posted,
      manual
    };
  }, [selectedRun]);

  const load = async (preferredRunId = selectedRun?.id) => {
    setLoading(true);
    setMessage("");
    try {
      const [nextPayees, nextRuns] = await Promise.all([api.payroll.payees(), api.payroll.runs()]);
      setPayees(nextPayees);
      setRuns(nextRuns);
      const nextRunId = preferredRunId || nextRuns[0]?.id;
      setSelectedRun(nextRunId ? await api.payroll.getRun(nextRunId) : null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  const focusKey = navigationIntent?.page === "payroll" ? navigationIntent.focus : "";
  const hasPayrollFocus = focusKey === "payroll_attention";
  useEffect(() => {
    if (focusKey !== "payroll_attention" || !runs.length) return;
    const attentionRun = runs.find((run) => ["pending_approval", "approved"].includes(run.status));
    if (attentionRun && attentionRun.id !== selectedRun?.id) {
      api.payroll.getRun(attentionRun.id).then(setSelectedRun).catch((err) => setMessage(err.message));
    }
  }, [focusKey, runs, selectedRun?.id]);

  const setPayeeField = (field, value) => {
    setPayeeForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "payee_type") {
        const basisByType = {
          employee: "monthly",
          casual: "daily",
          contractor: "invoice",
          subscription: "subscription"
        };
        next.rate_basis = basisByType[value] || current.rate_basis;
      }
      return next;
    });
  };
  const setPeriodPayeeField = (field, value) => {
    setPeriodPayeeForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "payee_type") {
        next.rate_basis = value === "contractor" ? "invoice" : "daily";
        next.payment_channel = value === "contractor" ? "bank" : "mpesa_paybill";
      }
      return next;
    });
  };
  const setRunField = (field, value) => setRunForm((current) => ({ ...current, [field]: value }));

  const createPayee = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const defaultUnits = Number(payeeForm.default_units);
      await api.payroll.createPayee({
        ...payeeForm,
        rate_amount: Number(payeeForm.rate_amount),
        default_additions: Number(payeeForm.default_additions || 0),
        default_deductions: Number(payeeForm.default_deductions || 0),
        metadata: Number.isFinite(defaultUnits) && defaultUnits >= 0 ? { default_units: defaultUnits } : {}
      });
      setPayeeForm({
        payee_type: "employee",
        name: "",
        code: "",
        title: "",
        rate_amount: "",
        rate_basis: "monthly",
        default_additions: "",
        default_deductions: "",
        payment_channel: "bank",
        default_units: "",
        start_date: today
      });
      await load();
      setMessage("Recurring payee added.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const addPeriodPayee = async (event) => {
    event.preventDefault();
    if (!selectedRun) return;
    setMessage("");
    try {
      const units = Number(periodPayeeForm.source_units || 1);
      const metadata = Number.isFinite(units) && units >= 0 ? { default_units: units } : {};
      const updated = await api.payroll.addRunLineItem(selectedRun.id, {
        ...periodPayeeForm,
        rate_amount: Number(periodPayeeForm.rate_amount),
        source_units: units,
        additions: Number(periodPayeeForm.additions || 0),
        deductions: Number(periodPayeeForm.deductions || 0),
        metadata
      });
      setPeriodPayeeForm({
        payee_type: "casual",
        name: "",
        code: "",
        title: "",
        rate_amount: "",
        rate_basis: "daily",
        source_units: "",
        additions: "",
        deductions: "",
        payment_channel: "mpesa_paybill",
        notes: ""
      });
      await load(updated.id);
      setMessage("Period payee added to this run.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const createRun = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const run = await api.payroll.createRun(runForm);
      setRunForm((current) => ({ ...current, name: "", notes: "" }));
      await load(run.id);
      setMessage("Draft payroll run created.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const openRun = async (run) => {
    setMessage("");
    setLineDraft(null);
    try {
      setSelectedRun(await api.payroll.getRun(run.id));
    } catch (err) {
      setMessage(err.message);
    }
  };

  const changeRunStatus = async (status) => {
    if (!selectedRun) return;
    setMessage("");
    try {
      const updated = await api.payroll.updateRunStatus(selectedRun.id, { status });
      await load(updated.id);
      setMessage(`Payroll run marked ${label(status)}.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const terminatePayee = async (payee) => {
    const actionLabel = payee.payee_type === "subscription" ? "cancellation" : "termination";
    const reason = window.prompt(`Enter ${actionLabel} reason for ${payee.name}`);
    if (!reason) return;
    setMessage("");
    try {
      await api.payroll.terminatePayee(payee.id, {
        end_date: today,
        termination_reason: reason
      });
      await load(selectedRun?.id);
      setMessage(`${payee.name} marked as ${payee.payee_type === "subscription" ? "cancelled" : "terminated"}.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const editLine = (line) => {
    setLineDraft({
      id: line.id,
      name: line.name,
      source_units: line.source_units,
      gross_amount: line.gross_amount,
      additions: line.additions,
      deductions: line.deductions,
      notes: line.notes || ""
    });
  };

  const saveLine = async (event) => {
    event.preventDefault();
    if (!lineDraft) return;
    setMessage("");
    try {
      await api.payroll.updateLineItem(lineDraft.id, {
        source_units: Number(lineDraft.source_units || 0),
        gross_amount: Number(lineDraft.gross_amount || 0),
        additions: Number(lineDraft.additions || 0),
        deductions: Number(lineDraft.deductions || 0),
        notes: lineDraft.notes
      });
      setLineDraft(null);
      await load(selectedRun.id);
      setMessage("Payroll line updated.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  const exportLines = () => {
    downloadCsvRows(
      `payroll-run-${selectedRun?.id || "draft"}.csv`,
      [
        { header: "Payee", value: (row) => row.name },
        { header: "Code", value: (row) => row.code },
        { header: "Type", value: (row) => row.payee_type },
        { header: "Source", value: (row) => row.source_type },
        { header: "Units", value: (row) => row.source_units },
        { header: "Gross", value: (row) => row.gross_amount },
        { header: "Additions", value: (row) => row.additions },
        { header: "Deductions", value: (row) => row.deductions },
        { header: "Net", value: (row) => row.net_amount },
        { header: "Status", value: (row) => row.status },
        { header: "Expense ID", value: (row) => row.expense_id || "" },
        { header: "Expense Reference", value: (row) => row.expense_reference || "" },
        { header: "Notes", value: (row) => row.notes }
      ],
      lineTable.filteredRows
    );
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Payroll Management</h2>
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Payee type filter">
          <option value="">All payees</option>
          {payeeTypes.map((type) => (
            <option key={type} value={type}>
              {label(type)}
            </option>
          ))}
        </select>
      </header>

      {focusKey === "payroll_attention" ? (
        <FocusNotice
          title="Payroll awaiting action"
          detail="Selected the first pay run pending approval or payment, where available."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      {!hasPayrollFocus ? (
      <div className="stat-grid">
        <StatCard label="Net Payable" value={money(summary.payable)} detail={selectedRun?.name || "No run selected"} />
        <StatCard label="Gross" value={money(summary.gross)} detail={`${summary.payees} line item(s)`} />
        <StatCard label="Period Payees" value={summary.manual.toLocaleString()} detail="Casuals and contractors" />
        <StatCard label="Posted Expenses" value={summary.posted.toLocaleString()} detail={selectedRun ? label(selectedRun.status) : "No run"} />
      </div>
      ) : null}

      <ToastMessage message={message} type={toastTypeFromMessage(message)} onClose={() => setMessage("")} />

      <section className="workspace-grid payroll-workspace-grid">
        <div className="page-stack">
          {!hasPayrollFocus ? (
          <form className="panel form-grid payroll-create-run" onSubmit={createRun}>
            <div className="panel-heading">
              <h3>Create Pay Run</h3>
              <CalendarDays size={18} />
            </div>
            <label>
              Run name
              <input value={runForm.name} onChange={(event) => setRunField("name", event.target.value)} placeholder="May 2026 payroll" />
            </label>
            <label>
              From
              <input value={runForm.period_start} onChange={(event) => setRunField("period_start", event.target.value)} type="date" required />
            </label>
            <label>
              To
              <input value={runForm.period_end} onChange={(event) => setRunField("period_end", event.target.value)} type="date" required />
            </label>
            <label>
              Payee group
              <select value={runForm.payee_type} onChange={(event) => setRunField("payee_type", event.target.value)}>
                <option value="">All recurring payees</option>
                {recurringPayeeTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea value={runForm.notes} onChange={(event) => setRunField("notes", event.target.value)} rows="3" />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              <Plus size={17} />
              Create draft run
            </button>
          </form>
          ) : null}

          {!hasPayrollFocus ? (
          <form className="panel form-grid payroll-recurring-form" onSubmit={createPayee}>
            <div className="panel-heading">
              <h3>Add Recurring Payee</h3>
              <Users size={18} />
            </div>
            <label>
              Type
              <select value={payeeForm.payee_type} onChange={(event) => setPayeeField("payee_type", event.target.value)}>
                {recurringPayeeTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input value={payeeForm.name} onChange={(event) => setPayeeField("name", event.target.value)} required />
            </label>
            <label>
              Code
              <input value={payeeForm.code} onChange={(event) => setPayeeField("code", event.target.value)} placeholder="EMP-003" />
            </label>
            <label>
              Role / plan
              <input value={payeeForm.title} onChange={(event) => setPayeeField("title", event.target.value)} />
            </label>
            <label>
              Rate
              <input value={payeeForm.rate_amount} onChange={(event) => setPayeeField("rate_amount", event.target.value)} type="number" min="0" required />
            </label>
            <label>
              Basis
              <select value={payeeForm.rate_basis} onChange={(event) => setPayeeField("rate_basis", event.target.value)}>
                {rateBases.map((basis) => (
                  <option key={basis} value={basis}>
                    {label(basis)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default units
              <input value={payeeForm.default_units} onChange={(event) => setPayeeField("default_units", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Start date
              <input value={payeeForm.start_date} onChange={(event) => setPayeeField("start_date", event.target.value)} type="date" />
            </label>
            <label>
              Additions
              <input value={payeeForm.default_additions} onChange={(event) => setPayeeField("default_additions", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Deductions
              <input value={payeeForm.default_deductions} onChange={(event) => setPayeeField("default_deductions", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Channel
              <select value={payeeForm.payment_channel} onChange={(event) => setPayeeField("payment_channel", event.target.value)}>
                <option value="bank">Bank</option>
                <option value="mpesa_paybill">M-Pesa/paybill</option>
                <option value="cash">Cash</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              <Save size={17} />
              Save payee
            </button>
          </form>
          ) : null}

          {!hasPayrollFocus ? (
          <form className="panel form-grid payroll-period-form" onSubmit={addPeriodPayee}>
            <div className="panel-heading">
              <h3>Add To This Run</h3>
              <Plus size={18} />
            </div>
            <label>
              Type
              <select value={periodPayeeForm.payee_type} onChange={(event) => setPeriodPayeeField("payee_type", event.target.value)}>
                {periodOnlyPayeeTypes.map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input value={periodPayeeForm.name} onChange={(event) => setPeriodPayeeField("name", event.target.value)} required />
            </label>
            <label>
              Code
              <input value={periodPayeeForm.code} onChange={(event) => setPeriodPayeeField("code", event.target.value)} placeholder="CAS-024" />
            </label>
            <label>
              Role / invoice
              <input value={periodPayeeForm.title} onChange={(event) => setPeriodPayeeField("title", event.target.value)} />
            </label>
            <label>
              Rate
              <input
                value={periodPayeeForm.rate_amount}
                onChange={(event) => setPeriodPayeeField("rate_amount", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>
            <label>
              Basis
              <select value={periodPayeeForm.rate_basis} onChange={(event) => setPeriodPayeeField("rate_basis", event.target.value)}>
                {rateBases.map((basis) => (
                  <option key={basis} value={basis}>
                    {label(basis)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Units
              <input value={periodPayeeForm.source_units} onChange={(event) => setPeriodPayeeField("source_units", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Additions
              <input value={periodPayeeForm.additions} onChange={(event) => setPeriodPayeeField("additions", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Deductions
              <input value={periodPayeeForm.deductions} onChange={(event) => setPeriodPayeeField("deductions", event.target.value)} type="number" min="0" />
            </label>
            <label>
              Channel
              <select value={periodPayeeForm.payment_channel} onChange={(event) => setPeriodPayeeField("payment_channel", event.target.value)}>
                <option value="mpesa_paybill">M-Pesa/paybill</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="manual_adjustment">Manual adjustment</option>
              </select>
            </label>
            <label>
              Notes
              <textarea value={periodPayeeForm.notes} onChange={(event) => setPeriodPayeeField("notes", event.target.value)} rows="2" />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={!selectedRun || !["draft", "pending_approval"].includes(selectedRun.status) || loading}
            >
              <Plus size={17} />
              Add period payee
            </button>
          </form>
          ) : null}

          <div className="panel payroll-run-panel">
            <div className="panel-heading">
              <h3>Recent Pay Runs</h3>
              <Banknote size={18} />
            </div>
            <div className="payroll-run-list">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className={selectedRun?.id === run.id ? "payroll-run active" : "payroll-run"}
                  onClick={() => openRun(run)}
                >
                  <span>
                    <strong>{run.name}</strong>
                    <small>
                      {dateOnly(run.period_start)} to {dateOnly(run.period_end)}
                    </small>
                  </span>
                  <StatusBadge status={run.status} />
                </button>
              ))}
              {!runs.length ? <div className="empty-state"><strong>No pay runs</strong><span>Create a draft run to begin.</span></div> : null}
            </div>
          </div>
        </div>

        <div className="page-stack wide-panel">
          <div className="panel payroll-review-panel">
            <div className="panel-heading">
              <h3>{selectedRun ? selectedRun.name : "Payroll Review"}</h3>
              <div className="row-actions">
                <button type="button" onClick={exportLines} disabled={!selectedRun}>
                  <Download size={16} />
                  Export
                </button>
                <button type="button" onClick={() => changeRunStatus("pending_approval")} disabled={!selectedRun || !["draft"].includes(selectedRun.status)}>
                  <Send size={16} />
                  Submit
                </button>
                {user.role === "admin" ? (
                  <button type="button" onClick={() => changeRunStatus("approved")} disabled={!selectedRun || !["draft", "pending_approval"].includes(selectedRun.status)}>
                    <CheckCircle2 size={16} />
                    Approve
                  </button>
                ) : null}
                <button type="button" onClick={() => changeRunStatus("paid")} disabled={!selectedRun || selectedRun.status !== "approved"}>
                  <Banknote size={16} />
                  Paid
                </button>
                <button type="button" onClick={() => changeRunStatus("locked")} disabled={!selectedRun || selectedRun.status !== "paid"}>
                  <Lock size={16} />
                  Lock
                </button>
              </div>
            </div>

            {selectedRun ? (
              <div className="reading-context payroll-run-context">
                <div>
                  <span>Period</span>
                  <strong>
                    {dateOnly(selectedRun.period_start)} to {dateOnly(selectedRun.period_end)}
                  </strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{label(selectedRun.status)}</strong>
                </div>
                <div>
                  <span>Created by</span>
                  <strong>{selectedRun.created_by_name || "-"}</strong>
                </div>
                <div>
                  <span>Approved by</span>
                  <strong>{selectedRun.approved_by_name || "-"}</strong>
                </div>
              </div>
            ) : null}

            <TableControls table={lineTable} label="lines" placeholder="Search payroll lines" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Payee</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Basis</th>
                    <th>Units</th>
                    <th>Gross</th>
                    <th>Additions</th>
                    <th>Deductions</th>
                    <th>Net</th>
                    <th>Expense</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lineTable.visibleRows.length ? (
                    lineTable.visibleRows.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.name}</strong>
                          <small>{line.code || line.title || "-"}</small>
                        </td>
                        <td>{label(line.payee_type)}</td>
                        <td>{line.source_type === "manual_period" ? "Period" : "Recurring"}</td>
                        <td>{label(line.rate_basis)}</td>
                        <td>{Number(line.source_units || 0).toLocaleString()}</td>
                        <td>{money(line.gross_amount)}</td>
                        <td>{money(line.additions)}</td>
                        <td>{money(line.deductions)}</td>
                        <td>{money(line.net_amount)}</td>
                        <td>
                          {line.expense_id ? `Expense #${line.expense_id}` : "-"}
                          {line.expense_reference ? <small>{line.expense_reference}</small> : null}
                        </td>
                        <td><StatusBadge status={line.status} /></td>
                        <td>
                          <button type="button" onClick={() => editLine(line)} disabled={!["draft", "pending_approval"].includes(selectedRun.status)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={12} title="No payroll lines found" detail="Create or open a payroll run." />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {lineDraft ? (
            <form className="panel form-grid payroll-line-editor" onSubmit={saveLine}>
              <div className="panel-heading">
                <h3>Edit {lineDraft.name}</h3>
                <Save size={18} />
              </div>
              <label>
                Units
                <input
                  value={lineDraft.source_units}
                  onChange={(event) => setLineDraft((current) => ({ ...current, source_units: event.target.value }))}
                  type="number"
                  min="0"
                />
              </label>
              <label>
                Gross
                <input
                  value={lineDraft.gross_amount}
                  onChange={(event) => setLineDraft((current) => ({ ...current, gross_amount: event.target.value }))}
                  type="number"
                  min="0"
                />
              </label>
              <label>
                Additions
                <input
                  value={lineDraft.additions}
                  onChange={(event) => setLineDraft((current) => ({ ...current, additions: event.target.value }))}
                  type="number"
                  min="0"
                />
              </label>
              <label>
                Deductions
                <input
                  value={lineDraft.deductions}
                  onChange={(event) => setLineDraft((current) => ({ ...current, deductions: event.target.value }))}
                  type="number"
                  min="0"
                />
              </label>
              <label>
                Notes
                <textarea
                  value={lineDraft.notes}
                  onChange={(event) => setLineDraft((current) => ({ ...current, notes: event.target.value }))}
                  rows="2"
                />
              </label>
              <button className="primary-button" type="submit">
                <Save size={17} />
                Save line
              </button>
            </form>
          ) : null}

          {!hasPayrollFocus ? (
          <div className="panel payroll-recurring-register">
            <div className="panel-heading">
              <h3>Recurring Payees</h3>
              <Users size={18} />
            </div>
            <TableControls table={payeeTable} label="payees" placeholder="Search payees" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Payee</th>
                    <th>Type</th>
                    <th>Rate</th>
                    <th>Basis</th>
                    <th>Status</th>
                    <th>Active From</th>
                    <th>Units</th>
                    <th>Additions</th>
                    <th>Deductions</th>
                    <th>Channel</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payeeTable.visibleRows.length ? (
                    payeeTable.visibleRows.map((payee) => (
                      <tr key={payee.id}>
                        <td>
                          <strong>{payee.name}</strong>
                          <small>{payee.code || payee.title || "-"}</small>
                        </td>
                        <td>{label(payee.payee_type)}</td>
                        <td>{money(payee.rate_amount)}</td>
                        <td>{label(payee.rate_basis)}</td>
                        <td>
                          <StatusBadge status={payee.status} />
                          {payee.termination_reason ? <small>{payee.termination_reason}</small> : null}
                        </td>
                        <td>
                          {dateOnly(payee.start_date)}
                          {payee.end_date ? <small>Ends {dateOnly(payee.end_date)}</small> : null}
                        </td>
                        <td>{readDefaultUnits(payee.metadata) || "-"}</td>
                        <td>{money(payee.default_additions)}</td>
                        <td>{money(payee.default_deductions)}</td>
                        <td>{label(payee.payment_channel)}</td>
                        <td>
                          {user.role === "admin" && payee.status === "active" ? (
                            <button type="button" onClick={() => terminatePayee(payee)}>
                              <UserMinus size={15} />
                              {payee.payee_type === "subscription" ? "Cancel" : "Terminate"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={11} title="No recurring payees found" detail="Add employees or subscriptions for automatic payroll inclusion." />
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}

          {!hasPayrollFocus ? (
          <div className="panel payroll-period-register">
            <div className="panel-heading">
              <h3>Period-Only Payees</h3>
              <Users size={18} />
            </div>
            <TableControls table={periodPayeeTable} label="payees" placeholder="Search casuals and contractors" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Payee</th>
                    <th>Type</th>
                    <th>Rate</th>
                    <th>Basis</th>
                    <th>Period</th>
                    <th>Channel</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {periodPayeeTable.visibleRows.length ? (
                    periodPayeeTable.visibleRows.map((payee) => (
                      <tr key={payee.id}>
                        <td>
                          <strong>{payee.name}</strong>
                          <small>{payee.code || payee.title || "-"}</small>
                        </td>
                        <td>{label(payee.payee_type)}</td>
                        <td>{money(payee.rate_amount)}</td>
                        <td>{label(payee.rate_basis)}</td>
                        <td>
                          {dateOnly(payee.start_date)}
                          {payee.end_date ? <small>to {dateOnly(payee.end_date)}</small> : null}
                        </td>
                        <td>{label(payee.payment_channel)}</td>
                        <td><StatusBadge status={payee.status} /></td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={7} title="No period-only payees found" detail="Add casuals and contractors from a selected payroll run." />
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

export default PayrollPage;
