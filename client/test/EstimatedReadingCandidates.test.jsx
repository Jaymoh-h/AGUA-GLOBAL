import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EstimatedReadingCandidates from "../src/components/EstimatedReadingCandidates.jsx";
import { api } from "../src/services/api.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Estimated reading automation boundary", () => {
  it("loads a suggestion into deliberate review without creating a reading or bill", async () => {
    const candidate = {
      acc_number: "AG-0042",
      average_units: 36,
      customer_name: "Kijani School",
      last_reading_date: "2026-08-31",
      last_reading_value: 740,
      meter_id: 42,
      meter_number: "MTR-0042",
      suggested_reading_value: 776
    };
    const onReview = vi.fn();
    vi.spyOn(api.readings, "estimationCandidates").mockResolvedValue({ baseline_intervals: 3, period: {}, rows: [candidate] });
    const createReading = vi.spyOn(api.readings, "create");

    render(<EstimatedReadingCandidates defaultOpen onReview={onReview} periodStart="2026-09-01" />);

    expect(await screen.findByText("Kijani School")).toBeInTheDocument();
    expect(screen.getByText(/suggestions never create a reading or bill automatically/i)).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    expect(createReading).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review suggestion" }));
    expect(onReview).toHaveBeenCalledWith(candidate);
    expect(createReading).not.toHaveBeenCalled();
  });
});
