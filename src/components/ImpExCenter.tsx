import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  Upload,
} from "lucide-react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { useFirebase } from "../contexts/FirebaseContext";
import { getTodayStr } from "../utils/dateUtils";
import { ImportCenter, buildTemplateCsv, buildTemplateXlsx } from "./ImportCenter";
import { ExcelImporter } from "./ExcelImporter";
import type { GoogleSheetsSyncConfig, Preferences } from "../types";

export type ImpExActionType =
  | "import_csv"
  | "import_excel"
  | "import_json_backup"
  | "export_csv_zip"
  | "export_excel"
  | "export_json_backup";

type RestoreMode = "safe_merge" | "replace_all";

type StatusLabel = "Preview" | "Warnings" | "Invalid" | "Duplicates" | "Ready to commit" | "Completed";

interface ImpExHistoryEntry {
  id: string;
  at: string;
  actionType: ImpExActionType;
  label: string;
  status: StatusLabel;
  message: string;
  scope: string;
  imported?: number;
  skipped?: number;
  invalid?: number;
}

interface BackupPreview {
  expenseCategories: number;
  incomeCategories: number;
  transactions: number;
  income: number;
  hasPreferences: boolean;
  hasGoogleSheetsConfig: boolean;
  hasDriveConnection: boolean;
}

interface FullBudgetBackupPayload {
  exportedAt?: string;
  baseCurrency?: string;
  preferences?: Preferences;
  expenseCategories?: unknown[];
  incomeCategories?: unknown[];
  transactions?: unknown[];
  income?: unknown[];
  googleSheetsConfig?: GoogleSheetsSyncConfig | null;
  driveConnection?: unknown;
}

const IMPEX_HISTORY_KEY = "impex_history_v1";

const readHistory = (): ImpExHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(IMPEX_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImpExHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHistory = (entries: ImpExHistoryEntry[]) => {
  localStorage.setItem(IMPEX_HISTORY_KEY, JSON.stringify(entries.slice(0, 25)));
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const makeCsv = (headers: string[], rows: Array<Array<unknown>>) => {
  const header = headers.map(escapeCsv).join(",");
  const body = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return `${header}\n${body}`;
};

const triggerDownload = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const parseBackupPayload = (raw: string): { preview: BackupPreview; payload: FullBudgetBackupPayload } => {
  const payload = JSON.parse(raw) as FullBudgetBackupPayload;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid JSON object.");
  }

  const expenseCategories = Array.isArray(payload.expenseCategories) ? payload.expenseCategories.length : 0;
  const incomeCategories = Array.isArray(payload.incomeCategories) ? payload.incomeCategories.length : 0;
  const transactions = Array.isArray(payload.transactions) ? payload.transactions.length : 0;
  const income = Array.isArray(payload.income) ? payload.income.length : 0;

  if (expenseCategories + incomeCategories + transactions + income === 0) {
    throw new Error("Backup JSON does not contain importable budget data.");
  }

  return {
    payload,
    preview: {
      expenseCategories,
      incomeCategories,
      transactions,
      income,
      hasPreferences: Boolean(payload.preferences || payload.baseCurrency),
      hasGoogleSheetsConfig: Boolean(payload.googleSheetsConfig),
      hasDriveConnection: Boolean(payload.driveConnection),
    },
  };
};

interface ImpExCenterProps {
  onRefresh: () => void;
  onNavigateToConnections?: () => void;
}

export const ImpExCenter: React.FC<ImpExCenterProps> = ({ onRefresh, onNavigateToConnections }) => {
  const {
    expenseCategories,
    incomeCategories,
    transactions,
    income,
    preferences,
    googleSheetsConfig,
    driveConnection,
    plaidConnection,
    tellerConnection,
    previewImport,
    commitImport,
    wipeData,
    updatePreferences,
    saveGoogleSheetsConfig,
  } = useFirebase();

  const [history, setHistory] = useState<ImpExHistoryEntry[]>(() => readHistory());
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [restoreRawJson, setRestoreRawJson] = useState("");
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("safe_merge");
  const [replaceConfirm, setReplaceConfirm] = useState("");
  const [busyAction, setBusyAction] = useState<ImpExActionType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [csvExportScope, setCsvExportScope] = useState({
    expenseCategories: true,
    incomeCategories: true,
    transactions: true,
    income: true,
  });
  const [includeMetadataSheet, setIncludeMetadataSheet] = useState(true);
  const [activeImportMethod, setActiveImportMethod] = useState<"csv" | "excel" | "json_backup" | null>(null);
  const [exportMethod, setExportMethod] = useState<"csv_zip" | "excel" | "json_backup">("csv_zip");

  const appendHistory = (entry: Omit<ImpExHistoryEntry, "id" | "at">) => {
    const next: ImpExHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    setHistory((current) => {
      const merged = [next, ...current].slice(0, 25);
      writeHistory(merged);
      return merged;
    });
  };

  const restoreSummary = useMemo(() => {
    if (!restorePreview) return "";
    return `${restorePreview.transactions} expenses, ${restorePreview.income} income, ${restorePreview.expenseCategories} expense categories, ${restorePreview.incomeCategories} income categories`;
  }, [restorePreview]);

  const handlePreviewBackup = () => {
    try {
      const { preview } = parseBackupPayload(restoreRawJson);
      setRestorePreview(preview);
      setMessage("Preview ready. Review counts and choose restore mode.");
      appendHistory({
        actionType: "import_json_backup",
        label: "JSON Backup",
        status: "Preview",
        scope: "full_budget",
        message: `Previewed backup: ${preview.transactions + preview.income} records`,
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : "Failed to parse backup JSON.";
      setRestorePreview(null);
      setMessage(err);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restorePreview) return;
    if (restoreMode === "replace_all" && replaceConfirm.trim().toUpperCase() !== "REPLACE") {
      setMessage("Type REPLACE to confirm destructive restore.");
      return;
    }

    setBusyAction("import_json_backup");
    try {
      const { payload } = parseBackupPayload(restoreRawJson);
      if (restoreMode === "replace_all") {
        await wipeData("expenses");
        await wipeData("income");
        await wipeData("expenseCategories");
        await wipeData("incomeCategories");
      }

      const batch = previewImport("manual_backup", restoreRawJson, {});
      const summary = await commitImport(batch, { includeDuplicates: false });

      if (payload.preferences || payload.baseCurrency) {
        await updatePreferences({
          ...(payload.preferences || {}),
          ...(payload.baseCurrency ? { baseCurrency: payload.baseCurrency } : {}),
        });
      }

      if (payload.googleSheetsConfig) {
        const { connectedAt, connectedBy, ...rest } = payload.googleSheetsConfig;
        try {
          await saveGoogleSheetsConfig(rest as Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">);
        } catch {
          // Keep restore successful even if Sheets re-authorization is required.
        }
      }

      onRefresh();
      setMessage(`Completed restore: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.invalid} invalid.`);
      appendHistory({
        actionType: "import_json_backup",
        label: "JSON Backup",
        status: "Completed",
        scope: restoreMode,
        message: `Restore completed (${restoreMode}).`,
        imported: summary.imported,
        skipped: summary.skipped,
        invalid: summary.invalid,
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : "Failed to restore backup.";
      setMessage(err);
      appendHistory({
        actionType: "import_json_backup",
        label: "JSON Backup",
        status: "Invalid",
        scope: restoreMode,
        message: err,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsvZip = async () => {
    setBusyAction("export_csv_zip");
    try {
      const zip = new JSZip();
      const included: string[] = [];

      if (csvExportScope.expenseCategories) {
        zip.file("expense_categories.csv", makeCsv(["Name", "Monthly Target"], expenseCategories.map((c) => [c.name, c.target_amount])));
        included.push("expense_categories.csv");
      }
      if (csvExportScope.incomeCategories) {
        zip.file("income_categories.csv", makeCsv(["Name", "Monthly Target"], incomeCategories.map((c) => [c.name, c.target_amount])));
        included.push("income_categories.csv");
      }
      if (csvExportScope.transactions) {
        zip.file("expenses.csv", makeCsv(["Date", "Vendor", "Amount", "Category", "Notes"], transactions.map((t) => [t.date, t.vendor, t.amount, t.category_name, t.notes || ""])));
        included.push("expenses.csv");
      }
      if (csvExportScope.income) {
        zip.file("income.csv", makeCsv(["Date", "Source", "Amount", "Category", "Notes"], income.map((i) => [i.date, i.source, i.amount, i.category, i.notes || ""])));
        included.push("income.csv");
      }

      if (included.length === 0) {
        setMessage("Select at least one dataset for CSV bundle export.");
        return;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(`vibebudget-csv-bundle-${getTodayStr()}.zip`, blob);
      setMessage(`Completed CSV bundle export (${included.length} files).`);
      appendHistory({
        actionType: "export_csv_zip",
        label: "CSV Bundle (.zip)",
        status: "Completed",
        scope: included.join(", "),
        message: `Exported ${included.length} CSV files in one zip.`,
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : "Failed to export CSV bundle.";
      setMessage(err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportExcel = () => {
    setBusyAction("export_excel");
    try {
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["Name", "Monthly Target"],
          ...expenseCategories.map((c) => [c.name, c.target_amount]),
        ]),
        "Expense Categories",
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["Name", "Monthly Target"],
          ...incomeCategories.map((c) => [c.name, c.target_amount]),
        ]),
        "Income Categories",
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["Date", "Vendor", "Amount", "Category", "Notes"],
          ...transactions.map((t) => [t.date, t.vendor, t.amount, t.category_name, t.notes || ""]),
        ]),
        "Expenses",
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["Date", "Source", "Amount", "Category", "Notes"],
          ...income.map((i) => [i.date, i.source, i.amount, i.category, i.notes || ""]),
        ]),
        "Income",
      );

      if (includeMetadataSheet) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Exported At", new Date().toISOString()],
            ["Base Currency", preferences?.baseCurrency || "CAD"],
            ["Expense Categories", expenseCategories.length],
            ["Income Categories", incomeCategories.length],
            ["Expenses", transactions.length],
            ["Income", income.length],
          ]),
          "Metadata",
        );
      }

      const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      triggerDownload(
        `vibebudget-export-${getTodayStr()}.xlsx`,
        new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );

      setMessage("Completed Excel workbook export.");
      appendHistory({
        actionType: "export_excel",
        label: "Excel Workbook",
        status: "Completed",
        scope: includeMetadataSheet ? "with metadata" : "without metadata",
        message: "Exported one workbook with all data tabs.",
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : "Failed to export Excel workbook.";
      setMessage(err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportFullJson = () => {
    setBusyAction("export_json_backup");
    try {
      const full = {
        exportedAt: new Date().toISOString(),
        baseCurrency: preferences?.baseCurrency,
        preferences,
        expenseCategories,
        incomeCategories,
        transactions,
        income,
        googleSheetsConfig,
        driveConnection,
        plaidConnection,
        tellerConnection,
      };
      triggerDownload(
        `budget-full-export-${getTodayStr()}.json`,
        new Blob([JSON.stringify(full, null, 2)], { type: "application/json" }),
      );
      setMessage("Completed full JSON backup export.");
      appendHistory({
        actionType: "export_json_backup",
        label: "Full Backup JSON",
        status: "Completed",
        scope: "full_budget",
        message: "Exported full budget JSON backup.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const isConnected = Boolean(googleSheetsConfig);

  return (
    <section className="space-y-5">
      {/* Status message */}
      {message && (
        <div className="rounded-xl border border-fintech-accent/30 bg-fintech-accent/10 px-4 py-3 text-sm text-fintech-accent">
          {message}
        </div>
      )}

      {/* ── IMPORT ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Import</h3>
        </div>

        {/* Sample Files */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--app-panel)] px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <span className="text-xs font-bold text-fintech-muted mr-1">Sample templates:</span>
          {(["expenses", "income", "expenseCategories", "incomeCategories"] as const).map((type) => {
            const label = { expenses: "Expenses", income: "Income", expenseCategories: "Expense Categories", incomeCategories: "Income Categories" }[type];
            const downloadCsv = () => {
              const blob = new Blob([buildTemplateCsv(type)], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `vibebudget-${type}-sample.csv`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            };
            const downloadXlsx = () => {
              const buf = buildTemplateXlsx(type);
              const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `vibebudget-${type}-sample.xlsx`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            };
            return (
              <div key={type} className="flex items-center gap-1">
                <span className="text-[10px] text-fintech-muted font-semibold">{label}:</span>
                <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-ghost)] px-2 py-1 text-[10px] font-bold text-fintech-muted hover:text-[var(--app-text)] transition-colors">
                  <Download size={11} /> CSV
                </button>
                <button type="button" onClick={downloadXlsx} className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-ghost)] px-2 py-1 text-[10px] font-bold text-fintech-muted hover:text-[var(--app-text)] transition-colors">
                  <Download size={11} /> Excel
                </button>
              </div>
            );
          })}
        </div>

        {/* Google Sheets — state-aware hero */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            isConnected
              ? "border-fintech-accent/40 bg-fintech-accent/5"
              : "border-[var(--app-border)] bg-[var(--app-panel)]"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  isConnected ? "bg-fintech-accent/15" : "bg-[var(--app-ghost)]"
                }`}
              >
                {/* Google Sheets icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={isConnected ? "text-fintech-accent" : "text-fintech-muted"}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="10" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--app-text)]">Google Sheets</span>
                  {isConnected ? (
                    <span className="flex items-center gap-1 rounded-full bg-fintech-accent/15 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">
                      <span className="h-1.5 w-1.5 rounded-full bg-fintech-accent" />
                      Live sync
                    </span>
                  ) : (
                    <span className="rounded-full bg-[var(--app-ghost)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted">
                      Not connected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-fintech-muted">
                  {isConnected
                    ? "Auto-syncs your spreadsheet. Changes reflect in your budget instantly."
                    : "Connect once — your spreadsheet stays in sync automatically."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateToConnections}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors ${
                isConnected
                  ? "bg-fintech-accent text-[#002919] hover:bg-fintech-accent/90"
                  : "border bg-[var(--app-ghost)] text-[var(--app-text)] hover:bg-[var(--app-ghost-strong)]"
              }`}
              style={isConnected ? undefined : { borderColor: "var(--app-border)" }}
            >
              {isConnected ? "Manage" : "Connect"}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* One-time import grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* CSV */}
          <div
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeImportMethod === "csv"
                ? "border-fintech-import/50 bg-fintech-import/8"
                : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
            }`}
            style={activeImportMethod === "csv" ? undefined : { borderColor: "var(--app-border)" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-fintech-import/15">
              <FileText size={18} className="text-fintech-import" />
            </div>
            <div className="text-sm font-bold text-[var(--app-text)]">CSV</div>
            <p className="mt-0.5 text-xs text-fintech-muted">One-time import</p>
            <button
              type="button"
              onClick={() => setActiveImportMethod(activeImportMethod === "csv" ? null : "csv")}
              className="mt-3 w-full rounded-lg border bg-[var(--app-ghost)] py-1.5 text-xs font-bold transition-colors hover:bg-[var(--app-ghost-strong)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              {activeImportMethod === "csv" ? "Close" : "Upload CSV"}
            </button>
          </div>

          {/* Excel */}
          <div
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeImportMethod === "excel"
                ? "border-fintech-accent/50 bg-fintech-accent/8"
                : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
            }`}
            style={activeImportMethod === "excel" ? undefined : { borderColor: "var(--app-border)" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-fintech-accent/15">
              <FileSpreadsheet size={18} className="text-fintech-accent" />
            </div>
            <div className="text-sm font-bold text-[var(--app-text)]">Excel</div>
            <p className="mt-0.5 text-xs text-fintech-muted">.xlsx / .xls</p>
            <button
              type="button"
              onClick={() => setActiveImportMethod(activeImportMethod === "excel" ? null : "excel")}
              className="mt-3 w-full rounded-lg border bg-[var(--app-ghost)] py-1.5 text-xs font-bold transition-colors hover:bg-[var(--app-ghost-strong)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              {activeImportMethod === "excel" ? "Close" : "Upload Excel"}
            </button>
          </div>

          {/* JSON Backup */}
          <div
            className={`cursor-pointer rounded-2xl border p-4 transition-all ${
              activeImportMethod === "json_backup"
                ? "border-purple-500/50 bg-purple-500/5"
                : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
            }`}
            style={activeImportMethod === "json_backup" ? undefined : { borderColor: "var(--app-border)" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15">
              <FileJson size={18} className="text-purple-400" />
            </div>
            <div className="text-sm font-bold text-[var(--app-text)]">JSON Backup</div>
            <p className="mt-0.5 text-xs text-fintech-muted">Restore full backup</p>
            <button
              type="button"
              onClick={() => setActiveImportMethod(activeImportMethod === "json_backup" ? null : "json_backup")}
              className="mt-3 w-full rounded-lg border bg-[var(--app-ghost)] py-1.5 text-xs font-bold transition-colors hover:bg-[var(--app-ghost-strong)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              {activeImportMethod === "json_backup" ? "Close" : "Upload JSON"}
            </button>
          </div>
        </div>
      </div>

      {/* Active import panels */}
      {activeImportMethod === "csv" && (
        <div className="rounded-2xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Import via CSV</h3>
            <span className="rounded-full bg-fintech-import/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fintech-import">Preview</span>
          </div>
          <ImportCenter
            onImported={() => {
              appendHistory({
                actionType: "import_csv",
                label: "CSV Import",
                status: "Completed",
                scope: "records",
                message: "CSV import committed via Import Center.",
              });
              onRefresh();
            }}
            allowedSources={["csv"]}
          />
        </div>
      )}

      {activeImportMethod === "excel" && (
        <div className="rounded-2xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Import via Excel</h3>
            <span className="rounded-full bg-fintech-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fintech-accent">Map + Preview</span>
          </div>
          <p className="text-xs text-fintech-muted">Upload .xlsx/.xls, map sheets to target domains, preview, then commit.</p>
          <button
            type="button"
            onClick={() => setShowExcelImporter(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent"
          >
            <FileSpreadsheet size={16} /> Open Excel Importer
          </button>
        </div>
      )}

      {activeImportMethod === "json_backup" && (
        <div className="rounded-2xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Import via JSON Backup</h3>
            <span className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-400">Preview + Commit</span>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border bg-[var(--app-ghost)] px-3 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>
            <Upload size={16} /> Upload backup JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  setRestoreRawJson(String(ev.target?.result || ""));
                  setRestorePreview(null);
                };
                reader.readAsText(file);
                event.target.value = "";
              }}
            />
          </label>
          <textarea
            value={restoreRawJson}
            onChange={(event) => {
              setRestoreRawJson(event.target.value);
              setRestorePreview(null);
            }}
            placeholder="Paste full backup JSON..."
            className="mt-3 min-h-28 w-full rounded-xl border bg-[var(--app-ghost)] px-3 py-2 text-xs"
            style={{ borderColor: "var(--app-border)" }}
          />
          <button
            type="button"
            onClick={handlePreviewBackup}
            disabled={!restoreRawJson.trim() || busyAction === "import_json_backup"}
            className="mt-3 rounded-xl bg-[var(--app-ghost)] px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            Preview Restore
          </button>

          {restorePreview && (
            <div className="mt-4 space-y-3 rounded-xl bg-[var(--app-ghost)] p-4 text-xs">
              <div className="font-semibold">{restoreSummary}</div>
              <div className="text-fintech-muted">
                {restorePreview.hasPreferences ? "Includes preferences" : "No preferences"} •{" "}
                {restorePreview.hasGoogleSheetsConfig ? "Includes Google Sheets config" : "No Google Sheets config"}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                  <input type="radio" checked={restoreMode === "safe_merge"} onChange={() => setRestoreMode("safe_merge")} />
                  Safe merge
                </label>
                <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                  <input type="radio" checked={restoreMode === "replace_all"} onChange={() => setRestoreMode("replace_all")} />
                  Replace all app data
                </label>
              </div>
              {restoreMode === "replace_all" && (
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-fintech-danger"><AlertTriangle size={14} /> Destructive mode</div>
                  <input
                    value={replaceConfirm}
                    onChange={(event) => setReplaceConfirm(event.target.value)}
                    placeholder="Type REPLACE to confirm"
                    className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2 text-xs"
                    style={{ borderColor: "var(--app-border)" }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleRestoreBackup()}
                disabled={busyAction === "import_json_backup"}
                className="rounded-xl bg-fintech-import/20 px-4 py-2 text-sm font-bold text-fintech-import disabled:opacity-50"
              >
                {busyAction === "import_json_backup" ? "Restoring..." : "Commit Restore"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── EXPORT ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Export</h3>

        <div className="rounded-2xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-[var(--app-ghost)] p-1">
            <button type="button" onClick={() => setExportMethod("csv_zip")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${exportMethod === "csv_zip" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>CSV Bundle</button>
            <button type="button" onClick={() => setExportMethod("excel")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${exportMethod === "excel" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Excel Workbook</button>
            <button type="button" onClick={() => setExportMethod("json_backup")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${exportMethod === "json_backup" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Full JSON Backup</button>
          </div>

          {exportMethod === "csv_zip" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                {[
                  { key: "expenseCategories", label: "Expense Categories" },
                  { key: "incomeCategories", label: "Income Categories" },
                  { key: "transactions", label: "Expenses" },
                  { key: "income", label: "Income" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border bg-[var(--app-ghost)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                    <input
                      type="checkbox"
                      checked={csvExportScope[key as keyof typeof csvExportScope]}
                      onChange={(e) => setCsvExportScope((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button onClick={() => void handleExportCsvZip()} disabled={busyAction === "export_csv_zip"} className="rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_csv_zip" ? "Generating..." : "Download CSV Zip"}
              </button>
            </div>
          )}

          {exportMethod === "excel" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeMetadataSheet} onChange={(event) => setIncludeMetadataSheet(event.target.checked)} />
                Include metadata sheet
              </label>
              <button onClick={handleExportExcel} disabled={busyAction === "export_excel"} className="rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_excel" ? "Generating..." : "Download Excel"}
              </button>
            </div>
          )}

          {exportMethod === "json_backup" && (
            <div className="space-y-3">
              <p className="text-xs text-fintech-muted">Canonical full backup for restore and portability. Includes all data and configuration.</p>
              <button onClick={handleExportFullJson} disabled={busyAction === "export_json_backup"} className="rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_json_backup" ? "Generating..." : "Download JSON Backup"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── HISTORY ────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Activity</h3>
          <div className="rounded-2xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-[var(--app-ghost)] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{entry.label}</span>
                    <span className="text-fintech-muted">{new Date(entry.at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-fintech-muted">{entry.status} · {entry.scope} · {entry.message}</div>
                  {(entry.imported !== undefined || entry.skipped !== undefined || entry.invalid !== undefined) && (
                    <div className="mt-1 text-fintech-muted">Imported {entry.imported || 0} · Skipped {entry.skipped || 0} · Invalid {entry.invalid || 0}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showExcelImporter && (
        <ExcelImporter
          onClose={() => setShowExcelImporter(false)}
          onImported={() => {
            setShowExcelImporter(false);
            appendHistory({
              actionType: "import_excel",
              label: "Excel Import",
              status: "Completed",
              scope: "records",
              message: "Excel import committed.",
            });
            onRefresh();
          }}
        />
      )}
    </section>
  );
};
