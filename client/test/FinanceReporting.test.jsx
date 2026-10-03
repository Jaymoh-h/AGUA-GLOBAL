import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ManagementMetricDefinitions from "../src/components/ManagementMetricDefinitions.jsx";
import ManagementPerformanceMetrics from "../src/components/ManagementPerformanceMetrics.jsx";
import ProfitStatement from "../src/components/ProfitStatement.jsx";

afterEach(cleanup);

describe("Finance and management reporting", () => {
  it("discloses metric basis and opens underlying work only on an explicit action", () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(
      <ManagementMetricDefinitions
        metrics={[
          { key: "budget-revenue", label: "Revenue against target", value: "KES 120,000", target: { page: "reports", focus: "budget" } },
          { key: "unknown", label: "Unmapped", value: "-" }
        ]}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText("Revenue against target")).toBeInTheDocument();
    expect(screen.getByText(/approved monthly revenue target/i)).toBeInTheDocument();
    expect(screen.queryByText("Unmapped")).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open underlying work" }));
    expect(onNavigate).toHaveBeenCalledWith({ page: "reports", focus: "budget" });
    fireEvent.click(screen.getByRole("button", { name: "Close metric definitions" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not present missing production data as a zero-variance operating result", () => {
    render(
      <ManagementPerformanceMetrics
        accountantTotals={{ unitsBilled: 1200, approvedPayrollLiability: 0, approvedPayrollRuns: 0, payables: 0, overduePayables: 0 }}
        highPriorityQualityCount={0}
        money={(amount) => `KES ${Number(amount || 0).toLocaleString()}`}
        number={(value) => Number(value || 0).toLocaleString()}
        productionTotals={{ weekCount: 0, consumption: 0 }}
        qualityIssueCount={0}
        totals={{ billed: 50000, collected: 45000, arrears: 5000, openCustomers: 2, maintenanceOverdue: 0, maintenanceUrgent: 0, maintenanceResolutionDays: 2, maintenanceResolved30d: 4 }}
      />
    );

    expect(screen.getByText("Output / billed variance").parentElement).toHaveTextContent("Awaiting data");
    expect(screen.getByText("No completed production week in this period")).toBeInTheDocument();
    expect(screen.getByText("Cash collected").parentElement).toHaveTextContent("90.0% of billed value");
  });

  it("renders finance statements with separate revenue, expenses, and disclosure notes", () => {
    render(
      <ProfitStatement
        money={(amount) => `KES ${Number(amount || 0).toLocaleString()}`}
        onPrint={vi.fn()}
        percent={(value) => `${Math.round(Number(value || 0) * 100)}%`}
        title="Accrual operating position"
        variant="accrual"
        statement={{
          totals: { revenue: 120000, expenses: 45000, net_profit: 75000, margin: 0.625 },
          revenue_lines: [{ label: "Payable billing", amount: 120000, detail: "Issued customer bills" }],
          expense_lines: [{ label: "Electricity", amount: 45000 }],
          notes: [{ label: "Basis", amount: 0, detail: "Accrual view; not cash flow" }]
        }}
      />
    );

    expect(screen.getByText("Accrual operating position")).toBeInTheDocument();
    expect(screen.getByText("Net profit").parentElement).toHaveTextContent("KES 75,000");
    expect(screen.getByText("Accrual view; not cash flow")).toBeInTheDocument();
    expect(screen.getAllByText("Revenue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
  });
});
