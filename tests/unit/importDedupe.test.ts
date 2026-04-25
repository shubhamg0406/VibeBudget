import { describe, expect, it } from "vitest";
import {
  dedupeExpensesByImportFingerprint,
  getExpenseImportFingerprint,
  getStableImportedExpenseId,
} from "../../src/utils/importDedupe";
import type { Transaction } from "../../src/types";

const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "txn-1",
  date: "2026-04-01",
  vendor: "Coffee Shop",
  amount: 4.5,
  category_id: "cat-1",
  category_name: "Going out food",
  notes: "Latte",
  updated_at: "2026-04-01T10:00:00.000Z",
  ...overrides,
});

describe("import dedupe helpers", () => {
  it("builds stable fingerprints across harmless text and amount formatting changes", () => {
    expect(getExpenseImportFingerprint(makeTransaction())).toBe(
      getExpenseImportFingerprint(makeTransaction({
        vendor: " coffee   shop ",
        amount: 4.5,
        category_name: "going OUT food",
        notes: " latte ",
      }))
    );
  });

  it("generates the same id for the same imported transaction", () => {
    expect(getStableImportedExpenseId(makeTransaction())).toBe(getStableImportedExpenseId(makeTransaction({
      id: "different-existing-id",
      updated_at: "2026-04-02T10:00:00.000Z",
    })));
  });

  it("collapses exact imported duplicates and keeps the newest version", () => {
    const deduped = dedupeExpensesByImportFingerprint([
      makeTransaction({ id: "old", updated_at: "2026-04-01T10:00:00.000Z" }),
      makeTransaction({ id: "new", updated_at: "2026-04-01T11:00:00.000Z" }),
      makeTransaction({ id: "other", vendor: "Grocery Store" }),
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((item) => item.vendor === "Coffee Shop")?.id).toBe("new");
  });

  it("leaves matching duplicates alone when they were not part of the current import", () => {
    const targetFingerprints = new Set([getExpenseImportFingerprint(makeTransaction({ vendor: "Grocery Store" }))]);
    const deduped = dedupeExpensesByImportFingerprint([
      makeTransaction({ id: "old", updated_at: "2026-04-01T10:00:00.000Z" }),
      makeTransaction({ id: "new", updated_at: "2026-04-01T11:00:00.000Z" }),
      makeTransaction({ id: "other", vendor: "Grocery Store" }),
    ], targetFingerprints);

    expect(deduped).toHaveLength(3);
  });
});
