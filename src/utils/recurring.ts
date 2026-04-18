import { RecurringRule, UpcomingRecurringInstance } from "../types";
import { formatDate } from "./dateUtils";

const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const getDaysInMonth = (year: number, month1Based: number) => (
  new Date(year, month1Based, 0).getDate()
);

export const clampDayOfMonth = (year: number, month1Based: number, dayOfMonth: number) => {
  const safeDay = Number.isFinite(dayOfMonth) ? Math.max(1, Math.trunc(dayOfMonth)) : 1;
  return Math.min(safeDay, getDaysInMonth(year, month1Based));
};

export const buildDateForMonth = (year: number, month1Based: number, requestedDayOfMonth: number) => {
  const day = clampDayOfMonth(year, month1Based, requestedDayOfMonth);
  return formatDate(new Date(year, month1Based - 1, day));
};

export const parseMonthKey = (monthKey: string) => {
  const [yearStr, monthStr] = monthKey.split("-");
  return {
    year: Number.parseInt(yearStr || "", 10),
    month: Number.parseInt(monthStr || "", 10),
  };
};

export const addMonthsToKey = (monthKey: string, monthsToAdd: number) => {
  const { year, month } = parseMonthKey(monthKey);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const next = new Date(year, month - 1 + monthsToAdd, 1);
  return toMonthKey(next);
};

export const listMonthsInclusive = (startMonthKey: string, endMonthKey: string) => {
  if (!startMonthKey || !endMonthKey || startMonthKey > endMonthKey) {
    return [] as string[];
  }

  const months: string[] = [];
  let cursor = startMonthKey;
  while (cursor <= endMonthKey) {
    months.push(cursor);
    const next = addMonthsToKey(cursor, 1);
    if (next === cursor) break;
    cursor = next;
  }
  return months;
};

export interface MaterializedOccurrence {
  month: string;
  dueDate: string;
}

export const materializeRule = (
  rule: RecurringRule,
  todayStr: string,
): MaterializedOccurrence[] => {
  if (!rule.is_active || rule.frequency !== "monthly") return [];

  const currentMonth = todayStr.slice(0, 7);
  const startMonth = rule.start_date.slice(0, 7);
  const seedMonth = rule.last_generated_month || addMonthsToKey(startMonth, -1);
  const fromMonth = addMonthsToKey(seedMonth, 1);
  const months = listMonthsInclusive(fromMonth, currentMonth);

  const occurrences: MaterializedOccurrence[] = [];
  for (const monthKey of months) {
    const { year, month } = parseMonthKey(monthKey);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

    const dueDate = buildDateForMonth(year, month, rule.day_of_month);
    if (dueDate < rule.start_date) continue;
    if (rule.end_date && dueDate > rule.end_date) continue;
    if (dueDate > todayStr) continue;
    occurrences.push({ month: monthKey, dueDate });
  }

  return occurrences;
};

export const computeUpcoming = (
  rules: RecurringRule[],
  todayStr: string,
  days: number
): UpcomingRecurringInstance[] => {
  const safeDays = Math.max(1, Math.min(90, Math.trunc(days || 30)));
  const start = new Date(`${todayStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + safeDays);

  const results: UpcomingRecurringInstance[] = [];
  for (const rule of rules) {
    if (!rule.is_active || rule.frequency !== "monthly") continue;

    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= endCursor) {
      const monthKey = toMonthKey(cursor);
      const { year, month } = parseMonthKey(monthKey);
      const projectedDate = buildDateForMonth(year, month, rule.day_of_month);

      if (
        projectedDate >= todayStr &&
        projectedDate <= formatDate(end) &&
        projectedDate >= rule.start_date &&
        (!rule.end_date || projectedDate <= rule.end_date)
      ) {
        results.push({
          rule_id: rule.id,
          projected_date: projectedDate,
          type: rule.type,
          amount: rule.amount,
          vendor: rule.vendor,
          source: rule.source,
          category_name: rule.type === "expense" ? rule.category_name : rule.category,
          notes: rule.notes,
        });
      }

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return results.sort((a, b) => {
    if (a.projected_date !== b.projected_date) return a.projected_date.localeCompare(b.projected_date);
    return a.rule_id.localeCompare(b.rule_id);
  });
};

export const getNextDueDate = (rule: RecurringRule, fromDateStr: string) => {
  if (!rule.is_active || rule.frequency !== "monthly") return null;

  const start = new Date(`${fromDateStr}T00:00:00`);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  for (let i = 0; i < 24; i += 1) {
    const monthKey = toMonthKey(cursor);
    const { year, month } = parseMonthKey(monthKey);
    const projected = buildDateForMonth(year, month, rule.day_of_month);
    if (
      projected >= fromDateStr &&
      projected >= rule.start_date &&
      (!rule.end_date || projected <= rule.end_date)
    ) {
      return projected;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return null;
};
