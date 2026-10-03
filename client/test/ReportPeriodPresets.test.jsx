import { describe, expect, it } from "vitest";
import { filtersForReportPeriod, lastConcludedMonth } from "../src/utils/reportPeriodPresets.js";

describe("report period defaults", () => {
  it("keeps monthly reporting anchored to the most recently concluded calendar month", () => {
    const period = lastConcludedMonth(new Date(2026, 9, 3));

    expect(period).toEqual({ key: "2026-09", start_date: "2026-09-01", end_date: "2026-09-30" });
    expect(filtersForReportPeriod("previous_month", new Date(2026, 9, 3))).toEqual({
      start_date: "2026-09-01",
      end_date: "2026-09-30"
    });
  });

  it("retains month-to-date as an explicit live operational choice", () => {
    expect(filtersForReportPeriod("month_to_date", new Date(2026, 9, 3))).toEqual({
      start_date: "2026-10-01",
      end_date: "2026-10-03"
    });
  });
});
