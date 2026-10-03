import { ArrowRight, CalendarPlus, Eye, ReceiptText, RefreshCw, Save, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import BillingCyclePanel from "../components/BillingCyclePanel";
import BillingStageEvidencePanel from "../components/BillingStageEvidencePanel";
import CollapsibleSection from "../components/CollapsibleSection";
import FocusNotice from "../components/FocusNotice";
import RevenueAssurancePanel from "../components/RevenueAssurancePanel";
import { EmptyTableRow } from "../components/EmptyState";
import ReviewDialog from "../components/ReviewDialog";
import StatusBadge from "../components/StatusBadge";
import TableControls, { useTableControls } from "../components/TableControls";
import { useToastMessage } from "../components/ToastProvider";
import WorkspaceState from "../components/WorkspaceState";
import WorkspaceActionMenu from "../components/WorkspaceActionMenu";
import { api } from "../services/api";

const money = (value) => `KES ${Number(value || 0).toLocaleString()}`;
const dateOnly = (value) => value?.toISOString().slice(0, 10) || "-";
const getPeriodSchedule = (periodStart) => {
  const date = new Date(`${String(periodStart || "").slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const close = new Date(Date.UTC(year, month + 1, 0));
  const due = new Date(Date.UTC(year, month + 2, 0));
  return {
    name: start.toLocaleString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" }),
    periodStart: dateOnly(start),
    closingDate: dateOnly(close),
    dueDate: dateOnly(due)
  };
};

const preferredOperationalPeriod = (periods) => {
  const today = new Date().toISOString().slice(0, 10);
  const openPeriods = periods.filter((period) => period.status === "open");
  return (
    openPeriods.find((period) => period.period_start?.slice(0, 10) <= today && period.period_end?.slice(0, 10) >= today) ||
    openPeriods[0] ||
    periods[0] ||
    null
  );
};

const readinessStatus = (readiness) => {
  if (!readiness) return "review";
  if (!readiness.summary?.ready_to_close) return "critical";
  return Number(readiness.summary?.warnings || 0) > 0 ? "review" : "ready";
};

const checkStatus = (check) => {
  if (check.passed) return "ready";
  return check.level === "block" ? "critical" : "review";
};

function BillingSetupPage({ navigationIntent, onClearNavigationIntent, onNavigate }) {
  const [periods, setPeriods] = useState([]);
  const [penaltyApplications, setPenaltyApplications] = useState([]);
  const [settings, setSettings] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [revenueAssurance, setRevenueAssurance] = useState(null);
  const [readinessPeriodId, setReadinessPeriodId] = useState("");
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [penaltyDate, setPenaltyDate] = useState(new Date().toISOString().slice(0, 10));
  const [penaltyPreview, setPenaltyPreview] = useState(null);
  const [penaltyBusy, setPenaltyBusy] = useState(false);
  const [reviewAction, setReviewAction] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [settingsReview, setSettingsReview] = useState(null);
  const [settingsReviewBusy, setSettingsReviewBusy] = useState(false);
  const [periodStartReview, setPeriodStartReview] = useState(null);
  const [periodStartReviewBusy, setPeriodStartReviewBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [stageReview, setStageReview] = useState("");
  const [activeWorkspaceAction, setActiveWorkspaceAction] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [, setMessage] = useToastMessage();
  const focusKey = navigationIntent?.page === "billing" ? navigationIntent.focus : "";

  const load = async ({ showState = false } = {}) => {
    if (showState) {
      setInitialLoading(true);
      setInitialError("");
    }
    try {
      const [periodRows, settingsRow, penaltyRows] = await Promise.all([
        api.billing.periods.list(),
        api.billing.settings.get(),
        api.billing.penalties.list()
      ]);
      setPeriods(periodRows);
      setSettings(settingsRow);
      setPenaltyApplications(penaltyRows);
    } catch (err) {
      if (showState) setInitialError(err.message || "Billing periods and controls could not be loaded.");
      throw err;
    } finally {
      if (showState) setInitialLoading(false);
    }
  };

  useEffect(() => {
    load({ showState: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!periods.length || readinessPeriodId) return;
    const initialPeriod = preferredOperationalPeriod(periods);
    if (initialPeriod) {
      loadReadiness(initialPeriod.id, { silent: true }).catch((err) => setMessage(err.message));
    }
  }, [periods, readinessPeriodId]);

  const updateSettingsField = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const loadReadiness = async (periodId, options = {}) => {
    if (!periodId) return null;
    if (!options.silent) setMessage("");
    setReadinessBusy(true);
    try {
      const [result, assurance] = await Promise.all([
        api.billing.periods.readiness(periodId),
        api.billing.periods.revenueAssurance(periodId)
      ]);
      setReadiness(result);
      setRevenueAssurance(assurance);
      setReadinessPeriodId(periodId);
      if (!options.silent) setReadinessOpen(true);
      return result;
    } catch (err) {
      if (!options.silent) setMessage(err.message);
      throw err;
    } finally {
      setReadinessBusy(false);
    }
  };

  const settingsPayload = () => ({
    penalty_grace_days: Number(settings.penalty_grace_days || 0),
    penalty_type: settings.penalty_type,
    penalty_value: Number(settings.penalty_value || 0),
    deposit_required: Boolean(settings.deposit_required),
    default_deposit_amount: Number(settings.default_deposit_amount || 0),
    bill_number_prefix: settings.bill_number_prefix || "BILL",
    bill_number_next: Number(settings.bill_number_next || 1),
    receipt_number_prefix: settings.receipt_number_prefix || "RCPT",
    receipt_number_next: Number(settings.receipt_number_next || 1),
    number_padding: Number(settings.number_padding || 6)
  });

  const saveSettings = (event) => {
    event.preventDefault();
    setSettingsReview(settingsPayload());
  };

  const closeSettingsReview = () => {
    if (!settingsReviewBusy) setSettingsReview(null);
  };

  const confirmSettingsReview = async (reviewNotes) => {
    if (!settingsReview) return;
    setMessage("");
    setSettingsReviewBusy(true);
    try {
      const updated = await api.billing.settings.update({ ...settingsReview, review_notes: reviewNotes });
      setSettings(updated);
      setPenaltyPreview(null);
      setSettingsReview(null);
      setMessage("Billing settings saved.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSettingsReviewBusy(false);
    }
  };

  const createPeriod = (event) => {
    event.preventDefault();
    setPeriodStartReview(getPeriodSchedule(periodStart));
  };

  const closePeriodStartReview = () => {
    if (!periodStartReviewBusy) setPeriodStartReview(null);
  };

  const confirmPeriodStartReview = async (reviewNotes) => {
    if (!periodStartReview) return;
    setMessage("");
    setPeriodStartReviewBusy(true);
    try {
      await api.billing.periods.create({ period_start: periodStart, status: "open", review_notes: reviewNotes });
      await load();
      setPeriodStartReview(null);
      setMessage("Billing period opened.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setPeriodStartReviewBusy(false);
    }
  };

  const persistPeriodStatus = async (period, status, approvalNote = "", options = {}) => {
    const finalizingPeriod = ["closed", "locked"].includes(status);
    await api.billing.periods.updateStatus(period.id, status, {
      correctionReason: options.requiresCorrection ? approvalNote : "",
      reviewNotes: finalizingPeriod ? approvalNote : ""
    });
    await load();
    if (readinessPeriodId === period.id) {
      await loadReadiness(period.id, { silent: true });
    }
  };

  const updateStatus = async (period, status) => {
    if (statusBusyId || reviewBusy || reviewAction) return;
    setMessage("");
    setStatusBusyId(period.id);
    try {
      let blockers = 0;
      let closeReadiness = null;
      if (["closed", "locked"].includes(status)) {
        closeReadiness = readinessPeriodId === period.id && readiness ? readiness : await loadReadiness(period.id, { silent: true });
        blockers = Number(closeReadiness?.summary?.blockers || 0);
      }
      const restrictedCurrent = ["closed", "locked"].includes(period.status);
      const finalizingPeriod = ["closed", "locked"].includes(status);
      if (blockers > 0 || restrictedCurrent || finalizingPeriod) {
        setReviewAction({
          type: "period-status",
          period,
          status,
          blockers,
          readiness: closeReadiness,
          reasonRequired: finalizingPeriod || restrictedCurrent || blockers > 0,
          requiresCorrection: restrictedCurrent || blockers > 0
        });
        return;
      }
      await persistPeriodStatus(period, status);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setStatusBusyId(null);
    }
  };

  const openReadinessTarget = (check) => {
    if (!check.page || !onNavigate) return;
    onNavigate({ page: check.page, focus: check.focus, label: check.label });
  };

  const previewPenalties = async (applicationDate = penaltyDate) => {
    setMessage("");
    setPenaltyBusy(true);
    try {
      const preview = await api.billing.penalties.preview(applicationDate);
      setPenaltyPreview(preview);
      setMessage(
        preview.summary.enabled
          ? `${preview.summary.eligible_bills} bill(s) eligible for ${money(preview.summary.total_penalties)} in penalties.`
          : "Penalties are disabled. Enable fixed or percentage penalties in settings before applying."
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setPenaltyBusy(false);
    }
  };

  useEffect(() => {
    if (focusKey !== "penalty_candidates") return;
    setActiveWorkspaceAction("penalty");
    const applicationDate = navigationIntent?.application_date || penaltyDate;
    if (applicationDate !== penaltyDate) setPenaltyDate(applicationDate);
    previewPenalties(applicationDate);
  }, [focusKey, navigationIntent?.application_date]);

  const applyPenalties = async (reason) => {
    setMessage("");
    setPenaltyBusy(true);
    try {
      const result = await api.billing.penalties.apply({
        application_date: penaltyDate,
        reason: reason || `Penalty application for ${penaltyDate.slice(0, 7)}`
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

  const openPenaltyApplicationReview = () => {
    if (penaltyBusy || reviewBusy || reviewAction || !penaltyPreview?.summary?.eligible_bills) return;
    setReviewAction({ type: "apply-penalties", preview: penaltyPreview, applicationDate: penaltyDate });
  };
  const periodTable = useTableControls(periods, {
    searchFields: ["name", "period_start", "closing_date", "due_date", "status"]
  });
  const penaltyApplicationTable = useTableControls(penaltyApplications, {
    searchFields: [
      "bill_number",
      "customer_name",
      "acc_number",
      "billing_period_name",
      "application_month",
      "penalty_type",
      "amount",
      "reason",
      "waiver_reason"
    ]
  });

  const waivePenalty = (application) => {
    if (reviewBusy || reviewAction) return;
    setReviewAction({ type: "waive-penalty", application });
  };

  const reapplyPenalty = (application) => {
    if (reviewBusy || reviewAction) return;
    setReviewAction({ type: "reapply-penalty", application });
  };

  const confirmReviewAction = async (reason) => {
    if (!reviewAction || reviewBusy) return;
    setMessage("");
    setReviewBusy(true);
    try {
      if (reviewAction.type === "period-status") {
        await persistPeriodStatus(reviewAction.period, reviewAction.status, reason, {
          requiresCorrection: reviewAction.requiresCorrection
        });
      } else if (reviewAction.type === "apply-penalties") {
        await applyPenalties(reason);
      } else if (reviewAction.type === "waive-penalty") {
        await api.billing.penalties.waive(reviewAction.application.id, { reason });
        await load();
        setMessage("Penalty waived.");
      } else if (reviewAction.type === "reapply-penalty") {
        await api.billing.penalties.reapply(reviewAction.application.id, { reason });
        await load();
        setMessage("Penalty re-applied.");
      }
      setReviewAction(null);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setReviewBusy(false);
    }
  };

  const currentReadinessStatus = readinessStatus(readiness);
  const readinessChecks = readiness?.checks || [];
  const selectedPeriod = periods.find((period) => period.id === readinessPeriodId) || readiness?.period || preferredOperationalPeriod(periods);
  const periodStatusReview = reviewAction?.type === "period-status" ? reviewAction : null;
  const penaltyReview = reviewAction?.type?.includes("penalty") ? reviewAction : null;
  const penaltyApplicationReview = reviewAction?.type === "apply-penalties" ? reviewAction : null;
  const periodTargetLabel = periodStatusReview
    ? periodStatusReview.status.charAt(0).toUpperCase() + periodStatusReview.status.slice(1)
    : "";
  const periodActionLabel = periodStatusReview?.status === "closed"
    ? "Close"
    : periodStatusReview?.status === "locked"
      ? "Lock"
      : periodTargetLabel;
  const hasPeriodBlockers = Number(periodStatusReview?.blockers || 0) > 0;
  const reviewTitle = periodStatusReview
    ? `${periodActionLabel} ${periodStatusReview.period.name}`
    : penaltyApplicationReview
      ? "Apply penalty run"
    : penaltyReview?.type === "waive-penalty"
      ? "Waive applied penalty"
      : "Re-apply waived penalty";
  const reviewDescription = periodStatusReview
    ? hasPeriodBlockers
      ? `${periodStatusReview.period.name} has ${periodStatusReview.blockers} unresolved month-end blocker(s). Continuing will change the period from ${periodStatusReview.period.status} to ${periodStatusReview.status} despite the readiness issues. Record the month-end approval and explicit override basis before continuing.`
      : periodStatusReview.reasonRequired
        ? `This period is currently ${periodStatusReview.period.status}. Changing it to ${periodStatusReview.status} is a restricted-period correction and requires an audit reason.`
        : periodStatusReview.status === "closed"
          ? `Closing ${periodStatusReview.period.name} finalizes the normal billing cycle and restricts later corrections. Record finance approval after reviewing readiness before continuing.`
          : `Locking ${periodStatusReview.period.name} applies the strictest correction controls. Record finance approval after its final review.`
    : penaltyReview?.type === "waive-penalty"
      ? `Waiving ${money(penaltyReview.application.amount)} from ${penaltyReview.application.bill_number || `Bill ${penaltyReview.application.bill_id}`} will remove the penalty from the bill balance. The reason will be stored in the audit trail.`
      : penaltyApplicationReview
        ? `Apply ${money(penaltyApplicationReview.preview.summary.total_penalties)} across ${Number(penaltyApplicationReview.preview.summary.eligible_bills || 0).toLocaleString()} eligible bill(s). The application remains subject to current billing-period controls and will be recorded in the audit trail.`
      : penaltyReview
        ? `Re-applying ${money(penaltyReview.application.amount)} to ${penaltyReview.application.bill_number || `Bill ${penaltyReview.application.bill_id}`} will restore the penalty to the bill balance. The reason will be stored in the audit trail.`
        : "";

  if (initialLoading) {
    return <WorkspaceState title="Preparing the billing cycle" detail="Retrieving billing periods, penalty controls, and current revenue settings." />;
  }
  if (initialError) {
    return <WorkspaceState state="error" title="The billing cycle could not load" detail={initialError} onRetry={() => load({ showState: true }).catch(() => {})} />;
  }

  return (
    <section className={`page-stack billing-control-page ${activeWorkspaceAction ? `billing-utility-open billing-utility-${activeWorkspaceAction}` : ""}`}>
      <header className="page-header billing-control-header">
        <div>
          <p className="eyebrow">Billing Control</p>
          <h2>Run the monthly revenue cycle.</h2>
          <p>Move one billing period from readings to close with every exception and lock decision visible.</p>
        </div>
        <div className="page-header-actions">
          <WorkspaceActionMenu
            actions={[
              { key: "period", label: "Open billing period", detail: "Period setup", icon: CalendarPlus, onSelect: () => setActiveWorkspaceAction("period") },
              { key: "penalty", label: "Review penalty candidates", detail: "Arrears control", icon: ReceiptText, onSelect: () => setActiveWorkspaceAction("penalty") },
              { key: "settings", label: "Billing settings", detail: "Numbering and policy", icon: Settings2, onSelect: () => setActiveWorkspaceAction("settings") }
            ]}
          />
        </div>
      </header>

      {focusKey === "unbilled_consumption" ? (
        <FocusNotice
          title="Unbilled consumption"
          detail="The revenue-assurance queue shows current-period client-meter readings that are not linked to a bill. Review the underlying reading before applying the normal billing controls."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      {focusKey === "penalty_candidates" ? (
        <FocusNotice
          title="Arrears penalty candidates"
          detail="This is a read-only candidate preview for the selected application date. Opening it does not apply a penalty; any application remains a separate reasoned and audited decision."
          onClear={onClearNavigationIntent}
        />
      ) : null}

      <BillingCyclePanel
        periods={periods}
        readiness={readiness}
        readinessBusy={readinessBusy}
        selectedPeriod={selectedPeriod}
        settings={settings}
        penaltyDate={penaltyDate}
        penaltyPreview={penaltyPreview}
        onNavigate={onNavigate}
        onOpenStage={setStageReview}
        onRefresh={() => loadReadiness(selectedPeriod?.id)}
        onSelectPeriod={(periodId) => {
          setStageReview("");
          loadReadiness(periodId);
        }}
        onUpdateStatus={updateStatus}
      />

      <BillingStageEvidencePanel
        onClose={() => setStageReview("")}
        onNavigate={onNavigate}
        period={selectedPeriod}
        stage={stageReview}
      />

      <RevenueAssurancePanel
        assurance={revenueAssurance}
        busy={readinessBusy}
        onRefresh={() => loadReadiness(selectedPeriod?.id)}
        onNavigate={onNavigate}
      />

      <section className="workspace-grid billing-control-workspace">
        <div className="page-stack billing-utility-panel">
          {settings ? (
            <CollapsibleSection
              as="form"
              actions={<button className="icon-button" type="button" title="Close billing settings" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
              className="form-grid billing-settings-action"
              defaultOpen={false}
              onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
              open={activeWorkspaceAction === "settings"}
              onSubmit={saveSettings}
              summary={`${settings.penalty_type === "none" ? "Penalties disabled" : `Penalty ${settings.penalty_type}`} | ${settings.bill_number_prefix || "BILL"}`}
              title="Settings"
            >
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
                  <option value="percentage">Percentage of unpaid principal</option>
                </select>
              </label>
              <label>
                {settings.penalty_type === "percentage" ? "Penalty percentage" : "Penalty amount"}
                <input
                  value={settings.penalty_value}
                  onChange={(event) => updateSettingsField("penalty_value", event.target.value)}
                  type="number"
                  min="0"
                  max={settings.penalty_type === "percentage" ? "100" : undefined}
                  step={settings.penalty_type === "percentage" ? "0.01" : "1"}
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
              <label>
                Bill prefix
                <input value={settings.bill_number_prefix || ""} onChange={(event) => updateSettingsField("bill_number_prefix", event.target.value)} />
              </label>
              <label>
                Next bill number
                <input value={settings.bill_number_next || 1} onChange={(event) => updateSettingsField("bill_number_next", event.target.value)} type="number" min="1" />
              </label>
              <label>
                Receipt prefix
                <input value={settings.receipt_number_prefix || ""} onChange={(event) => updateSettingsField("receipt_number_prefix", event.target.value)} />
              </label>
              <label>
                Next receipt number
                <input value={settings.receipt_number_next || 1} onChange={(event) => updateSettingsField("receipt_number_next", event.target.value)} type="number" min="1" />
              </label>
              <label>
                Number padding
                <input value={settings.number_padding || 6} onChange={(event) => updateSettingsField("number_padding", event.target.value)} type="number" min="3" max="12" />
              </label>
              <button className="primary-button" type="submit" disabled={settingsReviewBusy || Boolean(settingsReview)}>
                <Save size={17} />
                Save settings
              </button>
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            as="form"
            actions={<button className="icon-button" type="button" title="Close open-period panel" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
            className="form-grid billing-period-action"
            icon={<CalendarPlus size={18} />}
            onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
            onSubmit={createPeriod}
            open={activeWorkspaceAction === "period"}
            summary={periodStart}
            title="Open Period"
          >
            <label>
              Month
              <input value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} type="date" required />
            </label>
            <button className="primary-button" type="submit" disabled={periodStartReviewBusy || Boolean(periodStartReview)}>
              <CalendarPlus size={17} />
              Open period
            </button>
          </CollapsibleSection>

          <CollapsibleSection
            key={`penalty-automation:${focusKey === "penalty_candidates" ? "focused" : "default"}`}
            actions={<button className="icon-button" type="button" title="Close penalty review" onClick={() => setActiveWorkspaceAction("")}><X size={16} /></button>}
            className="form-grid billing-penalty-action"
            defaultOpen={focusKey === "penalty_candidates" || Boolean(penaltyPreview)}
            icon={<ReceiptText size={18} />}
            onOpenChange={(open) => !open && setActiveWorkspaceAction("")}
            open={activeWorkspaceAction === "penalty"}
            summary={`${penaltyDate} | ${settings?.penalty_type || "none"}`}
            title="Penalty policy and candidate review"
          >
            <label>
              Application date
              <input value={penaltyDate} onChange={(event) => setPenaltyDate(event.target.value)} type="date" />
            </label>
            <div className="reading-context">
              <div>
                <span>Mode</span>
                <strong>
                  {settings?.penalty_type === "fixed"
                    ? "Fixed amount"
                    : settings?.penalty_type === "percentage"
                      ? "Percentage"
                      : "Disabled"}
                </strong>
              </div>
              <div>
                <span>{settings?.penalty_type === "percentage" ? "Rate" : "Amount"}</span>
                <strong>
                  {settings?.penalty_type === "percentage"
                    ? `${Number(settings?.penalty_value || 0).toLocaleString()}%`
                    : money(settings?.penalty_value)}
                </strong>
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
              onClick={openPenaltyApplicationReview}
              disabled={penaltyBusy || reviewBusy || Boolean(reviewAction) || !penaltyPreview?.summary?.enabled || !penaltyPreview?.summary?.eligible_bills}
            >
              <ReceiptText size={17} />
              Apply previewed penalties
            </button>
          </CollapsibleSection>
        </div>

        <CollapsibleSection
          className="wide-panel"
          defaultOpen
          summary={`${periodTable.filteredRows.length.toLocaleString()} period(s) | ${selectedPeriod?.name || "No period"}`}
          title="Billing Periods"
        >
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
                {periodTable.visibleRows.length ? (
                  periodTable.visibleRows.map((period) => (
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
                        <div className="row-actions">
                          <select
                            value={period.status}
                            onChange={(event) => updateStatus(period, event.target.value)}
                            disabled={Boolean(statusBusyId) || reviewBusy || Boolean(reviewAction)}
                          >
                            <option value="draft">Draft</option>
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                            <option value="locked">Locked</option>
                          </select>
                          <button type="button" onClick={() => loadReadiness(period.id)} disabled={readinessBusy}>
                            <RefreshCw size={16} />
                            Readiness
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow colSpan={8} title="No billing periods found" detail="Create a billing period to begin monthly billing." />
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          className="wide-panel billing-readiness-panel"
          onOpenChange={setReadinessOpen}
          open={readinessOpen}
          summary={readiness ? `${selectedPeriod?.name || "Selected period"} | ${Number(readiness.summary?.blockers || 0).toLocaleString()} blocker(s)` : "Choose a billing period to run the control check"}
          title="Month-End Close Readiness"
        >
          <div className="readiness-panel">
            <div className="panel-heading">
              <div>
                <h3>Month-End Close Readiness</h3>
                <small>{selectedPeriod ? selectedPeriod.name : "Select a billing period"}</small>
              </div>
              {readiness ? (
                <div className="row-actions">
                  <StatusBadge status={currentReadinessStatus} />
                  <button type="button" onClick={() => loadReadiness(readiness.period.id)} disabled={readinessBusy}>
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>
              ) : null}
            </div>
            {readiness ? (
              <>
                <div className="reading-context">
                  <div>
                    <span>Blockers</span>
                    <strong>{Number(readiness.summary?.blockers || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Warnings</span>
                    <strong>{Number(readiness.summary?.warnings || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Active metered</span>
                    <strong>{Number(readiness.summary?.active_metered_customers || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Payable bills</span>
                    <strong>{Number(readiness.summary?.bill_count || 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Billed</span>
                    <strong>{money(readiness.summary?.billed_amount)}</strong>
                  </div>
                  <div>
                    <span>Open balance</span>
                    <strong>{money(readiness.summary?.balance_amount)}</strong>
                  </div>
                </div>
                <div className="readiness-list">
                  {readinessChecks.map((check) => {
                    const status = checkStatus(check);
                    return (
                      <div className="readiness-check" key={check.key}>
                        <div>
                          <StatusBadge status={status} />
                          <strong>{check.label}</strong>
                          <small>{check.detail}</small>
                        </div>
                        <div className="readiness-check-meta">
                          <span>{Number(check.count || 0).toLocaleString()}</span>
                          {check.amount !== null ? <small>{money(check.amount)}</small> : null}
                          {!check.passed && check.page ? (
                            <button type="button" onClick={() => openReadinessTarget(check)}>
                              <ArrowRight size={16} />
                              Open
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <strong>No readiness run yet</strong>
                <span>Choose a billing period and run readiness before closing or locking it.</span>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </section>

      {penaltyPreview?.rows?.length ? (
        <CollapsibleSection
          defaultOpen
          summary={`${penaltyPreview.rows.length.toLocaleString()} eligible bill(s) | ${money(penaltyPreview.summary.total_penalties)}`}
          title="Penalty Preview"
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Due</th>
                  <th>Balance</th>
                  <th>Principal</th>
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
                    <td>{money(row.unpaid_principal)}</td>
                    <td>{money(row.penalty_to_apply)}</td>
                    <td>{row.penalty_eligible_at?.slice(0, 10) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        summary={`${penaltyApplicationTable.filteredRows.length.toLocaleString()} application(s)`}
        title="Penalty Applications"
      >
        <TableControls table={penaltyApplicationTable} label="penalties" placeholder="Search penalties" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Customer</th>
                <th>Month</th>
                <th>Type</th>
                <th>Principal</th>
                <th>Penalty</th>
                <th>Status</th>
                <th>Waiver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {penaltyApplicationTable.visibleRows.map((application) => (
                <tr key={application.id}>
                  <td>
                    <strong>{application.bill_number || `Bill ${application.bill_id}`}</strong>
                    <small>{application.billing_period_name || "-"}</small>
                  </td>
                  <td>
                    {application.customer_name}
                    <small>{application.acc_number}</small>
                  </td>
                  <td>{application.application_month?.slice(0, 10)}</td>
                  <td>
                    {application.penalty_type || "fixed"}
                    {application.penalty_type === "percentage" ? (
                      <small>{Number(application.penalty_value || 0).toLocaleString()}%</small>
                    ) : null}
                  </td>
                  <td>{money(application.principal_amount)}</td>
                  <td>{money(application.amount)}</td>
                  <td>
                    <span className={`status ${application.waived_at ? "status-rejected" : "status-valid"}`}>
                      {application.waived_at ? "waived" : "applied"}
                    </span>
                  </td>
                  <td>
                    {application.waiver_reason || "-"}
                    {application.waived_by_name ? <small>{application.waived_by_name}</small> : null}
                  </td>
                  <td>
                    {!application.waived_at ? (
                      <button type="button" onClick={() => waivePenalty(application)} disabled={reviewBusy}>
                        Waive
                      </button>
                    ) : (
                      <button type="button" onClick={() => reapplyPenalty(application)} disabled={reviewBusy}>
                        Re-apply
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!penaltyApplicationTable.visibleRows.length ? (
                <EmptyTableRow colSpan={9} title="No penalties applied yet" detail="Applied or waived penalties will appear here." />
              ) : null}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <ReviewDialog
        open={Boolean(periodStartReview)}
        eyebrow="Billing cycle start review"
        title="Open billing period"
        description="This opens the selected monthly billing cycle and its operating schedule. It does not generate bills, apply penalties, change customer balances, or send invoices."
        confirmLabel="Open billing period"
        cancelLabel="Keep editing"
        reasonLabel="Cycle-start approval note"
        reasonPlaceholder="State the approved operating month, timing, or reason for opening this billing cycle"
        busy={periodStartReviewBusy}
        busyLabel="Opening billing period..."
        onCancel={closePeriodStartReview}
        onConfirm={confirmPeriodStartReview}
      >
        {periodStartReview ? (
          <div className="reading-context">
            <div><span>Billing month</span><strong>{periodStartReview.name}</strong></div>
            <div><span>Period start</span><strong>{periodStartReview.periodStart}</strong></div>
            <div><span>Bill and close date</span><strong>{periodStartReview.closingDate}</strong></div>
            <div><span>Customer due date</span><strong>{periodStartReview.dueDate}</strong></div>
            <div><span>Opening status</span><strong>Open</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(settingsReview)}
        eyebrow="Billing settings review"
        title="Save billing controls"
        description="This updates rules for future penalties, new customer deposits, and document-number allocation. It does not recalculate issued bills, add penalties, or change posted receipts."
        confirmLabel="Save billing controls"
        cancelLabel="Keep editing"
        reasonLabel="Configuration approval note"
        reasonPlaceholder="State the approved policy, authority, or reason for changing billing controls"
        busy={settingsReviewBusy}
        busyLabel="Saving billing controls..."
        onCancel={closeSettingsReview}
        onConfirm={confirmSettingsReview}
      >
        {settingsReview ? (
          <div className="reading-context">
            <div><span>Penalty policy</span><strong>{settingsReview.penalty_type === "none" ? "Disabled" : `${settingsReview.penalty_type} | ${settingsReview.penalty_value}`}</strong></div>
            <div><span>Grace days</span><strong>{settingsReview.penalty_grace_days}</strong></div>
            <div><span>Deposit requirement</span><strong>{settingsReview.deposit_required ? `Required | ${money(settingsReview.default_deposit_amount)}` : "Not required"}</strong></div>
            <div><span>Bill sequence</span><strong>{settingsReview.bill_number_prefix} | next {settingsReview.bill_number_next}</strong></div>
            <div><span>Receipt sequence</span><strong>{settingsReview.receipt_number_prefix} | next {settingsReview.receipt_number_next}</strong></div>
            <div><span>Number padding</span><strong>{settingsReview.number_padding} digits</strong></div>
          </div>
        ) : null}
      </ReviewDialog>
      <ReviewDialog
        open={Boolean(reviewAction)}
        eyebrow={periodStatusReview ? (hasPeriodBlockers ? "Month-end blocker review" : "Restricted period correction") : "Penalty review"}
        title={reviewTitle}
        description={reviewDescription}
        confirmLabel={
          periodStatusReview
            ? hasPeriodBlockers
              ? `${periodActionLabel} despite blockers`
              : `${periodActionLabel} period`
            : penaltyApplicationReview
              ? "Apply penalties"
            : penaltyReview?.type === "waive-penalty"
              ? "Waive penalty"
              : "Re-apply penalty"
        }
        cancelLabel={periodStatusReview ? "Keep current status" : "Cancel"}
        reasonLabel={
          periodStatusReview
            ? hasPeriodBlockers
              ? "Month-end approval and override note"
              : ["closed", "locked"].includes(periodStatusReview.status)
                ? "Month-end approval note"
                : "Audit reason"
            : penaltyApplicationReview
              ? "Application reason"
            : penaltyReview?.type === "waive-penalty"
              ? "Waiver reason"
              : penaltyReview?.type === "reapply-penalty"
                ? "Re-application reason"
                : "Audit reason"
        }
        reasonPlaceholder={periodStatusReview ? hasPeriodBlockers ? "Record finance approval and why each unresolved blocker is accepted for this close" : ["closed", "locked"].includes(periodStatusReview.status) ? "Record the completed finance review, close evidence, and approving authority" : "Explain why this restricted period status must change" : penaltyApplicationReview ? "Explain why this penalty run is being applied" : "Explain the reason for this penalty adjustment"}
        reasonRequired={periodStatusReview ? periodStatusReview.reasonRequired : true}
        busy={reviewBusy}
        busyLabel={periodStatusReview ? "Updating period..." : penaltyApplicationReview ? "Applying penalties..." : penaltyReview?.type === "waive-penalty" ? "Waiving penalty..." : "Re-applying penalty..."}
        danger={Boolean(periodStatusReview || penaltyReview?.type === "waive-penalty")}
        onCancel={() => !reviewBusy && setReviewAction(null)}
        onConfirm={confirmReviewAction}
      >
        {periodStatusReview?.readiness ? (
          <div className="billing-close-review" aria-label="Billing period close review">
            <div className="billing-close-review-summary">
              <div><span>Payable bills</span><strong>{Number(periodStatusReview.readiness.summary?.bill_count || 0).toLocaleString()}</strong></div>
              <div><span>Billed</span><strong>{money(periodStatusReview.readiness.summary?.billed_amount)}</strong></div>
              <div><span>Open balance</span><strong>{money(periodStatusReview.readiness.summary?.balance_amount)}</strong></div>
              <div><span>Warnings</span><strong>{Number(periodStatusReview.readiness.summary?.warnings || 0).toLocaleString()}</strong></div>
            </div>
            <div className="billing-close-review-checks">
              {periodStatusReview.readiness.checks.filter((check) => !check.passed).map((check) => (
                <div key={check.key}>
                  <StatusBadge status={checkStatus(check)} />
                  <span>{check.label}</span>
                  <strong>{Number(check.count || 0).toLocaleString()}</strong>
                </div>
              ))}
              {!periodStatusReview.readiness.checks.some((check) => !check.passed) ? <p>All recorded close checks are clear.</p> : null}
            </div>
          </div>
        ) : null}
        {penaltyApplicationReview ? (
          <div className="billing-close-review" aria-label="Penalty application review">
            <div className="billing-close-review-summary">
              <div><span>Eligible bills</span><strong>{Number(penaltyApplicationReview.preview.summary.eligible_bills || 0).toLocaleString()}</strong></div>
              <div><span>Total penalties</span><strong>{money(penaltyApplicationReview.preview.summary.total_penalties)}</strong></div>
              <div><span>Penalty month</span><strong>{penaltyApplicationReview.preview.application_month || penaltyApplicationReview.applicationDate.slice(0, 7)}</strong></div>
              <div><span>Mode</span><strong>{penaltyApplicationReview.preview.summary.penalty_type || settings?.penalty_type || "-"}</strong></div>
            </div>
          </div>
        ) : null}
      </ReviewDialog>
    </section>
  );
}

export default BillingSetupPage;
