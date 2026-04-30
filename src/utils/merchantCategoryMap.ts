import type { Income, Transaction } from "../types";

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "store", "shop", "inc", "ltd",
  "llc", "co", "corp", "services", "payment", "pymt", "debit", "credit",
  "online", "purchase", "refund", "fee", "charge",
]);

const extractKeywords = (name: string): string[] => {
  const text = name.toLowerCase().trim();
  const words = text
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique;
};

export interface MerchantCategoryMap {
  keywordToCategory: Record<string, string>;
  fullNameToCategory: Record<string, string>;
}

export const buildMerchantCategoryMap = (
  transactions: Transaction[],
  income: Income[],
): MerchantCategoryMap => {
  const keywordCounts = new Map<string, Map<string, number>>();
  const fullNameCounts = new Map<string, Map<string, number>>();

  const record = (name: string, category: string) => {
    if (!name || !category) return;
    const lower = name.toLowerCase().trim();

    if (!fullNameCounts.has(lower)) {
      fullNameCounts.set(lower, new Map());
    }
    const fnCounts = fullNameCounts.get(lower)!;
    fnCounts.set(category, (fnCounts.get(category) || 0) + 1);

    for (const kw of extractKeywords(name)) {
      if (!keywordCounts.has(kw)) {
        keywordCounts.set(kw, new Map());
      }
      const kCounts = keywordCounts.get(kw)!;
      kCounts.set(category, (kCounts.get(category) || 0) + 1);
    }
  };

  for (const tx of transactions) {
    record(tx.vendor, tx.category_name);
  }
  for (const inc of income) {
    record(inc.source, inc.category);
  }

  const best = (counts: Map<string, number>): string => {
    let bestCat = "";
    let bestN = 0;
    for (const [cat, n] of counts) {
      if (n > bestN) {
        bestN = n;
        bestCat = cat;
      }
    }
    return bestCat;
  };

  const keywordToCategory: Record<string, string> = {};
  for (const [kw, counts] of keywordCounts) {
    keywordToCategory[kw] = best(counts);
  }

  const fullNameToCategory: Record<string, string> = {};
  for (const [name, counts] of fullNameCounts) {
    fullNameToCategory[name] = best(counts);
  }

  return { keywordToCategory, fullNameToCategory };
};

export const mapMerchantToCategory = (
  merchant: string,
  map: MerchantCategoryMap,
): string | null => {
  const lower = merchant.toLowerCase().trim();
  if (!lower) return null;

  if (map.fullNameToCategory[lower]) {
    return map.fullNameToCategory[lower];
  }

  const keywords = extractKeywords(merchant);
  for (const kw of keywords) {
    if (map.keywordToCategory[kw]) {
      return map.keywordToCategory[kw];
    }
  }

  return null;
};
