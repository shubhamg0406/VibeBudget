import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  Table as TableIcon,
  Upload,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { parseExcelFile, ExcelSheetInfo } from "../utils/excelImport";
import { useFirebase } from "../contexts/FirebaseContext";
import { normalizeDateString } from "../utils/dateUtils";

type ImportDataType = "expenseCategories" | "incomeCategories" | "expenses" | "income";

interface ExcelImporterProps {
  onClose: () => void;
  onImported: () => void;
}

interface FieldMapping {
  field: string;
  label: string;
  required: boolean;
}

interface DataTypeConfig {
  label: string;
  fields: FieldMapping[];
  parseRow: (getValue: (field: string) => string) => any[] | null;
}

interface ConfiguredImport {
  id: string;
  dataType: ImportDataType;
  sheetName: string;
  columnMapping: Record<string, string>;
  rangeStart: number;
  rangeEnd: number;
  parsedRows: any[];
  skippedCount: number;
}

const DATA_TYPE_CONFIGS: Record<ImportDataType, DataTypeConfig> = {
  expenseCategories: {
    label: "Expense Categories",
    fields: [
      { field: "name", label: "Category Name", required: true },
      { field: "target", label: "Monthly Target", required: false },
    ],
    parseRow: (getValue) => {
      const name = getValue("name").trim();
      if (!name) return null;
      const target = parseAmount(getValue("target"));
      return [name, target];
    },
  },
  incomeCategories: {
    label: "Income Categories",
    fields: [
      { field: "name", label: "Category Name", required: true },
      { field: "target", label: "Monthly Target", required: false },
    ],
    parseRow: (getValue) => {
      const name = getValue("name").trim();
      if (!name) return null;
      const target = parseAmount(getValue("target"));
      return [name, target];
    },
  },
  expenses: {
    label: "Expenses",
    fields: [
      { field: "date", label: "Date", required: true },
      { field: "vendor", label: "Vendor / Store", required: true },
      { field: "amount", label: "Amount", required: true },
      { field: "category", label: "Category", required: true },
      { field: "notes", label: "Notes", required: false },
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
    label: "Income",
    fields: [
      { field: "date", label: "Date", required: true },
      { field: "source", label: "Source", required: true },
      { field: "amount", label: "Amount", required: true },
      { field: "category", label: "Category", required: true },
      { field: "notes", label: "Notes", required: false },
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

const parseAmount = (value: string) => {
  if (!value) return 0;
  const cleaned = value.replace(/[^-0-9.]/g, "");
  return Number.parseFloat(cleaned) || 0;
};

const parseDate = (value: string) => {
  if (!value) return "";
  return normalizeDateString(value.trim().replace(/^"|"$/g, "")) || "";
};

const getFieldAliases = (field: string, label: string): string[] => {
  const aliases: Record<string, string[]> = {
    date: ["date", "transaction date", "expense date", "income date", "posting date"],
    vendor: ["vendor", "store", "merchant", "payee", "description", "name"],
    source: ["source", "payer", "income source", "from"],
    amount: ["amount", "total", "value", "spent", "received", "sum"],
    category: ["category", "expense category", "income category", "type", "group"],
    notes: ["notes", "memo", "description", "comment", "remark", "details"],
    name: ["name", "category name", "title", "category"],
    target: ["target", "monthly target", "budget", "amount", "limit"],
  };
  return [label, field, ...(aliases[field] || [])];
};

let importIdCounter = 0;
const generateImportId = () => `import_${++importIdCounter}_${Date.now()}`;

export const ExcelImporter: React.FC<ExcelImporterProps> = ({ onClose, onImported }) => {
  const { previewImport, commitImport } = useFirebase();

  // Step tracking
  const [step, setStep] = useState<"upload" | "configure" | "preview" | "importing">("upload");

  // File state
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ExcelSheetInfo[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Multi-type import configuration
  const [configuredImports, setConfiguredImports] = useState<ConfiguredImport[]>([]);
  const [activeImportIndex, setActiveImportIndex] = useState<number>(0);

  // Current configuration being edited
  const [dataType, setDataType] = useState<ImportDataType>("expenses");
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Infinity);

  // Preview state
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const config = DATA_TYPE_CONFIGS[dataType];
  const currentSheet = sheets.find((s) => s.name === selectedSheet);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await parseExcelFile(file);
      setFileName(result.fileName);
      setSheets(result.sheets);

      if (result.sheets.length > 0) {
        setSelectedSheet(result.sheets[0].name);
      }

      setStep("configure");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to parse file.");
    }

    e.target.value = "";
  };

  const handleDataTypeChange = (type: ImportDataType) => {
    setDataType(type);
    setColumnMapping({});
  };

  const handleMappingChange = (field: string, header: string) => {
    setColumnMapping((prev) => ({ ...prev, [field]: header }));
  };

  const autoDetectMapping = () => {
    if (!currentSheet) return;

    const headers = currentSheet.headers.map((h) => h.toLowerCase().trim());
    const mapping: Record<string, string> = {};

    config.fields.forEach(({ field, label }) => {
      const aliases = getFieldAliases(field, label);
      let bestMatch = "";
      let bestScore = 0;

      headers.forEach((header, index) => {
        aliases.forEach((alias) => {
          const normalizedAlias = alias.toLowerCase().trim();
          let score = 0;
          if (header === normalizedAlias) score = 3;
          else if (header.includes(normalizedAlias) || normalizedAlias.includes(header)) score = 2;
          else if (header.split(/[\s_]+/).some((part) => part === normalizedAlias)) score = 1;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = currentSheet.headers[index];
          }
        });
      });

      if (bestMatch) {
        mapping[field] = bestMatch;
      }
    });

    setColumnMapping(mapping);
  };

  const handleAddImport = () => {
    if (!currentSheet) return;

    const requiredFields = config.fields.filter((f) => f.required).map((f) => f.field);
    const missingFields = requiredFields.filter((f) => !columnMapping[f]);
    if (missingFields.length > 0) {
      setError(`Please map all required fields: ${missingFields.join(", ")}`);
      return;
    }

    const startIdx = Math.max(0, rangeStart - 1);
    const endIdx = rangeEnd === Infinity ? currentSheet.rows.length : Math.min(rangeEnd, currentSheet.rows.length);
    const rowsToProcess = currentSheet.rows.slice(startIdx, endIdx);

    const parsed: any[] = [];
    let skipped = 0;

    rowsToProcess.forEach((row) => {
      const getValue = (field: string) => {
        const header = columnMapping[field];
        if (!header) return "";
        const colIndex = currentSheet.headers.indexOf(header);
        if (colIndex < 0) return "";
        return row[colIndex] || "";
      };

      if (config.fields.every((f) => getValue(f.field).trim() === "")) {
        return;
      }

      if (requiredFields.some((f) => getValue(f).trim() === "")) {
        skipped += 1;
        return;
      }

      const parsedRow = config.parseRow(getValue);
      if (parsedRow) {
        parsed.push(parsedRow);
      } else {
        skipped += 1;
      }
    });

    if (parsed.length === 0) {
      setError(skipped > 0 ? `No valid rows found. ${skipped} row(s) were skipped.` : "No data rows found in the selected range.");
      return;
    }

    const newImport: ConfiguredImport = {
      id: generateImportId(),
      dataType,
      sheetName: selectedSheet,
      columnMapping: { ...columnMapping },
      rangeStart,
      rangeEnd,
      parsedRows: parsed,
      skippedCount: skipped,
    };

    setConfiguredImports((prev) => [...prev, newImport]);
    setError(null);

    // Reset for next configuration
    setColumnMapping({});
    setRangeStart(1);
    setRangeEnd(Infinity);
  };

  const handleRemoveImport = (id: string) => {
    setConfiguredImports((prev) => prev.filter((imp) => imp.id !== id));
  };

  const handlePreviewAll = () => {
    if (configuredImports.length === 0) {
      setError("Add at least one data type configuration before previewing.");
      return;
    }
    setStep("preview");
  };

  const handleImportAll = async () => {
    if (configuredImports.length === 0) return;

    setStep("importing");
    setError(null);
    setSuccessMessage(null);

    let totalImported = 0;
    let totalSkipped = 0;
    let totalInvalid = 0;
    let hasError = false;

    try {
      for (const imp of configuredImports) {
        const batch = previewImport("csv", imp.parsedRows, { type: imp.dataType, hasHeader: false });
        const summary = await commitImport(batch, { includeDuplicates: false });
        totalImported += summary.imported;
        totalSkipped += summary.skipped;
        totalInvalid += summary.invalid;
      }

      setSuccessMessage(
        `Import complete: ${totalImported} record(s) imported across ${configuredImports.length} type(s). ${totalSkipped} skipped, ${totalInvalid} invalid.`
      );
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStep("preview");
    }
  };

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSheets([]);
    setSelectedSheet("");
    setColumnMapping({});
    setConfiguredImports([]);
    setActiveImportIndex(0);
    setError(null);
    setSuccessMessage(null);
    setFileError(null);
    setRangeStart(1);
    setRangeEnd(Infinity);
  };

  const currentSheetInfo = currentSheet;
  const previewLimit = 10;

  // Calculate total rows across all configured imports
  const totalConfiguredRows = configuredImports.reduce((sum, imp) => sum + imp.parsedRows.length, 0);

  return (
    <div className="fixed inset-0 z-[140] backdrop-blur-sm" style={{ backgroundColor: "var(--app-overlay)" }}>
      <button
        type="button"
        aria-label="Close importer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative h-full w-full p-3 sm:p-5 lg:p-7">
        <div
          className="animate-in fade-in zoom-in-[0.99] flex h-full w-full flex-col overflow-hidden rounded-[32px] border bg-fintech-card shadow-2xl"
          style={{ borderColor: "var(--app-border)" }}
        >
          {/* Header */}
          <div className="mb-0 flex items-center justify-between border-b px-6 py-5 sm:px-8" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-fintech-accent/10 p-3 text-fintech-accent">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Excel / CSV Importer</h3>
                <p className="text-sm text-fintech-muted">
                  Upload an Excel file or CSV, map columns, and import your data.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-[var(--app-ghost)]">
              <X size={24} className="text-fintech-muted" />
            </button>
          </div>

          {/* Error / Success messages */}
          {(error || fileError) && (
            <div className="mx-6 mb-2 mt-3 flex items-center gap-3 rounded-xl bg-fintech-danger/10 p-4 text-fintech-danger sm:mx-8">
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{error || fileError}</span>
            </div>
          )}

          {successMessage && (
            <div className="mx-6 mb-2 mt-3 flex items-center gap-3 rounded-xl bg-fintech-accent/10 p-4 text-fintech-accent sm:mx-8">
              <CheckCircle2 size={20} />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-8 pr-4 pt-5 custom-scrollbar sm:px-8">
            {/* Step 1: Upload */}
            {step === "upload" && (
              <div className="space-y-4">
                <div className="rounded-2xl border-2 border-dashed bg-[var(--app-panel-muted)] p-8 text-center" style={{ borderColor: "var(--app-border)" }}>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fintech-accent/10">
                    <Upload size={28} className="text-fintech-accent" />
                  </div>
                  <h4 className="mt-4 text-lg font-bold">Upload your file</h4>
                  <p className="mt-2 text-sm text-fintech-muted">
                    Supports .xlsx, .xls, and .csv files
                  </p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-fintech-accent px-6 py-3 text-sm font-bold text-[#002919] hover:bg-fintech-accent/90">
                    <FileText size={18} />
                    Choose File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                  <h4 className="mb-2 text-sm font-bold">Tips</h4>
                  <ul className="space-y-1 text-xs text-fintech-muted">
                    <li>• The first row of each sheet should contain column headers</li>
                    <li>• For expenses/income, make sure Date, Amount, and Category columns exist</li>
                    <li>• For categories, a Name column is required</li>
                    <li>• You can configure multiple data types from the same file (e.g., expenses + income)</li>
                    <li>• We'll auto-detect column mappings based on header names</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Step 2: Configure */}
            {step === "configure" && (
              <div className="space-y-5">
                {/* File info */}
                <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-fintech-accent" />
                      <div>
                        <div className="text-sm font-semibold">{fileName}</div>
                        <div className="text-xs text-fintech-muted">{sheets.length} sheet(s) found</div>
                      </div>
                    </div>
                    <button onClick={resetAll} className="rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-xs font-bold">
                      Change File
                    </button>
                  </div>
                </div>

                {/* Configured imports summary */}
                {configuredImports.length > 0 && (
                  <div className="rounded-xl border bg-fintech-accent/5 p-4" style={{ borderColor: "var(--app-border)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-widest text-fintech-accent">
                        Configured Imports ({configuredImports.length})
                      </span>
                      <span className="text-xs text-fintech-muted">
                        {totalConfiguredRows} total rows
                      </span>
                    </div>
                    <div className="space-y-2">
                      {configuredImports.map((imp) => {
                        const cfg = DATA_TYPE_CONFIGS[imp.dataType];
                        return (
                          <div key={imp.id} className="flex items-center justify-between rounded-lg bg-[var(--app-ghost)] px-3 py-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={14} className="text-fintech-accent" />
                              <span className="text-sm font-medium">{cfg.label}</span>
                              <span className="text-xs text-fintech-muted">
                                ({imp.parsedRows.length} rows from "{imp.sheetName}")
                              </span>
                            </div>
                            <button
                              onClick={() => handleRemoveImport(imp.id)}
                              className="rounded-full p-1 text-fintech-muted hover:text-fintech-danger transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Data Type Selection */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Add Data Type</span>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {(Object.entries(DATA_TYPE_CONFIGS) as [ImportDataType, DataTypeConfig][]).map(([type, cfg]) => {
                      const alreadyConfigured = configuredImports.some((imp) => imp.dataType === type);
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            if (!alreadyConfigured) {
                              handleDataTypeChange(type);
                            }
                          }}
                          disabled={alreadyConfigured}
                          className={`rounded-xl border p-3 text-left transition-all ${
                            dataType === type
                              ? "border-fintech-accent bg-fintech-accent/10"
                              : alreadyConfigured
                                ? "bg-[var(--app-ghost)] opacity-40 cursor-not-allowed"
                                : "bg-[var(--app-ghost)] hover:border-[var(--app-border-strong)]"
                          }`}
                          style={dataType === type ? undefined : { borderColor: "var(--app-border)" }}
                        >
                          <div className="text-sm font-bold">{cfg.label}</div>
                          <div className="mt-1 text-xs text-fintech-muted">
                            {alreadyConfigured ? "Already added" : `${cfg.fields.length} field(s)`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sheet Selection */}
                {sheets.length > 1 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Sheet Tab</span>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {sheets.map((sheet) => (
                        <button
                          key={sheet.name}
                          onClick={() => {
                            setSelectedSheet(sheet.name);
                            setColumnMapping({});
                          }}
                          className={`rounded-xl border p-3 text-left transition-all ${
                            selectedSheet === sheet.name
                              ? "border-fintech-accent bg-fintech-accent/10"
                              : "bg-[var(--app-ghost)] hover:border-[var(--app-border-strong)]"
                          }`}
                          style={selectedSheet === sheet.name ? undefined : { borderColor: "var(--app-border)" }}
                        >
                          <div className="flex items-center gap-2 text-sm font-bold">
                            <TableIcon size={14} className="text-fintech-muted" />
                            {sheet.name}
                          </div>
                          <div className="mt-1 text-xs text-fintech-muted">
                            {sheet.headers.length} columns, {sheet.totalRows} rows
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Column Mapping */}
                {currentSheetInfo && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">
                        Column Mapping for {config.label}
                      </span>
                      <button
                        onClick={autoDetectMapping}
                        className="rounded-lg bg-fintech-accent/10 px-3 py-1.5 text-xs font-bold text-fintech-accent"
                      >
                        Auto-Detect
                      </button>
                    </div>

                    <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                      <div className="mb-3 text-xs text-fintech-muted">
                        Sheet: <span className="font-semibold text-[var(--app-text)]">{currentSheetInfo.name}</span>
                        {" "}· Headers: <span className="font-semibold text-[var(--app-text)]">{currentSheetInfo.headers.join(", ")}</span>
                      </div>

                      <div className="space-y-3">
                        {config.fields.map(({ field, label, required }) => (
                          <div key={field} className="flex items-center gap-3">
                            <label className="w-32 shrink-0 text-xs font-semibold text-fintech-muted">
                              {label}
                              {required && <span className="ml-1 text-fintech-danger">*</span>}
                            </label>
                            <select
                              value={columnMapping[field] || ""}
                              onChange={(e) => handleMappingChange(field, e.target.value)}
                              className="flex-1 rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm"
                              style={{ borderColor: "var(--app-border)" }}
                            >
                              <option value="">-- Select column --</option>
                              {currentSheetInfo.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Range Selection */}
                    <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Row Range (Optional)</span>
                      <div className="mt-2 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs">
                          From row:
                          <input
                            type="number"
                            min={1}
                            max={currentSheetInfo.totalRows}
                            value={rangeStart}
                            onChange={(e) => setRangeStart(Math.max(1, Number.parseInt(e.target.value) || 1))}
                            className="w-20 rounded-lg border bg-[var(--app-ghost)] px-2 py-1.5 text-sm"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          To row:
                          <input
                            type="number"
                            min={rangeStart}
                            max={currentSheetInfo.totalRows}
                            value={rangeEnd === Infinity ? "" : rangeEnd}
                            placeholder="End"
                            onChange={(e) => {
                              const val = e.target.value;
                              setRangeEnd(val === "" ? Infinity : Number.parseInt(val) || Infinity);
                            }}
                            className="w-20 rounded-lg border bg-[var(--app-ghost)] px-2 py-1.5 text-sm"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                        </label>
                        <span className="text-xs text-fintech-muted">
                          (Total: {currentSheetInfo.totalRows} rows)
                        </span>
                      </div>
                    </div>

                    {/* Sample Data Preview */}
                    <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Sample Data (First 5 Rows)</span>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[400px] text-left text-xs">
                          <thead>
                            <tr className="text-fintech-muted">
                              <th className="p-2 font-semibold">#</th>
                              {currentSheetInfo.headers.map((header) => (
                                <th key={header} className="p-2 font-semibold">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {currentSheetInfo.rows.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                <td className="p-2 text-fintech-muted">{idx + 1}</td>
                                {currentSheetInfo.headers.map((header, colIdx) => (
                                  <td key={colIdx} className="max-w-[150px] truncate p-2">
                                    {row[colIdx] || "-"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Add Import Button */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddImport}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-[var(--app-ghost)] px-4 py-3 text-sm font-bold transition-all hover:bg-[var(--app-ghost-strong)]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <Plus size={18} />
                        Add {config.label} Configuration
                      </button>
                    </div>

                    {/* Preview All Button - only shown when there are configured imports */}
                    {configuredImports.length > 0 && (
                      <button
                        onClick={handlePreviewAll}
                        className="w-full rounded-xl bg-fintech-accent px-4 py-3 text-sm font-bold text-[#002919]"
                      >
                        Preview All ({totalConfiguredRows} rows across {configuredImports.length} type(s))
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Preview */}
            {step === "preview" && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold">Import Preview</h4>
                      <p className="text-xs text-fintech-muted">
                        {configuredImports.length} data type(s) · {totalConfiguredRows} total row(s)
                      </p>
                    </div>
                    <button
                      onClick={() => setStep("configure")}
                      className="rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-xs font-bold"
                    >
                      Back to Config
                    </button>
                  </div>
                </div>

                {/* Per-type preview tables */}
                {configuredImports.map((imp) => {
                  const cfg = DATA_TYPE_CONFIGS[imp.dataType];
                  return (
                    <div key={imp.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-fintech-accent" />
                        <h5 className="text-sm font-bold">{cfg.label}</h5>
                        <span className="text-xs text-fintech-muted">
                          ({imp.parsedRows.length} rows{imp.skippedCount > 0 ? `, ${imp.skippedCount} skipped` : ""})
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--app-border)" }}>
                        <table className="w-full min-w-[500px] text-left text-xs">
                          <thead className="sticky top-0 bg-[var(--app-panel-strong)] text-fintech-muted">
                            <tr>
                              <th className="p-3 font-semibold">#</th>
                              {cfg.fields.map((f) => (
                                <th key={f.field} className="p-3 font-semibold">{f.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {imp.parsedRows.slice(0, previewLimit).map((row, idx) => (
                              <tr key={idx} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                <td className="p-3 text-fintech-muted">{idx + 1}</td>
                                {cfg.fields.map((f) => {
                                  const fieldIndex = cfg.fields.indexOf(f);
                                  return (
                                    <td key={f.field} className="max-w-[200px] truncate p-3">
                                      {String(row[fieldIndex] ?? "-")}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {imp.parsedRows.length > previewLimit && (
                          <div className="border-t bg-[var(--app-panel-muted)] p-3 text-center text-xs text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
                            ... and {imp.parsedRows.length - previewLimit} more row(s)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Import Button */}
                <button
                  onClick={handleImportAll}
                  className="w-full rounded-xl bg-fintech-accent px-4 py-3 text-sm font-bold text-[#002919]"
                >
                  Import All ({totalConfiguredRows} Record(s) Across {configuredImports.length} Type(s))
                </button>
              </div>
            )}

            {/* Step 4: Importing */}
            {step === "importing" && (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw size={40} className="animate-spin text-fintech-accent" />
                <h4 className="mt-4 text-lg font-bold">Importing Data...</h4>
                <p className="mt-2 text-sm text-fintech-muted">
                  Processing {totalConfiguredRows} record(s) across {configuredImports.length} type(s)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
