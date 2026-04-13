import { DateRange, DateRangeOption } from "../types";

export const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const normalizeDateString = (dateStr: string): string => {
  if (!dateStr) return "";

  const trimmed = dateStr.trim().replace(/^"|"$/g, "");
  if (!trimmed) return "";

  const isValidYmd = (year: number, month: number, day: number) => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1) return false;
    const maxDay = new Date(year, month, 0).getDate();
    return day <= maxDay;
  };

  const formatYmd = (year: number, month: number, day: number) => (
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  );

  const parseGoogleSheetsSerialDate = (candidate: string) => {
    if (!/^-?\d+(\.\d+)?$/.test(candidate)) return "";
    const numeric = Number.parseFloat(candidate);
    if (!Number.isFinite(numeric)) return "";

    const serialDay = Math.floor(numeric);
    // Google Sheets serial dates are days since 1899-12-30.
    if (serialDay < 20000 || serialDay > 80000) return "";
    const unixMillis = (serialDay - 25569) * 86400 * 1000;
    const parsed = new Date(unixMillis);
    if (Number.isNaN(parsed.getTime())) return "";

    return formatYmd(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr, dayStr] = trimmed.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    return isValidYmd(year, month, day) ? trimmed : "";
  }

  const parts = trimmed.split(/[-/]/).map((part) => part.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [yearStr, monthStr, dayStr] = parts;
      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      const day = Number.parseInt(dayStr, 10);
      return isValidYmd(year, month, day) ? formatYmd(year, month, day) : "";
    }

    if (parts[2].length === 4 || parts[2].length === 2) {
      const [leftStr, rightStr, yearStr] = parts;
      const left = Number.parseInt(leftStr, 10);
      const right = Number.parseInt(rightStr, 10);
      const year = Number.parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr, 10);

      if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(year)) {
        // Keep going so month-name formats like 1-Apr-2024 can be parsed
        // by the Date fallback below.
      } else {
        // Disambiguate DD/MM/YYYY and MM/DD/YYYY when year is in the last position.
        let month = left;
        let day = right;
        if (left > 12 && right <= 12) {
          day = left;
          month = right;
        }

        return isValidYmd(year, month, day) ? formatYmd(year, month, day) : "";
      }
    }
  }

  const serialDate = parseGoogleSheetsSerialDate(trimmed);
  if (serialDate) {
    return serialDate;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return "";
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return formatYmd(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
};

export const parseDateString = (dateStr: string): Date => {
  const normalized = normalizeDateString(dateStr);
  return normalized ? new Date(`${normalized}T00:00:00`) : new Date(Number.NaN);
};

export const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const normalized = normalizeDateString(dateStr);
  if (!normalized) return dateStr;
  const date = new Date(normalized + 'T00:00:00'); // Use T00:00:00 to avoid timezone shifts
  if (Number.isNaN(date.getTime())) return dateStr;
  const d = date.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = monthNames[date.getMonth()];
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

export const getMonthYearLabel = (dateStr: string): string => {
  if (!dateStr) return "";
  const normalized = normalizeDateString(dateStr);
  if (!normalized) return "Unknown Date";
  const date = new Date(normalized + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return "Unknown Date";
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatMonth = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const getTodayStr = (): string => {
  return formatDate(new Date());
};

export const getMonthKey = (dateStr: string): string => {
  const normalized = normalizeDateString(dateStr);
  return normalized ? normalized.slice(0, 7) : "";
};

export const isDateInRange = (dateStr: string, start: string, end: string): boolean => {
  const normalizedDate = normalizeDateString(dateStr);
  const normalizedStart = normalizeDateString(start);
  const normalizedEnd = normalizeDateString(end);

  if (!normalizedDate || !normalizedStart || !normalizedEnd) return false;
  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
};

export const compareDateStrings = (left: string, right: string): number => {
  const normalizedLeft = normalizeDateString(left);
  const normalizedRight = normalizeDateString(right);
  return normalizedLeft.localeCompare(normalizedRight);
};

export const getFirstDayOfMonth = (date: Date): string => {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  return formatDate(firstDay);
};

export const getLastDayOfMonth = (date: Date): string => {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return formatDate(lastDay);
};

export const getPresetDateRange = (
  option: Exclude<DateRangeOption, "custom">,
  referenceDate: Date = new Date()
): DateRange => {
  const today = formatDate(referenceDate);
  let start = "";
  let end = today;

  switch (option) {
    case "this-month":
      start = getFirstDayOfMonth(referenceDate);
      break;
    case "last-month": {
      const previousMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
      start = getFirstDayOfMonth(previousMonth);
      end = getLastDayOfMonth(previousMonth);
      break;
    }
    case "last-3-months":
      // This month + previous 2 full calendar months
      start = formatDate(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 2, 1));
      break;
    case "last-6-months":
      // This month + previous 5 full calendar months
      start = formatDate(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 5, 1));
      break;
    case "ytd":
      start = formatDate(new Date(referenceDate.getFullYear(), 0, 1));
      break;
    case "last-12-months":
      start = formatDate(new Date(referenceDate.getFullYear() - 1, referenceDate.getMonth(), referenceDate.getDate()));
      break;
  }

  return { start, end, option };
};

export const resolveDateRange = (
  range: DateRange,
  referenceDate: Date = new Date()
): DateRange => {
  if (range.option === "custom") {
    return range;
  }

  return getPresetDateRange(range.option, referenceDate);
};

export const getMonthCountForDateRangeOption = (option: DateRangeOption): number | null => {
  switch (option) {
    case "this-month":
    case "last-month":
      return 1;
    case "last-3-months":
      return 3;
    case "last-6-months":
      return 6;
    case "last-12-months":
      return 12;
    default:
      return null;
  }
};
