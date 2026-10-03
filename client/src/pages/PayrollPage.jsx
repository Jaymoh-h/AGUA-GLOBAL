import {
  Banknote,
  CalendarDays,
  Pencil,
  Plus,
  Save,
  UserMinus,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CollapsibleSection from "../components/CollapsibleSection";
import { EmptyTableRow } from "../components/EmptyState";
import FocusNotice from "../components/FocusNotice";
import PayrollRunReviewPanel from "../components/PayrollRunReviewPanel";
import ReviewDialog from "../components/ReviewDialog";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import WorkspaceActionMenu from "../components/WorkspaceActionMenu";
import { api } from "../services/api";
import { downloadCsvRows } from "../utils/csvTemplate";
import { downloadBlobFile, namedExport } from "../utils/exportNames";
import useScopedDraft from "../utils/useScopedDraft";

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
  let source = metadata;
  if (typeof metadata === "string") {
    try {
      source = JSON.parse(metadata);
    } catch (_error) {
      source = {};
    }
  }
  const units = Number(source?.default_units);
  return Number.isFinite(units) && units >= 0 ? units : "";
};

const blankPayeeForm = () => ({
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
const blankPayeeDraft = () => ({ editing_payee_id: "", values: blankPayeeForm() });
const blankPeriodPayeeForm = () => ({
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
const blankRunForm = () => ({
  name: "",
  period_start: firstDay,
  period_end: today,
  payee_type: "",
  notes: ""
});

const payeeToForm = (payee) => ({
  payee_type: payee.payee_type || "employee",
  name: payee.name || "",
  code: payee.code || "",
  title: payee.title || "",
  rate_amount: payee.rate_amount ?? "",
  rate_basis: payee.rate_basis || "monthly",
  default_additions: payee.default_additions ?? "",
  default_deductions: payee.default_deductions ?? "",
  payment_channel: payee.payment_channel || "bank",
  default_units: readDefaultUnits(payee.metadata),
  start_date: dateOnly(payee.start_date) === "-" ? today : dateOnly(payee.start_date)
});

function PayrollPage({ user, navigationIntent, onClearNavigationIntent }) {
  const [payees, setPayees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [activeWorkspaceAction, setActiveWorkspaceAction] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [, setMessage] = useToastMessage();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [payeeDraft, setPayeeDraft, clearPayeeDraft] = useScopedDraft(user, "payroll-recurring-payee", blankPayeeDraft);
  const [periodPayeeForm, setPeriodPayeeForm, clearPeriodPayeeDraft] = useScopedDraft(
    user,
    `payroll-period-payee:${selectedRun?.id || "unselected"}`,
    blankPeriodPayeeForm
  );
  const [runForm, setRunForm, clearRunDraft] = useScopedDraft(user, "payroll-run", blankRunForm);
  const [lineDraft, setLineDraft] = useState(null);
  const [terminationPayee, setTerminationPayee] = useState(null);
  const [terminationForm, setTerminationForm] = useState({ end_date: today, termination_reason: "" });
  const [runReview, setRunReview] = useState(null);
  const [runReviewBusy, setRunReviewBusy] = useState(false);
  const editingPayeeId = payeeDraft.editing_payee_id;
  const payeeForm = payeeDraft.values;
  const setPayeeForm = (updater) =>
    setPayeeDraft((current) => ({
      ...current,
      values: typeof updater === "function" ? updater(current.values) : updater
    }));

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

  const load = async (preferredRunId = selectedRun?.id, { showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    setLoading(true);
    try {
      const [nextPayees, nextRuns] = await Promise.all([api.payroll.payees(), api.payroll.runs()]);
      setPayees(nextPayees);
      setRuns(nextRuns);
      const nextRunId = preferredRunId || nextRuns[0]?.id;
      setSelectedRun(nextRunId ? await api.payroll.getRun(nextRunId) : null);
    } catch (err) {
      if (showState) setInitialError(err.message || "Payroll payees and pay-run controls could not be loaded.");
      throw err;
    } finally {
      setLoading(false);
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load(undefined, { showState: true }).catch(() => {});
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

  const resetPayeeForm = () => {
    clearPayeeDraft();
  };

  const editPayee = (payee) => {
    setPayeeDraft({ editing_payee_id: String(payee.id), values: payeeToForm(payee) });
    setMessage(`${payee.name} loaded for editing.`);
  };

  const savePayee = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const defaultUnits = Number(payeeForm.default_units);
      const payload = {
        ...payeeForm,
        rate_amount: Number(payeeForm.rate_amount),
        default_additions: Number(payeeForm.default_additions || 0),
        default_deductions: Number(payeeForm.default_deductions || 0),
        metadata: Number.isFinite(defaultUnits) && defaultUnits >= 0 ? { default_units: defaultUnits } : {}
      };
      if (editingPayeeId) {
        await api.payroll.updatePayee(editingPayeeId, payload);
      } else {
        await api.payroll.createPayee(payload);
      }
      resetPayeeForm();
      await load();
      setMessage(editingPayeeId ? "Recurring payee updated." : "Recurring payee added.");
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
      clearPeriodPayeeDraft();
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
      clearRunDraft();
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

  const updateRunStatus = async (run, status, notes = "") => {
    if (!run) return;
    setMessage("");
    try {
      const updated = await api.payroll.updateRunStatus(run.id, { status, notes });
      await load(updated.id);
      setMessage(`Payroll run marked ${label(status)}.`);
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    }
  };

  const changeRunStatus = async (status) => {
    if (!selectedRun) return;
    if (["approved", "paid", "locked"].includes(status)) {
      setRunReview({ run: selectedRun, status });
      return;
    }
    await updateRunStatus(selectedRun, status);
  };

  const closeRunReview = () => {
    if (!runReviewBusy) setRunReview(null);
  };

  const confirmRunReview = async (notes) => {
    if (!runReview) return;
    setRunReviewBusy(true);
    try {
      const updated = await updateRunStatus(runReview.run, runReview.status, notes);
      if (updated) setRunReview(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRunReviewBusy(false);
    }
  };

  const openTermination = (payee) => {
    setTerminationPayee(payee);
    setTerminationForm({ end_date: today, termination_reason: "" });
  };

  const terminatePayee = async (event) => {
    event.preventDefault();
    if (!terminationPayee) return;
    setMessage("");
    try {
      await api.payroll.terminatePayee(terminationPayee.id, {
        end_date: terminationForm.end_date,
        termination_reason: terminationForm.termination_reason
      });
      await load(selectedRun?.id);
      setMessage(
        `${terminationPayee.name} marked as ${terminationPayee.payee_type === "subscription" ? "cancelled" : "terminated"}.`
      );
      setTerminationPayee(null);
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

  const downloadPayslip = async (line) => {
    setMessage("");
    try {
      const blob = await api.payroll.downloadPayslip(line.id);
      downloadBlobFile(blob, namedExport("payslip", "pdf", [selectedRun?.name || selectedRun?.id, line.name || line.id]), "pdf");
      setMessage(`Payslip downloaded for ${line.name}.`);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const exportLines = () => {
    downloadCsvRows(
      namedExport("payroll-run-lines", "csv", [selectedRun?.name || selectedRun?.id || "no-run", typeFilter || "all-payees"]),
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

  if (initialLoading) {
    return <WorkspaceState title="Preparing payroll control" detail="Retrieving payees, pay runs, and the selected run's controlled line items." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="Payroll control could not load" detail={initialError} onRetry={() => load(undefined, { showState: true }).catch(() => {})} />;
  }

  return (
    <section className={`page-stack payroll-control-page ${activeWorkspaceAction ? `payroll-utility-open payroll-utility-${activeWorkspaceAction}` : ""}`}>
      <header className="page-header payroll-control-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Payroll control</h2>
          <p>Prepare one accountable pay run, review every line, and post only approved payroll to operating costs.</p>
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Payee type filter">
          <option value="">All payees</option>
          {payeeTypes.map((type) => (
            <option key={type} value={type}>
              {label(type)}
            </option>
          ))}
        </select>
        <WorkspaceActionMenu
          actions={[
            { key: "run", label: "Create pay run", detail: "New draft", icon: CalendarDays, disabled: hasPayrollFocus, onSelect: () => setActiveWorkspaceAction("run") },
            { key: "recurring", label: "Add recurring payee", detail: "Employee or subscription", icon: Users, disabled: hasPayrollFocus, onSelect: () => setActiveWorkspaceAction("recurring") },
            { key: "period", label: "Add payee to run", detail: "Casual or contractor", icon: Plus, disabled: hasPayrollFocus, onSelect: () => setActiveWorkspaceAction("period") }
          ]}
        />
      </header>

      {focusKey === "payroll_attention" ? (
        <FocusNotice
          title="Payroll awaiting action"
          detail="Selected the first pay run pending approval or payment, where available."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      {!hasPayrollFocus ? (
      <div className="stat-grid payroll-control-metrics">
        <StatCard label="Net Payable" value={money(summary.payable)} detail={selectedRun?.name || "No run selected"} />
        <StatCard label="Gross" value={money(summary.gross)} detail={`${summary.payees} line item(s)`} />
        <StatCard label="Period Payees" value={summary.manual.toLocaleString()} detail="Casuals and contractors" />
        <StatCard label="Posted Expenses" value={summary.posted.toLocaleString()} detail={selectedRun ? label(selectedRun.status) : "No run"} />
      </div>
      ) : null}

      <section className="workspace-grid payroll-workspace-grid">
        <div className="page-stack">
          {!hasPayrollFocus ? (
          <CollapsibleSection
            as="form"
            actions={<button className="icon-button" type="button" title="Close pay-run panel" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
            className="form-grid payroll-create-run payroll-utility-form payroll-run-action"
            defaultOpen={!runs.length}
            icon={<CalendarDays size={18} />}
            onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
            onSubmit={createRun}
            open={activeWorkspaceAction === "run"}
            summary={`${runs.length.toLocaleString()} recent run(s)`}
            title="Create Pay Run"
          >
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
          </CollapsibleSection>
          ) : null}

          {!hasPayrollFocus ? (
          <CollapsibleSection
            as="form"
            actions={<button className="icon-button" type="button" title="Close recurring-payee panel" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
            className="form-grid payroll-recurring-form payroll-utility-form payroll-recurring-action"
            defaultOpen={Boolean(editingPayeeId)}
            icon={<Users size={18} />}
            onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
            onSubmit={savePayee}
            open={activeWorkspaceAction === "recurring"}
            summary={`${payeeTable.filteredRows.length.toLocaleString()} recurring payee(s)`}
            title={editingPayeeId ? "Edit Recurring Payee" : "Add Recurring Payee"}
          >
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
            <div className="row-actions full-span">
              <button className="primary-button" type="submit" disabled={loading}>
                <Save size={17} />
                {editingPayeeId ? "Save changes" : "Save payee"}
              </button>
              {editingPayeeId ? (
                <button type="button" onClick={resetPayeeForm} disabled={loading}>
                  <X size={16} />
                  Cancel
                </button>
              ) : null}
            </div>
          </CollapsibleSection>
          ) : null}

          {!hasPayrollFocus ? (
          <CollapsibleSection
            as="form"
            actions={<button className="icon-button" type="button" title="Close add-payee panel" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
            className="form-grid payroll-period-form payroll-utility-form payroll-period-action"
            defaultOpen={false}
            icon={<Plus size={18} />}
            onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
            onSubmit={addPeriodPayee}
            open={activeWorkspaceAction === "period"}
            summary={selectedRun ? selectedRun.name : "Select a run first"}
            title="Add To This Run"
          >
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
          </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            className="payroll-run-panel"
            defaultOpen
            icon={<Banknote size={18} />}
            summary={`${runs.length.toLocaleString()} run(s)`}
            title="Recent Pay Runs"
          >
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
          </CollapsibleSection>
        </div>

        <div className="page-stack wide-panel">
          <PayrollRunReviewPanel
            lineDraft={lineDraft}
            lineTable={lineTable}
            money={money}
            onDownloadPayslip={downloadPayslip}
            onEditLine={editLine}
            onExport={exportLines}
            onSaveLine={saveLine}
            onSetLineDraft={setLineDraft}
            onStatusChange={changeRunStatus}
            selectedRun={selectedRun}
            summary={summary}
            userRole={user.role}
          />

          {!hasPayrollFocus ? (
          <CollapsibleSection
            className="payroll-recurring-register"
            icon={<Users size={18} />}
            summary={`${payeeTable.filteredRows.length.toLocaleString()} payee(s)`}
            title="Recurring Payees"
          >
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
                          <div className="row-actions">
                            <button type="button" onClick={() => editPayee(payee)}>
                              <Pencil size={15} />
                              Edit
                            </button>
                            {user.role === "admin" && payee.status === "active" ? (
                              <button type="button" onClick={() => openTermination(payee)} title="Terminate payee">
                                <UserMinus size={15} />
                                {payee.payee_type === "subscription" ? "Cancel" : "Terminate"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={11} title="No recurring payees found" detail="Add employees or subscriptions for automatic payroll inclusion." />
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
          ) : null}

          {!hasPayrollFocus ? (
          <CollapsibleSection
            className="payroll-period-register"
            icon={<Users size={18} />}
            summary={`${periodPayeeTable.filteredRows.length.toLocaleString()} payee(s)`}
            title="Period-Only Payees"
          >
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
          </CollapsibleSection>
          ) : null}
        </div>
      </section>
      {terminationPayee ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setTerminationPayee(null)}>
          <form
            className="modal-panel override-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terminate-payee-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={terminatePayee}
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Payroll Payee</p>
                <h3 id="terminate-payee-title">
                  {terminationPayee.payee_type === "subscription" ? "Cancel service provider" : "Terminate payee"}
                </h3>
              </div>
            </div>
            <p className="muted">{terminationPayee.name}</p>
            <label>
              Effective date
              <input
                value={terminationForm.end_date}
                onChange={(event) => setTerminationForm((current) => ({ ...current, end_date: event.target.value }))}
                type="date"
                required
              />
            </label>
            <label>
              Reason
              <textarea
                value={terminationForm.termination_reason}
                onChange={(event) => setTerminationForm((current) => ({ ...current, termination_reason: event.target.value }))}
                rows="3"
                required
              />
            </label>
            <div className="row-actions">
              <button className="primary-button" type="submit" disabled={loading || !terminationForm.termination_reason.trim()}>
                <UserMinus size={16} />
                {terminationPayee.payee_type === "subscription" ? "Confirm cancellation" : "Confirm termination"}
              </button>
              <button type="button" onClick={() => setTerminationPayee(null)} disabled={loading}>
                <X size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <ReviewDialog
        open={Boolean(runReview)}
        eyebrow="Payroll run review"
        title={
          runReview?.status === "approved"
            ? "Approve payroll run"
            : runReview?.status === "paid"
              ? "Mark payroll paid"
              : "Lock paid payroll run"
        }
        description={
          runReview?.status === "approved"
            ? "Approval freezes this reviewed run for payment. It does not post operating expenses or send money."
            : runReview?.status === "paid"
              ? "This marks eligible lines as paid and creates their linked operating-expense records. It does not initiate a bank or M-Pesa transfer."
              : "Locking prevents further status changes to this paid run while preserving its payroll and expense audit history."
        }
        confirmLabel={runReview?.status === "approved" ? "Approve run" : runReview?.status === "paid" ? "Mark paid and post expenses" : "Lock run"}
        cancelLabel={runReview?.status === "approved" ? "Keep for review" : runReview?.status === "paid" ? "Keep approved" : "Keep unlocked"}
        reasonLabel={runReview?.status === "approved" ? "Approval note" : runReview?.status === "paid" ? "Payment posting note" : "Lock note"}
        reasonPlaceholder="State the evidence or decision basis for the payroll audit trail"
        busy={runReviewBusy}
        busyLabel={runReview?.status === "paid" ? "Posting payroll expenses..." : "Saving review..."}
        onCancel={closeRunReview}
        onConfirm={confirmRunReview}
      >
        {runReview ? (
          <div className="reading-context payroll-run-context">
            <div><span>Pay run</span><strong>{runReview.run.name}</strong></div>
            <div><span>Period</span><strong>{dateOnly(runReview.run.period_start)} to {dateOnly(runReview.run.period_end)}</strong></div>
            <div><span>Eligible lines</span><strong>{Number(runReview.run.lines?.filter((line) => !["held", "cancelled"].includes(line.status)).length || 0).toLocaleString()}</strong></div>
            <div><span>Net payable</span><strong>{money(runReview.run.total_net)}</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
    </section>
  );
}

export default PayrollPage;
