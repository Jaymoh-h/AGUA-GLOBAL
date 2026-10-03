import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillingCyclePanel from "../src/components/BillingCyclePanel.jsx";

const selectedPeriod = {
  id: 7,
  name: "September 2026",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  status: "open"
};

const clearChecks = [
  "missing_readings",
  "readings_without_bills",
  "pending_source_billing",
  "held_bills",
  "delivery_exceptions",
  "no_period_bills",
  "suspense_payments",
  "pending_adjustments"
].map((key) => ({ key, count: 0, passed: true }));

function renderCycle({ period = selectedPeriod, readiness, onNavigate = vi.fn(), onUpdateStatus = vi.fn(), penaltyPreview = null, settings = { penalty_type: "none", penalty_value: 0 } }) {
  render(
    <BillingCyclePanel
      periods={[period]}
      readiness={readiness}
      readinessBusy={false}
      selectedPeriod={period}
      settings={settings}
      penaltyDate="2026-09-30"
      penaltyPreview={penaltyPreview}
      onNavigate={onNavigate}
      onOpenStage={vi.fn()}
      onRefresh={vi.fn()}
      onSelectPeriod={vi.fn()}
      onUpdateStatus={onUpdateStatus}
    />
  );
  return { onNavigate, onUpdateStatus };
}

afterEach(cleanup);

describe("Billing cycle control", () => {
  it("routes an incomplete reading gate to field operations before billing release", () => {
    const { onNavigate } = renderCycle({
      readiness: {
        summary: { active_metered_customers: 10, blockers: 2, warnings: 0, bill_count: 0, balance_amount: 0, reading_completion_rate: 0.8 },
        checks: clearChecks.map((check) => check.key === "missing_readings" ? { ...check, count: 2, passed: false, level: "block" } : check)
      }
    });

    const nextAction = screen.getByLabelText("Next billing cycle action");
    expect(nextAction).toHaveTextContent("Capture readings");
    expect(nextAction).toHaveTextContent("2 required reading(s) remain before bill preparation.");

    fireEvent.click(within(nextAction).getByRole("button", { name: "Enter readings" }));
    expect(onNavigate).toHaveBeenCalledWith({
      page: "readings",
      focus: "missing_readings",
      label: "Capture readings",
      period_start: "2026-09-01",
      period_end: "2026-09-30"
    });
  });

  it("offers a clean period for explicit finance close without closing it automatically", () => {
    const onUpdateStatus = vi.fn();
    renderCycle({
      onUpdateStatus,
      readiness: {
        summary: { active_metered_customers: 10, blockers: 0, warnings: 0, bill_count: 10, balance_amount: 4500, reading_completion_rate: 1 },
        checks: clearChecks
      }
    });

    const nextAction = screen.getByLabelText("Next billing cycle action");
    expect(nextAction).toHaveTextContent("Close period");
    expect(onUpdateStatus).not.toHaveBeenCalled();

    fireEvent.click(within(nextAction).getByRole("button", { name: "Close period" }));
    expect(onUpdateStatus).toHaveBeenCalledWith(selectedPeriod, "closed");
  });

  it("marks a locked period as review-only and removes the close control", () => {
    renderCycle({
      period: { ...selectedPeriod, status: "locked" },
      readiness: {
        summary: { active_metered_customers: 10, blockers: 0, warnings: 0, bill_count: 10, balance_amount: 4500, reading_completion_rate: 1 },
        checks: clearChecks
      }
    });

    expect(screen.getByLabelText("Selected billing period snapshot")).toHaveTextContent("Period statelocked");
    expect(screen.getAllByText("Period locked").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Close period" })).not.toBeInTheDocument();
  });

  it("keeps arrears penalty candidates read-only until finance deliberately opens their review", () => {
    const onNavigate = vi.fn();
    const onUpdateStatus = vi.fn();
    renderCycle({
      onNavigate,
      onUpdateStatus,
      readiness: {
        summary: { active_metered_customers: 10, blockers: 0, warnings: 0, bill_count: 10, balance_amount: 4500, reading_completion_rate: 1 },
        checks: clearChecks
      },
      settings: { penalty_type: "percentage", penalty_value: 5 }
    });

    const nextAction = screen.getByLabelText("Next billing cycle action");
    expect(nextAction).toHaveTextContent("Review arrears penalties");
    expect(nextAction).toHaveTextContent("Previewing candidates is read-only and never applies a penalty by itself.");
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onUpdateStatus).not.toHaveBeenCalled();

    fireEvent.click(within(nextAction).getByRole("button", { name: "Review candidates" }));
    expect(onNavigate).toHaveBeenCalledWith({
      page: "billing",
      focus: "penalty_candidates",
      application_date: "2026-09-30",
      label: "Arrears penalty review"
    });
    expect(onUpdateStatus).not.toHaveBeenCalled();
  });
});
