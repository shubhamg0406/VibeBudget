import {
  PublicSheetImportConfig,
  PublicSheetImportRangeSelection,
  PublicSheetImportSharedConfig,
} from "../types";
import {
  getFullSheetGridRows,
  getGoogleSheetsAccessErrorMessage,
  getSheetColumnValuesUntilEmptyRun,
  parseSpreadsheetId,
  trimValuesAtEmptyRun,
} from "./googleSheetsSync";
import { normalizeDateString } from "./dateUtils";

type TransactionImportType = "expenses" | "income";

interface ImportFieldConfig {
  required: string[];
  parseRow: (getValue: (field: string) => string) => any[] | null;
}

const SHARED_IMPORT_CONFIG_KEY = "googleSheetImport_shared";
const TRANSACTION_IMPORT_TYPES: TransactionImportType[] = ["expenses", "income"];

/** Key under which we store the last-imported row cursor per type */
const CURSOR_PREFIX = "googleSheetImport_cursor_";

const IMPORT_CONFIGS: Record<TransactionImportType, ImportFieldConfig> = {
  expenses: {
    required: ["date", "vendor", "amount", "category"],
    parseRow: (getValue) => {
      const date = parseDate(getValue("date"));
      const vendor = getValue("vendor").trim();
      const amount = parseAmount(getValue("amount"));
      const category = getValue("category").trim();
      const notes = getValue("notes").trim();
      if (!date || !vendor || !category) return null;
      return [date, vendor, amount, category, notes];
    },
  },
  income: {
    required: ["date", "source", "amount", "category"],
    parseRow: (getValue) => {
      const date = parseDate(getValue("date"));
      const source = getValue("source").trim();
      const amount = parseAmount(getValue("amount"));
      const category = getValue("category").trim();
      const notes = getValue("notes").trim();
      if (!date || !source || !category) return null;
      return [date, source, amount, category, notes];
    },
  },
};

export interface SheetImportRefreshResult {
  expenses: number;
  income: number;
}

export interface SheetImportSingleRefreshResult {
  imported: number;
}

/** Detailed result from a delta refresh */
export interface SheetImportDeltaResult {
  newRows: number;
  updatedRows: number;
  skippedDuplicates: number;
  totalParsed: number;
}

const getImportConfigKey = (type: TransactionImportType) => `googleSheetImport_${type}`;

const readJson = <T>(key: string): T | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const parseAmount = (value: string) => {
  if (!value) return 0;
  const cleaned = value.replace(/[^-0-9.]/g, "");
  return Number.parseFloat(cleaned) || 0;
};

const parseDate = (value: string) => {
  if (!value) return "";
  return normalizeDateString(value.trim().replace(/^"|"$/g, "")) || "";
};

const splitCSVRow = (row: string) => {
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
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

const hasUsableMapping = (config: PublicSheetImportConfig | null) => (
  Boolean(config?.sheetTabName && config.mapping && Object.keys(config.mapping).length > 0)
);

export const hasSavedTransactionSheetImportConfig = () => (
  TRANSACTION_IMPORT_TYPES.some((type) => hasUsableMapping(readJson<PublicSheetImportConfig>(getImportConfigKey(type))))
);

const getSourceUrl = (typeConfig: PublicSheetImportConfig & { sheetUrl?: string }) => {
  const sharedConfig = readJson<PublicSheetImportSharedConfig>(SHARED_IMPORT_CONFIG_KEY);
  return typeConfig.sheetUrl || sharedConfig?.sheetUrl || "";
};

const getSpreadsheetIdForConfig = (typeConfig: PublicSheetImportConfig & { sheetUrl?: string }) => {
  const sourceUrl = getSourceUrl(typeConfig);
  const spreadsheetId = parseSpreadsheetId(sourceUrl);
  if (!spreadsheetId) {
    throw new Error("No saved Google Sheet URL found for the transaction import.");
  }

  return spreadsheetId;
};

const loadSheetRows = async (
  typeConfig: PublicSheetImportConfig & { sheetUrl?: string },
  token: string | null,
) => {
  const spreadsheetId = getSpreadsheetIdForConfig(typeConfig);

  if (token) {
    try {
      return await getFullSheetGridRows(token, spreadsheetId, typeConfig.sheetTabName);
    } catch (error) {
      throw new Error(getGoogleSheetsAccessErrorMessage(error));
    }
  }

  const targetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(typeConfig.sheetTabName)}`;
  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error("Could not fetch the saved Google Sheet. Make it public or connect Google Sheets.");
  }

  const text = await response.text();
  if (text.trim().startsWith("<!DOCTYPE html>")) {
    throw new Error("Saved Google Sheet is not public. Connect Google Sheets to read private sheets.");
  }

  return text
    .split(/\r?\n/)
    .filter((row) => row.trim() !== "")
    .map((row) => splitCSVRow(row).map((cell) => cell.replace(/^"|"$/g, "").trim()));
};

const fetchRangeValuesFromRows = (
  rows: string[][],
  selection: PublicSheetImportRangeSelection,
) => {
  const firstDataRowIndex = selection.start.rowIndex + 1;
  const sourceRows = rows.slice(selection.start.rowIndex);
  const columnValues = sourceRows.map((row) => (row[selection.start.columnIndex] || "").trim());

  if (selection.extendToSheetEnd) {
    return trimValuesAtEmptyRun(columnValues);
  }

  if (firstDataRowIndex > selection.end.rowIndex) {
    return [];
  }

  return rows
    .slice(selection.start.rowIndex, selection.end.rowIndex)
    .map((row) => (row[selection.start.columnIndex] || "").trim());
};

const parseRows = async (
  type: TransactionImportType,
  typeConfig: PublicSheetImportConfig & { sheetUrl?: string },
  token: string | null,
  mapping: Record<string, PublicSheetImportRangeSelection>,
) => {
  const importConfig = IMPORT_CONFIGS[type];
  let cachedRows: string[][] | null = null;
  const loadRowsOnce = async () => {
    if (!cachedRows) {
      cachedRows = await loadSheetRows(typeConfig, token);
    }
    return cachedRows;
  };

  const valuesByField = new Map<string, string[]>();
  for (const [field, selection] of Object.entries(mapping)) {
    if (selection.extendToSheetEnd && token) {
      try {
        const values = await getSheetColumnValuesUntilEmptyRun(
          token,
          getSpreadsheetIdForConfig(typeConfig),
          typeConfig.sheetTabName,
          selection.start.columnIndex,
          selection.start.rowIndex + 1,
        );
        valuesByField.set(field, values);
      } catch (error) {
        throw new Error(getGoogleSheetsAccessErrorMessage(error));
      }
    } else {
      valuesByField.set(field, fetchRangeValuesFromRows(await loadRowsOnce(), selection));
    }
  }

  const rowCount = Math.max(...importConfig.required.map((field) => valuesByField.get(field)?.length || 0));
  const parsedRows: any[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const getValue = (field: string) => (valuesByField.get(field)?.[index] || "").trim();

    if (importConfig.required.every((field) => getValue(field) === "")) {
      continue;
    }

    if (importConfig.required.some((field) => getValue(field) === "")) {
      continue;
    }

    const parsed = importConfig.parseRow(getValue);
    if (parsed) {
      parsedRows.push(parsed);
    }
  }

  return parsedRows;
};

/**
 * Build a fingerprint for a parsed row (array of values).
 * Used to detect duplicates across refreshes.
 */
const buildRowFingerprint = (row: any[]): string => {
  return row
    .map((v) => {
      if (typeof v === "number") return v.toFixed(2);
      return String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
    })
    .join("|||");
};

/**
 * Get the stored cursor (last imported absolute row index) for a given type.
 */
const getStoredCursor = (type: TransactionImportType): number | null => {
  const raw = localStorage.getItem(`${CURSOR_PREFIX}${type}`);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Store the cursor (last imported absolute row index) for a given type.
 */
const storeCursor = (type: TransactionImportType, absoluteRowIndex: number) => {
  localStorage.setItem(`${CURSOR_PREFIX}${type}`, String(absoluteRowIndex));
};

/**
 * Clear the stored cursor for a given type.
 */
const clearCursor = (type: TransactionImportType) => {
  localStorage.removeItem(`${CURSOR_PREFIX}${type}`);
};

/**
 * Get the stored fingerprints from the last import for a given type.
 * This allows us to detect if existing rows have been modified.
 */
const getStoredFingerprints = (type: TransactionImportType): Set<string> | null => {
  const raw = localStorage.getItem(`${CURSOR_PREFIX}fingerprints_${type}`);
  if (!raw) return null;
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return null;
  }
};

/**
 * Store fingerprints for a given type.
 */
const storeFingerprints = (type: TransactionImportType, fingerprints: string[]) => {
  localStorage.setItem(`${CURSOR_PREFIX}fingerprints_${type}`, JSON.stringify(fingerprints));
};

/**
 * Clear stored fingerprints for a given type.
 */
const clearFingerprints = (type: TransactionImportType) => {
  localStorage.removeItem(`${CURSOR_PREFIX}fingerprints_${type}`);
};

/**
 * Check if there is new data available in the sheet since the last import.
 * Returns the count of new rows and whether any existing rows have changed.
 */
export const checkForNewSheetData = async (
  type: TransactionImportType,
  token: string | null,
): Promise<{ hasNewData: boolean; newRowCount: number; changedRowCount: number }> => {
  const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
  if (!hasUsableMapping(config)) {
    return { hasNewData: false, newRowCount: 0, changedRowCount: 0 };
  }

  const cursor = getStoredCursor(type);
  const storedFingerprints = getStoredFingerprints(type);

  // If no cursor or fingerprints stored, we can't do delta detection
  if (cursor === null || !storedFingerprints) {
    // Fall back: just check if there are any rows at all
    const parsedRows = await parseRows(type, config!, token, config!.mapping);
    return {
      hasNewData: parsedRows.length > 0,
      newRowCount: parsedRows.length,
      changedRowCount: 0,
    };
  }

  // Parse all rows to compare
  const parsedRows = await parseRows(type, config!, token, config!.mapping);

  // Check for new rows beyond the cursor
  const newRows = parsedRows.slice(cursor);
  const newRowCount = newRows.length;

  // Check for changes in previously imported rows
  let changedRowCount = 0;
  for (let i = 0; i < Math.min(cursor, parsedRows.length); i += 1) {
    const fingerprint = buildRowFingerprint(parsedRows[i]);
    if (!storedFingerprints.has(fingerprint)) {
      changedRowCount += 1;
    }
  }

  return {
    hasNewData: newRowCount > 0 || changedRowCount > 0,
    newRowCount,
    changedRowCount,
  };
};

/**
 * Refresh saved transaction sheet imports with delta detection.
 * Only imports rows that are new or changed since the last refresh.
 * Returns detailed summary including duplicates flagged.
 */
export const refreshSavedTransactionSheetImports = async (
  token: string | null,
  upsertGoogleSheetRows: (type: TransactionImportType, rows: any[]) => Promise<{ imported: number; updated: number; skipped: number }>,
): Promise<SheetImportRefreshResult> => {
  const result: SheetImportRefreshResult = { expenses: 0, income: 0 };

  for (const type of TRANSACTION_IMPORT_TYPES) {
    const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
    if (!hasUsableMapping(config)) continue;

    const parsedRows = await parseRows(type, config!, token, config!.mapping);
    if (parsedRows.length === 0) continue;

    const summary = await upsertGoogleSheetRows(type, parsedRows);
    result[type] = summary.imported;

    // Store cursor and fingerprints for future delta detection
    storeCursor(type, parsedRows.length);
    storeFingerprints(type, parsedRows.map(buildRowFingerprint));
  }

  return result;
};

/**
 * Delta refresh: only imports rows that are new or changed since the last cursor.
 * Returns detailed delta information.
 */
export const refreshSavedTransactionSheetImportsDelta = async (
  token: string | null,
  upsertGoogleSheetRows: (type: TransactionImportType, rows: any[]) => Promise<{ imported: number; updated: number; skipped: number }>,
): Promise<Record<TransactionImportType, SheetImportDeltaResult>> => {
  const result: Record<TransactionImportType, SheetImportDeltaResult> = {
    expenses: { newRows: 0, updatedRows: 0, skippedDuplicates: 0, totalParsed: 0 },
    income: { newRows: 0, updatedRows: 0, skippedDuplicates: 0, totalParsed: 0 },
  };

  for (const type of TRANSACTION_IMPORT_TYPES) {
    const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
    if (!hasUsableMapping(config)) continue;

    const parsedRows = await parseRows(type, config!, token, config!.mapping);
    if (parsedRows.length === 0) continue;

    result[type].totalParsed = parsedRows.length;

    const cursor = getStoredCursor(type);
    const storedFingerprints = getStoredFingerprints(type);

    // Determine which rows to import (delta)
    const rowsToImport: any[] = [];
    let newRows = 0;
    let updatedRows = 0;
    let skippedDuplicates = 0;

    if (cursor !== null && storedFingerprints) {
      // Delta mode: only import new rows and changed rows
      for (let i = 0; i < parsedRows.length; i += 1) {
        const fingerprint = buildRowFingerprint(parsedRows[i]);

        if (i < cursor) {
          // Previously imported row - check if changed
          if (storedFingerprints.has(fingerprint)) {
            // Unchanged - skip
            skippedDuplicates += 1;
          } else {
            // Changed - re-import
            rowsToImport.push(parsedRows[i]);
            updatedRows += 1;
          }
        } else {
          // New row beyond cursor
          rowsToImport.push(parsedRows[i]);
          newRows += 1;
        }
      }
    } else {
      // No cursor - import all rows
      rowsToImport.push(...parsedRows);
      newRows = parsedRows.length;
    }

    if (rowsToImport.length > 0) {
      const summary = await upsertGoogleSheetRows(type, rowsToImport);
      // upsertGoogleSheetRows already handles dedup internally
      // The "skipped" from upsert is for invalid rows, not duplicates
    }

    result[type].newRows = newRows;
    result[type].updatedRows = updatedRows;
    result[type].skippedDuplicates = skippedDuplicates;

    // Update cursor and fingerprints
    storeCursor(type, parsedRows.length);
    storeFingerprints(type, parsedRows.map(buildRowFingerprint));
  }

  return result;
};

export const refreshSavedTransactionSheetImportForType = async (
  type: TransactionImportType,
  token: string | null,
  upsertGoogleSheetRows: (type: TransactionImportType, rows: any[]) => Promise<{ imported: number; updated: number; skipped: number }>,
): Promise<SheetImportSingleRefreshResult> => {
  const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
  if (!hasUsableMapping(config)) {
    return { imported: 0 };
  }

  const parsedRows = await parseRows(type, config!, token, config!.mapping);
  if (parsedRows.length === 0) {
    return { imported: 0 };
  }

  const summary = await upsertGoogleSheetRows(type, parsedRows);
  return { imported: summary.imported };
};

export const getSavedTransactionSheetRowsForType = async (
  type: TransactionImportType,
  token: string | null,
): Promise<any[]> => {
  const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
  if (!hasUsableMapping(config)) {
    return [];
  }
  return parseRows(type, config!, token, config!.mapping);
};

/**
 * Get the count of rows that would be imported (for preview purposes).
 */
export const getSavedTransactionSheetRowCount = async (
  type: TransactionImportType,
  token: string | null,
): Promise<number> => {
  const rows = await getSavedTransactionSheetRowsForType(type, token);
  return rows.length;
};

/**
 * Clear all stored cursors and fingerprints (e.g., when reconfiguring).
 */
export const clearAllCursors = () => {
  for (const type of TRANSACTION_IMPORT_TYPES) {
    clearCursor(type);
    clearFingerprints(type);
  }
};
