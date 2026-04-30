import { describe, expect, it } from "vitest";
import { createBudgetDataFile, parseBudgetDataFile } from "../../src/utils/googleDrive";

describe("googleDrive budget data file", () => {
  it("serializes and parses budget JSON with current collections", () => {
    const file = createBudgetDataFile(
      [{ id: "expense-food", name: "Groceries", target_amount: 500 }],
      [{ id: "income-salary", name: "Salary", target_amount: 5000 }],
      [{
        id: "txn-1",
        date: "2026-04-10",
        vendor: "Cafe",
        amount: 7.5,
        category_id: "expense-food",
        category_name: "Groceries",
        notes: "Latte",
      }],
      [],
      null,
    );

    const parsed = parseBudgetDataFile(JSON.stringify(file));
    expect(parsed.version).toBe(2);
    expect(parsed.transactions[0].vendor).toBe("Cafe");
    expect(parsed.expenseCategories[0].name).toBe("Groceries");
  });

  it("keeps backward compatibility for legacy categories", () => {
    const parsed = parseBudgetDataFile(JSON.stringify({
      categories: [{ id: "legacy", name: "Legacy", target_amount: 1 }],
      transactions: [],
      income: [],
    }));

    expect(parsed.expenseCategories).toEqual([
      { id: "legacy", name: "Legacy", target_amount: 1 },
    ]);
  });
});
