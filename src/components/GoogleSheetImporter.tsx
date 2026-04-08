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
  HeaderRowDetectionResult,
  ImportFieldDefinition,
  SheetTabPreview,
  detectHeaderRow,
  getFullSheetGridRows,
  getSheetPreviewRows,
  getSheetTabPreviews,
  getSheetValues,
  parseSpreadsheetId,
} from "../utils/googleSheetsSync";
import { PublicSheetImportConfig, PublicSheetImportColumnSelection } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";

interface GoogleSheetImporterProps {
  initialType: "expenseCategories" | "incomeCategories" | "expenses" | "income" | "investments";
  onClose: () => void;
  onImport: (type: "expenseCategories" | "incomeCategories" | "expenses" | "income" | "investments", data: any[], override: boolean) => Promise<void>;
}

interface ImportTypeConfig {
  fields: ImportFieldDefinition[];
  parseRow: (getValue: (field: string) => string) => any[] | null;
}

type ImporterType = "expenseCategories" | "incomeCategories" | "expenses" | "income" | "investments";
type CoordinateDraft = { column: string; row: string };
type FieldPreviewMap = Partial<Record<ImporterType, Record<string, string[]>>>;

const IMPORT_TABS: { type: ImporterType; label: string; enabled: boolean }[] = [
  { type: "expenseCategories", label: "Expense Categories", enabled: true },
  { type: "incomeCategories", label: "Income Categories", enabled: true },
  { type: "expenses", label: "Expenses", enabled: true },
  { type: "income", label: "Income", enabled: true },
  { type: "investments", label: "Investments", enabled: false },
];

const IMPORT_CONFIGS: Record<"expenseCategories" | "incomeCategories" | "expenses" | "income", ImportTypeConfig> = {
  expenseCategories: {
    fields: [
      { field: "targetName", label: "Category Name", aliases: ["category", "name", "target name"], required: true },
      { field: "targetAmount", label: "Monthly Target", aliases: ["target", "amount", "budget", "expense target"], required: true },
    ],
    parseRow: (getValue) => {
      const name = getValue("targetName") || "Unknown";
      const amount = parseAmount(getValue("targetAmount"));
      if (!name || !Number.isFinite(amount)) return null;
      return [name, amount];
    },
  },
  incomeCategories: {
    fields: [
      { field: "targetName", label: "Category Name", aliases: ["category", "name", "income category"], required: true },
      { field: "targetAmount", label: "Monthly Target", aliases: ["target", "amount", "budget", "income target"], required: true },
    ],
    parseRow: (getValue) => {
      const name = getValue("targetName") || "Unknown";
      const amount = parseAmount(getValue("targetAmount"));
      if (!name || !Number.isFinite(amount)) return null;
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
      const vendor = getValue("vendor") || "Unknown";
      const amount = parseAmount(getValue("amount"));
      const category = getValue("category") || "Misc.";
      const notes = getValue("notes") || "";
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
      const source = getValue("source") || "Unknown";
      const amount = parseAmount(getValue("amount"));
      const category = getValue("category") || "Misc.";
      const notes = getValue("notes") || "";
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

const getTodayStr = () => new Date().toISOString().split("T")[0];

const parseDate = (value: string) => {
  if (!value) return getTodayStr();

  const trimmed = value.trim().replace(/^"|"$/g, "");
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    let year;
    let month;
    let day;

    if (parts[0].length === 4) {
      [year, month, day] = parts;
    } else if (parts[2].length === 4 || parts[2].length === 2) {
      [month, day, year] = parts;
    } else {
      return trimmed;
    }

    return `${(year.length === 2 ? `20${year}` : year)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const columnLabel = (columnIndex: number) => {
  let current = columnIndex + 1;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const isRowEmpty = (row: string[]) => row.every((cell) => cell.trim() === "");

const getColumnSampleValues = (rows: string[][], rowIndex: number, columnIndex: number) => {
  return rows
    .slice(Math.max(rowIndex - 1, 0), Math.max(rowIndex - 1, 0) + 4)
    .map((row) => row[columnIndex]?.trim() || "")
    .filter((value) => value !== "");
};

const getCellValue = (rows: string[][], rowIndex: number, columnIndex: number) => {
  return rows[rowIndex - 1]?.[columnIndex]?.trim() || "";
};

const parseColumnCoordinate = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return parsed > 0 ? parsed - 1 : null;
  }
  if (!/^[A-Z]+$/.test(trimmed)) return null;

  let result = 0;
  for (const character of trimmed) {
    result = result * 26 + (character.charCodeAt(0) - 64);
  }
  return result - 1;
};

const getSelectionCellRef = (selection?: PublicSheetImportColumnSelection) => {
  if (!selection || selection.rowIndex < 1 || selection.columnIndex < 0) return "";
  return `${columnLabel(selection.columnIndex)}${selection.rowIndex}`;
};

const escapeSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`;

const toStoredMapping = (mapping: Record<string, PublicSheetImportColumnSelection>) => {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, selection]) => (
      selection &&
      Number.isInteger(selection.rowIndex) &&
      Number.isInteger(selection.columnIndex)
    ))
  );
};

export const GoogleSheetImporter: React.FC<GoogleSheetImporterProps> = ({ initialType, onClose, onImport }) => {
  const { googleSheetsAccessToken } = useFirebase();
  const [activeType, setActiveType] = useState<ImporterType>(initialType);
  const configKey = `googleSheetImport_${activeType}`;
  const importConfig = activeType === "investments" ? null : IMPORT_CONFIGS[activeType];

  const [url, setUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetTabName, setSheetTabName] = useState("");
  const [tabsLoading, setTabsLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedTabs, setDetectedTabs] = useState<SheetTabPreview[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [headerDetection, setHeaderDetection] = useState<HeaderRowDetectionResult | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [mappingByType, setMappingByType] = useState<Partial<Record<ImporterType, Record<string, PublicSheetImportColumnSelection>>>>({});
  const [draftsByType, setDraftsByType] = useState<Partial<Record<ImporterType, Record<string, CoordinateDraft>>>>({});
  const [fieldPreviewsByType, setFieldPreviewsByType] = useState<FieldPreviewMap>({});
  const [overrideByType, setOverrideByType] = useState<Record<ImporterType, boolean>>({
    expenseCategories: false,
    incomeCategories: false,
    expenses: false,
    income: false,
    investments: false,
  });

  const mapping = mappingByType[activeType] || {};
  const drafts = draftsByType[activeType] || {};
  const fieldPreviews = fieldPreviewsByType[activeType] || {};
  const override = overrideByType[activeType];
  const activeSourceRowIndex = useMemo(() => {
    const selectedRows = Object.values(mapping)
      .map((selection) => selection?.rowIndex)
      .filter((value): value is number => Number.isInteger(value));

    if (selectedRows.length > 0) {
      return Math.min(...selectedRows);
    }

    return headerDetection?.headerRowIndex || headerRowIndex;
  }, [headerDetection?.headerRowIndex, headerRowIndex, mapping]);

  const requiredFields = useMemo(
    () => importConfig?.fields.filter((field) => field.required).map((field) => field.field) || [],
    [importConfig]
  );

  const canImport = useMemo(() => {
    if (!importConfig) return false;
    return requiredFields.every((field) => {
      const selection = mapping[field];
      return Boolean(selection && selection.rowIndex > 0 && selection.columnIndex >= 0);
    });
  }, [importConfig, mapping, requiredFields]);

  useEffect(() => {
    const saved = localStorage.getItem(configKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as PublicSheetImportConfig & { mapping?: Record<string, string> };
      setUrl((current) => current || parsed.sheetUrl || "");
      setSpreadsheetId((current) => current || parsed.spreadsheetId || parseSpreadsheetId(parsed.sheetUrl || "") || "");
      setSheetTabName((current) => current || parsed.sheetTabName || "");
      setHeaderRowIndex((current) => (current > 1 ? current : parsed.headerRowIndex || 1));
      setOverrideByType((current) => ({ ...current, [activeType]: parsed.override || false }));

      if (parsed.mapping) {
        const nextMapping = Object.fromEntries(
          Object.entries(parsed.mapping).map(([field, value]) => {
            if (typeof value === "string") {
              return [field, { rowIndex: parsed.headerRowIndex || 1, columnIndex: -1, headerLabel: value }];
            }
            return [field, value];
          })
        ) as Record<string, PublicSheetImportColumnSelection>;
        setMappingByType((current) => ({ ...current, [activeType]: nextMapping }));
        setDraftsByType((current) => ({
          ...current,
          [activeType]: Object.fromEntries(
            Object.entries(nextMapping).map(([field, selection]) => [
              field,
              { column: columnLabel(selection.columnIndex), row: String(selection.rowIndex) },
            ])
          ),
        }));
      }
    } catch (loadError) {
      console.error("Failed to restore Google Sheet import config", loadError);
    }
  }, [activeType, configKey]);

  useEffect(() => {
    if (!importConfig) return;
    setDraftsByType((current) => {
      const currentDrafts = current[activeType] || {};
      const nextDrafts = { ...currentDrafts };
      importConfig.fields.forEach((field) => {
        const selection = mapping[field.field];
        if (selection) {
          nextDrafts[field.field] = {
            column: columnLabel(selection.columnIndex),
            row: String(selection.rowIndex),
          };
        } else if (!nextDrafts[field.field]) {
          nextDrafts[field.field] = { column: "", row: "" };
        }
      });
      return {
        ...current,
        [activeType]: nextDrafts,
      };
    });
  }, [activeType, importConfig, mapping]);

  useEffect(() => {
    const nextSpreadsheetId = parseSpreadsheetId(url) || "";
    setSpreadsheetId(nextSpreadsheetId);

    if (!nextSpreadsheetId || !googleSheetsAccessToken) {
      setDetectedTabs([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setTabsLoading(true);
      try {
        const tabs = await getSheetTabPreviews(googleSheetsAccessToken, nextSpreadsheetId, 6);
        setDetectedTabs(tabs);
      } catch (loadError) {
        console.error("Tab detection failed", loadError);
        setDetectedTabs([]);
      } finally {
        setTabsLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [googleSheetsAccessToken, url]);

  useEffect(() => {
    if (!importConfig || previewRows.length === 0) return;

    const detection = detectHeaderRow(previewRows, importConfig.fields);
    setHeaderDetection(detection);

    setHeaderRowIndex((current) => {
      const maxIndex = Math.max(previewRows.length, 1);
      if (current >= 1 && current <= maxIndex && Object.keys(mapping).length > 0) {
        return current;
      }
      return detection.headerRowIndex;
    });
  }, [importConfig, mapping, previewRows]);

  if (!importConfig) {
    return null;
  }

  const loadSheetRows = async () => {
    const resolvedSpreadsheetId = parseSpreadsheetId(url);
    if (!resolvedSpreadsheetId) {
      throw new Error("Enter a valid Google Sheet URL or spreadsheet ID.");
    }

    if (googleSheetsAccessToken) {
      return getFullSheetGridRows(googleSheetsAccessToken, resolvedSpreadsheetId, sheetTabName);
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

    setPreviewLoading(true);
    setError(null);
    try {
      let rows: string[][] = [];
      if (googleSheetsAccessToken) {
        rows = await getSheetPreviewRows(googleSheetsAccessToken, spreadsheetId, sheetTabName, 25);
      } else {
        rows = (await loadSheetRows()).slice(0, 25);
      }

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
    if (!sheetTabName || !parseSpreadsheetId(url) || previewLoading) return;
    await handleLoadPreview();
  };

  const fetchFieldColumnValues = async (selection: PublicSheetImportColumnSelection) => {
    const resolvedSpreadsheetId = parseSpreadsheetId(url);
    if (!resolvedSpreadsheetId) {
      throw new Error("Enter a valid Google Sheet URL or spreadsheet ID.");
    }

    const startCell = `${columnLabel(selection.columnIndex)}${selection.rowIndex}`;

    if (googleSheetsAccessToken) {
      const response = await getSheetValues(
        googleSheetsAccessToken,
        resolvedSpreadsheetId,
        `${escapeSheetName(sheetTabName)}!${startCell}:${columnLabel(selection.columnIndex)}`
      );
      return (response.values || []).map((row) => row[0] || "");
    }

    const rows = await loadSheetRows();
    return rows
      .slice(Math.max(selection.rowIndex - 1, 0))
      .map((row) => row[selection.columnIndex] || "");
  };

  const loadFieldPreview = async (field: string, selection: PublicSheetImportColumnSelection) => {
    const values = await fetchFieldColumnValues(selection);
    setFieldPreviewsByType((current) => ({
      ...current,
      [activeType]: {
        ...(current[activeType] || {}),
        [field]: values,
      },
    }));
  };

  const updateFieldSelection = (field: string, updates: { rowIndex?: number | null; columnIndex?: number | null }) => {
    setMappingByType((currentByType) => {
      const current = currentByType[activeType] || {};
      const existing = current[field];
      const nextRowIndex = updates.rowIndex ?? existing?.rowIndex ?? 0;
      const nextColumnIndex = updates.columnIndex ?? existing?.columnIndex ?? -1;

      if (nextRowIndex <= 0 || nextColumnIndex < 0) {
        const nextMapping = { ...current };
        delete nextMapping[field];
        return {
          ...currentByType,
          [activeType]: nextMapping,
        };
      }

      const headerLabel = previewRows[nextRowIndex - 1]?.[nextColumnIndex]?.trim() || "";
      return {
        ...currentByType,
        [activeType]: {
          ...current,
          [field]: {
            rowIndex: nextRowIndex,
            columnIndex: nextColumnIndex,
            headerLabel,
          },
        },
      };
    });
  };

  const commitDraftSelection = (field: string) => {
    const draft = drafts[field];
    const nextColumnIndex = parseColumnCoordinate(draft?.column || "");
    const nextRowIndex = Number.parseInt(draft?.row || "", 10);
    const finalRowIndex = Number.isFinite(nextRowIndex) && nextRowIndex > 0 ? nextRowIndex : null;
    updateFieldSelection(field, {
      columnIndex: nextColumnIndex,
      rowIndex: finalRowIndex,
    });

    if (finalRowIndex && nextColumnIndex !== null && nextColumnIndex >= 0) {
      void loadFieldPreview(field, {
        rowIndex: finalRowIndex,
        columnIndex: nextColumnIndex,
        headerLabel: previewRows[finalRowIndex - 1]?.[nextColumnIndex]?.trim() || "",
      }).catch((loadError) => {
        console.error("Failed to load field preview", loadError);
      });
    } else {
      setFieldPreviewsByType((current) => ({
        ...current,
        [activeType]: {
          ...(current[activeType] || {}),
          [field]: [],
        },
      }));
    }
  };

  const handleImport = async () => {
    setImportLoading(true);
    setError(null);

    try {
      const fieldValueMaps = await Promise.all(
        Object.entries(mapping).map(async ([field, selection]) => {
          const values = await fetchFieldColumnValues(selection);
          const absoluteValues = new Map<number, string>();
          values.forEach((value, index) => {
            absoluteValues.set(selection.rowIndex + index, value);
          });
          return [field, absoluteValues] as const;
        })
      );

      const valuesByField = new Map(fieldValueMaps);
      const startRowIndex = activeSourceRowIndex + 1;
      const maxRowIndex = Math.max(
        ...fieldValueMaps.map(([, valueMap]) => Math.max(...Array.from(valueMap.keys()))),
        startRowIndex
      );
      let skippedRows = 0;

      const parsedRows = Array.from({ length: Math.max(maxRowIndex - startRowIndex + 1, 0) }, (_, offset) => startRowIndex + offset).reduce<any[]>((accumulator, absoluteRowIndex) => {
        const getValue = (field: string) => {
          const valueMap = valuesByField.get(field);
          return valueMap?.get(absoluteRowIndex)?.trim() || "";
        };

        if (requiredFields.every((field) => getValue(field) === "") && importConfig.fields.every((field) => getValue(field.field) === "")) {
          return accumulator;
        }

        const requiredMissing = requiredFields.some((field) => getValue(field) === "");
        if (requiredMissing) {
          skippedRows += 1;
          return accumulator;
        }

        const parsed = importConfig.parseRow(getValue);
        if (!parsed) {
          skippedRows += 1;
          return accumulator;
        }

        accumulator.push(parsed);
        return accumulator;
      }, []);

      if (parsedRows.length === 0) {
        throw new Error(skippedRows > 0 ? `No valid rows found. ${skippedRows} row(s) were skipped.` : "No data rows found.");
      }

      const config: PublicSheetImportConfig = {
        sheetUrl: url,
        spreadsheetId,
        sheetTabName,
        headerRowIndex: activeSourceRowIndex,
        mapping: toStoredMapping(mapping),
        override,
      };
      localStorage.setItem(configKey, JSON.stringify(config));

      await onImport(activeType, parsedRows, override);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Import failed.";
      setError(message);
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] bg-[#040814]/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close importer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative h-full w-full p-3 sm:p-5 lg:p-7">
        <div className="flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-fintech-card shadow-2xl animate-in fade-in zoom-in-[0.99]">
      <div className="mb-0 flex items-center justify-between border-b border-white/10 px-6 py-5 sm:px-8">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-fintech-accent/10 p-3 text-fintech-accent">
            <TableIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Smart Sheet Importer</h3>
            <p className="text-sm text-fintech-muted">Choose a tab, confirm the header row, then match destination fields to source columns.</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-white/5">
          <X size={24} className="text-fintech-muted" />
        </button>
      </div>

      <div className="border-b border-white/10 px-6 py-3 sm:px-8">
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
                    ? "bg-white/5 text-fintech-muted hover:bg-white/10 hover:text-white"
                    : "bg-white/5 text-fintech-muted/50 opacity-60"
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

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pr-4 pt-5 custom-scrollbar sm:px-8">
          <label className="block space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Spreadsheet URL</span>
            <div className="relative flex items-center">
              <Link2 size={16} className="absolute left-4 text-fintech-muted" />
              <input
                type="text"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onBlur={() => { void maybeLoadPreview(); }}
                placeholder="https://docs.google.com/spreadsheets/d/... or spreadsheet ID"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white transition-colors focus:border-fintech-accent focus:outline-none"
              />
            </div>
          </label>

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
                      onClick={() => setSheetTabName(tab.title)}
                      className={`rounded-xl border p-4 text-left transition-all ${sheetTabName === tab.title ? "border-fintech-accent bg-fintech-accent/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                        <FileSpreadsheet size={16} className={sheetTabName === tab.title ? "text-fintech-accent" : "text-fintech-muted"} />
                        {tab.title}
                      </div>
                      <div className="rounded-lg bg-[#121a2d] p-2 font-mono text-xs text-fintech-muted">
                        {tab.previewRows.length > 0 ? (
                          tab.previewRows.slice(0, 3).map((row, rowIndex) => (
                            <div key={`${tab.title}-${rowIndex}`} className={`${rowIndex === 0 ? "mb-1 font-bold text-white" : ""} truncate`}>
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Sheet Tab Name</span>
            <input
              type="text"
              value={sheetTabName}
              onChange={(event) => setSheetTabName(event.target.value)}
              onBlur={() => { void maybeLoadPreview(); }}
              placeholder="e.g. Expenses, Sheet1"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition-colors focus:border-fintech-accent focus:outline-none"
            />
          </label>

          <div className="rounded-2xl border border-white/5 bg-white/5 p-4 space-y-4">
            <label className="group flex cursor-pointer items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white transition-colors group-hover:text-fintech-accent">Append Data (Upsert)</div>
                <div className="text-xs text-fintech-muted">Merge with current data by matching date and name.</div>
              </div>
              <div className="relative flex items-center">
                <input type="radio" checked={!override} onChange={() => setOverrideByType((current) => ({ ...current, [activeType]: false }))} className="h-5 w-5 appearance-none rounded-full border-2 border-white/20 checked:border-fintech-accent transition-all" />
                {!override && <div className="pointer-events-none absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-fintech-accent" />}
              </div>
            </label>

            <label className="group flex cursor-pointer items-center justify-between border-t border-white/10 pt-4">
              <div>
                <div className="text-sm font-bold text-white transition-colors group-hover:text-fintech-danger">Delete & Override</div>
                <div className="text-xs text-fintech-muted">Wipes existing {activeType} entirely before importing.</div>
              </div>
              <div className="relative flex items-center">
                <input type="radio" checked={override} onChange={() => setOverrideByType((current) => ({ ...current, [activeType]: true }))} className="h-5 w-5 appearance-none rounded-full border-2 border-white/20 checked:border-fintech-danger transition-all" />
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
              <span className="text-lg font-bold text-fintech-accent">Load Header Preview</span>
            </div>
            <ArrowRight size={20} className="text-fintech-accent" />
          </button>
          {activeType === "investments" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-fintech-muted">
              Investment sheet import is not implemented yet. You can switch to `Targets`, `Expenses`, or `Income` from the tabs above.
            </div>
          )}

          {previewRows.length > 0 && activeType !== "investments" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-fintech-muted">
                Enter the original sheet coordinates for where each destination column starts, for example <span className="font-semibold text-white">B</span> and <span className="font-semibold text-white">6</span>. The importer reads downward from that exact cell, so notes or merged rows above are ignored.
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#10182b]">
                <div className="grid grid-cols-[minmax(180px,0.8fr)_96px_minmax(320px,1fr)_minmax(220px,1.1fr)] gap-px bg-white/5 text-[11px] uppercase tracking-widest text-fintech-muted">
                  <div className="bg-[#162034] px-4 py-3">Destination Field</div>
                  <div className="bg-[#162034] px-4 py-3">Need</div>
                  <div className="bg-[#162034] px-4 py-3">Source Coordinates</div>
                  <div className="bg-[#162034] px-4 py-3">Column Preview</div>
                </div>
                {importConfig.fields.map((field) => {
                  const selectedOption = mapping[field.field];
                  const previewValues = fieldPreviews[field.field] || [];
                  const selectedCellValue = previewValues[0] || "";
                  const sampleValues = previewValues.slice(1, 5);

                  return (
                    <div
                      key={field.field}
                      className="grid grid-cols-[minmax(180px,0.8fr)_96px_minmax(320px,1fr)_minmax(220px,1.1fr)] gap-px border-t border-white/5 bg-white/5"
                    >
                      <div className="bg-[#152033] px-4 py-4">
                        <div className="text-sm font-bold text-white">{field.label}</div>
                        <div className="mt-1 text-xs text-fintech-muted">
                          {field.required ? "Required destination field" : "Optional destination field"}
                        </div>
                      </div>
                      <div className="bg-[#152033] px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${field.required ? "bg-fintech-accent/15 text-fintech-accent" : "bg-white/5 text-fintech-muted"}`}>
                          {field.required ? "Required" : "Optional"}
                        </span>
                      </div>
                      <div className="bg-[#152033] px-4 py-4">
                        <div className="grid grid-cols-[120px_120px] gap-3">
                          <input
                            type="text"
                            inputMode="text"
                            placeholder="Column"
                            value={drafts[field.field]?.column || ""}
                            onChange={(event) => {
                              const value = event.target.value.toUpperCase();
                              setDraftsByType((current) => ({
                                ...current,
                                [activeType]: {
                                  ...(current[activeType] || {}),
                                  [field.field]: {
                                    column: value,
                                    row: drafts[field.field]?.row || "",
                                  },
                                },
                              }));
                            }}
                            onBlur={() => commitDraftSelection(field.field)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-fintech-accent focus:outline-none"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            placeholder="Row"
                            value={drafts[field.field]?.row || ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftsByType((current) => ({
                                ...current,
                                [activeType]: {
                                  ...(current[activeType] || {}),
                                  [field.field]: {
                                    column: drafts[field.field]?.column || "",
                                    row: value,
                                  },
                                },
                              }));
                            }}
                            onBlur={() => commitDraftSelection(field.field)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-fintech-accent focus:outline-none"
                          />
                        </div>
                        <div className="mt-2 text-xs text-fintech-muted">
                          Reads downward from <span className="font-semibold text-white">{getSelectionCellRef(selectedOption) || "no source cell"}</span>.
                        </div>
                      </div>
                      <div className="bg-[#152033] px-4 py-4">
                        {sampleValues.length > 0 ? (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-fintech-accent/30 bg-fintech-accent/10 px-3 py-2 text-xs text-white">
                              {getSelectionCellRef(selectedOption) || "No source cell"} = {selectedCellValue || "(empty)"}
                            </div>
                            {sampleValues.map((value, index) => (
                              <div key={`${field.field}-sample-${index}`} className="truncate rounded-lg bg-white/5 px-3 py-2 text-xs text-white">
                                {value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-fintech-muted">
                            No sample values yet. Pick a source header or this column can stay empty.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <motion.button
              onClick={handleImport}
              disabled={!canImport || importLoading || previewRows.length === 0 || activeType === "investments"}
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
