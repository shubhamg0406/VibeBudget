import { describe, expect, it } from "vitest";
import { computeUpcoming, materializeRule } from "../../src/utils/recurring";
import type { RecurringRule } from "../../src/types";

const makeRule = (overrides: Partial<RecurringRule> = {}): RecurringRule => ({
  id: "rule-1",
  uid: "user-1",
  type: "expense",
  amount: 100,
  vendor: "Netflix",
  day_of_month: 31,
  frequency: "monthly",
  start_date: "2026-01-01",
  last_generated_month: "2026-01",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("recurring utilities", () => {
  it("materializeRule catches up missed months and clamps month-end dates", () => {
    const rule = makeRule({
      day_of_month: 31,
      last_generated_month: "2026-01",
    });
    const results = materializeRule(rule, "2026-04-30");
    expect(results.map((item) => item.dueDate)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("materializeRule skips occurrences after end_date", () => {
    const rule = makeRule({
      day_of_month: 15,
      last_generated_month: "2026-01",
      end_date: "2026-03-10",
    });
    const results = materializeRule(rule, "2026-04-30");
    expect(results.map((item) => item.dueDate)).toEqual(["2026-02-15"]);
  });

  it("computeUpcoming returns projected entries in requested range", () => {
    const rules: RecurringRule[] = [
      makeRule({ id: "rent", vendor: "Rent", day_of_month: 1, amount: 2100 }),
      makeRule({ id: "pay", type: "income", source: "Salary", category: "Job", day_of_month: 15, amount: 5000 }),
    ];
    const upcoming = computeUpcoming(rules, "2026-04-10", 30);
    expect(upcoming).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule_id: "pay", projected_date: "2026-04-15", type: "income", amount: 5000 }),
      expect.objectContaining({ rule_id: "rent", projected_date: "2026-05-01", type: "expense", amount: 2100 }),
    ]));
  });
});
