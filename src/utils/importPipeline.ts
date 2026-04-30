import type {
  ExpenseCategory,
  ImportBatch,
  ImportPreviewOptions,
  ImportRecord,
  ImportRecordKind,
  ImportRecordStatus,
  ImportSource,
  Income,
  IncomeCategory,
  Transaction,
} from "../types";
import { normalizeDateString } from "./dateUtils";
import { parseAndroidNotificationHistory } from "./androidNotificationImport";

interface PreviewImportArgs {
  source: ImportSource;
  payload: string | unknown[] | Record<string, unknown>;
  options?: ImportPreviewOptions;
  existing: {
    transactions: Transaction[];
    income: Income[];
    expenseCategories: ExpenseCategory[];
    incomeCategories: IncomeCategory[];
  };
}

interface ParsedRecordCandidate {
  kind: ImportRecordKind;
  source_id?: string;
  date?: string;
  merchant?: string;
  amount?: number;
  category?: string;
  notes?: string;
  raw_description?: string;
  raw_payload?: unknown;
}

const DEFAULT_EXPENSE_CATEGORY = "Misc.";
const DEFAULT_INCOME_CATEGORY = "Uncategorized";

const normalizeText = (value: string | undefined) => (value || "").trim().replace(/\s+/g, " ");
const normalizeKeyText = (value: string | undefined) => normalizeText(value).toLowerCase();

const normalizeAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "").replace(/[^-0-9.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const makeBatchId = (source: ImportSource, payload: unknown) => {
  const payloadKey = typeof payload === "string" ? payload.slice(0, 5000) : JSON.stringify(payload).slice(0, 5000);
  return `import-${source}-${hashString(`${Date.now()}|${payloadKey}`)}`;
};

const splitDelimitedRow = (row: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === "\"") {
      if (inQuotes && row[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((value) => value.trim().replace(/^"|"$/g, ""));
};

const normalizeDate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return normalizeDateString(raw) || raw;
};

const detectDelimiter = (text: string) => {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
};

const parseCsvCandidates = (payload: string, options?: ImportPreviewOptions): ParsedRecordCandidate[] => {
  const type = options?.type || "expenses";
  const delimiter = detectDelimiter(payload);
  const lines = payload.split(/\r?\n/).filter((line) => line.trim() !== "");
  const dataLines = options?.hasHeader === false ? lines : lines.slice(1);

  return dataLines.map((line, index) => {
    const [first, second, third, fourth, fifth] = splitDelimitedRow(line, delimiter);
    const rowNumber = (options?.hasHeader === false ? index : index + 1) + 1;

    if (type === "expenseCategories" || type === "incomeCategories") {
      return {
        kind: type === "expenseCategories" ? "expenseCategory" : "incomeCategory",
        source_id: `csv-row-${rowNumber}`,
        merchant: first,
        amount: normalizeAmount(second),
        raw_payload: line,
      };
    }

    return {
      kind: type === "income" ? "income" : "expense",
      source_id: `csv-row-${rowNumber}`,
      date: normalizeDate(first),
      merchant: second,
      amount: normalizeAmount(third),
      category: fourth,
      notes: fifth || "",
      raw_description: line,
      raw_payload: line,
    };
  });
};

const parseRowsCandidates = (
  payload: unknown[],
  source: ImportSource,
  options?: ImportPreviewOptions
): ParsedRecordCandidate[] => {
  const type = options?.type || "expenses";
  return payload.map((row, index) => {
    const wrapped = (!Array.isArray(row) && row && typeof row === "object")
      ? row as { __row?: unknown[]; __sourceId?: string; __rawDescription?: string }
      : null;
    const values = Array.isArray(row) ? row : (Array.isArray(wrapped?.__row) ? wrapped.__row : []);
    const [first, second, third, fourth, fifth] = values;
    const sourceId = wrapped?.__sourceId || `${source}-row-${index + 1}`;

    if (type === "expenseCategories" || type === "incomeCategories") {
      return {
        kind: type === "expenseCategories" ? "expenseCategory" : "incomeCategory",
        source_id: sourceId,
        merchant: normalizeText(String(first || "")),
        amount: normalizeAmount(second),
        raw_payload: row,
      };
    }

    return {
      kind: type === "income" ? "income" : "expense",
      source_id: sourceId,
      date: normalizeDate(first),
      merchant: normalizeText(String(second || "")),
      amount: normalizeAmount(third),
      category: normalizeText(String(fourth || "")),
      notes: normalizeText(String(fifth || "")),
      raw_description: wrapped?.__rawDescription || (Array.isArray(row) ? row.join(", ") : undefined),
      raw_payload: row,
    };
  });
};

const parseManualBackupCandidates = (payload: string | Record<string, unknown>): ParsedRecordCandidate[] => {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const transactions = Array.isArray(parsed.transactions) ? parsed.transactions as Transaction[] : [];
  const income = Array.isArray(parsed.income) ? parsed.income as Income[] : [];
  const expenseCategories = Array.isArray(parsed.expenseCategories) ? parsed.expenseCategories as ExpenseCategory[] : [];
  const incomeCategories = Array.isArray(parsed.incomeCategories) ? parsed.incomeCategories as IncomeCategory[] : [];

  return [
    ...expenseCategories.map((category) => ({
      kind: "expenseCategory" as const,
      source_id: `backup-expense-category-${category.id || hashString(category.name)}`,
      merchant: category.name,
      amount: category.target_amount,
      raw_payload: category,
    })),
    ...incomeCategories.map((category) => ({
      kind: "incomeCategory" as const,
      source_id: `backup-income-category-${category.id || hashString(category.name)}`,
      merchant: category.name,
      amount: category.target_amount,
      raw_payload: category,
    })),
    ...transactions.map((item) => ({
      kind: "expense" as const,
      source_id: item.source_id || `backup-expense-${item.id}`,
      date: item.date,
      merchant: item.vendor,
      amount: item.amount,
      category: item.category_name,
      notes: item.notes,
      raw_description: item.raw_description || item.notes,
      raw_payload: item,
    })),
    ...income.map((item) => ({
      kind: "income" as const,
      source_id: item.source_id || `backup-income-${item.id}`,
      date: item.date,
      merchant: item.source,
      amount: item.amount,
      category: item.category,
      notes: item.notes,
      raw_description: item.raw_description || item.notes,
      raw_payload: item,
    })),
  ];
};

const parseAndroidCandidates = (payload: string, options?: ImportPreviewOptions): ParsedRecordCandidate[] => {
  const type = options?.type === "income" ? "income" : "expenses";
  const parsed = parseAndroidNotificationHistory(payload, type);
  return parsed.rows.map((row, index) => {
    const [date, merchant, amount, category, notes] = row;
    return {
      kind: type === "income" ? "income" : "expense",
      source_id: `android-${hashString(row.join("|")) || index}`,
      date,
      merchant,
      amount,
      category,
      notes,
      raw_description: notes,
      raw_payload: row,
    };
  });
};

const makeExistingKeys = (existing: PreviewImportArgs["existing"]) => {
  const sourceKeys = new Set<string>();
  const fallbackKeys = new Set<string>();

  existing.transactions.forEach((item) => {
    if (item.import_source && item.source_id) sourceKeys.add(`${item.import_source}|${item.source_id}`);
    fallbackKeys.add(makeFallbackKey("expense", item.date, item.vendor, item.amount, item.raw_description || item.notes));
  });
  existing.income.forEach((item) => {
    if (item.import_source && item.source_id) sourceKeys.add(`${item.import_source}|${item.source_id}`);
    fallbackKeys.add(makeFallbackKey("income", item.date, item.source, item.amount, item.raw_description || item.notes));
  });

  return { sourceKeys, fallbackKeys };
};

const makeFallbackKey = (
  kind: ImportRecordKind,
  date: string | undefined,
  merchant: string | undefined,
  amount: number | undefined,
  rawDescription: string | undefined
) => [
  kind,
  date || "",
  normalizeKeyText(merchant),
  Number.isFinite(amount) ? Number(amount).toFixed(2) : "0.00",
  normalizeKeyText(rawDescription),
].join("|");

const classifyCandidate = (
  candidate: ParsedRecordCandidate,
  source: ImportSource,
  existing: PreviewImportArgs["existing"]
): ImportRecord => {
  const warnings: string[] = [];
  const { sourceKeys, fallbackKeys } = makeExistingKeys(existing);

  let category = normalizeText(candidate.category);
  const merchant = normalizeText(candidate.merchant);
  const amount = Number(candidate.amount || 0);
  const date = normalizeText(candidate.date);

  if (candidate.kind === "expense") {
    const knownExpenseCategories = new Set(existing.expenseCategories.map((item) => normalizeKeyText(item.name)));
    if (!category || !knownExpenseCategories.has(normalizeKeyText(category))) {
      if (category && normalizeKeyText(category) !== normalizeKeyText(DEFAULT_EXPENSE_CATEGORY)) {
        warnings.push(`Unknown expense category "${category}" mapped to ${DEFAULT_EXPENSE_CATEGORY}.`);
      }
      category = DEFAULT_EXPENSE_CATEGORY;
    }
  }

  if (candidate.kind === "income" && !category) {
    category = DEFAULT_INCOME_CATEGORY;
    warnings.push(`Missing income category mapped to ${DEFAULT_INCOME_CATEGORY}.`);
  }

  if ((candidate.kind === "expense" || candidate.kind === "income") && !date) warnings.push("Missing date.");
  if ((candidate.kind === "expense" || candidate.kind === "income") && !merchant) warnings.push("Missing merchant/source.");
  if ((candidate.kind === "expense" || candidate.kind === "income") && amount <= 0) warnings.push("Missing or invalid amount.");
  if ((candidate.kind === "expenseCategory" || candidate.kind === "incomeCategory") && !merchant) warnings.push("Missing category name.");

  const invalid = warnings.some((warning) => warning.startsWith("Missing"));
  const sourceDuplicate = candidate.source_id ? sourceKeys.has(`${source}|${candidate.source_id}`) : false;
  const fallbackDuplicate = fallbackKeys.has(makeFallbackKey(
    candidate.kind,
    date,
    merchant,
    amount,
    candidate.raw_description || candidate.notes,
  ));
  const duplicate = candidate.source_id ? sourceDuplicate : fallbackDuplicate;
  const status: ImportRecordStatus = invalid ? "invalid" : duplicate ? "duplicate" : warnings.length > 0 ? "warning" : "new";

  return {
    id: `${source}-${hashString(JSON.stringify(candidate))}`,
    kind: candidate.kind,
    status,
    source,
    source_id: candidate.source_id,
    date,
    merchant,
    amount,
    category,
    notes: normalizeText(candidate.notes),
    raw_description: candidate.raw_description,
    confidence: status === "new" ? 0.95 : status === "warning" ? 0.7 : status === "duplicate" ? 0.9 : 0.2,
    warnings,
    raw_payload: candidate.raw_payload,
  };
};

const summarize = (records: ImportRecord[]) => ({
  total: records.length,
  new: records.filter((record) => record.status === "new").length,
  duplicate: records.filter((record) => record.status === "duplicate").length,
  warning: records.filter((record) => record.status === "warning").length,
  invalid: records.filter((record) => record.status === "invalid").length,
});

export const previewImportBatch = ({
  source,
  payload,
  options,
  existing,
}: PreviewImportArgs): ImportBatch => {
  let candidates: ParsedRecordCandidate[] = [];
  const warnings: string[] = [];

  try {
    if (source === "csv") {
      candidates = parseCsvCandidates(String(payload || ""), options);
    } else if (source === "android_notifications") {
      candidates = parseAndroidCandidates(String(payload || ""), options);
    } else if (source === "manual_backup") {
      candidates = parseManualBackupCandidates(payload as string | Record<string, unknown>);
    } else if (Array.isArray(payload)) {
      candidates = parseRowsCandidates(payload, source, options);
    } else {
      warnings.push(`${source} imports are not implemented yet.`);
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Failed to parse import payload.");
  }

  const records = candidates.map((candidate) => classifyCandidate(candidate, source, existing));

  return {
    id: makeBatchId(source, payload),
    source,
    createdAt: new Date().toISOString(),
    records,
    ignoredRows: Math.max(0, Array.isArray(payload) ? payload.length - candidates.length : 0),
    warnings,
    summary: summarize(records),
  };
};
