import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CollectionsRecoveryQueue from "../src/components/CollectionsRecoveryQueue.jsx";

afterEach(cleanup);

describe("Collections recovery queue", () => {
  it("surfaces delivery and held-suspense evidence without making a financial action", () => {
    const onNavigate = vi.fn();
    render(
      <CollectionsRecoveryQueue
        deliveryPayload={{
          summary: { exception_count: 2, failed_count: 1, skipped_count: 1 },
          rows: [{ id: 11, customer_id: 21, customer_name: "Green Valley School", acc_number: "AG-0001", channel: "sms", status: "failed", error_message: "Phone number unavailable" }]
        }}
        suspenseItems={[
          { id: 31, status: "held", customer_id: 22, customer_name: "Kijani Apartments", acc_number: "AG-0002", payment_date: "2026-09-20", amount: 350 },
          { id: 32, status: "resolved", customer_id: 23, customer_name: "Resolved account", amount: 999 }
        ]}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText("Delivery failures").parentElement.parentElement).toHaveTextContent("2");
    expect(screen.getByText("Held suspense").parentElement.parentElement).toHaveTextContent("1");
    expect(screen.getByText("KES 350 is awaiting a documented reapplication or discard decision.")).toBeInTheDocument();
    expect(screen.queryByText("Resolved account")).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Green Valley School/ }));
    expect(onNavigate).toHaveBeenLastCalledWith({ page: "customers", focus: "customer_360", customer_id: 21, label: "Delivery contact recovery" });

    fireEvent.click(screen.getByRole("button", { name: "Open suspense resolution" }));
    expect(onNavigate).toHaveBeenLastCalledWith({ page: "payments", focus: "suspense_payments", label: "Suspense resolution" });
  });

  it("shows explicit empty states when recovery review has no outstanding evidence", () => {
    render(<CollectionsRecoveryQueue deliveryPayload={{ summary: {} }} suspenseItems={[]} onNavigate={vi.fn()} />);

    expect(screen.getByText("No delivery failures are waiting.")).toBeInTheDocument();
    expect(screen.getByText("No held suspense is waiting.")).toBeInTheDocument();
  });
});
