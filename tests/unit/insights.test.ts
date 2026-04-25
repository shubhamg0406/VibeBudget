import { describe, expect, it } from "vitest";
import { generateDashboardInsights } from "../../src/utils/insights";

describe("dashboard insights", () => {
  it("returns one readable insight per pillar", () => {
    const insights = generateDashboardInsights({
      transactions: [
        {
          id: "t1",
          date: "2026-04-10",
          vendor: "Costco",
          amount: 220,
          currency: "CAD",
          category_id: "groceries",
          category_name: "Groceries",
          notes: "",
        },
        {
          id: "t2",
          date: "2026-04-11",
          vendor: "Landlord",
          amount: 1500,
          currency: "CAD",
          category_id: "rent",
          category_name: "Rent",
          notes: "",
          recurring_rule_id: "rule-rent",
          is_recurring_instance: true,
        },
      ],
      allTransactions: [
        {
          id: "t1",
          date: "2026-04-10",
          vendor: "Costco",
          amount: 220,
          currency: "CAD",
          category_id: "groceries",
          category_name: "Groceries",
          notes: "",
        },
        {
          id: "t2",
          date: "2026-04-11",
          vendor: "Landlord",
          amount: 1500,
          currency: "CAD",
          category_id: "rent",
          category_name: "Rent",
          notes: "",
          recurring_rule_id: "rule-rent",
          is_recurring_instance: true,
        },
      ],
      income: [
        {
          id: "i1",
          date: "2026-04-01",
          source: "Employer",
          amount: 5000,
          currency: "CAD",
          category: "Salary",
          notes: "",
        },
        {
          id: "i2",
          date: "2026-04-08",
          source: "Freelance",
          amount: 400,
          currency: "CAD",
          category: "Side",
          notes: "",
        },
      ],
      previousTransactions: [
        {
          id: "pt1",
          date: "2026-03-12",
          vendor: "Costco",
          amount: 180,
          currency: "CAD",
          category_id: "groceries",
          category_name: "Groceries",
          notes: "",
        },
      ],
      previousIncome: [
        {
          id: "pi1",
          date: "2026-03-01",
          source: "Employer",
          amount: 4800,
          currency: "CAD",
          category: "Salary",
          notes: "",
        },
      ],
      expenseCategories: [
        { id: "groceries", name: "Groceries", target_amount: 600 },
        { id: "rent", name: "Rent", target_amount: 1600 },
      ],
      upcomingRecurring: [
        { rule_id: "rule-rent", projected_date: "2026-05-01", type: "expense", amount: 1500, vendor: "Landlord" },
      ],
      monthMultiplier: 1,
      baseCurrency: "CAD",
      exchangeRates: [],
    });

    expect(insights).toHaveLength(6);
    expect(insights.map((item) => item.pillar)).toEqual([
      "spending-analysis",
      "income-tracking",
      "budget-health",
      "trends-forecasting",
      "goals-milestones",
      "smart-alerts",
    ]);
    expect(insights[0].tiles.map((item) => item.label)).toContain("Top category");
    expect(insights[2].tiles.map((item) => item.label)).toContain("Budget used");
    expect(insights.every((item) => item.tiles.length >= 2 && item.tiles.length <= 3)).toBe(true);
  });
});
