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

export const refreshSavedTransactionSheetImports = async (
  token: string | null,
  importData: (type: string, data: any[], isUpsert?: boolean) => Promise<void>,
): Promise<SheetImportRefreshResult> => {
  const result: SheetImportRefreshResult = { expenses: 0, income: 0 };

  for (const type of TRANSACTION_IMPORT_TYPES) {
    const config = readJson<PublicSheetImportConfig & { sheetUrl?: string }>(getImportConfigKey(type));
    if (!hasUsableMapping(config)) continue;

    const parsedRows = await parseRows(type, config!, token, config!.mapping);
    if (parsedRows.length === 0) continue;

    await importData(type, parsedRows, true);
    result[type] = parsedRows.length;
  }

  return result;
};
