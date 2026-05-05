import { describe, expect, it } from "vitest";
import { detectDuplicateGroups, getTransactionFingerprint } from "../../src/utils/duplicateDetection";
import type { Transaction } from "../../src/types";

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "txn-1",
  date: "2026-04-05",
  vendor: "Save-On Foods",
  amount: 120.35,
  currency: "CAD",
  category_id: "expense-groceries",
  category_name: "Groceries",
  notes: "Weekly groceries",
  ...overrides,
});

describe("getTransactionFingerprint", () => {
  it("produces the same fingerprint for identical transactions with different ids", () => {
    const a = makeTx({ id: "txn-1" });
    const b = makeTx({ id: "txn-2" });
    expect(getTransactionFingerprint(a)).toBe(getTransactionFingerprint(b));
  });

  it("produces different fingerprints when any field differs", () => {
    const a = makeTx({ amount: 100 });
    const b = makeTx({ amount: 101 });
    expect(getTransactionFingerprint(a)).not.toBe(getTransactionFingerprint(b));
  });

  it("handles undefined and null fields gracefully", () => {
    const a = makeTx({ notes: "" });
    const b = makeTx({ notes: undefined });
    const fp1 = getTransactionFingerprint(a);
    const fp2 = getTransactionFingerprint(b);
    expect(typeof fp1).toBe("string");
    expect(typeof fp2).toBe("string");
  });
});

describe("detectDuplicateGroups", () => {
  it("returns empty array for no duplicates", () => {
    const txs = [
      makeTx({ id: "1", vendor: "Store A" }),
      makeTx({ id: "2", vendor: "Store B" }),
      makeTx({ id: "3", vendor: "Store C" }),
    ];
    expect(detectDuplicateGroups(txs)).toEqual([]);
  });

  it("detects duplicate groups", () => {
    const txs = [
      makeTx({ id: "1", vendor: "Dupe" }),
      makeTx({ id: "2", vendor: "Dupe" }),
      makeTx({ id: "3", vendor: "Unique" }),
      makeTx({ id: "4", vendor: "Dupe" }),
    ];
    const groups = detectDuplicateGroups(txs);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(3);
  });

  it("detects multiple separate duplicate groups", () => {
    const txs = [
      makeTx({ id: "1", vendor: "Dupe A", amount: 10 }),
      makeTx({ id: "2", vendor: "Dupe A", amount: 10 }),
      makeTx({ id: "3", vendor: "Dupe B", amount: 20 }),
      makeTx({ id: "4", vendor: "Dupe B", amount: 20 }),
    ];
    const groups = detectDuplicateGroups(txs);
    expect(groups.length).toBe(2);
    expect(groups[0].length).toBe(2);
    expect(groups[1].length).toBe(2);
  });

  it("ignores id differences when detecting duplicates", () => {
    const base = {
      date: "2026-04-10",
      vendor: "Walmart",
      amount: 75.5,
      currency: "CAD",
      category_id: "cat-1",
      category_name: "Groceries",
      notes: "Weekly shop",
    };
    const txs = [
      makeTx({ ...base, id: "a" }),
      makeTx({ ...base, id: "b" }),
      makeTx({ ...base, id: "c" }),
    ];
    const groups = detectDuplicateGroups(txs);
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(3);
  });

  it("treats near-identical transactions as non-duplicates when a field differs slightly", () => {
    const txs = [
      makeTx({ id: "1", amount: 10.00, vendor: "Store", notes: "note" }),
      makeTx({ id: "2", amount: 10.01, vendor: "Store", notes: "note" }),
    ];
    expect(detectDuplicateGroups(txs).length).toBe(0);
  });
});
