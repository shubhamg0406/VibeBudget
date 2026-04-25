import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  DownloadCloud,
  FileSpreadsheet,
  Link2,
  Table as TableIcon,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import {
  getGoogleSheetsAccessErrorMessage,
  ImportFieldDefinition,
  SheetTabPreview,
  buildCellRef,
  getFullSheetGridRows,
  getSheetColumnValuesUntilEmptyRun,
  getSheetPreviewRows,
  getSheetTabPreviews,
  parseA1CellReference,
  parseSpreadsheetId,
  trimValuesAtEmptyRun,
} from "../utils/googleSheetsSync";
import { normalizeDateString } from "../utils/dateUtils";
import {
  PublicSheetImportCellCoordinate,
  PublicSheetImportConfig,
  PublicSheetImportSharedConfig,
  PublicSheetImportRangeSelection,
} from "../types";
import { useFirebase } from "../contexts/FirebaseContext";

interface GoogleSheetImporterProps {
  initialType: "expenseCategories" | "incomeCategories" | "expenses" | "income";
  onClose: () => void;
  onImport: (type: "expenseCategories" | "incomeCategories" | "expenses" | "income", data: any[], override: boolean) => Promise<void>;
}

interface ImportTypeConfig {
  fields: ImportFieldDefinition[];
  parseRow: (getValue: (field: string) => string) => any[] | null;
}

type ImporterType = "expenseCategories" | "incomeCategories" | "expenses" | "income";
type FieldRangeDraft = { startCell: string; endCell: string; noEndColumn: boolean };

interface FieldPreview {
  headerCellRef: string;
  headerValue: string;
  firstDataCellRef: string;
  lastDataCellRef: string;
  firstDataValue: string;
  lastDataValue: string;
  values: Array<{ cellRef: string; value: string }>;
}

type FieldPreviewMap = Partial<Record<ImporterType, Record<string, FieldPreview>>>;

const SHARED_IMPORT_CONFIG_KEY = "googleSheetImport_shared";

const IMPORT_TABS: { type: ImporterType; label: string; enabled: boolean }[] = [
  { type: "expenseCategories", label: "Expense Categories", enabled: true },
  { type: "incomeCategories", label: "Income Categories", enabled: true },
  { type: "expenses", label: "Expenses", enabled: true },
  { type: "income", label: "Income", enabled: true },
];

const IMPORT_CONFIGS: Record<"expenseCategories" | "incomeCategories" | "expenses" | "income", ImportTypeConfig> = {
  expenseCategories: {
    fields: [
      { field: "targetName", label: "Category Name", aliases: ["category", "name", "target name"], required: true },
      { field: "targetAmount", label: "Monthly Target", aliases: ["target", "amount", "budget", "expense target"], required: true },
    ],
    parseRow: (getValue) => {
      const name = getValue("targetName").trim();
      const amount = parseAmount(getValue("targetAmount"));
      if (!name) return null;
      return [name, amount];
    },
  },
  incomeCategories: {
    fields: [
      { field: "targetName", label: "Category Name", aliases: ["category", "name", "income category"], required: true },
      { field: "targetAmount", label: "Monthly Target", aliases: ["target", "amount", "budget", "income target"], required: true },
    ],
    parseRow: (getValue) => {
      const name = getValue("targetName").trim();
      const amount = parseAmount(getValue("targetAmount"));
      if (!name) return null;
      return [name, amount];
    },
  },
  expenses: {
    fields: [
      { field: "date", label: "Date", aliases: ["transaction date", "expense date"], required: true },
      { field: "vendor", label: "Vendor", aliases: ["store", "merchant", "payee"], required: true },
      { field: "amount", label: "Amount", aliases: ["total", "value", "spent"], required: true },
      { field: "category", label: "Category", aliases: ["expense category"], required: true },
      { field: "notes", label: "Notes", aliases: ["memo", "description"], required: false },
    ],
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
    fields: [
      { field: "date", label: "Date", aliases: ["income date"], required: true },
      { field: "source", label: "Source", aliases: ["payer", "income source"], required: true },
      { field: "amount", label: "Amount", aliases: ["total", "value"], required: true },
      { field: "category", label: "Category", aliases: ["income category"], required: true },
      { field: "notes", label: "Notes", aliases: ["memo", "description"], required: false },
    ],
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

const parseAmount = (value: string) => {
  if (!value) return 0;
  const cleaned = value.replace(/[^-0-9.]/g, "");
  return Number.parseFloat(cleaned) || 0;
};

const parseDate = (value: string) => {
  if (!value) return "";
  const normalized = normalizeDateString(value.trim().replace(/^"|"$/g, ""));
  return normalized || "";
};

const normalizeCellDraft = (value: string) => value.trim().toUpperCase();

const getSelectionHeaderCell = (selection: PublicSheetImportRangeSelection) => (
  selection.start.cellRef || buildCellRef(selection.start.rowIndex, selection.start.columnIndex)
);

const getSelectionFirstDataCell = (selection: PublicSheetImportRangeSelection) => (
  buildCellRef(selection.start.rowIndex + 1, selection.start.columnIndex)
);

const getSelectionLastDataCell = (selection: PublicSheetImportRangeSelection) => (
  selection.end.cellRef || buildCellRef(selection.end.rowIndex, selection.end.columnIndex)
);

const toStoredMapping = (mapping: Record<string, PublicSheetImportRangeSelection>) => (
  Object.fromEntries(
    Object.entries(mapping).filter(([, selection]) => (
      selection &&
      selection.start.rowIndex > 0 &&
      selection.end.rowIndex > 0
    ))
  )
);

const convertLegacySelection = (field: string, legacyValue: unknown): [string, PublicSheetImportRangeSelection] | null => {
  if (!legacyValue || typeof legacyValue !== "object") return null;
  const maybeSelection = legacyValue as { rowIndex?: number; columnIndex?: number; headerLabel?: string };
  if (!Number.isInteger(maybeSelection.rowIndex) || !Number.isInteger(maybeSelection.columnIndex)) return null;

  const rowIndex = maybeSelection.rowIndex as number;
  const columnIndex = maybeSelection.columnIndex as number;
  const cellRef = buildCellRef(rowIndex, columnIndex);
  const displayValue = maybeSelection.headerLabel || cellRef;

  return [
    field,
    {
      start: { rowIndex, columnIndex, cellRef, displayValue },
      end: { rowIndex, columnIndex, cellRef, displayValue },
    },
  ];
};

const validateRange = (selection?: PublicSheetImportRangeSelection) => {
  if (!selection) return "Provide a start cell.";
  if (selection.extendToSheetEnd) {
    return null;
  }
  if (selection.start.columnIndex !== selection.end.columnIndex) {
    return "Start and end cells must stay in the same column.";
  }
  if (selection.end.rowIndex < selection.start.rowIndex) {
    return "End cell must be on or after the start cell.";
  }
  return null;
};

const getImportConfigKey = (type: ImporterType) => `googleSheetImport_${type}`;

const readSharedImportConfig = () => {
  const raw = localStorage.getItem(SHARED_IMPORT_CONFIG_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PublicSheetImportSharedConfig;
  } catch (error) {
    console.error("Failed to restore shared import config", error);
    return null;
  }
};

const persistSharedImportConfig = (config: PublicSheetImportSharedConfig) => {
  localStorage.setItem(SHARED_IMPORT_CONFIG_KEY, JSON.stringify(config));
};

const persistImportConfig = (
  type: ImporterType,
  config: PublicSheetImportConfig
) => {
  localStorage.setItem(getImportConfigKey(type), JSON.stringify(config));
};

export const GoogleSheetImporter: React.FC<GoogleSheetImporterProps> = ({ initialType, onClose, onImport }) => {
  const { googleSheetsAccessToken, googleSheetsConfig } = useFirebase();
  const [activeType, setActiveType] = useState<ImporterType>(initialType);
  const importConfig = IMPORT_CONFIGS[activeType];

  const [sharedUrl, setSharedUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetTabNameByType, setSheetTabNameByType] = useState<Partial<Record<ImporterType, string>>>({});
  const [tabsLoading, setTabsLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharedUrlError, setSharedUrlError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detectedTabs, setDetectedTabs] = useState<SheetTabPreview[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mappingByType, setMappingByType] = useState<Partial<Record<ImporterType, Record<string, PublicSheetImportRangeSelection>>>>({});
  const [draftsByType, setDraftsByType] = useState<Partial<Record<ImporterType, Record<string, FieldRangeDraft>>>>({});
  const [fieldPreviewsByType, setFieldPreviewsByType] = useState<FieldPreviewMap>({});
  const [overrideByType, setOverrideByType] = useState<Record<ImporterType, boolean>>({
    expenseCategories: false,
    incomeCategories: false,
    expenses: false,
    income: false,
  });

  const mapping = mappingByType[activeType] || {};
  const drafts = draftsByType[activeType] || {};
  const fieldPreviews = fieldPreviewsByType[activeType] || {};
  const override = overrideByType[activeType];
  const sheetTabName = sheetTabNameByType[activeType] || "";
  const syncSpreadsheetUrl = googleSheetsConfig?.spreadsheetUrl?.trim() || "";
  const activeSourceUrl = syncSpreadsheetUrl || sharedUrl;
  const usingSyncSpreadsheet = Boolean(syncSpreadsheetUrl);

  const requiredFields = useMemo(
    () => importConfig?.fields.filter((field) => field.required).map((field) => field.field) || [],
    [importConfig]
  );

  const fieldErrors = useMemo(() => {
    const next: Record<string, string | null> = {};
    if (!importConfig) return next;
    importConfig.fields.forEach((field) => {
      next[field.field] = validateRange(mapping[field.field]);
    });
    return next;
  }, [importConfig, mapping]);

  const canImport = useMemo(() => {
    if (!importConfig) return false;
    return requiredFields.every((field) => !fieldErrors[field]);
  }, [fieldErrors, importConfig, requiredFields]);

  useEffect(() => {
    const sharedConfig = readSharedImportConfig();
    const nextMappingByType: Partial<Record<ImporterType, Record<string, PublicSheetImportRangeSelection>>> = {};
    const nextOverrideByType: Partial<Record<ImporterType, boolean>> = {};
    const nextTabByType: Partial<Record<ImporterType, string>> = {};
    const legacyUrls: string[] = [];

    IMPORT_TABS.forEach((tab) => {
      const saved = localStorage.getItem(getImportConfigKey(tab.type));
      if (!saved) return;

      try {
        const parsed = JSON.parse(saved) as PublicSheetImportConfig & {
          sheetUrl?: string;
          spreadsheetId?: string;
          mapping?: Record<string, unknown>;
        };

        if (parsed.sheetUrl) legacyUrls.push(parsed.sheetUrl);
        if (parsed.sheetTabName) nextTabByType[tab.type] = parsed.sheetTabName;
        nextOverrideByType[tab.type] = parsed.override || false;

        if (parsed.mapping) {
          nextMappingByType[tab.type] = Object.fromEntries(
            Object.entries(parsed.mapping)
              .map(([field, value]) => {
                const candidate = value as { start?: unknown; end?: unknown } | null;
                if (candidate && typeof candidate === "object" && "start" in candidate && "end" in candidate) {
                  return [field, value as PublicSheetImportRangeSelection];
                }
                return convertLegacySelection(field, value);
              })
              .filter((entry): entry is [string, PublicSheetImportRangeSelection] => Boolean(entry))
          );
        }
      } catch (loadError) {
        console.error("Failed to restore Google Sheet import config", loadError);
      }
    });

    if (Object.keys(nextMappingByType).length > 0) {
      setMappingByType((current) => ({ ...current, ...nextMappingByType }));
    }

    if (Object.keys(nextOverrideByType).length > 0) {
      setOverrideByType((current) => ({ ...current, ...nextOverrideByType }));
    }

    if (Object.keys(nextTabByType).length > 0) {
      setSheetTabNameByType((current) => ({ ...current, ...nextTabByType }));
    }

    if (syncSpreadsheetUrl) {
      setSharedUrl(syncSpreadsheetUrl);
      setSpreadsheetId(parseSpreadsheetId(syncSpreadsheetUrl) || "");
      return;
    }

    const fallbackUrl = sharedConfig?.sheetUrl || legacyUrls.find((candidate) => Boolean(parseSpreadsheetId(candidate))) || "";
    if (!fallbackUrl) return;

    const fallbackSpreadsheetId = sharedConfig?.spreadsheetId || parseSpreadsheetId(fallbackUrl) || "";
    setSharedUrl(fallbackUrl);
    setSpreadsheetId(fallbackSpreadsheetId);
    persistSharedImportConfig({ sheetUrl: fallbackUrl, spreadsheetId: fallbackSpreadsheetId });
  }, [initialType, syncSpreadsheetUrl]);

  useEffect(() => {
    const saved = localStorage.getItem(getImportConfigKey(activeType));
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as PublicSheetImportConfig;
      if (parsed.sheetTabName) {
        setSheetTabNameByType((current) => (
          current[activeType] === parsed.sheetTabName
            ? current
            : { ...current, [activeType]: parsed.sheetTabName }
        ));
      }
    } catch (loadError) {
      console.error("Failed to restore Google Sheet import config", loadError);
    }
  }, [activeType]);

  useEffect(() => {
    if (!importConfig) return;
    setDraftsByType((current) => {
      const currentDrafts = current[activeType] || {};
      const nextDrafts = { ...currentDrafts };
      importConfig.fields.forEach((field) => {
        const selection = mapping[field.field];
        if (selection) {
          nextDrafts[field.field] = {
            startCell: selection.start.cellRef,
            endCell: selection.extendToSheetEnd ? "" : selection.end.cellRef,
            noEndColumn: Boolean(selection.extendToSheetEnd),
          };
        } else if (!nextDrafts[field.field]) {
          nextDrafts[field.field] = { startCell: "", endCell: "", noEndColumn: false };
        }
      });
      return { ...current, [activeType]: nextDrafts };
    });
  }, [activeType, importConfig, mapping]);

  useEffect(() => {
    IMPORT_TABS.forEach(({ type }) => {
      const nextSheetTabName = sheetTabNameByType[type]?.trim() || "";
      const nextMapping = toStoredMapping(mappingByType[type] || {});
      const nextOverride = overrideByType[type] || false;

      if (!nextSheetTabName && Object.keys(nextMapping).length === 0 && !nextOverride) {
        return;
      }

      persistImportConfig(type, {
        sheetTabName: nextSheetTabName,
        mapping: nextMapping,
        override: nextOverride,
      });
    });
  }, [mappingByType, overrideByType, sheetTabNameByType]);

  useEffect(() => {
    if (usingSyncSpreadsheet) return;
    const trimmedUrl = activeSourceUrl.trim();
    const nextSpreadsheetId = parseSpreadsheetId(trimmedUrl) || "";
    if (!trimmedUrl || !nextSpreadsheetId) return;

    persistSharedImportConfig({
      sheetUrl: trimmedUrl,
      spreadsheetId: nextSpreadsheetId,
    });
  }, [activeSourceUrl, usingSyncSpreadsheet]);

  useEffect(() => {
    const nextSpreadsheetId = parseSpreadsheetId(activeSourceUrl) || "";
    setSpreadsheetId(nextSpreadsheetId);
    setSharedUrlError(null);

    if (!nextSpreadsheetId || !googleSheetsAccessToken) {
      setDetectedTabs([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setTabsLoading(true);
      try {
        const tabs = await getSheetTabPreviews(googleSheetsAccessToken, nextSpreadsheetId, 6);
        setDetectedTabs(tabs);
        setSharedUrlError(null);
      } catch (loadError) {
        console.error("Tab detection failed", loadError);
        setDetectedTabs([]);
        setSharedUrlError(getGoogleSheetsAccessErrorMessage(loadError));
      } finally {
        setTabsLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [activeSourceUrl, googleSheetsAccessToken]);

  useEffect(() => {
    if (!sheetTabName || !spreadsheetId || previewRows.length > 0 || previewLoading) return;
    void handleLoadPreview();
  }, [sheetTabName, spreadsheetId]);

  const hasSavedConfiguration = useMemo(() => (
    importConfig.fields.some((field) => {
      const draft = drafts[field.field];
      return Boolean(
        mapping[field.field] ||
        draft?.startCell?.trim() ||
        draft?.endCell?.trim()
      );
    })
  ), [drafts, importConfig.fields, mapping]);

  const loadSheetRows = async () => {
    const resolvedSpreadsheetId = parseSpreadsheetId(activeSourceUrl);
    if (!resolvedSpreadsheetId) {
      throw new Error("Enter a valid Google Sheet URL or spreadsheet ID.");
    }

    if (googleSheetsAccessToken) {
      try {
        return await getFullSheetGridRows(googleSheetsAccessToken, resolvedSpreadsheetId, sheetTabName);
      } catch (error) {
        throw new Error(getGoogleSheetsAccessErrorMessage(error));
      }
    }

    const targetUrl = `https://docs.google.com/spreadsheets/d/${resolvedSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTabName)}`;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error("Could not fetch data. Ensure the sheet is public or connect Google Sync.");
    }

    const text = await response.text();
    if (text.trim().startsWith("<!DOCTYPE html>")) {
      throw new Error("Sheet is not public, or URL is incorrect. Link Google to read private sheets.");
    }

    return text
      .split(/\r?\n/)
      .filter((row) => row.trim() !== "")
      .map((row) => splitCSVRow(row).map((cell) => cell.replace(/^"|"$/g, "").trim()));
  };

  const handleLoadPreview = async () => {
    if (!sheetTabName) {
      setError("Choose a sheet tab first.");
      return;
    }

    if (!spreadsheetId) {
      setError("Enter a valid Google Sheet URL or spreadsheet ID.");
      return;
    }

    if (sharedUrlError) {
      setError(sharedUrlError);
      return;
    }

    setPreviewLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const rows = googleSheetsAccessToken
        ? await getSheetPreviewRows(googleSheetsAccessToken, spreadsheetId, sheetTabName, 25)
        : (await loadSheetRows()).slice(0, 25);

      if (rows.length === 0) {
        throw new Error("No preview rows found in that sheet.");
      }

      setPreviewRows(rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load preview rows.";
      setError(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const maybeLoadPreview = async () => {
    if (!sheetTabName || !parseSpreadsheetId(activeSourceUrl) || previewLoading) return;
    await handleLoadPreview();
  };

  const fetchRangeValues = async (selection: PublicSheetImportRangeSelection) => {
    const firstDataRowIndex = selection.start.rowIndex + 1;

    if (selection.extendToSheetEnd) {
      if (googleSheetsAccessToken) {
        const resolvedSpreadsheetId = parseSpreadsheetId(activeSourceUrl);
        if (!resolvedSpreadsheetId) {
          throw new Error("Enter a valid Google Sheet URL or spreadsheet ID.");
        }

        try {
          return await getSheetColumnValuesUntilEmptyRun(
            googleSheetsAccessToken,
            resolvedSpreadsheetId,
            sheetTabName,
            selection.start.columnIndex,
            firstDataRowIndex
          );
        } catch (error) {
          throw new Error(getGoogleSheetsAccessErrorMessage(error));
        }
      }

      const rows = await loadSheetRows();
      const sourceRows = rows.slice(selection.start.rowIndex);
      const columnValues = sourceRows.map((row) => (row[selection.start.columnIndex] || "").trim());
      return trimValuesAtEmptyRun(columnValues);
    }

    const rows = await loadSheetRows();
    const endRowIndex = selection.end.rowIndex;
    if (firstDataRowIndex > endRowIndex) {
      return [];
    }

    return rows
      .slice(selection.start.rowIndex, selection.end.rowIndex)
      .map((row) => (row[selection.start.columnIndex] || "").trim());
  };

  const loadFieldPreview = async (field: string, selection: PublicSheetImportRangeSelection) => {
    const headerCellRef = getSelectionHeaderCell(selection);
    const headerValue = selection.start.displayValue || "";
    const values = await fetchRangeValues(selection);
    const firstDataCellRef = values.length > 0 ? getSelectionFirstDataCell(selection) : "";
    const lastDataCellRef = values.length > 0
      ? (
        selection.extendToSheetEnd
          ? buildCellRef(selection.start.rowIndex + values.length, selection.start.columnIndex)
          : getSelectionLastDataCell(selection)
      )
      : "";
    const previewValues = values.map((value, index) => ({
      cellRef: buildCellRef(selection.start.rowIndex + index + 1, selection.start.columnIndex),
      value,
    }));

    setFieldPreviewsByType((current) => ({
      ...current,
      [activeType]: {
        ...(current[activeType] || {}),
        [field]: {
          headerCellRef,
          headerValue,
          firstDataCellRef,
          lastDataCellRef,
          firstDataValue: values[0] || "",
          lastDataValue: values[values.length - 1] || "",
          values: previewValues,
        },
      },
    }));
  };

  const clearFieldPreview = (field: string) => {
    setFieldPreviewsByType((current) => ({
      ...current,
      [activeType]: {
        ...(current[activeType] || {}),
        [field]: {
          headerCellRef: "",
          headerValue: "",
          firstDataCellRef: "",
          lastDataCellRef: "",
          firstDataValue: "",
          lastDataValue: "",
          values: [],
        },
      },
    }));
  };

  const updateFieldRange = (field: string, startCell: string, endCell: string, noEndColumn = false) => {
    const parsedStart = parseA1CellReference(startCell);
    const parsedEnd = noEndColumn ? parsedStart : parseA1CellReference(endCell);

    if (!parsedStart || !parsedEnd) {
      setMappingByType((currentByType) => {
        const nextMapping = { ...(currentByType[activeType] || {}) };
        delete nextMapping[field];
        return { ...currentByType, [activeType]: nextMapping };
      });
      clearFieldPreview(field);
      return;
    }

    const nextSelection: PublicSheetImportRangeSelection = {
      start: {
        rowIndex: parsedStart.rowIndex,
        columnIndex: parsedStart.columnIndex,
        cellRef: parsedStart.cellRef,
        displayValue: previewRows[parsedStart.rowIndex - 1]?.[parsedStart.columnIndex]?.trim() || parsedStart.cellRef,
      },
      end: {
        rowIndex: parsedEnd.rowIndex,
        columnIndex: parsedEnd.columnIndex,
        cellRef: parsedEnd.cellRef,
        displayValue: previewRows[parsedEnd.rowIndex - 1]?.[parsedEnd.columnIndex]?.trim() || parsedEnd.cellRef,
      },
      extendToSheetEnd: noEndColumn,
    };

    setMappingByType((currentByType) => ({
      ...currentByType,
      [activeType]: {
        ...(currentByType[activeType] || {}),
        [field]: nextSelection,
      },
    }));

    const rangeError = validateRange(nextSelection);
    if (rangeError) {
      clearFieldPreview(field);
      return;
    }

    void loadFieldPreview(field, nextSelection).catch((loadError) => {
      console.error("Failed to load range preview", loadError);
    });
  };

  const commitDraftRange = (field: string) => {
    const draft = drafts[field];
    updateFieldRange(
      field,
      normalizeCellDraft(draft?.startCell || ""),
      normalizeCellDraft(draft?.endCell || ""),
      Boolean(draft?.noEndColumn)
    );
  };

  const applyDraftRange = (field: string, draft: FieldRangeDraft) => {
    updateFieldRange(
      field,
      normalizeCellDraft(draft.startCell || ""),
      normalizeCellDraft(draft.endCell || ""),
      Boolean(draft.noEndColumn)
    );
  };

  useEffect(() => {
    if (!sheetTabName || !spreadsheetId || previewLoading) return;

    const missingPreviewFields = importConfig.fields
      .map((field) => field.field)
      .filter((field) => {
        const selection = mapping[field];
        if (!selection || validateRange(selection)) return false;
        const preview = fieldPreviews[field];
        return !preview || preview.values.length === 0;
      });

    if (missingPreviewFields.length === 0) return;

    let cancelled = false;

    const hydrateFieldPreviews = async () => {
      for (const field of missingPreviewFields) {
        if (cancelled) return;
        const selection = mapping[field];
        if (!selection || validateRange(selection)) continue;

        try {
          await loadFieldPreview(field, selection);
        } catch (loadError) {
          if (!cancelled) {
            console.error("Failed to restore field preview", field, loadError);
          }
        }
      }
    };

    void hydrateFieldPreviews();

    return () => {
      cancelled = true;
    };
  }, [fieldPreviews, importConfig.fields, mapping, previewLoading, sheetTabName, spreadsheetId]);

  const handleImport = async () => {
    setImportLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const validEntries = Object.entries(mapping).filter(([, selection]) => !validateRange(selection));
      const fieldRanges = await Promise.all(
        validEntries.map(async ([field, selection]) => [field, await fetchRangeValues(selection)] as const)
      );

      const valuesByField = new Map(fieldRanges);
      const requiredLengths = requiredFields.map((field) => valuesByField.get(field)?.length || 0).filter((length) => length > 0);
      const rowCount = requiredLengths.length > 0 ? Math.min(...requiredLengths) : 0;

      if (rowCount <= 0) {
        throw new Error("No valid rows found inside the selected required ranges.");
      }

      let skippedRows = 0;
      const parsedRows: any[] = [];
      for (let index = 0; index < rowCount; index += 1) {
        const getValue = (field: string) => (valuesByField.get(field)?.[index] || "").trim();

        if (requiredFields.every((field) => getValue(field) === "") && importConfig.fields.every((field) => getValue(field.field) === "")) {
          continue;
        }

        if (requiredFields.some((field) => getValue(field) === "")) {
          skippedRows += 1;
          continue;
        }

        const parsed = importConfig.parseRow(getValue);
        if (!parsed) {
          skippedRows += 1;
          continue;
        }

        parsedRows.push(parsed);
      }

      if (parsedRows.length === 0) {
        throw new Error(skippedRows > 0 ? `No valid rows found. ${skippedRows} row(s) were skipped.` : "No data rows found.");
      }

      const config: PublicSheetImportConfig = {
        sheetTabName,
        mapping: toStoredMapping(mapping),
        override,
      };
      persistImportConfig(activeType, config);

      if (!usingSyncSpreadsheet && activeSourceUrl) {
        persistSharedImportConfig({
          sheetUrl: activeSourceUrl,
          spreadsheetId: parseSpreadsheetId(activeSourceUrl) || "",
        });
      }

      await onImport(activeType, parsedRows, override);
      const importTypeLabel = IMPORT_TABS.find((tab) => tab.type === activeType)?.label || activeType;
      setSuccessMessage(`${importTypeLabel} import complete: ${parsedRows.length} record(s) imported.`);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Import failed.";
      setError(message);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] backdrop-blur-sm" style={{ backgroundColor: "var(--app-overlay)" }}>
      <button
        type="button"
        aria-label="Close importer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative h-full w-full p-3 sm:p-5 lg:p-7">
        <div className="animate-in fade-in zoom-in-[0.99] flex h-full w-full flex-col overflow-hidden rounded-[32px] border bg-fintech-card shadow-2xl" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-0 flex items-center justify-between border-b px-6 py-5 sm:px-8" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-fintech-accent/10 p-3 text-fintech-accent">
                <TableIcon size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Smart Sheet Importer</h3>
                <p className="text-sm text-fintech-muted">Pick a start cell for each field, then either cap it with an end cell or let it continue until the sheet runs out of data.</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-[var(--app-ghost)]">
              <X size={24} className="text-fintech-muted" />
            </button>
          </div>

          <div className="border-b px-6 py-3 sm:px-8" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex flex-wrap gap-2">
              {IMPORT_TABS.map((tab) => (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => tab.enabled && setActiveType(tab.type)}
                  disabled={!tab.enabled}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    activeType === tab.type
                      ? "bg-fintech-accent text-[#002919]"
                      : tab.enabled
                        ? "bg-[var(--app-ghost)] text-fintech-muted hover:bg-[var(--app-ghost-strong)] hover:text-[var(--app-text)]"
                        : "bg-[var(--app-ghost)] text-fintech-muted/50 opacity-60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mx-6 mb-2 flex items-center gap-3 rounded-xl bg-fintech-danger/10 p-4 text-fintech-danger sm:mx-8">
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mx-6 mb-2 flex items-center gap-3 rounded-xl bg-fintech-accent/10 p-4 text-fintech-accent sm:mx-8">
              <CheckCircle2 size={20} />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
          )}

          <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pr-4 pt-5 custom-scrollbar sm:px-8">
            <div className="space-y-4 rounded-2xl border bg-[var(--app-panel-muted)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Import Source</div>
                  <div className="mt-2 text-sm font-bold text-[var(--app-text)]">One spreadsheet powers every import type</div>
                  <p className="mt-1 text-xs text-fintech-muted">
                    Switch between import types below to change only the tab and field ranges. The spreadsheet link stays shared across imports.
                  </p>
                </div>
                <span className="rounded-full bg-fintech-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-fintech-accent">
                  {usingSyncSpreadsheet ? "From Sync" : "Shared"}
                </span>
              </div>

              {usingSyncSpreadsheet ? (
                <div className="rounded-xl border border-fintech-accent/20 bg-fintech-accent/10 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-fintech-accent">Managed by Google Sheets Sync</div>
                  <div className="mt-2 break-all text-sm text-[var(--app-text)]">{syncSpreadsheetUrl}</div>
                  <p className="mt-2 text-xs text-fintech-muted">
                    Change this spreadsheet in the Google Sheets Sync section in Settings. The importer will automatically reuse it here.
                  </p>
                </div>
              ) : (
                <label className="block space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Shared Spreadsheet URL</span>
                  <div className="relative flex items-center">
                    <Link2 size={16} className="absolute left-4 text-fintech-muted" />
                    <input
                      type="text"
                      value={sharedUrl}
                      onChange={(event) => {
                        setSharedUrl(event.target.value);
                        setPreviewRows([]);
                        setDetectedTabs([]);
                        setError(null);
                        setSharedUrlError(null);
                      }}
                      onBlur={() => {
                        const trimmed = sharedUrl.trim();
                        const nextSpreadsheetId = parseSpreadsheetId(trimmed) || "";
                        if (nextSpreadsheetId) {
                          persistSharedImportConfig({ sheetUrl: trimmed, spreadsheetId: nextSpreadsheetId });
                        }
                        void maybeLoadPreview();
                      }}
                      placeholder="https://docs.google.com/spreadsheets/d/... or spreadsheet ID"
                      className="w-full rounded-xl border bg-[var(--app-ghost)] py-3 pl-10 pr-4 text-sm text-[var(--app-text)] transition-colors focus:border-fintech-accent focus:outline-none"
                      style={{ borderColor: "var(--app-border)" }}
                    />
                  </div>
                  <p className="text-xs text-fintech-muted">
                    Enter this once and reuse it for expense categories, income categories, expenses, and income imports.
                  </p>
                  {sharedUrlError && (
                    <div className="flex items-start gap-2 rounded-xl border border-fintech-danger/20 bg-fintech-danger/10 px-3 py-2 text-xs text-fintech-danger">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>{sharedUrlError}</span>
                    </div>
                  )}
                </label>
              )}
            </div>

            {googleSheetsAccessToken ? (
              tabsLoading ? (
                <div className="flex w-fit items-center gap-2 rounded-lg bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-fintech-accent border-t-transparent" />
                  Loading sheet tabs...
                </div>
              ) : detectedTabs.length > 0 ? (
                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Choose Sheet Tab</span>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {detectedTabs.map((tab) => (
                      <button
                        key={tab.title}
                        onClick={() => setSheetTabNameByType((current) => ({ ...current, [activeType]: tab.title }))}
                        className={`rounded-xl border p-4 text-left transition-all ${sheetTabName === tab.title ? "border-fintech-accent bg-fintech-accent/10" : "bg-[var(--app-ghost)] hover:border-[var(--app-border-strong)]"}`}
                        style={sheetTabName === tab.title ? undefined : { borderColor: "var(--app-border)" }}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--app-text)]">
                          <FileSpreadsheet size={16} className={sheetTabName === tab.title ? "text-fintech-accent" : "text-fintech-muted"} />
                          {tab.title}
                        </div>
                        <div className="rounded-lg bg-[var(--app-panel)] p-2 font-mono text-xs text-fintech-muted">
                          {tab.previewRows.length > 0 ? (
                            tab.previewRows.slice(0, 3).map((row, rowIndex) => (
                              <div key={`${tab.title}-${rowIndex}`} className={`${rowIndex === 0 ? "mb-1 font-bold text-[var(--app-text)]" : ""} truncate`}>
                                {row.slice(0, 4).join(" | ") || "(empty row)"}
                              </div>
                            ))
                          ) : (
                            <div className="py-2 italic">Empty Sheet</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-fintech-muted">No tabs were auto-detected yet. You can still enter the tab name manually.</p>
              )
            ) : (
              <p className="text-xs text-fintech-muted">Sign in with Google Sync to fetch tabs and preview private sheets. Public-sheet import still works with a manual tab name.</p>
            )}

            <label className="block space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">
                Sheet Tab For {IMPORT_TABS.find((tab) => tab.type === activeType)?.label}
              </span>
              <input
                type="text"
                value={sheetTabName}
                onChange={(event) => setSheetTabNameByType((current) => ({ ...current, [activeType]: event.target.value }))}
                onBlur={() => { void maybeLoadPreview(); }}
                placeholder="e.g. Expenses, Sheet1"
                className="w-full rounded-xl border bg-[var(--app-ghost)] px-4 py-3 text-sm text-[var(--app-text)] transition-colors focus:border-fintech-accent focus:outline-none"
                style={{ borderColor: "var(--app-border)" }}
              />
            </label>

            <div className="space-y-4 rounded-2xl border bg-[var(--app-ghost)] p-4" style={{ borderColor: "var(--app-border)" }}>
              <label className="group flex cursor-pointer items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-[var(--app-text)] transition-colors group-hover:text-fintech-accent">Append Data (Upsert)</div>
                  <div className="text-xs text-fintech-muted">Merge with current data by matching date and name.</div>
                </div>
                <div className="relative flex items-center">
                  <input type="radio" checked={!override} onChange={() => setOverrideByType((current) => ({ ...current, [activeType]: false }))} className="h-5 w-5 appearance-none rounded-full border-2 checked:border-fintech-accent transition-all" style={{ borderColor: "var(--app-border)" }} />
                  {!override && <div className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-fintech-accent" />}
                </div>
              </label>

              <label className="group flex cursor-pointer items-center justify-between border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <div>
                  <div className="text-sm font-bold text-[var(--app-text)] transition-colors group-hover:text-fintech-danger">Delete & Override</div>
                  <div className="text-xs text-fintech-muted">Wipes existing {activeType} entirely before importing.</div>
                </div>
                <div className="relative flex items-center">
                  <input type="radio" checked={override} onChange={() => setOverrideByType((current) => ({ ...current, [activeType]: true }))} className="h-5 w-5 appearance-none rounded-full border-2 checked:border-fintech-danger transition-all" style={{ borderColor: "var(--app-border)" }} />
                  {override && <div className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-fintech-danger" />}
                </div>
              </label>
            </div>

            <button
              onClick={handleLoadPreview}
              disabled={previewLoading || !sheetTabName}
              className="mt-6 flex w-full items-center justify-between rounded-2xl bg-fintech-accent/10 p-5 transition-all hover:bg-fintech-accent/20 disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                {previewLoading ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-fintech-accent border-t-transparent" />
                ) : (
                  <DownloadCloud size={24} className="text-fintech-accent" />
                )}
                <span className="text-lg font-bold text-fintech-accent">Load Sheet Preview</span>
              </div>
              <ArrowRight size={20} className="text-fintech-accent" />
            </button>

            {(previewRows.length > 0 || hasSavedConfiguration) && (
              <div className="rounded-xl border bg-[var(--app-ghost)] p-4 text-sm text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
                This import type keeps its own tab and ranges. Enter exact original-sheet cells like <span className="font-semibold text-[var(--app-text)]">B6</span> to <span className="font-semibold text-[var(--app-text)]">B20</span>, or enable <span className="font-semibold text-[var(--app-text)]">No End Column</span> to keep reading down that column for as long as the sheet has data.
              </div>
            )}

            {(previewRows.length > 0 || hasSavedConfiguration) && (
              <div className="overflow-hidden rounded-2xl border bg-[var(--app-panel-muted)]" style={{ borderColor: "var(--app-border)" }}>
                <div className="grid grid-cols-[minmax(170px,0.8fr)_110px_minmax(320px,1.2fr)_minmax(260px,1.1fr)] gap-px text-[11px] uppercase tracking-widest text-fintech-muted" style={{ backgroundColor: "var(--app-border)" }}>
                  <div className="bg-[var(--app-panel-strong)] px-4 py-3">Destination Field</div>
                  <div className="bg-[var(--app-panel-strong)] px-4 py-3">Need</div>
                  <div className="bg-[var(--app-panel-strong)] px-4 py-3">Source Range</div>
                  <div className="bg-[var(--app-panel-strong)] px-4 py-3">Range Preview</div>
                </div>
                {importConfig.fields.map((field) => {
                  const selectedRange = mapping[field.field];
                  const rangeError = fieldErrors[field.field];
                  const preview = fieldPreviews[field.field];
                  const samples = preview?.values.slice(0, 4) || [];

                  return (
                    <div
                      key={field.field}
                      className="grid grid-cols-[minmax(170px,0.8fr)_110px_minmax(320px,1.2fr)_minmax(260px,1.1fr)] gap-px border-t"
                      style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-border)" }}
                    >
                      <div className="bg-[var(--app-panel)] px-4 py-4">
                        <div className="text-sm font-bold text-[var(--app-text)]">{field.label}</div>
                        <div className="mt-1 text-xs text-fintech-muted">
                          {field.required ? "Required destination field" : "Optional destination field"}
                        </div>
                      </div>
                      <div className="bg-[var(--app-panel)] px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${field.required ? "bg-fintech-accent/15 text-fintech-accent" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>
                          {field.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <div className="bg-[var(--app-panel)] px-4 py-4">
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Start cell"
                            value={drafts[field.field]?.startCell || ""}
                            onChange={(event) => {
                              const value = normalizeCellDraft(event.target.value);
                              setDraftsByType((current) => ({
                                ...current,
                                [activeType]: {
                                  ...(current[activeType] || {}),
                                  [field.field]: {
                                    startCell: value,
                                    endCell: drafts[field.field]?.endCell || "",
                                    noEndColumn: drafts[field.field]?.noEndColumn || false,
                                  },
                                },
                              }));
                            }}
                            onBlur={() => commitDraftRange(field.field)}
                            className="w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-fintech-accent focus:outline-none"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                          <input
                            type="text"
                            placeholder="End cell"
                            value={drafts[field.field]?.endCell || ""}
                            disabled={drafts[field.field]?.noEndColumn}
                            onChange={(event) => {
                              const value = normalizeCellDraft(event.target.value);
                              setDraftsByType((current) => ({
                                ...current,
                                [activeType]: {
                                  ...(current[activeType] || {}),
                                  [field.field]: {
                                    startCell: drafts[field.field]?.startCell || "",
                                    endCell: value,
                                    noEndColumn: drafts[field.field]?.noEndColumn || false,
                                  },
                                },
                              }));
                            }}
                            onBlur={() => commitDraftRange(field.field)}
                            className="w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-fintech-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                        </div>
                        <label className="mt-3 flex items-center gap-3 text-xs text-fintech-muted">
                          <input
                            type="checkbox"
                            checked={drafts[field.field]?.noEndColumn || false}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              const nextDraft = {
                                startCell: drafts[field.field]?.startCell || "",
                                endCell: checked ? "" : drafts[field.field]?.endCell || "",
                                noEndColumn: checked,
                              };
                              setDraftsByType((current) => ({
                                ...current,
                                [activeType]: {
                                  ...(current[activeType] || {}),
                                  [field.field]: nextDraft,
                                },
                              }));
                              applyDraftRange(field.field, nextDraft);
                            }}
                            className="h-4 w-4 rounded border bg-[var(--app-ghost)] text-fintech-accent focus:ring-fintech-accent"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                          <span>No End Column: keep reading until the last non-empty row in this column.</span>
                        </label>
                        <div className="mt-2 text-xs text-fintech-muted">
                          {selectedRange ? (
                            <>
                              {selectedRange.extendToSheetEnd ? (
                                <>
                                  Reads from <span className="font-semibold text-[var(--app-text)]">{selectedRange.start.cellRef}</span> downward until the last non-empty row in that column.
                                  {preview?.lastDataCellRef ? (
                                    <>
                                      {" "}Last detected data: <span className="font-semibold text-[var(--app-text)]">{preview.lastDataCellRef}</span> = <span className="font-semibold text-[var(--app-text)]">{preview.lastDataValue || "(empty)"}</span>.
                                    </>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  Reads only from <span className="font-semibold text-[var(--app-text)]">{selectedRange.start.cellRef}</span> to <span className="font-semibold text-[var(--app-text)]">{selectedRange.end.cellRef}</span>.
                                </>
                              )}
                            </>
                          ) : (
                            "Enter a start cell and either an end cell or enable No End Column."
                          )}
                        </div>
                        {rangeError && (!drafts[field.field]?.startCell || (!drafts[field.field]?.endCell && !drafts[field.field]?.noEndColumn) ? field.required : true) && (
                          <div className="mt-2 text-xs font-medium text-fintech-danger">{rangeError}</div>
                        )}
                      </div>
                      <div className="bg-[var(--app-panel)] px-4 py-4">
                        {preview && samples.length > 0 ? (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-fintech-accent/30 bg-fintech-accent/10 px-3 py-2 text-xs text-[var(--app-text)]">
                              Header: {preview.headerCellRef} = {preview.headerValue || "(empty)"}<br />
                              Data: {preview.firstDataCellRef} to {preview.lastDataCellRef || "(none)"}<br />
                              Last value: {preview.lastDataCellRef || "(none)"} = {preview.lastDataValue || "(empty)"}
                            </div>
                            {samples.map((sample, index) => (
                              <div key={`${field.field}-sample-${index}`} className="truncate rounded-lg bg-[var(--app-ghost)] px-3 py-2 text-xs text-[var(--app-text)]">
                                {sample.cellRef} = {sample.value || "(empty)"}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed px-3 py-4 text-xs text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
                            No preview yet. Enter a header cell and the last data cell, or enable No End Column.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-4">
              <motion.button
                onClick={handleImport}
                disabled={!canImport || importLoading || !sheetTabName || !hasSavedConfiguration}
                className="flex items-center justify-center gap-2 rounded-xl border bg-[var(--app-ghost)] px-5 py-4 font-bold text-[var(--app-text)] transition-colors hover:bg-[var(--app-ghost-strong)] disabled:opacity-50"
                style={{ borderColor: "var(--app-border)" }}
                whileTap={{ scale: canImport && !importLoading ? 0.99 : 1 }}
              >
                {importLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--app-text)] border-t-transparent" /> : <DownloadCloud size={18} />}
                <span>Refresh Data</span>
              </motion.button>
              <motion.button
                onClick={handleImport}
                disabled={!canImport || importLoading || !sheetTabName}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fintech-accent py-4 font-bold text-[#002919] shadow-lg transition-colors hover:bg-fintech-accent/90 disabled:opacity-50"
                whileTap={{ scale: canImport && !importLoading ? 0.99 : 1 }}
              >
                {importLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#002919] border-t-transparent" /> : <CheckCircle2 size={18} />}
                <span>Start Import</span>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
