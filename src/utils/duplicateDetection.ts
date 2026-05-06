import { Transaction } from "../types";

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase();
}

export function getTransactionFingerprint(tx: Transaction): string {
  const parts = [
    tx.date,
    tx.vendor,
    String(tx.amount),
    tx.currency,
    tx.category_id,
    tx.category_name,
    tx.notes,
    tx.import_source,
    tx.source_id,
    tx.import_batch_id,
    tx.raw_description,
    tx.status,
    tx.recurring_rule_id,
    tx.is_recurring_instance !== undefined ? String(tx.is_recurring_instance) : "",
    tx.updated_at,
  ];
  return parts.map(normalizeValue).join("||");
}

export function detectDuplicateGroups(transactions: Transaction[]): Transaction[][] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const fp = getTransactionFingerprint(tx);
    const group = groups.get(fp);
    if (group) {
      group.push(tx);
    } else {
      groups.set(fp, [tx]);
    }
  }
  const result: Transaction[][] = [];
  for (const group of groups.values()) {
    if (group.length > 1) {
      result.push(group);
    }
  }
  return result;
}
