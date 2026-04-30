import { describe, expect, it } from "vitest";
import { previewImportBatch } from "../../src/utils/importPipeline";
import type { ExpenseCategory, IncomeCategory, Income, Transaction } from "../../src/types";

const expenseCategories: ExpenseCategory[] = [
  { id: "cat-food", name: "Groceries", target_amount: 500 },
  { id: "cat-misc", name: "Misc.", target_amount: 0 },
];

const incomeCategories: IncomeCategory[] = [
  { id: "inc-salary", name: "Salary", target_amount: 5000 },
];

const existing = {
  transactions: [] as Transaction[],
  income: [] as Income[],
  expenseCategories,
  incomeCategories,
};

describe("importPipeline", () => {
  it("previews CSV expenses with warnings for unknown categories", () => {
    const batch = previewImportBatch({
      source: "csv",
      payload: "Date,Vendor,Amount,Category,Notes\n2026-04-10,Cafe,7.50,Dining,Latte",
      options: { type: "expenses" },
      existing,
    });

    expect(batch.summary.total).toBe(1);
    expect(batch.records[0]).toEqual(expect.objectContaining({
      kind: "expense",
      status: "warning",
      category: "Misc.",
      merchant: "Cafe",
      amount: 7.5,
    }));
  });

  it("classifies source-id matches as duplicates", () => {
    const batch = previewImportBatch({
      source: "csv",
      payload: "Date,Vendor,Amount,Category,Notes\n2026-04-10,Cafe,7.50,Groceries,Latte",
      options: { type: "expenses" },
      existing: {
        ...existing,
        transactions: [{
          id: "txn-1",
          date: "2026-04-10",
          vendor: "Cafe",
          amount: 7.5,
          category_id: "cat-food",
          category_name: "Groceries",
          notes: "Latte",
          import_source: "csv",
          source_id: "csv-row-2",
        }],
      },
    });

    expect(batch.records[0].status).toBe("duplicate");
  });

  it("adapts Android notification history into preview records", () => {
    const batch = previewImportBatch({
      source: "android_notifications",
      payload: "SBI A/c XX111 debited Rs 250 at UBER on 12-04-26",
      options: { type: "expenses" },
      existing,
    });

    expect(batch.records[0]).toEqual(expect.objectContaining({
      source: "android_notifications",
      kind: "expense",
      merchant: "UBER",
      amount: 250,
    }));
  });

  it("previews manual backup JSON with backward-compatible arrays", () => {
    const batch = previewImportBatch({
      source: "manual_backup",
      payload: JSON.stringify({
        expenseCategories,
        incomeCategories,
        transactions: [{
          id: "txn-backup",
          date: "2026-04-11",
          vendor: "Market",
          amount: 20,
          category_id: "cat-food",
          category_name: "Groceries",
          notes: "Backup row",
        }],
        income: [],
      }),
      existing,
    });

    expect(batch.records.some((record) => record.kind === "expense")).toBe(true);
    expect(batch.records.some((record) => record.kind === "expenseCategory")).toBe(true);
  });
});
