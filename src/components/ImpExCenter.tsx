import React, { useMemo, useState } from "react";
import { Archive, CheckCircle2, Download, FileJson, FileSpreadsheet, FileText, History, RefreshCw, Upload, AlertTriangle } from "lucide-react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { useFirebase } from "../contexts/FirebaseContext";
import { getTodayStr } from "../utils/dateUtils";
import { ImportCenter } from "./ImportCenter";
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

export const ImpExCenter: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
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
  const [mode, setMode] = useState<"import" | "export">("import");
  const [importMethod, setImportMethod] = useState<"csv" | "excel" | "json_backup">("csv");
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

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted">
        <Archive size={16} className="text-fintech-accent" />
        ImpEx Center
      </div>
      <p className="text-xs text-fintech-muted">Imports: select source, preview, resolve, commit. Exports: choose scope, generate, download.</p>

      {message && (
        <div className="rounded-xl border border-fintech-accent/30 bg-fintech-accent/10 px-4 py-3 text-sm text-fintech-accent">
          {message}
        </div>
      )}

      <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">I want to...</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("import")}
            className={`rounded-xl border px-4 py-3 text-left ${mode === "import" ? "border-fintech-accent bg-fintech-accent/10" : "bg-[var(--app-ghost)]"}`}
            style={mode === "import" ? undefined : { borderColor: "var(--app-border)" }}
          >
            <div className="text-sm font-bold">Import Data</div>
            <div className="mt-1 text-xs text-fintech-muted">Bring data into VibeBudget using one method.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("export")}
            className={`rounded-xl border px-4 py-3 text-left ${mode === "export" ? "border-fintech-accent bg-fintech-accent/10" : "bg-[var(--app-ghost)]"}`}
            style={mode === "export" ? undefined : { borderColor: "var(--app-border)" }}
          >
            <div className="text-sm font-bold">Export Data</div>
            <div className="mt-1 text-xs text-fintech-muted">Download a one-time data package in your preferred format.</div>
          </button>
        </div>
      </div>

      {mode === "import" && (
        <>
          <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Choose import method</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <button type="button" onClick={() => setImportMethod("csv")} className={`rounded-lg px-3 py-2 text-sm font-bold ${importMethod === "csv" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>CSV</button>
              <button type="button" onClick={() => setImportMethod("excel")} className={`rounded-lg px-3 py-2 text-sm font-bold ${importMethod === "excel" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>Excel</button>
              <button type="button" onClick={() => setImportMethod("json_backup")} className={`rounded-lg px-3 py-2 text-sm font-bold ${importMethod === "json_backup" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>JSON Backup</button>
            </div>
          </div>

          {importMethod === "csv" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Import via CSV</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Preview</span>
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

          {importMethod === "excel" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">Import via Excel</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Map + Preview</span>
              </div>
              <p className="text-xs text-fintech-muted">Upload .xlsx/.xls, map sheets to target domains, preview, then commit using the same import engine.</p>
              <button
                type="button"
                onClick={() => setShowExcelImporter(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-fintech-accent/10 px-3 py-2 text-sm font-bold text-fintech-accent"
              >
                <FileSpreadsheet size={16} /> Open Excel Importer
              </button>
            </div>
          )}

          {importMethod === "json_backup" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">Import via JSON Backup</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Preview + Commit</span>
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>
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
                className="mt-3 min-h-28 w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-xs"
                style={{ borderColor: "var(--app-border)" }}
              />
              <button
                type="button"
                onClick={handlePreviewBackup}
                disabled={!restoreRawJson.trim() || busyAction === "import_json_backup"}
                className="mt-3 rounded-lg bg-[var(--app-ghost)] px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                Preview Restore
              </button>

              {restorePreview && (
                <div className="mt-3 space-y-3 rounded-lg bg-[var(--app-ghost)] p-3 text-xs">
                  <div className="font-semibold">Preview: {restoreSummary}</div>
                  <div className="text-fintech-muted">
                    {restorePreview.hasPreferences ? "Includes preferences" : "No preferences"} • {restorePreview.hasGoogleSheetsConfig ? "Includes Google Sheets config" : "No Google Sheets config"}
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                      <input type="radio" checked={restoreMode === "safe_merge"} onChange={() => setRestoreMode("safe_merge")} />
                      Safe merge
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
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
                        className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-xs"
                        style={{ borderColor: "var(--app-border)" }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleRestoreBackup()}
                    disabled={busyAction === "import_json_backup"}
                    className="rounded-lg bg-fintech-import/20 px-3 py-2 text-sm font-bold text-fintech-import disabled:opacity-50"
                  >
                    {busyAction === "import_json_backup" ? "Restoring..." : "Commit Restore"}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === "export" && (
        <>
          <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Choose export method</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <button type="button" onClick={() => setExportMethod("csv_zip")} className={`rounded-lg px-3 py-2 text-sm font-bold ${exportMethod === "csv_zip" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>CSV Bundle (.zip)</button>
              <button type="button" onClick={() => setExportMethod("excel")} className={`rounded-lg px-3 py-2 text-sm font-bold ${exportMethod === "excel" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>Excel Workbook</button>
              <button type="button" onClick={() => setExportMethod("json_backup")} className={`rounded-lg px-3 py-2 text-sm font-bold ${exportMethod === "json_backup" ? "bg-fintech-accent text-[#002919]" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>Full JSON Backup</button>
            </div>
          </div>

          {exportMethod === "csv_zip" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <h3 className="font-bold">Export CSV Bundle (.zip)</h3>
              <div className="mt-3 space-y-2 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={csvExportScope.expenseCategories} onChange={(e) => setCsvExportScope((c) => ({ ...c, expenseCategories: e.target.checked }))} /> Expense Categories</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={csvExportScope.incomeCategories} onChange={(e) => setCsvExportScope((c) => ({ ...c, incomeCategories: e.target.checked }))} /> Income Categories</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={csvExportScope.transactions} onChange={(e) => setCsvExportScope((c) => ({ ...c, transactions: e.target.checked }))} /> Expenses</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={csvExportScope.income} onChange={(e) => setCsvExportScope((c) => ({ ...c, income: e.target.checked }))} /> Income</label>
              </div>
              <button onClick={() => void handleExportCsvZip()} disabled={busyAction === "export_csv_zip"} className="mt-3 rounded-lg bg-fintech-accent/10 px-3 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_csv_zip" ? "Generating..." : "Download CSV Zip"}
              </button>
            </div>
          )}

          {exportMethod === "excel" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <h3 className="font-bold">Export Excel Workbook (.xlsx)</h3>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeMetadataSheet} onChange={(event) => setIncludeMetadataSheet(event.target.checked)} />
                Include metadata sheet
              </label>
              <button onClick={handleExportExcel} disabled={busyAction === "export_excel"} className="mt-3 rounded-lg bg-fintech-accent/10 px-3 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_excel" ? "Generating..." : "Download Excel"}
              </button>
            </div>
          )}

          {exportMethod === "json_backup" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <h3 className="font-bold">Export Full Budget JSON</h3>
              <p className="mt-2 text-xs text-fintech-muted">Canonical full backup for restore and portability.</p>
              <button onClick={handleExportFullJson} disabled={busyAction === "export_json_backup"} className="mt-3 rounded-lg bg-fintech-accent/10 px-3 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50">
                {busyAction === "export_json_backup" ? "Generating..." : "Download JSON Backup"}
              </button>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
        <h3 className="mb-3 flex items-center gap-2 font-bold"><History size={16} /> ImpEx Activity Timeline</h3>
        {history.length === 0 ? (
          <p className="text-xs text-fintech-muted">No ImpEx activity yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-lg bg-[var(--app-ghost)] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{entry.label}</span>
                  <span className="text-fintech-muted">{new Date(entry.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-fintech-muted">{entry.status} • {entry.scope} • {entry.message}</div>
                {(entry.imported !== undefined || entry.skipped !== undefined || entry.invalid !== undefined) && (
                  <div className="mt-1 text-fintech-muted">Imported {entry.imported || 0} • Skipped {entry.skipped || 0} • Invalid {entry.invalid || 0}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
