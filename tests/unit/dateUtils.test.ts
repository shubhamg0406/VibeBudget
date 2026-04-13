import { describe, expect, it } from "vitest";
import {
  compareDateStrings,
  formatDisplayDate,
  getMonthCountForDateRangeOption,
  getMonthYearLabel,
  getPresetDateRange,
  isDateInRange,
  normalizeDateString,
  resolveDateRange,
} from "../../src/utils/dateUtils";

describe("dateUtils", () => {
  it("normalizes US-style dates into YYYY-MM-DD", () => {
    expect(normalizeDateString("4/9/26")).toBe("2026-04-09");
    expect(normalizeDateString("2026-4-9")).toBe("2026-04-09");
  });

  it("supports day-first values when month-first is impossible", () => {
    expect(normalizeDateString("31/03/2026")).toBe("2026-03-31");
    expect(normalizeDateString("13/04/2026")).toBe("2026-04-13");
  });

  it("normalizes month-name date formats from Google Sheets", () => {
    expect(normalizeDateString("1-Apr-2024")).toBe("2024-04-01");
    expect(normalizeDateString("3-Apr-24")).toBe("2024-04-03");
  });

  it("normalizes Google Sheets serial dates", () => {
    expect(normalizeDateString("46000")).toBe("2025-12-09");
    expect(normalizeDateString("46000.9")).toBe("2025-12-09");
  });

  it("rejects impossible calendar dates", () => {
    expect(normalizeDateString("2026-15-04")).toBe("");
    expect(normalizeDateString("04/31/2026")).toBe("");
    expect(normalizeDateString("2026")).toBe("");
  });

  it("builds preset ranges from a reference date", () => {
    const range = getPresetDateRange("last-3-months", new Date("2026-04-10T12:00:00"));
    expect(range).toEqual({
      start: "2026-02-01",
      end: "2026-04-10",
      option: "last-3-months",
    });
  });

  it("resolves live presets but preserves custom ranges", () => {
    expect(resolveDateRange({ start: "2026-04-01", end: "2026-04-30", option: "custom" })).toEqual({
      start: "2026-04-01",
      end: "2026-04-30",
      option: "custom",
    });
  });

  it("matches inclusive date boundaries", () => {
    expect(isDateInRange("2026-04-10", "2026-04-01", "2026-04-10")).toBe(true);
    expect(isDateInRange("2026-04-11", "2026-04-01", "2026-04-10")).toBe(false);
    expect(compareDateStrings("2026-04-10", "2026-04-09")).toBeGreaterThan(0);
  });

  it("returns month counts for preset ranges", () => {
    expect(getMonthCountForDateRangeOption("last-6-months")).toBe(6);
    expect(getMonthCountForDateRangeOption("custom")).toBeNull();
  });

  it("falls back safely for invalid display dates", () => {
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
    expect(getMonthYearLabel("not-a-date")).toBe("Unknown Date");
  });
});
