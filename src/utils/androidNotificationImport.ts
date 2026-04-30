import { getTodayStr } from "./dateUtils";

export type AndroidNotificationImportType = "expenses" | "income";

export interface AndroidNotificationImportResult {
  rows: [string, string, number, string, string][];
  ignoredCount: number;
}

interface NotificationCandidate {
  title?: string;
  text: string;
  timestamp?: string;
}

const DEFAULT_CATEGORY_BY_TYPE: Record<AndroidNotificationImportType, string> = {
  expenses: "Bank Alerts",
  income: "Bank Credits",
};

const TIMESTAMP_KEYS = ["postTime", "timestamp", "time", "createdAt", "date", "datetime"] as const;
const TEXT_KEYS = ["text", "message", "body", "content", "notificationText", "description"] as const;
const TITLE_KEYS = ["title", "sender", "appName", "channelName", "packageName"] as const;

const shouldIgnoreText = (text: string) => {
  const lowered = text.toLowerCase();
  if (!/\d/.test(lowered)) return true;
  if (!/(debited|credited|spent|payment|paid|received|txn|transaction|withdrawn|upi|purchase|deposit)/i.test(lowered)) {
    return true;
  }
  return /(otp|one time password|verification code|promo|offer|cashback unlocked)/i.test(lowered);
};

const parseFlexibleDate = (raw: unknown): string | null => {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d{12,}$/.test(value)) {
    const millis = Number(value);
    const epoch = Number.isFinite(millis) ? (value.length > 10 ? millis : millis * 1000) : NaN;
    if (Number.isFinite(epoch)) {
      const d = new Date(epoch);
      if (!Number.isNaN(d.getTime())) return toDateString(d);
    }
  }

  const ymdMatch = value.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const dmyOrMdyMatch = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (dmyOrMdyMatch) {
    const [, first, second, yearRaw] = dmyOrMdyMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const dayFirst = firstNum > 12 || secondNum <= 12;
    const day = (dayFirst ? first : second).padStart(2, "0");
    const month = (dayFirst ? second : first).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateString(parsed);
};

const toDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFirstString = (source: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const pickTimestamp = (source: Record<string, unknown>) => {
  for (const key of TIMESTAMP_KEYS) {
    const parsed = parseFlexibleDate(source[key]);
    if (parsed) return parsed;
  }
  return null;
};

const normalizeJsonCandidates = (input: unknown): NotificationCandidate[] => {
  const items: unknown[] = [];
  if (Array.isArray(input)) {
    items.push(...input);
  } else if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const arrays = [obj.notifications, obj.data, obj.items];
    const firstArray = arrays.find((value) => Array.isArray(value));
    if (Array.isArray(firstArray)) {
      items.push(...firstArray);
    } else {
      items.push(obj);
    }
  }

  const normalized = items
    .map((item) => {
      if (typeof item === "string") return { text: item };
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const text = getFirstString(source, TEXT_KEYS);
      if (!text) return null;
      const title = getFirstString(source, TITLE_KEYS) || undefined;
      return {
        title,
        text,
        timestamp: pickTimestamp(source) || undefined,
      };
    })
    .filter((item) => item !== null);

  return normalized as NotificationCandidate[];
};

const parseCandidatesFromRaw = (raw: string): NotificationCandidate[] => {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const candidates = normalizeJsonCandidates(parsed);
    if (candidates.length > 0) return candidates;
  } catch {
    // Fallback to line-based parsing.
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ text: line }));
};

const parseAmount = (text: string, type: AndroidNotificationImportType): number | null => {
  const patterns = type === "expenses"
    ? [
        /(debited|spent|paid|withdrawn|payment(?:\s+of)?|txn(?:\s+of)?|purchase(?:\s+of)?)\D{0,20}(?:rs\.?|inr|usd|cad|\$|₹)?\s*([0-9][\d,]*(?:\.\d{1,2})?)/i,
        /(?:upi|card|account|a\/c).{0,50}(?:rs\.?|inr|usd|cad|\$|₹)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i,
      ]
    : [
        /(credited|received|deposit(?:ed)?|salary|refund|reversal)\D{0,20}(?:rs\.?|inr|usd|cad|\$|₹)?\s*([0-9][\d,]*(?:\.\d{1,2})?)/i,
      ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[2] || match?.[1];
    if (candidate) {
      const amount = Number(candidate.replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0) return amount;
    }
  }

  const fallbackMatch = text.match(/(?:rs\.?|inr|usd|cad|\$|₹)\s*([0-9][\d,]*(?:\.\d{1,2})?)/i);
  if (!fallbackMatch?.[1]) return null;
  const amount = Number(fallbackMatch[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const cleanCounterparty = (value: string) => {
  return value
    .replace(/\b(?:on|at|ref|utr|avl|available|bal(?:ance)?|txn|transaction|id)\b.*$/i, "")
    .replace(/[^\w&@.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const parseCounterparty = (
  text: string,
  title: string | undefined,
  type: AndroidNotificationImportType
) => {
  const expensePattern = /\b(?:at|to|on)\s+([a-z0-9&@._\- ]{2,60})/i;
  const incomePattern = /\b(?:from|by|via)\s+([a-z0-9&@._\- ]{2,60})/i;
  const match = text.match(type === "expenses" ? expensePattern : incomePattern);
  if (match?.[1]) {
    const cleaned = cleanCounterparty(match[1]);
    if (cleaned.length >= 2) return cleaned;
  }
  if (title && title.length >= 2) return cleanCounterparty(title);
  return type === "expenses" ? "Bank Transaction" : "Bank Credit";
};

const inferDateFromText = (text: string) => {
  const direct = parseFlexibleDate(text);
  if (direct) return direct;
  return null;
};

export const parseAndroidNotificationHistory = (
  raw: string,
  type: AndroidNotificationImportType
): AndroidNotificationImportResult => {
  const candidates = parseCandidatesFromRaw(raw);
  const rows: [string, string, number, string, string][] = [];
  let ignoredCount = 0;

  for (const candidate of candidates) {
    const text = `${candidate.title ? `${candidate.title} ` : ""}${candidate.text}`.trim();
    if (shouldIgnoreText(text)) {
      ignoredCount += 1;
      continue;
    }

    const lowered = text.toLowerCase();
    const isCredit = /(credited|received|deposit|salary|refund|reversal)/i.test(lowered);
    const isDebit = /(debited|spent|paid|withdrawn|payment|purchase|upi|sent)/i.test(lowered);
    if ((type === "expenses" && !isDebit) || (type === "income" && !isCredit)) {
      ignoredCount += 1;
      continue;
    }

    const amount = parseAmount(text, type);
    if (!amount) {
      ignoredCount += 1;
      continue;
    }

    const date = candidate.timestamp || inferDateFromText(text) || getTodayStr();
    const counterparty = parseCounterparty(text, candidate.title, type);
    const notes = candidate.title ? `${candidate.title}: ${candidate.text}` : candidate.text;
    rows.push([date, counterparty, amount, DEFAULT_CATEGORY_BY_TYPE[type], notes]);
  }

  return { rows, ignoredCount };
};
