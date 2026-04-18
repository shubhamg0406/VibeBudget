import { describe, expect, it } from "vitest";
import { buildBudgetSummary, buildSystemPrompt } from "../../src/server/aiChat";

describe("ai summary builder", () => {
  it("builds a summary and prompt from budget data", () => {
    const now = new Date("2026-04-15T10:00:00.000Z");

    const summary = buildBudgetSummary({
      transactions: [
        {
          date: "2026-04-10",
          vendor: "Costco",
          amount: 120,
          category_id: "1",
          category_name: "Groceries",
          notes: "Weekly shopping",
        },
        {
          date: "2026-04-05",
          vendor: "Safeway",
          amount: 80,
          category_id: "1",
          category_name: "Groceries",
          notes: "Produce",
        },
        {
          date: "2026-03-02",
          vendor: "Landlord",
          amount: 1500,
          category_id: "2",
          category_name: "Rent",
          notes: "March",
        },
      ],
      income: [
        {
          date: "2026-04-01",
          source: "Employer",
          amount: 5000,
          category: "Salary",
        },
      ],
      categories: [
        { name: "Groceries", target_amount: 400 },
        { name: "Rent", target_amount: 1600 },
      ],
    }, now);

    expect(summary.totalIncome).toBe(5000);
    expect(summary.totalExpenses).toBe(1700);
    expect(summary.netBalance).toBe(3300);
    expect(summary.topVendors[0]).toEqual({ vendor: "Landlord", total: 1500 });
    expect(summary.categoryPerformance.find((item) => item.name === "Groceries")).toEqual({
      name: "Groceries",
      spent: 200,
      target: 400,
      pct: 50,
    });

    const prompt = buildSystemPrompt(summary, now);

    expect(prompt).toContain("Today's date is 2026-04-15.");
    expect(prompt).toContain("Total Income: $5,000.00");
    expect(prompt).toContain("- Groceries: spent $200.00 of $400.00 target (50%)");
    expect(prompt).toContain("2026-04-10 | Costco | $120.00 | Groceries | Weekly shopping");
    expect(prompt).toContain("2026-04-01 | Employer | $5,000.00 | Salary");
  });
});
