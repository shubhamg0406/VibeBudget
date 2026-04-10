import {
  ExpenseSheetMapping,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  Income,
  IncomeSheetMapping,
  PublicSheetImportCellCoordinate,
  Transaction,
} from "../types";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_EXPENSE_HEADERS = ["Date", "Vendor", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"];
const DEFAULT_INCOME_HEADERS = ["Date", "Source", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"];

interface SpreadsheetSheet {
  properties?: {
    title?: string;
    gridProperties?: {
      rowCount?: number;
      columnCount?: number;
    };
  };
  data?: Array<{
    startRow?: number;
    startColumn?: number;
    rowData?: Array<{
      values?: Array<{
        formattedValue?: string;
      }>;
    }>;
  }>;
}

interface SpreadsheetMetadataResponse {
  properties?: {
    title?: string;
  };
  sheets?: SpreadsheetSheet[];
}

interface ValueRangeResponse {
  values?: string[][];
}

export interface SheetTabPreview {
  title: string;
  previewRows: string[][];
}

interface SpreadsheetGridResponse {
  sheets?: SpreadsheetSheet[];
}

export interface ImportFieldDefinition {
  field: string;
  label: string;
  aliases: string[];
  required: boolean;
}

export interface HeaderRowDetectionResult {
  headerRowIndex: number;
  confidence: number;
  matchedFields: string[];
}

export interface SheetColumnOption extends PublicSheetImportCellCoordinate {
  value: string;
}

type SheetsKind = "expenses" | "income";

interface SheetRecord {
  rowNumber: number;
  values: Record<string, string>;
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const escapeSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`;

const getColumnLetter = (index: number) => {
  let current = index + 1;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

export const buildCellRef = (rowIndex: number, columnIndex: number) => (
  `${getColumnLetter(columnIndex)}${rowIndex}`
);

export const parseA1CellReference = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const [, letters, rowPart] = match;
  let columnIndex = 0;
  for (const character of letters) {
    columnIndex = (columnIndex * 26) + (character.charCodeAt(0) - 64);
  }

  const rowIndex = Number.parseInt(rowPart, 10);
  if (!Number.isFinite(rowIndex) || rowIndex < 1) return null;

  return {
    rowIndex,
    columnIndex: columnIndex - 1,
    cellRef: trimmed,
  };
};

export const buildA1Range = (sheetName: string, startCellRef: string, endCellRef: string) => (
  `${escapeSheetName(sheetName)}!${startCellRef}:${endCellRef}`
);

const buildRowRange = (sheetName: string, rowNumber: number, columnCount: number) => (
  `${escapeSheetName(sheetName)}!A${rowNumber}:${getColumnLetter(Math.max(columnCount - 1, 0))}${rowNumber}`
);

const parseAmount = (value: string) => {
  const cleaned = value.replace(/[^-0-9.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseSheetDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const [month, day, year] = parts;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultExpenseMapping = (): ExpenseSheetMapping => ({
  date: "Date",
  vendor: "Vendor",
  amount: "Amount",
  category: "Category",
  notes: "Notes",
  id: "VibeBudget ID",
  updatedAt: "Updated At",
});

const getDefaultIncomeMapping = (): IncomeSheetMapping => ({
  date: "Date",
  source: "Source",
  amount: "Amount",
  category: "Category",
  notes: "Notes",
  id: "VibeBudget ID",
  updatedAt: "Updated At",
});

const fetchGoogleSheets = async <T>(token: string, url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Google Sheets request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
};

export const parseSpreadsheetId = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const idFromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (idFromUrl) return idFromUrl;

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};

export const getSpreadsheetMetadata = async (token: string, spreadsheetId: string) => (
  fetchGoogleSheets<SpreadsheetMetadataResponse>(token, `${GOOGLE_SHEETS_API}/${spreadsheetId}`)
);

export const getSheetValues = async (token: string, spreadsheetId: string, range: string) => (
  fetchGoogleSheets<ValueRangeResponse>(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`
  )
);

const buildGridRows = (
  data: SpreadsheetSheet["data"],
  rowCount: number,
  columnCount: number
) => {
  const rows = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ""));

  (data || []).forEach((block) => {
    const startRow = block.startRow || 0;
    const startColumn = block.startColumn || 0;

    (block.rowData || []).forEach((row, rowOffset) => {
      (row.values || []).forEach((cell, columnOffset) => {
        const targetRow = startRow + rowOffset;
        const targetColumn = startColumn + columnOffset;
        if (targetRow < rowCount && targetColumn < columnCount) {
          rows[targetRow][targetColumn] = cell.formattedValue || "";
        }
      });
    });
  });

  return rows;
};

export const getSheetGridRows = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  rowCount = 50
) => {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  const sheet = (metadata.sheets || []).find((entry) => entry.properties?.title === sheetName);
  const columnCount = Math.max(sheet?.properties?.gridProperties?.columnCount || 1, 1);

  const response = await fetchGoogleSheets<SpreadsheetGridResponse>(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}?ranges=${encodeURIComponent(`${escapeSheetName(sheetName)}!1:${rowCount}`)}&includeGridData=true&fields=sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue))))`
  );

  const targetSheet = (response.sheets || [])[0];
  return buildGridRows(targetSheet?.data, rowCount, columnCount);
};

export const getFullSheetGridRows = async (
  token: string,
  spreadsheetId: string,
  sheetName: string
) => {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  const sheet = (metadata.sheets || []).find((entry) => entry.properties?.title === sheetName);
  const rowCount = Math.max(sheet?.properties?.gridProperties?.rowCount || 1, 1);
  const columnCount = Math.max(sheet?.properties?.gridProperties?.columnCount || 1, 1);

  const response = await fetchGoogleSheets<SpreadsheetGridResponse>(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}?ranges=${encodeURIComponent(escapeSheetName(sheetName))}&includeGridData=true&fields=sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue))))`
  );

  const targetSheet = (response.sheets || [])[0];
  return buildGridRows(targetSheet?.data, rowCount, columnCount);
};

export const getSheetTabPreviews = async (
  token: string,
  spreadsheetId: string,
  previewRowCount = 6
): Promise<SheetTabPreview[]> => {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  const sheets = metadata.sheets || [];

  const tabs = await Promise.all(sheets.map(async (sheet) => {
    const title = sheet.properties?.title || "";
    let previewRows: string[][] = [];

    if (title) {
      try {
        previewRows = await getSheetGridRows(token, spreadsheetId, title, previewRowCount);
      } catch (error) {
        console.error("Failed to load sheet preview", title, error);
      }
    }

    return {
      title,
      previewRows,
    };
  }));

  return tabs.filter((tab) => Boolean(tab.title));
};

export const getSheetPreviewRows = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  previewRowCount = 25
) => {
  return getSheetGridRows(token, spreadsheetId, sheetName, previewRowCount);
};

const scoreHeaderCell = (value: string, aliases: string[]) => {
  const normalizedValue = normalizeHeader(value);
  if (!normalizedValue) return 0;

  let bestScore = 0;
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    if (!normalizedAlias) continue;
    if (normalizedValue === normalizedAlias) return 3;
    if (normalizedValue.includes(normalizedAlias) || normalizedAlias.includes(normalizedValue)) {
      bestScore = Math.max(bestScore, 2);
    }
  }

  return bestScore;
};

export const detectHeaderRow = (
  rows: string[][],
  fields: ImportFieldDefinition[]
): HeaderRowDetectionResult => {
  let bestRowIndex = 1;
  let bestScore = -1;
  let bestMatchedFields: string[] = [];

  rows.forEach((row, index) => {
    const nonEmptyCells = row.filter((cell) => cell.trim() !== "").length;
    if (nonEmptyCells === 0) return;

    const matchedFields = fields
      .filter((field) => row.some((cell) => scoreHeaderCell(cell, [field.label, ...field.aliases]) > 0))
      .map((field) => field.field);

    const exactishScore = fields.reduce((total, field) => {
      const bestCellScore = row.reduce((cellBest, cell) => (
        Math.max(cellBest, scoreHeaderCell(cell, [field.label, ...field.aliases]))
      ), 0);
      return total + bestCellScore;
    }, 0);

    const rowScore = exactishScore + Math.min(nonEmptyCells, 8) * 0.05;

    if (
      rowScore > bestScore ||
      (rowScore === bestScore && matchedFields.length > bestMatchedFields.length)
    ) {
      bestScore = rowScore;
      bestRowIndex = index + 1;
      bestMatchedFields = matchedFields;
    }
  });

  return {
    headerRowIndex: bestRowIndex,
    confidence: bestScore > 0 ? bestScore : 0,
    matchedFields: bestMatchedFields,
  };
};

export const buildSheetColumnOptions = (headerRow: string[]): SheetColumnOption[] => {
  return headerRow.map((header, index) => {
    const normalizedHeader = header.trim();
    const headerLabel = normalizedHeader || `Column ${index + 1}`;
    return {
      columnIndex: index,
      rowIndex: 1,
      cellRef: buildCellRef(1, index),
      displayValue: headerLabel,
      value: `${headerLabel} (${getColumnLetter(index)})`,
    };
  });
};

export const updateSheetValues = async (
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
) => {
  await fetchGoogleSheets(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    }
  );
};

export const appendSheetValues = async (
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
) => {
  await fetchGoogleSheets(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    }
  );
};

export const clearSheetValues = async (token: string, spreadsheetId: string, range: string) => {
  await fetchGoogleSheets(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
};

export const batchUpdateSpreadsheet = async (token: string, spreadsheetId: string, requests: unknown[]) => {
  await fetchGoogleSheets(
    token,
    `${GOOGLE_SHEETS_API}/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests }),
    }
  );
};

export const ensureSheetAndHeaders = async (
  token: string,
  spreadsheetId: string,
  sheetName: string,
  requiredHeaders: string[]
) => {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  const existingTitles = new Set((metadata.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean));

  if (!existingTitles.has(sheetName)) {
    await batchUpdateSpreadsheet(token, spreadsheetId, [{ addSheet: { properties: { title: sheetName } } }]);
  }

  const headerRange = `${escapeSheetName(sheetName)}!1:1`;
  const currentHeaders = (await getSheetValues(token, spreadsheetId, headerRange)).values?.[0] || [];
  const mergedHeaders = [...currentHeaders.filter(Boolean)];

  requiredHeaders.forEach((header) => {
    if (!mergedHeaders.includes(header)) {
      mergedHeaders.push(header);
    }
  });

  const finalHeaders = mergedHeaders.length > 0 ? mergedHeaders : requiredHeaders;
  await updateSheetValues(token, spreadsheetId, headerRange, [finalHeaders]);
  return finalHeaders;
};

export const readSheetRecords = async (
  token: string,
  spreadsheetId: string,
  sheetName: string
) => {
  const range = `${escapeSheetName(sheetName)}`;
  const values = (await getSheetValues(token, spreadsheetId, range)).values || [];
  const headers = values[0] || [];
  const rows = values.slice(1);

  const records: SheetRecord[] = rows.map((row, index) => {
    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndex] || "";
    });
    return {
      rowNumber: index + 2,
      values: record,
    };
  });

  return { headers, records };
};

const matchHeader = (headers: string[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.find((header) => normalizedCandidates.includes(normalizeHeader(header))) || "";
};

const detectExpenseMapping = (headers: string[]): ExpenseSheetMapping => ({
  date: matchHeader(headers, ["Date", "Transaction Date"]),
  vendor: matchHeader(headers, ["Vendor", "Store", "Merchant", "Payee"]),
  amount: matchHeader(headers, ["Amount", "Total", "Value"]),
  category: matchHeader(headers, ["Category", "Expense Category"]),
  notes: matchHeader(headers, ["Notes", "Memo", "Description"]),
  id: matchHeader(headers, ["VibeBudget ID", "ID", "Budget ID"]),
  updatedAt: matchHeader(headers, ["Updated At", "Last Updated", "Modified At"]),
});

const detectIncomeMapping = (headers: string[]): IncomeSheetMapping => ({
  date: matchHeader(headers, ["Date", "Income Date"]),
  source: matchHeader(headers, ["Source", "Payer", "Income Source"]),
  amount: matchHeader(headers, ["Amount", "Total", "Value"]),
  category: matchHeader(headers, ["Category", "Income Category"]),
  notes: matchHeader(headers, ["Notes", "Memo", "Description"]),
  id: matchHeader(headers, ["VibeBudget ID", "ID", "Budget ID"]),
  updatedAt: matchHeader(headers, ["Updated At", "Last Updated", "Modified At"]),
});

export const inspectSpreadsheet = async (
  token: string,
  spreadsheetUrl: string,
  expensesSheetName: string,
  incomeSheetName: string
): Promise<GoogleSheetsInspectionResult> => {
  const spreadsheetId = parseSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) {
    throw new Error("Enter a valid Google Sheets URL or spreadsheet ID.");
  }

  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  const expenseHeaders = (await getSheetValues(token, spreadsheetId, `${escapeSheetName(expensesSheetName)}!1:1`).catch(() => ({ values: [] }))).values?.[0] || [];
  const incomeHeaders = (await getSheetValues(token, spreadsheetId, `${escapeSheetName(incomeSheetName)}!1:1`).catch(() => ({ values: [] }))).values?.[0] || [];

  return {
    spreadsheetId,
    spreadsheetTitle: metadata.properties?.title || "Google Sheet",
    expenseHeaders,
    incomeHeaders,
    suggestedExpenseMapping: {
      ...getDefaultExpenseMapping(),
      ...detectExpenseMapping(expenseHeaders),
    },
    suggestedIncomeMapping: {
      ...getDefaultIncomeMapping(),
      ...detectIncomeMapping(incomeHeaders),
    },
  };
};

export const getRequiredHeadersForConfig = (config: GoogleSheetsSyncConfig, kind: SheetsKind) => {
  if (kind === "expenses") {
    const mapping = config.expenseMapping;
    return Array.from(new Set([
      ...DEFAULT_EXPENSE_HEADERS,
      mapping.date,
      mapping.vendor,
      mapping.amount,
      mapping.category,
      mapping.notes,
      mapping.id,
      mapping.updatedAt,
    ].filter(Boolean)));
  }

  const mapping = config.incomeMapping;
  return Array.from(new Set([
    ...DEFAULT_INCOME_HEADERS,
    mapping.date,
    mapping.source,
    mapping.amount,
    mapping.category,
    mapping.notes,
    mapping.id,
    mapping.updatedAt,
  ].filter(Boolean)));
};

const buildExpenseRow = (headers: string[], mapping: ExpenseSheetMapping, item: Transaction) => {
  const valuesByHeader: Record<string, string> = {
    [mapping.date]: item.date,
    [mapping.vendor]: item.vendor,
    [mapping.amount]: String(item.amount),
    [mapping.category]: item.category_name,
    [mapping.notes]: item.notes || "",
    [mapping.id]: item.id,
    [mapping.updatedAt]: item.updated_at || "",
  };

  return headers.map((header) => valuesByHeader[header] || "");
};

const buildIncomeRow = (headers: string[], mapping: IncomeSheetMapping, item: Income) => {
  const valuesByHeader: Record<string, string> = {
    [mapping.date]: item.date,
    [mapping.source]: item.source,
    [mapping.amount]: String(item.amount),
    [mapping.category]: item.category,
    [mapping.notes]: item.notes || "",
    [mapping.id]: item.id,
    [mapping.updatedAt]: item.updated_at || "",
  };

  return headers.map((header) => valuesByHeader[header] || "");
};

export const syncAppDataToSheet = async (
  token: string,
  config: GoogleSheetsSyncConfig,
  transactions: Transaction[],
  income: Income[]
) => {
  const expenseHeaders = await ensureSheetAndHeaders(
    token,
    config.spreadsheetId,
    config.expensesSheetName,
    getRequiredHeadersForConfig(config, "expenses")
  );
  const incomeHeaders = await ensureSheetAndHeaders(
    token,
    config.spreadsheetId,
    config.incomeSheetName,
    getRequiredHeadersForConfig(config, "income")
  );

  const expenseSheet = await readSheetRecords(token, config.spreadsheetId, config.expensesSheetName);
  const incomeSheet = await readSheetRecords(token, config.spreadsheetId, config.incomeSheetName);

  const expenseRowsById = new Map(
    expenseSheet.records
      .map((record) => [record.values[config.expenseMapping.id], record] as const)
      .filter(([id]) => Boolean(id))
  );
  const incomeRowsById = new Map(
    incomeSheet.records
      .map((record) => [record.values[config.incomeMapping.id], record] as const)
      .filter(([id]) => Boolean(id))
  );

  for (const item of transactions) {
    const currentRow = expenseRowsById.get(item.id);
    const rowValues = buildExpenseRow(expenseHeaders, config.expenseMapping, item);
    const rowUpdatedAt = currentRow?.values[config.expenseMapping.updatedAt] || "";

    if (currentRow) {
      if (!rowUpdatedAt || (item.updated_at || "") >= rowUpdatedAt) {
        await updateSheetValues(
          token,
          config.spreadsheetId,
          buildRowRange(config.expensesSheetName, currentRow.rowNumber, expenseHeaders.length),
          [rowValues]
        );
      }
    } else {
      await appendSheetValues(token, config.spreadsheetId, `${escapeSheetName(config.expensesSheetName)}!A1`, [rowValues]);
    }
  }

  for (const item of income) {
    const currentRow = incomeRowsById.get(item.id);
    const rowValues = buildIncomeRow(incomeHeaders, config.incomeMapping, item);
    const rowUpdatedAt = currentRow?.values[config.incomeMapping.updatedAt] || "";

    if (currentRow) {
      if (!rowUpdatedAt || (item.updated_at || "") >= rowUpdatedAt) {
        await updateSheetValues(
          token,
          config.spreadsheetId,
          buildRowRange(config.incomeSheetName, currentRow.rowNumber, incomeHeaders.length),
          [rowValues]
        );
      }
    } else {
      await appendSheetValues(token, config.spreadsheetId, `${escapeSheetName(config.incomeSheetName)}!A1`, [rowValues]);
    }
  }
};

export const clearSheetRowForItem = async (
  token: string,
  config: GoogleSheetsSyncConfig,
  kind: SheetsKind,
  itemId: string
) => {
  const sheetName = kind === "expenses" ? config.expensesSheetName : config.incomeSheetName;
  const mapping = kind === "expenses" ? config.expenseMapping : config.incomeMapping;
  const { headers, records } = await readSheetRecords(token, config.spreadsheetId, sheetName);
  const record = records.find((row) => row.values[mapping.id] === itemId);

  if (!record) return;

  await clearSheetValues(
    token,
    config.spreadsheetId,
    buildRowRange(sheetName, record.rowNumber, headers.length)
  );
};

interface SyncSheetToAppArgs {
  token: string;
  config: GoogleSheetsSyncConfig;
  transactions: Transaction[];
  income: Income[];
  ensureCategoryId: (name: string) => Promise<string>;
  upsertTransaction: (id: string | null, data: Omit<Transaction, "id">) => Promise<void>;
  upsertIncome: (id: string | null, data: Omit<Income, "id">) => Promise<void>;
}

export const syncSheetDataToApp = async ({
  token,
  config,
  transactions,
  income,
  ensureCategoryId,
  upsertTransaction,
  upsertIncome,
}: SyncSheetToAppArgs) => {
  await ensureSheetAndHeaders(
    token,
    config.spreadsheetId,
    config.expensesSheetName,
    getRequiredHeadersForConfig(config, "expenses")
  );
  await ensureSheetAndHeaders(
    token,
    config.spreadsheetId,
    config.incomeSheetName,
    getRequiredHeadersForConfig(config, "income")
  );

  const expenseSheet = await readSheetRecords(token, config.spreadsheetId, config.expensesSheetName);
  const incomeSheet = await readSheetRecords(token, config.spreadsheetId, config.incomeSheetName);

  const transactionsById = new Map(transactions.map((item) => [item.id, item]));
  const incomeById = new Map(income.map((item) => [item.id, item]));

  for (const row of expenseSheet.records) {
    const id = row.values[config.expenseMapping.id] || null;
    const date = parseSheetDate(row.values[config.expenseMapping.date] || "");
    const vendor = row.values[config.expenseMapping.vendor] || "";
    const amount = parseAmount(row.values[config.expenseMapping.amount] || "");
    const categoryName = row.values[config.expenseMapping.category] || "";
    const notes = row.values[config.expenseMapping.notes] || "";
    const updatedAt = row.values[config.expenseMapping.updatedAt] || new Date().toISOString();

    if (!date || !vendor || !categoryName) continue;

    const existing = id ? transactionsById.get(id) : undefined;
    if (existing && existing.updated_at && existing.updated_at >= updatedAt) {
      continue;
    }

    const categoryId = await ensureCategoryId(categoryName);
    await upsertTransaction(id, {
      date,
      vendor,
      amount,
      category_id: categoryId,
      category_name: categoryName,
      notes,
      updated_at: updatedAt,
    });
  }

  for (const row of incomeSheet.records) {
    const id = row.values[config.incomeMapping.id] || null;
    const date = parseSheetDate(row.values[config.incomeMapping.date] || "");
    const source = row.values[config.incomeMapping.source] || "";
    const amount = parseAmount(row.values[config.incomeMapping.amount] || "");
    const category = row.values[config.incomeMapping.category] || "";
    const notes = row.values[config.incomeMapping.notes] || "";
    const updatedAt = row.values[config.incomeMapping.updatedAt] || new Date().toISOString();

    if (!date || !source || !category) continue;

    const existing = id ? incomeById.get(id) : undefined;
    if (existing && existing.updated_at && existing.updated_at >= updatedAt) {
      continue;
    }

    await upsertIncome(id, {
      date,
      source,
      amount,
      category,
      notes,
      updated_at: updatedAt,
    });
  }
};
