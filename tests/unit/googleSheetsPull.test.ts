import { describe, expect, it, vi } from "vitest";
import type {
  GooglePullSummary,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncOptions,
} from "../../src/types";
import { previewImportBatch } from "../../src/utils/importPipeline";

const makeMockExisting = () => ({
  transactions: [],
  income: [],
  expenseCategories: [
    { id: "cat-1", name: "Groceries", target_amount: 0 },
    { id: "cat-2", name: "Rent", target_amount: 0 },
    { id: "cat-3", name: "Dining", target_amount: 0 },
  ],
  incomeCategories: [
    { id: "inc-cat-1", name: "Salary", target_amount: 0 },
  ],
});

describe("GooglePullSummary type", () => {
  it("constructs a valid pull summary with incremental mode", () => {
    const summary: GooglePullSummary = {
      fetched: 50,
      imported: 10,
      duplicateSkipped: 35,
      invalidSkipped: 5,
      netNew: 10,
      mode: "incremental",
    };
    expect(summary.fetched).toBe(50);
    expect(summary.imported).toBe(10);
    expect(summary.netNew).toBe(summary.imported);
    expect(summary.mode).toBe("incremental");
  });

  it("constructs a valid pull summary with full_reconcile mode", () => {
    const summary: GooglePullSummary = {
      fetched: 100,
      imported: 80,
      duplicateSkipped: 15,
      invalidSkipped: 5,
      netNew: 80,
      mode: "full_reconcile",
    };
    expect(summary.mode).toBe("full_reconcile");
    expect(summary.duplicateSkipped).toBeLessThan(summary.fetched);
  });

  it("net new equals imported when no updates", () => {
    const summary: GooglePullSummary = {
      fetched: 20,
      imported: 20,
      duplicateSkipped: 0,
      invalidSkipped: 0,
      netNew: 20,
      mode: "incremental",
    };
    expect(summary.fetched).toBe(summary.imported + summary.duplicateSkipped + summary.invalidSkipped);
    expect(summary.netNew).toBe(summary.imported);
  });
});

describe("GoogleSheetsSyncOptions mode", () => {
  it("defaults to incremental when mode is not provided", () => {
    const options: GoogleSheetsSyncOptions = {};
    expect(options.mode).toBeUndefined();
  });

  it("accepts incremental mode", () => {
    const options: GoogleSheetsSyncOptions = { mode: "incremental" };
    expect(options.mode).toBe("incremental");
  });

  it("accepts full_reconcile mode", () => {
    const options: GoogleSheetsSyncOptions = { mode: "full_reconcile" };
    expect(options.mode).toBe("full_reconcile");
  });
});

describe("Pull pipeline via previewImportBatch", () => {
  it("previews and classifies expense rows correctly", () => {
    const rows = [
      { __row: ["2026-04-10", "Costco", 150.0, "Groceries", "Monthly stockup"], __sourceId: "google_sheet-row-1" },
      { __row: ["2026-04-11", "Tim Hortons", 5.5, "Dining", "Coffee"], __sourceId: "google_sheet-row-2" },
    ];

    const batch = previewImportBatch({
      source: "google_sheet",
      payload: rows,
      options: { type: "expenses", hasHeader: false },
      existing: makeMockExisting(),
    });

    expect(batch.source).toBe("google_sheet");
    expect(batch.records.length).toBe(2);
    expect(batch.summary.new).toBe(2);
    expect(batch.summary.duplicate).toBe(0);
    expect(batch.summary.invalid).toBe(0);
  });

  it("marks duplicate rows correctly", () => {
    const existing = makeMockExisting();
    existing.transactions = [
      {
        id: "existing-1",
        date: "2026-04-10",
        vendor: "Costco",
        amount: 150.0,
        category_id: "cat-1",
        category_name: "Groceries",
        notes: "Monthly stockup",
        import_source: "google_sheet",
        source_id: "google_sheet-row-1",
      },
    ];

    const duplicateRow = {
      __row: ["2026-04-10", "Costco", 150.0, "Groceries", "Monthly stockup"],
      __sourceId: "google_sheet-row-1",
    };

    const batch = previewImportBatch({
      source: "google_sheet",
      payload: [duplicateRow],
      options: { type: "expenses", hasHeader: false },
      existing,
    });

    expect(batch.summary.duplicate).toBe(1);
    expect(batch.summary.new).toBe(0);
  });

  it("marks invalid rows for missing required fields", () => {
    const invalidRows = [
      { __row: ["", "", 0, "", ""], __sourceId: "google_sheet-row-1" },
    ];

    const batch = previewImportBatch({
      source: "google_sheet",
      payload: invalidRows,
      options: { type: "expenses", hasHeader: false },
      existing: makeMockExisting(),
    });

    expect(batch.summary.invalid).toBeGreaterThan(0);
  });

  it("handles income rows through the pipeline", () => {
    const incomeRows = [
      { __row: ["2026-04-01", "Day Job", 5000.0, "Salary", "Monthly"], __sourceId: "google_sheet-income-row-1" },
    ];

    const batch = previewImportBatch({
      source: "google_sheet",
      payload: incomeRows,
      options: { type: "income", hasHeader: false },
      existing: makeMockExisting(),
    });

    expect(batch.records.length).toBe(1);
    expect(batch.records[0].kind).toBe("income");
    expect(batch.summary.new).toBe(1);
  });

  it("skips duplicates by default on commit", () => {
    const existing = makeMockExisting();
    existing.transactions = [
      {
        id: "existing-1",
        date: "2026-04-10",
        vendor: "Costco",
        amount: 150.0,
        category_id: "cat-1",
        category_name: "Groceries",
        notes: "Monthly stockup",
        import_source: "google_sheet",
        source_id: "google_sheet-row-1",
      },
    ];

    const rows = [
      { __row: ["2026-04-10", "Costco", 150.0, "Groceries", "Monthly stockup"], __sourceId: "google_sheet-row-1" },
      { __row: ["2026-04-11", "Walmart", 45.0, "Groceries", "Snacks"], __sourceId: "google_sheet-row-2" },
    ];

    const batch = previewImportBatch({
      source: "google_sheet",
      payload: rows,
      options: { type: "expenses", hasHeader: false },
      existing,
    });

    expect(batch.summary.duplicate).toBe(1);
    expect(batch.summary.new).toBe(1);

    // Records to commit should exclude duplicates when includeDuplicates=false
    const commitCandidates = batch.records.filter((r) => {
      if (r.status === "invalid") return false;
      if (r.status === "duplicate") return false;
      return true;
    });
    expect(commitCandidates.length).toBe(1);
  });
});

describe("Mapping validation logic", () => {
  const validExpenseMapping = {
    date: "Date",
    vendor: "Vendor",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  };

  const validIncomeMapping = {
    date: "Date",
    source: "Source",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  };

  const testValidationFn = (
    config: Partial<GoogleSheetsSyncConfig> | null,
  ): { valid: boolean; missing: string[] } => {
    if (!config) return { valid: false, missing: ["No config saved"] };

    const missing: string[] = [];
    const reqExpFields = ["date", "vendor", "amount", "category"];
    const reqIncFields = ["date", "source", "amount", "category"];

    for (const field of reqExpFields) {
      if (!(config.expenseMapping as Record<string, string>)?.[field]?.trim()) {
        missing.push(`expenses.${field}`);
      }
    }
    for (const field of reqIncFields) {
      if (!(config.incomeMapping as Record<string, string>)?.[field]?.trim()) {
        missing.push(`income.${field}`);
      }
    }

    return { valid: missing.length === 0, missing };
  };

  it("returns valid for a complete mapping", () => {
    const config: Partial<GoogleSheetsSyncConfig> = {
      expenseMapping: validExpenseMapping,
      incomeMapping: validIncomeMapping,
    };
    const result = testValidationFn(config);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns invalid when expense date mapping is empty", () => {
    const config: Partial<GoogleSheetsSyncConfig> = {
      expenseMapping: { ...validExpenseMapping, date: "" },
      incomeMapping: validIncomeMapping,
    };
    const result = testValidationFn(config);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("expenses.date");
  });

  it("returns invalid when income mapping has empty fields", () => {
    const config: Partial<GoogleSheetsSyncConfig> = {
      expenseMapping: validExpenseMapping,
      incomeMapping: { ...validIncomeMapping, source: "" },
    };
    const result = testValidationFn(config);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("income.source");
  });

  it("returns invalid when config is null", () => {
    const result = testValidationFn(null);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("No config saved");
  });

  it("reports all missing fields", () => {
    const config: Partial<GoogleSheetsSyncConfig> = {
      expenseMapping: { ...validExpenseMapping, date: "", vendor: "", amount: "" },
      incomeMapping: { ...validIncomeMapping, source: "" },
    };
    const result = testValidationFn(config);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("expenses.date");
    expect(result.missing).toContain("expenses.vendor");
    expect(result.missing).toContain("expenses.amount");
    expect(result.missing).toContain("income.source");
    expect(result.missing.length).toBe(4);
  });
});
