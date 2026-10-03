import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReadingAnomalyQueue from "../src/components/ReadingAnomalyQueue.jsx";
import ReadingEntryForm from "../src/components/ReadingEntryForm.jsx";
import ToastProvider from "../src/components/ToastProvider.jsx";
import { api } from "../src/services/api.js";

const customer = { id: 1, acc_number: "AG-0001", name: "Green Valley School", active_meter_id: 10, active_meter_number: "MTR-100", active_meter_count: 1 };
const readingContext = {
  activeMeter: { id: 10, meter_number: "MTR-100", meter_role: "client_billing" },
  availableMeters: [],
  previousReading: { reading_value: 100, reading_date: "2026-08-31" },
  billingPeriod: { name: "September 2026", status: "open", dueDate: "2026-10-31" }
};

function ReadingFormHarness({ editingId, readingReviewContext, restrictedReadingPeriod = false, onSubmit = vi.fn() }) {
  const [form, setForm] = useState({
    customer_id: "1",
    meter_id: "10",
    reading_value: "150",
    reading_date: "2026-09-30",
    notes: "",
    fallback_reason: "",
    correction_reason: ""
  });

  return (
    <ToastProvider>
      <ReadingEntryForm
      cancelEdit={vi.fn()}
      editingId={editingId}
      form={form}
      meterRoleLabels={{ client_billing: "Client billing" }}
      onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onCustomerChange={vi.fn()}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      readingContext={readingContext}
      readingCustomerOptions={[customer]}
      readingEligibility={{ period: { name: "September 2026", periodEnd: "2026-09-30" } }}
      readingReviewContext={readingReviewContext}
        restrictedReadingPeriod={restrictedReadingPeriod}
      />
    </ToastProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Meter-reading review safeguards", () => {
  it("keeps anomaly rows read-only until an operator explicitly opens a review", async () => {
    const anomaly = {
      id: 91,
      customer_name: "Green Valley School",
      acc_number: "AG-0001",
      meter_number: "MTR-100",
      reading_date: "2026-09-30",
      units_used: 80,
      average_units: 40,
      variance_ratio: 1,
      direction: "above_average"
    };
    const onReview = vi.fn();
    const anomalies = vi.spyOn(api.readings, "anomalies").mockResolvedValue({ rows: [anomaly], threshold: 0.5, baseline_intervals: 3 });

    render(<ReadingAnomalyQueue defaultOpen onReview={onReview} periodStart="2026-09-01" />);

    expect(await screen.findByText("Green Valley School")).toBeInTheDocument();
    expect(anomalies).toHaveBeenCalledWith("2026-09-01");
    expect(onReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review reading" }));
    expect(onReview).toHaveBeenCalledWith(anomaly);
  });

  it("requires a field-verification note before an estimated reading can be submitted", () => {
    const onSubmit = vi.fn();
    render(
      <ReadingFormHarness
        onSubmit={onSubmit}
        readingReviewContext={{ type: "estimate", intervalCount: 3, averageUnits: 40 }}
      />
    );

    const note = screen.getByRole("textbox", { name: "Field verification note" });
    expect(note).toBeRequired();
    expect(screen.getByText("Estimated-reading suggestion loaded")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit reading" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: "Verified at the meter during route visit." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit reading" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notes: "Verified at the meter during route visit." }));
  });

  it("requires an anomaly review note before a reviewed reading correction can be saved", () => {
    const onSubmit = vi.fn();
    render(
      <ReadingFormHarness
        editingId={91}
        onSubmit={onSubmit}
        readingReviewContext={{ type: "anomaly", unitsUsed: 80, averageUnits: 40, varianceRatio: 1, direction: "above_average" }}
      />
    );

    const note = screen.getByRole("textbox", { name: "Anomaly review note" });
    expect(note).toBeRequired();
    expect(screen.getByText("Consumption anomaly under review")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save reading" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: "Field image confirms the irrigation increase." } });
    fireEvent.click(screen.getByRole("button", { name: "Save reading" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ correction_reason: "Field image confirms the irrigation increase." }));
  });
});
