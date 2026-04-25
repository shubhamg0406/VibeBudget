import { Income, Transaction } from "../types";

const normalizeText = (value: string | undefined) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getExpenseImportFingerprint = (
  item: Pick<Transaction, "date" | "vendor" | "amount" | "category_name" | "notes">
) => [
  item.date,
  normalizeText(item.vendor),
  normalizeAmount(item.amount),
  normalizeText(item.category_name),
  normalizeText(item.notes),
].join("|");

export const getIncomeImportFingerprint = (
  item: Pick<Income, "date" | "source" | "amount" | "category" | "notes">
) => [
  item.date,
  normalizeText(item.source),
  normalizeAmount(item.amount),
  normalizeText(item.category),
  normalizeText(item.notes),
].join("|");

export const getStableImportedExpenseId = (
  item: Pick<Transaction, "date" | "vendor" | "amount" | "category_name" | "notes">
) => `sheet-expense-${hashString(getExpenseImportFingerprint(item))}`;

export const getStableImportedIncomeId = (
  item: Pick<Income, "date" | "source" | "amount" | "category" | "notes">
) => `sheet-income-${hashString(getIncomeImportFingerprint(item))}`;

export const dedupeExpensesByImportFingerprint = (items: Transaction[], targetFingerprints?: Set<string>) => {
  const byFingerprint = new Map<string, Transaction>();
  const untouched: Transaction[] = [];

  items.forEach((item) => {
    const fingerprint = getExpenseImportFingerprint(item);
    if (targetFingerprints && !targetFingerprints.has(fingerprint)) {
      untouched.push(item);
      return;
    }

    const existing = byFingerprint.get(fingerprint);
    if (!existing || (item.updated_at || "") > (existing.updated_at || "")) {
      byFingerprint.set(fingerprint, item);
    }
  });

  return [...untouched, ...Array.from(byFingerprint.values())];
};

export const dedupeIncomeByImportFingerprint = (items: Income[], targetFingerprints?: Set<string>) => {
  const byFingerprint = new Map<string, Income>();
  const untouched: Income[] = [];

  items.forEach((item) => {
    const fingerprint = getIncomeImportFingerprint(item);
    if (targetFingerprints && !targetFingerprints.has(fingerprint)) {
      untouched.push(item);
      return;
    }

    const existing = byFingerprint.get(fingerprint);
    if (!existing || (item.updated_at || "") > (existing.updated_at || "")) {
      byFingerprint.set(fingerprint, item);
    }
  });

  return [...untouched, ...Array.from(byFingerprint.values())];
};
