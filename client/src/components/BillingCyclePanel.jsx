import { ArrowRight, CalendarDays, FileCheck2, Gauge, LockKeyhole, ReceiptText, RefreshCw, Send } from "lucide-react";
import StatusBadge from "./StatusBadge";

const number = (value) => Number(value || 0);
const money = (value) => `KES ${number(value).toLocaleString()}`;
const percentage = (value) => `${Math.round(number(value) * 100)}%`;

const findCheck = (checks, key) => checks.find((check) => check.key === key) || { count: 0, passed: true };

function BillingCyclePanel({
  periods,
  readiness,
  readinessBusy,
  selectedPeriod,
  settings,
  penaltyDate,
  penaltyPreview,
  onNavigate,
  onOpenStage,
  onRefresh,
  onSelectPeriod,
  onUpdateStatus
}) {
  const checks = readiness?.checks || [];
  const summary = readiness?.summary || {};
  const activeMeteredCustomers = number(summary.active_metered_customers);
  const readingCompletionRate = number(summary.reading_completion_rate);
  const readingCompletionTarget = number(summary.reading_completion_recommendation_threshold || 0.95);
  const readingCompletionTargetMet = typeof summary.reading_completion_recommendation_met === "boolean"
    ? summary.reading_completion_recommendation_met
    : readingCompletionRate >= readingCompletionTarget;
  const missingReadings = findCheck(checks, "missing_readings");
  const readingsWithoutBills = findCheck(checks, "readings_without_bills");
  const pendingSourceBilling = findCheck(checks, "pending_source_billing");
  const heldBills = findCheck(checks, "held_bills");
  const deliveryExceptions = findCheck(checks, "delivery_exceptions");
  const noPeriodBills = findCheck(checks, "no_period_bills");
  const suspensePayments = findCheck(checks, "suspense_payments");
  const pendingAdjustments = findCheck(checks, "pending_adjustments");
  const penaltiesEnabled = ["fixed", "percentage"].includes(settings?.penalty_type) && number(settings?.penalty_value) > 0;
  const penaltyPreviewLoaded = Boolean(penaltyPreview);
  const eligiblePenaltyBills = number(penaltyPreview?.summary?.eligible_bills);
  const totalCandidatePenalties = number(penaltyPreview?.summary?.total_penalties);
  const periodStatus = selectedPeriod?.status || "draft";
  const restrictedPeriod = ["closed", "locked"].includes(periodStatus);
  const completedReadings = Math.max(activeMeteredCustomers - number(missingReadings.count), 0);
  const exceptionCount = number(pendingSourceBilling.count) + number(readingsWithoutBills.count);
  const closeControlCount = number(summary.blockers);
  const closeStatus = ["closed", "locked"].includes(periodStatus)
    ? "resolved"
    : number(summary.blockers) > 0
      ? "critical"
      : number(summary.warnings) > 0
        ? "review"
        : "ready";

  if (!selectedPeriod) {
    return (
      <section className="panel billing-cycle-panel" aria-labelledby="billing-cycle-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Monthly workflow</p>
            <h3 id="billing-cycle-title">Billing Cycle</h3>
          </div>
        </div>
        <div className="empty-state">
          <strong>Open a billing period to begin</strong>
          <span>The period setup form below creates the monthly window for readings, bills, and close controls.</span>
        </div>
      </section>
    );
  }

  if (!readiness) {
    return (
      <section className="panel billing-cycle-panel" aria-labelledby="billing-cycle-title">
        <header className="billing-cycle-header">
          <div>
            <p className="eyebrow">Monthly workflow</p>
            <h3 id="billing-cycle-title">Billing Cycle</h3>
            <small>{selectedPeriod.name}</small>
          </div>
          <button className="icon-button" type="button" title="Load billing cycle readiness" onClick={onRefresh} disabled={readinessBusy}>
            <RefreshCw size={16} />
          </button>
        </header>
        <div className="empty-state">
          <strong>Loading period readiness</strong>
          <span>Current readings, bills, delivery exceptions, and month-end checks will appear here.</span>
        </div>
      </section>
    );
  }

  const steps = [
    {
      key: "period",
      label: "Period setup",
      detail: `${selectedPeriod.period_start?.slice(0, 10)} to ${selectedPeriod.period_end?.slice(0, 10)}`,
      owner: "Finance control",
      progress: periodStatus === "open" ? "Window open" : periodStatus === "draft" ? "Awaiting activation" : "Finalized",
      gate: periodStatus === "open" ? "The operating window is active." : `Period is ${periodStatus}; restricted controls apply when it is finalized.`,
      status: periodStatus === "open" ? "ready" : ["closed", "locked"].includes(periodStatus) ? "resolved" : "review",
      icon: CalendarDays
    },
    {
      key: "readings",
      label: "Capture readings",
      detail: restrictedPeriod
        ? "This restricted period is available for review; permitted corrections require the existing audit controls."
        : number(missingReadings.count)
        ? `${number(missingReadings.count).toLocaleString()} active meter(s) still need a reading. The ${percentage(readingCompletionTarget)} bill-preparation target is ${readingCompletionTargetMet ? "met" : "not yet met"}.`
        : `All active metered customers have a period reading. The ${percentage(readingCompletionTarget)} bill-preparation target is met.`,
      owner: "Field operations",
      progress: `${completedReadings.toLocaleString()} / ${activeMeteredCustomers.toLocaleString()} accounts`,
      gate: number(missingReadings.count)
        ? `${number(missingReadings.count).toLocaleString()} required reading(s) remain before bill preparation.`
        : "All active metered accounts have a period reading.",
      status: number(missingReadings.count) ? "critical" : "ready",
      icon: Gauge,
      action: restrictedPeriod ? null : { label: number(missingReadings.count) ? "Enter readings" : "Review readings", page: "readings", focus: "missing_readings" }
    },
    {
      key: "exceptions",
      label: "Validate and prepare",
      detail: number(pendingSourceBilling.count)
        ? `${number(pendingSourceBilling.count).toLocaleString()} source billing review(s) are pending.`
        : number(readingsWithoutBills.count)
          ? `${number(readingsWithoutBills.count).toLocaleString()} reading(s) do not have a bill.`
          : "No unresolved reading or source-billing exceptions.",
      owner: "Billing review",
      progress: exceptionCount ? `${exceptionCount.toLocaleString()} review item(s)` : "Evidence clear",
      gate: exceptionCount
        ? `${number(pendingSourceBilling.count).toLocaleString()} source review(s) and ${number(readingsWithoutBills.count).toLocaleString()} unbilled reading(s) need resolution.`
        : "Reading and source-billing evidence is ready for release.",
      status: exceptionCount ? "critical" : "ready",
      icon: FileCheck2,
      action: restrictedPeriod ? null : {
        label: "Open stage review",
        stage: "validation"
      }
    },
    {
      key: "bills",
      label: "Approve and release bills",
      detail: number(heldBills.count)
        ? `${number(heldBills.count).toLocaleString()} bill(s) remain held before they become payable.`
        : number(summary.bill_count)
          ? "Payable bills are available for customer delivery and collections."
          : "Generate bills from eligible readings before closing the period.",
      owner: "Revenue office",
      progress: `${number(summary.bill_count).toLocaleString()} payable bill(s)`,
      gate: number(heldBills.count)
        ? `${number(heldBills.count).toLocaleString()} held bill(s) require a release decision.`
        : number(noPeriodBills.count)
          ? "No payable bills are available for this active period."
          : "Payable bills are released to customer accounts.",
      status: number(heldBills.count) || number(noPeriodBills.count) ? "critical" : "ready",
      icon: FileCheck2,
      action: { label: number(heldBills.count) ? "Review held bills" : "Open bills", page: "bills", focus: number(heldBills.count) ? "held_bills" : "" }
    },
    {
      key: "delivery",
      label: "Invoice delivery",
      detail: number(deliveryExceptions.count)
        ? `${number(deliveryExceptions.count).toLocaleString()} bill delivery result(s) need attention.`
        : "No failed or skipped bill deliveries were found for this period.",
      owner: "Customer communications",
      progress: number(deliveryExceptions.count) ? `${number(deliveryExceptions.count).toLocaleString()} recovery item(s)` : "No exceptions",
      gate: number(deliveryExceptions.count)
        ? "Delivery recovery is reviewed deliberately; no automatic resend occurs."
        : "No failed or skipped bill delivery is recorded for this period.",
      status: number(deliveryExceptions.count) ? "review" : "ready",
      icon: Send,
      action: { label: number(deliveryExceptions.count) ? "Resolve delivery" : "Review delivery", stage: "delivery" }
    },
    {
      key: "penalties",
      label: "Review arrears penalties",
      detail: !penaltiesEnabled
        ? "The arrears penalty policy is disabled. No candidate run can be prepared."
        : penaltyPreviewLoaded
          ? eligiblePenaltyBills
            ? `${eligiblePenaltyBills.toLocaleString()} overdue bill(s) are candidates for ${money(totalCandidatePenalties)} in penalties.`
            : "No overdue bills are currently eligible under the configured policy."
          : `The ${settings.penalty_type} penalty policy is active. Load candidates before a separate application review.`,
      owner: "Collections control",
      progress: !penaltiesEnabled
        ? "Policy disabled"
        : penaltyPreviewLoaded
          ? eligiblePenaltyBills
            ? `${eligiblePenaltyBills.toLocaleString()} candidate(s) | ${money(totalCandidatePenalties)}`
            : "No candidates"
          : "Candidate review due",
      gate: !penaltiesEnabled
        ? "No penalty application is available while this policy remains disabled."
        : penaltyPreviewLoaded
          ? eligiblePenaltyBills
            ? "Candidates remain review-only until a separate, reasoned application decision is confirmed."
            : "No action is required unless a later review produces eligible bills."
          : "Previewing candidates is read-only and never applies a penalty by itself.",
      status: !penaltiesEnabled ? "resolved" : penaltyPreviewLoaded && !eligiblePenaltyBills ? "ready" : "review",
      icon: ReceiptText,
      action: penaltiesEnabled
        ? {
            label: penaltyPreviewLoaded ? "Open candidates" : "Review candidates",
            onClick: () => onNavigate?.({
              page: "billing",
              focus: "penalty_candidates",
              application_date: penaltyDate,
              label: "Arrears penalty review"
            })
          }
        : null
    },
    {
      key: "close",
      label: periodStatus === "locked" ? "Period locked" : periodStatus === "closed" ? "Lock period" : "Close period",
      detail: ["closed", "locked"].includes(periodStatus)
        ? `This period is ${periodStatus}. Restricted corrections retain their audit requirement.`
        : number(summary.blockers)
          ? `${number(summary.blockers).toLocaleString()} month-end blocker(s) must be reviewed before close.`
          : number(summary.warnings)
            ? `${number(summary.warnings).toLocaleString()} warning(s) remain for finance review.`
            : "Readiness checks are clear. Close when the billing cycle is final.",
      owner: "Finance approval",
      progress: restrictedPeriod ? `Period ${periodStatus}` : closeControlCount ? `${closeControlCount.toLocaleString()} blocker(s)` : "Ready for approval",
      gate: restrictedPeriod
        ? "Finalized periods retain audit controls for corrections."
        : closeControlCount
          ? `${number(suspensePayments.count).toLocaleString()} suspense item(s) and ${number(pendingAdjustments.count).toLocaleString()} pending adjustment(s) are included in close readiness.`
          : "All blocking close checks are clear; finance approval is still explicit.",
      status: closeStatus,
      icon: LockKeyhole,
      action: ["closed", "locked"].includes(periodStatus)
        ? null
        : {
            label: closeStatus === "ready" ? "Close period" : "Review readiness",
            onClick: closeStatus === "ready" ? () => onUpdateStatus(selectedPeriod, "closed") : onRefresh
          }
    }
  ];
  const closeStep = steps.find((step) => step.key === "close");
  const nextStep = steps.find((step) => step.status === "critical" || step.status === "review") || (closeStep?.action ? closeStep : steps.find((step) => step.action));
  const runAction = (step) => () => {
    if (step.action?.onClick) return step.action.onClick();
    if (step.action?.stage) return onOpenStage?.(step.action.stage);
    return onNavigate?.({
      page: step.action?.page,
      focus: step.action?.focus,
      label: step.label,
      period_start: selectedPeriod.period_start?.slice(0, 10),
      period_end: selectedPeriod.period_end?.slice(0, 10)
    });
  };

  return (
    <section className="panel billing-cycle-panel billing-control-board" aria-labelledby="billing-cycle-title">
      <header className="billing-cycle-header">
        <div>
          <p className="eyebrow">Period control</p>
          <h3 id="billing-cycle-title">{selectedPeriod.name}</h3>
          <small>{nextStep ? `Next decision: ${nextStep.label}` : "All operational stages are clear."}</small>
        </div>
        <div className="row-actions">
          <label className="sr-only" htmlFor="billing-cycle-period">Billing period</label>
          <select
            id="billing-cycle-period"
            aria-label="Billing cycle period"
            value={selectedPeriod.id}
            onChange={(event) => onSelectPeriod(event.target.value)}
            disabled={readinessBusy}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>{period.name} ({period.status})</option>
            ))}
          </select>
          <button className="icon-button" type="button" title="Refresh billing cycle" onClick={onRefresh} disabled={readinessBusy}>
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      <div className="billing-cycle-snapshot" aria-label="Selected billing period snapshot">
        <div><span>Period state</span><strong>{periodStatus}</strong></div>
        <div><span>Reading completion</span><strong>{percentage(readingCompletionRate)}</strong></div>
        <div><span>Bills issued</span><strong>{number(summary.bill_count).toLocaleString()}</strong></div>
        <div><span>Blockers</span><strong>{number(summary.blockers).toLocaleString()}</strong></div>
        <div><span>Warnings</span><strong>{number(summary.warnings).toLocaleString()}</strong></div>
        <div><span>Open balance</span><strong>{money(summary.balance_amount)}</strong></div>
      </div>
      <div className="billing-cycle-next-action" aria-label="Next billing cycle action">
        <div>
          <span>Next required action</span>
          <strong>{nextStep ? nextStep.label : "Cycle checks are clear"}</strong>
          <small>{nextStep?.gate || "The selected period has no remaining operational gate."}</small>
        </div>
        {nextStep?.action ? <button type="button" onClick={runAction(nextStep)}>{nextStep.action.label}<ArrowRight size={16} /></button> : null}
      </div>
      <ol className="billing-cycle-steps" aria-label="Billing cycle progress">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li className={`billing-cycle-step${nextStep?.key === step.key ? " is-next" : ""}`} key={step.key}>
              <div className="billing-cycle-stage-marker" aria-hidden="true">
                <span>{index + 1}</span>
                <Icon size={17} />
              </div>
              <div className="billing-cycle-stage-detail">
                <small>{step.owner}</small>
                <strong>{step.label}</strong>
                <p>{step.detail}</p>
              </div>
              <div className="billing-cycle-stage-progress">
                <span>Completion</span>
                <strong>{step.progress}</strong>
              </div>
              <div className="billing-cycle-stage-gate">
                <span>Gate</span>
                <StatusBadge status={step.status} />
                <small>{step.gate}</small>
              </div>
              <div className="billing-cycle-stage-action">
                {step.action ? (
                  <button type="button" onClick={runAction(step)}>
                    {step.action.label}
                    <ArrowRight size={16} />
                  </button>
                ) : <small>Review only</small>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default BillingCyclePanel;
