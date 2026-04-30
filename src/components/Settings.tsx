import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Cloud,
  CloudDownload,
  Database,
  Download,
  Globe,
  History,
  Link2,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  ExchangeRate,
  ExpenseCategory,
  ExpenseSheetMapping,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncDirection,
  Income,
  IncomeCategory,
  IncomeSheetMapping,
  PublicSheetImportConfig,
  PublicSheetImportRangeSelection,
  SheetRangeDraft,
  Transaction,
} from "../types";
import { CURRENCIES, getCurrencySymbol } from "../utils/currencyUtils";
import { useFirebase } from "../contexts/FirebaseContext";
import { getTodayStr } from "../utils/dateUtils";
import {
  getFullSheetGridRows,
  getGoogleSheetsAccessErrorMessage,
  parseSpreadsheetId,
  trimValuesAtEmptyRun,
} from "../utils/googleSheetsSync";
import { getSavedTransactionSheetRowsForType } from "../utils/publicSheetImport";
import { GoogleSheetImporter } from "./GoogleSheetImporter";
import { ImpExCenter } from "./ImpExCenter";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidCategoryMapping, PlaidCredentials, PlaidEnv, TellerCategoryMapping, TellerCredentials, TellerEnv } from "../types";

interface SettingsProps {
  onRefresh: () => void;
}

type SettingsTab = "data" | "currency" | "google_workspace" | "finance_feeds" | "maintenance";
type RangeDraft = SheetRangeDraft;
type MappingTab = "expenses" | "income" | "expense_categories" | "income_categories" | "sync";
type StatusLevel = "success" | "info" | "warning" | "error";
type DataHubMode = "one_time" | "live_sync";

interface SettingsStatus {
  level: StatusLevel;
  message: string;
  action?: string;
  section?: SettingsTab;
}

interface DataDomain {
  id: string;
  title: string;
  description: string;
  type: "expenseCategories" | "incomeCategories" | "income" | "expenses";
  exportType: "expenseCategories" | "incomeCategories" | "income" | "transactions";
}

interface ImportHistoryEntry {
  id: string;
  at: string;
  source: "csv" | "google_sheet" | "export";
  domain: string;
  imported?: number;
  skipped?: number;
  invalid?: number;
  message: string;
  status: StatusLevel;
}

interface SavedSheetMappingSummary {
  type: string;
  sheetTabName: string;
  fieldsMapped: number;
  override: boolean;
  updatedAt: string | null;
  config: PublicSheetImportConfig;
}

interface FxRateMeta {
  lastUpdated: string;
  source: "manual" | "seeded";
}

interface SheetMappingRefreshCursor {
  lastImportedOffset: number;
  lastImportedAbsoluteRow: number;
  previousSegmentHash: string;
  updatedAt: string;
}

const MAINTENANCE_WIPE_TIMEOUT_MS = 15000;
const IMPORT_FINISH_TIMEOUT_MS = 30000;
const IMPORT_HISTORY_KEY = "settings_import_history_v1";
const FX_META_KEY = "settings_fx_meta_v1";
const TRACKED_CURRENCIES_KEY = "settings_tracked_currencies_v1";
const SHEET_MAPPING_META_KEY = "settings_sheet_mapping_meta_v1";
const SHEET_VALIDATION_KEY = "settings_sheet_validation_v1";
const SHEET_MAPPING_CURSOR_KEY = "settings_sheet_mapping_refresh_cursor_v1";

const domains: DataDomain[] = [
  {
    id: "expense-categories",
    title: "Expense Categories",
    description: "Category structure and monthly targets",
    type: "expenseCategories",
    exportType: "expenseCategories",
  },
  {
    id: "income-categories",
    title: "Income Categories",
    description: "Income categorization and target setup",
    type: "incomeCategories",
    exportType: "incomeCategories",
  },
  {
    id: "expenses",
    title: "Expense History",
    description: "Expense transactions and vendor data",
    type: "expenses",
    exportType: "transactions",
  },
  {
    id: "income",
    title: "Income Records",
    description: "Income transactions and source data",
    type: "income",
    exportType: "income",
  },
];

const statusClassByLevel: Record<StatusLevel, string> = {
  success: "border-fintech-accent/30 bg-fintech-accent/10 text-fintech-accent",
  info: "border-fintech-import/30 bg-fintech-import/10 text-fintech-import",
  warning: "border-yellow-400/30 bg-yellow-500/10 text-yellow-300",
  error: "border-fintech-danger/30 bg-fintech-danger/10 text-fintech-danger",
};

const getCloudActionableError = (raw: string) => {
  const message = raw.toLowerCase();
  if (message.includes("has not been used in project") || message.includes("sheets.googleapis.com")) {
    return "Google Sheets API is disabled for your Firebase project. Enable Sheets API (and Drive API), wait a few minutes, then reconnect Google.";
  }
  if (message.includes("permission") || message.includes("access")) {
    return "Google account is connected, but permission is missing for this sheet. Reconnect Google and verify sheet access for this account.";
  }
  if (message.includes("redirecting to google")) {
    return "Google needs re-authorization. Finish the Google sign-in flow and retry.";
  }
  return raw;
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const Settings: React.FC<SettingsProps> = ({ onRefresh }) => {
  const {
    wipeData,
    backupToDrive,
    backingUp,
    lastSynced,
    syncToCloud,
    isSyncing,
    previewImport,
    commitImport,
    importData,
    upsertGoogleSheetRows,
    expenseCategories,
    incomeCategories,
    transactions,
    income: incomeRecords,
    googleSheetsConfig,
    googleSheetsConnected,
    googleSheetsSyncing,
    googleSheetsError,
    connectGoogleSheets,
    disconnectGoogleSheets,
    inspectGoogleSheetsSpreadsheet,
    previewGoogleSheetColumn,
    saveGoogleSheetsConfig,
    syncGoogleSheets,
    driveConnection,
    driveConnected,
    driveSyncError,
    connectDriveFolder,
    previewBudgetFromDrive,
    loadBudgetFromDrive,
    disconnectDriveFolder,
    preferences,
    updatePreferences,
    googleSheetsAccessToken,

    // Plaid
    plaidConnected,
    plaidConnection,
    plaidSyncing,
    plaidError,
    plaidCredentials,
    plaidCategoryMappings,
    connectPlaid,
    disconnectPlaid,
    syncPlaidTransactions,
    fetchPlaidAccounts,
    setPlaidCredentials,
    setPlaidCategoryMappings,

    // Teller
    tellerConnected,
    tellerConnection,
    tellerSyncing,
    tellerError,
    tellerCredentials,
    tellerCategoryMappings,
    connectTeller,
    disconnectTeller,
    syncTellerTransactions,
    fetchTellerAccounts,
    setTellerCredentials,
    setTellerCategoryMappings,
  } = useFirebase();


  const [activeTab, setActiveTab] = useState<SettingsTab>("data");
  const [dataHubMode, setDataHubMode] = useState<DataHubMode>("one_time");
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [wiping, setWiping] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<DataDomain | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<string | null>(null);
  const [confirmWipeText, setConfirmWipeText] = useState("");
  const [maintenanceExportConfirmed, setMaintenanceExportConfirmed] = useState(false);
  const [lastLocalExportAt, setLastLocalExportAt] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isUpsertByType, setIsUpsertByType] = useState<Record<string, boolean>>({
    expenses: true,
    income: true,
    expenseCategories: false,
    incomeCategories: false,
  });
  const [showGoogleSheetImporter, setShowGoogleSheetImporter] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() => readJson<ImportHistoryEntry[]>(IMPORT_HISTORY_KEY, []));
  const [sheetMappingMeta, setSheetMappingMeta] = useState<Record<string, string>>(() => readJson<Record<string, string>>(SHEET_MAPPING_META_KEY, {}));
  const [lastSheetValidatedAt, setLastSheetValidatedAt] = useState<string | null>(() => localStorage.getItem(SHEET_VALIDATION_KEY));
  const [sheetMappingCursors, setSheetMappingCursors] = useState<Record<string, SheetMappingRefreshCursor>>(() => readJson<Record<string, SheetMappingRefreshCursor>>(SHEET_MAPPING_CURSOR_KEY, {}));
  const [refreshingMappingType, setRefreshingMappingType] = useState<string | null>(null);

  const [folderInput, setFolderInput] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
  const [expensesSheetName, setExpensesSheetName] = useState("Expenses");
  const [incomeSheetName, setIncomeSheetName] = useState("Income");
  const [expenseCategoriesSheetName, setExpenseCategoriesSheetName] = useState("Expense Categories");
  const [incomeCategoriesSheetName, setIncomeCategoriesSheetName] = useState("Income Categories");
  const [sheetMode, setSheetMode] = useState<DataHubMode>("live_sync");
  const [syncIntervalSeconds, setSyncIntervalSeconds] = useState("30");
  const [sheetAutoSync, setSheetAutoSync] = useState(true);
  const [loadingSheetConfig, setLoadingSheetConfig] = useState(false);
  const [savingSheetConfig, setSavingSheetConfig] = useState(false);
  const [expenseHeaders, setExpenseHeaders] = useState<string[]>([]);
  const [incomeHeaders, setIncomeHeaders] = useState<string[]>([]);
  const [expenseCategoryHeaders, setExpenseCategoryHeaders] = useState<string[]>([]);
  const [incomeCategoryHeaders, setIncomeCategoryHeaders] = useState<string[]>([]);
  const [availableSheetTabs, setAvailableSheetTabs] = useState<string[]>([]);
  const [expensesDataStartRow, setExpensesDataStartRow] = useState("2");
  const [incomeDataStartRow, setIncomeDataStartRow] = useState("2");
  const [expenseCategoriesDataStartRow, setExpenseCategoriesDataStartRow] = useState("2");
  const [incomeCategoriesDataStartRow, setIncomeCategoriesDataStartRow] = useState("2");
  const [expenseCategoryNameColumn, setExpenseCategoryNameColumn] = useState("Name");
  const [expenseCategoryTargetColumn, setExpenseCategoryTargetColumn] = useState("Monthly Target");
  const [incomeCategoryNameColumn, setIncomeCategoryNameColumn] = useState("Name");
  const [incomeCategoryTargetColumn, setIncomeCategoryTargetColumn] = useState("Monthly Target");
  const [expenseRangeDrafts, setExpenseRangeDrafts] = useState<Record<string, RangeDraft>>({
    date: { startCell: "A1", endCell: "", noEnd: true },
    vendor: { startCell: "B1", endCell: "", noEnd: true },
    amount: { startCell: "C1", endCell: "", noEnd: true },
    category: { startCell: "D1", endCell: "", noEnd: true },
    notes: { startCell: "E1", endCell: "", noEnd: true },
  });
  const [incomeRangeDrafts, setIncomeRangeDrafts] = useState<Record<string, RangeDraft>>({
    date: { startCell: "A1", endCell: "", noEnd: true },
    source: { startCell: "B1", endCell: "", noEnd: true },
    amount: { startCell: "C1", endCell: "", noEnd: true },
    category: { startCell: "D1", endCell: "", noEnd: true },
    notes: { startCell: "E1", endCell: "", noEnd: true },
  });
  const [expenseCategoryRangeDrafts, setExpenseCategoryRangeDrafts] = useState<Record<string, RangeDraft>>({
    name: { startCell: "A1", endCell: "", noEnd: true },
    target: { startCell: "B1", endCell: "", noEnd: true },
  });
  const [incomeCategoryRangeDrafts, setIncomeCategoryRangeDrafts] = useState<Record<string, RangeDraft>>({
    name: { startCell: "A1", endCell: "", noEnd: true },
    target: { startCell: "B1", endCell: "", noEnd: true },
  });
  const [activeMappingTab, setActiveMappingTab] = useState<MappingTab>("expenses");
  const [columnPreviewByKey, setColumnPreviewByKey] = useState<Record<string, string>>({});
  const [expenseMapping, setExpenseMapping] = useState<ExpenseSheetMapping>({
    date: "Date",
    vendor: "Vendor",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  });
  const [incomeMapping, setIncomeMapping] = useState<IncomeSheetMapping>({
    date: "Date",
    source: "Source",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  });

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [generatingLinkToken, setGeneratingLinkToken] = useState(false);
  const [showBaseCurrencyModal, setShowBaseCurrencyModal] = useState(false);
  const [pendingBaseCurrency, setPendingBaseCurrency] = useState(preferences?.baseCurrency || "CAD");
  const [trackedCurrencies, setTrackedCurrencies] = useState<string[]>(() => readJson<string[]>(TRACKED_CURRENCIES_KEY, []));
  const [fxMeta, setFxMeta] = useState<Record<string, FxRateMeta>>(() => readJson<Record<string, FxRateMeta>>(FX_META_KEY, {}));

  useEffect(() => {
    writeJson(IMPORT_HISTORY_KEY, importHistory.slice(0, 12));
  }, [importHistory]);

  useEffect(() => {
    writeJson(FX_META_KEY, fxMeta);
  }, [fxMeta]);

  useEffect(() => {
    writeJson(TRACKED_CURRENCIES_KEY, trackedCurrencies);
  }, [trackedCurrencies]);

  useEffect(() => {
    writeJson(SHEET_MAPPING_META_KEY, sheetMappingMeta);
  }, [sheetMappingMeta]);

  useEffect(() => {
    writeJson(SHEET_MAPPING_CURSOR_KEY, sheetMappingCursors);
  }, [sheetMappingCursors]);

  useEffect(() => {
    if (lastSheetValidatedAt) {
      localStorage.setItem(SHEET_VALIDATION_KEY, lastSheetValidatedAt);
    }
  }, [lastSheetValidatedAt]);

  useEffect(() => {
    if (!googleSheetsConfig) return;
    setSheetUrl(googleSheetsConfig.spreadsheetUrl);
    setSheetTitle(googleSheetsConfig.spreadsheetTitle || "");
    setExpensesSheetName(googleSheetsConfig.expensesSheetName);
    setIncomeSheetName(googleSheetsConfig.incomeSheetName);
    setExpenseCategoriesSheetName(googleSheetsConfig.expenseCategoriesSheetName || "Expense Categories");
    setIncomeCategoriesSheetName(googleSheetsConfig.incomeCategoriesSheetName || "Income Categories");
    setExpensesDataStartRow(String(googleSheetsConfig.expensesDataStartRow || 2));
    setIncomeDataStartRow(String(googleSheetsConfig.incomeDataStartRow || 2));
    setExpenseCategoriesDataStartRow(String(googleSheetsConfig.expenseCategoriesDataStartRow || 2));
    setIncomeCategoriesDataStartRow(String(googleSheetsConfig.incomeCategoriesDataStartRow || 2));
    setExpenseCategoryNameColumn(googleSheetsConfig.expenseCategoryNameColumn || "Name");
    setExpenseCategoryTargetColumn(googleSheetsConfig.expenseCategoryTargetColumn || "Monthly Target");
    setIncomeCategoryNameColumn(googleSheetsConfig.incomeCategoryNameColumn || "Name");
    setIncomeCategoryTargetColumn(googleSheetsConfig.incomeCategoryTargetColumn || "Monthly Target");
    setSyncIntervalSeconds(String(googleSheetsConfig.syncIntervalSeconds || 30));
    setSheetAutoSync(googleSheetsConfig.autoSync);
    setExpenseMapping(googleSheetsConfig.expenseMapping);
    setIncomeMapping(googleSheetsConfig.incomeMapping);
    if (googleSheetsConfig.expenseRangeDrafts) setExpenseRangeDrafts(googleSheetsConfig.expenseRangeDrafts);
    if (googleSheetsConfig.incomeRangeDrafts) setIncomeRangeDrafts(googleSheetsConfig.incomeRangeDrafts);
    if (googleSheetsConfig.expenseCategoryRangeDrafts) setExpenseCategoryRangeDrafts(googleSheetsConfig.expenseCategoryRangeDrafts);
    if (googleSheetsConfig.incomeCategoryRangeDrafts) setIncomeCategoryRangeDrafts(googleSheetsConfig.incomeCategoryRangeDrafts);
  }, [googleSheetsConfig]);

  useEffect(() => {
    if (!preferences?.exchangeRates) return;
    const fromRates = preferences.exchangeRates.map((r) => r.currency);
    setTrackedCurrencies((current) => Array.from(new Set([...current, ...fromRates])).filter((c) => c !== preferences.baseCurrency));
  }, [preferences?.exchangeRates, preferences?.baseCurrency]);

  const ensureMappingOption = (headers: string[], fallback: string) => (headers.includes(fallback) ? headers : [...headers, fallback]);

  const appendImportHistory = (entry: Omit<ImportHistoryEntry, "id" | "at">) => {
    const next: ImportHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    setImportHistory((current) => [next, ...current].slice(0, 12));
  };

  const setSectionStatus = (section: SettingsTab, level: StatusLevel, message: string, action?: string) => {
    setStatus({ section, level, message, action });
  };

  const renderStatusStrip = (section: SettingsTab) => {
    const isWorkspace = section === "google_workspace";
    const isFinanceFeeds = section === "finance_feeds";
    const workspaceError = getCloudActionableError(googleSheetsError || driveSyncError || "");
    const financeError = plaidError || tellerError || "";
    const hasWorkspaceError = isWorkspace && Boolean(googleSheetsError || driveSyncError);
    const hasFinanceError = isFinanceFeeds && Boolean(financeError);
    const level: StatusLevel | null = hasWorkspaceError || hasFinanceError
      ? "warning"
      : status?.section === section
        ? status.level
        : null;
    const message = hasWorkspaceError
      ? workspaceError
      : hasFinanceError
        ? financeError
        : status?.section === section
          ? status.message
          : "No recent issues. Actions in this section are isolated to this workflow.";

    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${level ? statusClassByLevel[level] : "border-[var(--app-border)] bg-[var(--app-panel)] text-fintech-muted"}`}>
        {message}
      </div>
    );
  };

  const splitCSVRow = (row: string, delimiter: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parseAmount = (amt: string) => {
    if (!amt) return 0;
    const cleaned = amt.replace(/[^-0-9.]/g, "");
    return Number.parseFloat(cleaned) || 0;
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return getTodayStr();
    const cleanDate = dateStr.trim().replace(/^"|"$/g, "");
    const parts = cleanDate.split(/[-/]/);
    if (parts.length === 3) {
      let year: string;
      let month: string;
      let day: string;
      if (parts[0].length === 4) {
        [year, month, day] = parts;
      } else {
        [month, day, year] = parts;
      }
      return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const d = new Date(cleanDate);
    if (Number.isNaN(d.getTime())) return cleanDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const hashString = (value: string) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return String(hash);
  };

  const buildSegmentHash = (valuesByField: Record<string, string[]>, upToOffset: number) => {
    const fields = Object.keys(valuesByField).sort();
    const rows: string[] = [];
    for (let rowIndex = 0; rowIndex <= upToOffset; rowIndex += 1) {
      const row = fields.map((field) => valuesByField[field]?.[rowIndex] || "").join("||");
      rows.push(row);
    }
    return hashString(rows.join("\n"));
  };

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadFullBudgetExport = () => {
    const full = {
      exportedAt: new Date().toISOString(),
      baseCurrency: preferences?.baseCurrency,
      expenseCategories,
      incomeCategories,
      transactions,
      income: incomeRecords,
      googleSheetsConfig,
      driveConnection,
    };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-full-export-${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    setLastLocalExportAt(now);
    setMaintenanceExportConfirmed(true);
    appendImportHistory({ source: "export", domain: "full_budget", status: "success", message: "Full budget export downloaded." });
    setSectionStatus("data", "success", "Full budget export package downloaded.");
  };

  const templates = {
    expenseCategories: () => downloadCSV("expense_categories_template.csv", "Category Name,Monthly Target\nRent,2000\nGroceries,500\nUtilities,150"),
    incomeCategories: () => downloadCSV("income_categories_template.csv", "Category Name,Monthly Target\nSalary,5000\nFreelance,1500\nDividends,250"),
    income: () => downloadCSV("income_template.csv", "Date (MM-DD-YYYY),Source,Amount,Income Category,Notes (Optional)\n04-05-2024,Client,3667.00,Salary,April payout"),
    expenses: () => downloadCSV("expenses_template.csv", "Date,Store / Vendor,Amount,Expense Category,Notes (Optional)\n04-01-2024,Grocery Store,35.37,Groceries,Weekly trip"),
  };

  const handleExport = async (type: string, domainLabel: string) => {
    try {
      let csv = "";
      if (type === "expenseCategories") {
        csv = `Name,Monthly Target\n${expenseCategories.map((c: ExpenseCategory) => `${c.name},${c.target_amount}`).join("\n")}`;
      } else if (type === "incomeCategories") {
        csv = `Name,Monthly Target\n${incomeCategories.map((c: IncomeCategory) => `${c.name},${c.target_amount}`).join("\n")}`;
      } else if (type === "transactions") {
        csv = `Date,Vendor,Amount,Category,Notes\n${transactions.map((t: Transaction) => `${t.date},${t.vendor},${t.amount},${t.category_name},${t.notes || ""}`).join("\n")}`;
      } else if (type === "income") {
        csv = `Date,Source,Amount,Category,Notes\n${incomeRecords.map((i: Income) => `${i.date},${i.source},${i.amount},${i.category},${i.notes || ""}`).join("\n")}`;
      }
      downloadCSV(`${type}_export_${getTodayStr()}.csv`, csv);
      const now = new Date().toISOString();
      setLastLocalExportAt(now);
      setMaintenanceExportConfirmed(true);
      appendImportHistory({ source: "export", domain: domainLabel, status: "success", message: `${domainLabel} export downloaded.` });
      setSectionStatus("data", "success", `${domainLabel} exported successfully.`);
      setActiveDomain(null);
    } catch {
      setSectionStatus("data", "error", `Failed to export ${domainLabel}.`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(type);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const sampleLines = text.split("\n").slice(0, 5);
        const commaCount = sampleLines.join("").split(",").length - 1;
        const tabCount = sampleLines.join("").split("\t").length - 1;
        const delimiter = tabCount > commaCount ? "\t" : ",";
        const rows = text.split(/\r?\n/).slice(1).filter((row) => row.trim() !== "");
        if (rows.length === 0) throw new Error("No valid data found in CSV.");

        let data: any[] = [];
        if (type === "expenseCategories" || type === "incomeCategories") {
          data = rows
            .map((row) => {
              const [name, target] = splitCSVRow(row, delimiter);
              if (!name) return null;
              return [name.trim().replace(/^"|"$/g, ""), parseAmount(target)];
            })
            .filter(Boolean);
        } else {
          data = rows
            .map((row) => {
              const parts = splitCSVRow(row, delimiter);
              if (parts.length < 3) return null;
              const [date, vendorOrSource, amount, category, notes] = parts;
              return [
                parseDate(date?.trim()),
                vendorOrSource?.trim().replace(/^"|"$/g, "") || "Unknown",
                parseAmount(amount),
                category?.trim().replace(/^"|"$/g, "") || "Misc.",
                notes?.trim().replace(/^"|"$/g, "") || "",
              ];
            })
            .filter(Boolean);
        }

        setImportProgress({ current: 0, total: data.length });
        let didTimeout = false;
        let importTimer: number | null = null;
        await Promise.race([
          importData(type, data, isUpsertByType[type], (current, total) => {
            if (!didTimeout) setImportProgress({ current, total });
          }),
          new Promise<never>((_, reject) => {
            importTimer = window.setTimeout(() => {
              didTimeout = true;
              reject(new Error("import-timeout"));
            }, IMPORT_FINISH_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (importTimer !== null) window.clearTimeout(importTimer);
        });

        appendImportHistory({
          source: "csv",
          domain: type,
          imported: data.length,
          invalid: 0,
          skipped: 0,
          status: "success",
          message: `${type} CSV import completed (${data.length}).`,
        });
        setSectionStatus("data", "success", `${type} import completed: ${data.length} parsed rows.`);
        onRefresh();
        setActiveDomain(null);
      } catch (error: any) {
        if (error instanceof Error && error.message === "import-timeout") {
          appendImportHistory({ source: "csv", domain: type, status: "info", message: `${type} import queued in background.` });
          setSectionStatus("data", "info", `${type} import queued. Firestore is syncing in the background.`);
          return;
        }
        const msg = error instanceof Error ? error.message : `Failed to import ${type}.`;
        appendImportHistory({ source: "csv", domain: type, status: "error", message: msg });
        setSectionStatus("data", "error", msg);
      } finally {
        setLoading(null);
        setImportProgress(null);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleGoogleSheetImport = async (type: string, dataRows: any[], override: boolean) => {
    let importTimer: number | null = null;
    try {
      if (override) {
        setWiping(type);
        await wipeData(type);
        setWiping(null);
      }
      setImportProgress({ current: 0, total: dataRows.length });

      if (type === "expenses" || type === "income") {
        // Content-based delta detection: match by (date, vendor/source, amount, category, notes).
        // Same row → "updated" (skip re-add). New row → "imported". Invalid row → "skipped".
        // This is correct for append-only sheets and handles gaps/re-ordered rows safely.
        const commitSummary = await Promise.race([
          upsertGoogleSheetRows(type, dataRows),
          new Promise<never>((_, reject) => {
            importTimer = window.setTimeout(() => {
              reject(new Error("import-timeout"));
            }, IMPORT_FINISH_TIMEOUT_MS);
          }),
        ]);
        setImportProgress({ current: dataRows.length, total: dataRows.length });
        const statusLevel: StatusLevel = commitSummary.imported > 0 ? "success" : "info";
        const statusMsg = commitSummary.imported > 0
          ? `${type}: ${commitSummary.imported} new row(s) imported, ${commitSummary.updated} already in app.`
          : `${type}: no new rows — ${commitSummary.updated} already in app, ${commitSummary.skipped} invalid.`;
        appendImportHistory({
          source: "google_sheet",
          domain: type,
          imported: commitSummary.imported,
          skipped: commitSummary.updated,
          invalid: commitSummary.skipped,
          status: statusLevel,
          message: statusMsg,
        });
        setSheetMappingMeta((current) => ({ ...current, [type]: new Date().toISOString() }));
        setSectionStatus("data", statusLevel, statusMsg);
      } else {
        let didTimeout = false;
        const batch = previewImport("google_sheet", dataRows, { type: type as any, hasHeader: false });
        await Promise.race([
          commitImport(batch, { includeDuplicates: override }, (current, total) => {
            if (!didTimeout) setImportProgress({ current, total });
          }),
          new Promise<never>((_, reject) => {
            importTimer = window.setTimeout(() => {
              didTimeout = true;
              reject(new Error("import-timeout"));
            }, IMPORT_FINISH_TIMEOUT_MS);
          }),
        ]);
        appendImportHistory({
          source: "google_sheet",
          domain: type,
          imported: batch.summary.new,
          invalid: batch.summary.invalid,
          skipped: batch.summary.duplicate,
          status: "success",
          message: `${type} Google Sheet import: ${batch.summary.new} imported, ${batch.summary.duplicate} skipped.`,
        });
        setSheetMappingMeta((current) => ({ ...current, [type]: new Date().toISOString() }));
        setSectionStatus("data", "success", `${type} imported from Google Sheet: ${batch.summary.new} new rows.`);
      }

      setImportProgress(null);
      setWiping(null);
      onRefresh();
    } catch (error: any) {
      if (error instanceof Error && error.message === "import-timeout") {
        appendImportHistory({ source: "google_sheet", domain: type, status: "info", message: `${type} sheet import queued.` });
        setSectionStatus("data", "info", `${type} import queued. Firebase is syncing in the background.`);
      } else {
        const message = error instanceof Error ? error.message : `Failed to import ${type} from sheet.`;
        appendImportHistory({ source: "google_sheet", domain: type, status: "error", message });
        setSectionStatus("data", "error", message);
      }
      setImportProgress(null);
      setWiping(null);
    } finally {
      if (importTimer !== null) window.clearTimeout(importTimer);
    }
  };

  const handleCloseGoogleSheetImporter = () => {
    setShowGoogleSheetImporter(false);
    setActiveDomain(null);
  };

  const handleWipeAction = async (type: string) => {
    setWiping(type);
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      setSectionStatus("maintenance", "info", `${type} wipe queued. Firebase is still syncing.`);
      setConfirmWipe(null);
      setConfirmWipeText("");
      setWiping(null);
      onRefresh();
    }, MAINTENANCE_WIPE_TIMEOUT_MS);

    try {
      await wipeData(type);
      if (!didTimeout) {
        window.clearTimeout(timeoutId);
        setSectionStatus("maintenance", "success", `${type} wiped successfully.`);
        setConfirmWipe(null);
        setConfirmWipeText("");
        onRefresh();
      }
    } catch (error) {
      if (!didTimeout) {
        window.clearTimeout(timeoutId);
        const message = error instanceof Error ? error.message : `Failed to wipe ${type}.`;
        setSectionStatus("maintenance", "error", message);
      }
    } finally {
      if (!didTimeout) setWiping(null);
    }
  };

  const handleBackup = async () => {
    try {
      await backupToDrive();
      setSectionStatus("google_workspace", "success", "Drive mirror completed successfully.");
    } catch {
      setSectionStatus("google_workspace", "error", "Failed to mirror to Drive.");
    }
  };

  const handleConnectDriveFolder = async () => {
    try {
      await connectDriveFolder(folderInput.trim() || undefined);
      setFolderInput("");
      setSectionStatus("google_workspace", "success", "Connected your VibeBudget Drive folder.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect Drive folder.";
      if (!message.includes("Redirecting to Google")) {
        setSectionStatus("google_workspace", "error", getCloudActionableError(message));
      }
    }
  };

  const handlePreviewDriveRestore = async () => {
    try {
      const preview = await previewBudgetFromDrive();
      setSectionStatus("google_workspace", "info", `Restore preview: ${preview.summary.new} new, ${preview.summary.duplicate} duplicates, ${preview.summary.invalid} invalid.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview Drive restore.";
      setSectionStatus("google_workspace", "error", getCloudActionableError(message));
    }
  };

  const handleGoogleSheetsConnect = async () => {
    try {
      await connectGoogleSheets();
      setSectionStatus("google_workspace", "success", "Google sheet authorization granted. You can now verify access to your selected sheet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to authorize Google Sheet access.";
      if (message.toLowerCase().includes("redirecting to google")) {
        setSectionStatus("google_workspace", "info", "Redirecting to Google to authorize sheet access...");
        return;
      }
      setSectionStatus("google_workspace", "error", getCloudActionableError(message));
    }
  };

  const ensureSheetAuthorization = async () => {
    if (googleSheetsConnected && googleSheetsAccessToken) return true;
    try {
      await connectGoogleSheets();
      setSectionStatus("google_workspace", "info", "Redirecting to Google to authorize sheet access...");
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to authorize Google Sheet access.";
      setSectionStatus("google_workspace", "error", getCloudActionableError(message));
      return false;
    }
  };

  const handleInspectGoogleSheet = async () => {
    const allowed = await ensureSheetAuthorization();
    if (!allowed) return;
    if (!sheetUrl) {
      setSectionStatus("google_workspace", "error", "Add a Google Sheet URL first.");
      return;
    }
    setLoadingSheetConfig(true);
    try {
      const result = await inspectGoogleSheetsSpreadsheet(
        sheetUrl,
        expensesSheetName,
        incomeSheetName,
        expenseCategoriesSheetName.trim() || undefined,
        incomeCategoriesSheetName.trim() || undefined
      );
      setSheetTitle(result.spreadsheetTitle);
      setAvailableSheetTabs(result.sheetTitles || []);
      setExpenseHeaders(ensureMappingOption(result.expenseHeaders, "VibeBudget ID"));
      setIncomeHeaders(ensureMappingOption(result.incomeHeaders, "VibeBudget ID"));
      setExpenseCategoryHeaders(result.expenseCategoryHeaders || []);
      setIncomeCategoryHeaders(result.incomeCategoryHeaders || []);
      setExpenseMapping(result.suggestedExpenseMapping);
      setIncomeMapping(result.suggestedIncomeMapping);
      setSectionStatus("google_workspace", "success", "Connection verified: sheet tabs and suggested mappings loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to verify spreadsheet.";
      setSectionStatus("google_workspace", "error", getCloudActionableError(message));
    } finally {
      setLoadingSheetConfig(false);
    }
  };

  const handleSaveGoogleSheetsConfig = async () => {
    const allowed = await ensureSheetAuthorization();
    if (!allowed) return;
    if (!sheetUrl) {
      setSectionStatus("google_workspace", "error", "Add a Google Sheet URL first.");
      return;
    }
    setSavingSheetConfig(true);
    try {
      const inspection = await inspectGoogleSheetsSpreadsheet(
        sheetUrl,
        expensesSheetName,
        incomeSheetName,
        expenseCategoriesSheetName.trim() || undefined,
        incomeCategoriesSheetName.trim() || undefined
      );
      const readHeader = async (sheetName: string, startCell: string) => {
        const preview = await previewGoogleSheetColumn(sheetUrl, sheetName, startCell, startCell, false);
        return preview.headerValue || "";
      };

      const expenseDateHeader = await readHeader(expensesSheetName, expenseRangeDrafts.date.startCell);
      const expenseVendorHeader = await readHeader(expensesSheetName, expenseRangeDrafts.vendor.startCell);
      const expenseAmountHeader = await readHeader(expensesSheetName, expenseRangeDrafts.amount.startCell);
      const expenseCategoryHeader = await readHeader(expensesSheetName, expenseRangeDrafts.category.startCell);
      const expenseNotesHeader = await readHeader(expensesSheetName, expenseRangeDrafts.notes.startCell);

      const incomeDateHeader = await readHeader(incomeSheetName, incomeRangeDrafts.date.startCell);
      const incomeSourceHeader = await readHeader(incomeSheetName, incomeRangeDrafts.source.startCell);
      const incomeAmountHeader = await readHeader(incomeSheetName, incomeRangeDrafts.amount.startCell);
      const incomeCategoryHeader = await readHeader(incomeSheetName, incomeRangeDrafts.category.startCell);
      const incomeNotesHeader = await readHeader(incomeSheetName, incomeRangeDrafts.notes.startCell);

      const expenseCategoryNameHeader = expenseCategoriesSheetName
        ? await readHeader(expenseCategoriesSheetName, expenseCategoryRangeDrafts.name.startCell)
        : "";
      const expenseCategoryTargetHeader = expenseCategoriesSheetName
        ? await readHeader(expenseCategoriesSheetName, expenseCategoryRangeDrafts.target.startCell)
        : "";
      const incomeCategoryNameHeader = incomeCategoriesSheetName
        ? await readHeader(incomeCategoriesSheetName, incomeCategoryRangeDrafts.name.startCell)
        : "";
      const incomeCategoryTargetHeader = incomeCategoriesSheetName
        ? await readHeader(incomeCategoriesSheetName, incomeCategoryRangeDrafts.target.startCell)
        : "";

      const payload: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy"> = {
        spreadsheetId: inspection.spreadsheetId,
        spreadsheetUrl: sheetUrl,
        spreadsheetTitle: inspection.spreadsheetTitle,
        expensesSheetName,
        incomeSheetName,
        expenseCategoriesSheetName: expenseCategoriesSheetName.trim() || undefined,
        incomeCategoriesSheetName: incomeCategoriesSheetName.trim() || undefined,
        expensesDataStartRow: getRowFromCellRef(expenseRangeDrafts.date.startCell, 2),
        incomeDataStartRow: getRowFromCellRef(incomeRangeDrafts.date.startCell, 2),
        expenseCategoriesDataStartRow: getRowFromCellRef(expenseCategoryRangeDrafts.name.startCell, 2),
        incomeCategoriesDataStartRow: getRowFromCellRef(incomeCategoryRangeDrafts.name.startCell, 2),
        expenseCategoryNameColumn: expenseCategoryNameHeader || undefined,
        expenseCategoryTargetColumn: expenseCategoryTargetHeader || undefined,
        incomeCategoryNameColumn: incomeCategoryNameHeader || undefined,
        incomeCategoryTargetColumn: incomeCategoryTargetHeader || undefined,
        expenseMapping: {
          ...expenseMapping,
          date: expenseDateHeader || expenseMapping.date,
          vendor: expenseVendorHeader || expenseMapping.vendor,
          amount: expenseAmountHeader || expenseMapping.amount,
          category: expenseCategoryHeader || expenseMapping.category,
          notes: expenseNotesHeader || expenseMapping.notes,
        },
        incomeMapping: {
          ...incomeMapping,
          date: incomeDateHeader || incomeMapping.date,
          source: incomeSourceHeader || incomeMapping.source,
          amount: incomeAmountHeader || incomeMapping.amount,
          category: incomeCategoryHeader || incomeMapping.category,
          notes: incomeNotesHeader || incomeMapping.notes,
        },
        autoSync: sheetAutoSync,
        syncIntervalSeconds: Math.max(15, Number.parseInt(syncIntervalSeconds, 10) || 30),
        expenseRangeDrafts,
        incomeRangeDrafts,
        expenseCategoryRangeDrafts,
        incomeCategoryRangeDrafts,
        lastError: null,
        lastPullAt: googleSheetsConfig?.lastPullAt || null,
        lastPushAt: googleSheetsConfig?.lastPushAt || null,
        lastSyncedAt: googleSheetsConfig?.lastSyncedAt || null,
      };
      await saveGoogleSheetsConfig(payload);
      setSectionStatus("google_workspace", "success", "CloudSync configuration saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save CloudSync config.";
      setSectionStatus("google_workspace", "error", getCloudActionableError(message));
    } finally {
      setSavingSheetConfig(false);
    }
  };

  const handleGoogleSheetsSync = async (direction: GoogleSheetsSyncDirection = "pull") => {
    const allowed = await ensureSheetAuthorization();
    if (!allowed) return;
    try {
      await syncGoogleSheets(direction);
      const message = direction === "both"
        ? "Sync complete (pull + push)."
        : direction === "push"
          ? "Push complete. App changes uploaded to Google Sheet."
          : "Pull complete. Latest sheet changes imported.";
      setSectionStatus("google_workspace", "success", message, "sync-now");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Google Sheets.";
      setSectionStatus("google_workspace", "error", getCloudActionableError(message), "sync-now");
    }
  };

  const mappingSummaries = useMemo<SavedSheetMappingSummary[]>(() => {
    const types = ["expenses", "income", "expenseCategories", "incomeCategories"];
    return types
      .map((type) => {
        const raw = localStorage.getItem(`googleSheetImport_${type}`);
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as PublicSheetImportConfig;
          if (!parsed.sheetTabName || !parsed.mapping) return null;
          return {
            type,
            sheetTabName: parsed.sheetTabName,
            fieldsMapped: Object.keys(parsed.mapping).length,
            override: Boolean(parsed.override),
            updatedAt: sheetMappingMeta[type] || null,
            config: parsed,
          };
        } catch {
          return null;
        }
      })
      .filter((v): v is SavedSheetMappingSummary => Boolean(v));
  }, [showGoogleSheetImporter, activeDomain, sheetMappingMeta]);

  const validateSavedMapping = async () => {
    const allowed = await ensureSheetAuthorization();
    if (!allowed) return;
    const shared = readJson<{ sheetUrl?: string }>("googleSheetImport_shared", {});
    const resolvedUrl = googleSheetsConfig?.spreadsheetUrl || shared.sheetUrl || "";
    if (!resolvedUrl) {
      setSectionStatus("data", "warning", "No saved shared spreadsheet URL found. Save a mapping first.");
      return;
    }
    try {
      await inspectGoogleSheetsSpreadsheet(resolvedUrl, expensesSheetName, incomeSheetName);
      setLastSheetValidatedAt(new Date().toISOString());
      setSectionStatus("data", "success", "Saved mapping test passed. Spreadsheet is reachable and tabs are readable.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mapping validation failed.";
      setSectionStatus("data", "error", getCloudActionableError(message));
    }
  };

  const parseMappedRowsForType = (type: string, valuesByField: Record<string, string[]>, startOffset: number, endOffset: number) => {
    const parsedRows: Array<{ offset: number; row: any[] }> = [];
    let skippedRows = 0;
    for (let offset = startOffset; offset <= endOffset; offset += 1) {
      const getValue = (field: string) => (valuesByField[field]?.[offset] || "").trim();

      if (type === "expenses") {
        const date = parseDate(getValue("date"));
        const vendor = getValue("vendor");
        const amount = parseAmount(getValue("amount"));
        const category = getValue("category");
        const notes = getValue("notes");
        if (!date || !vendor || !category) {
          skippedRows += 1;
          continue;
        }
        parsedRows.push({ offset, row: [date, vendor, amount, category, notes] });
        continue;
      }

      if (type === "income") {
        const date = parseDate(getValue("date"));
        const source = getValue("source");
        const amount = parseAmount(getValue("amount"));
        const category = getValue("category");
        const notes = getValue("notes");
        if (!date || !source || !category) {
          skippedRows += 1;
          continue;
        }
        parsedRows.push({ offset, row: [date, source, amount, category, notes] });
        continue;
      }

      if (type === "expenseCategories" || type === "incomeCategories") {
        const rawName = getValue("name") || getValue("category") || getValue("title");
        const target = parseAmount(getValue("target") || getValue("amount"));
        if (!rawName) {
          skippedRows += 1;
          continue;
        }
        parsedRows.push({ offset, row: [rawName, target] });
      }
    }
    return { parsedRows, skippedRows };
  };

  const refreshSavedMapping = async (item: SavedSheetMappingSummary) => {
    const allowed = await ensureSheetAuthorization();
    if (!allowed) return;
    const shared = readJson<{ sheetUrl?: string }>("googleSheetImport_shared", {});
    const sourceUrl = googleSheetsConfig?.spreadsheetUrl || shared.sheetUrl || "";
    const spreadsheetId = parseSpreadsheetId(sourceUrl || "");

    if (!spreadsheetId) {
      setSectionStatus("data", "error", "No valid Google Sheet source configured for mapping refresh.");
      return;
    }

    const token = googleSheetsAccessToken || localStorage.getItem("vibebudgetGoogleAccessToken");
    if (!token) {
      setSectionStatus("data", "warning", "Google session token is missing. Reconnect Google in CloudSync.");
      return;
    }

    setRefreshingMappingType(item.type);
    try {
      if (item.type === "expenses" || item.type === "income") {
        const parsedRows = await getSavedTransactionSheetRowsForType(item.type, token);
        if (parsedRows.length === 0) {
          setSectionStatus("data", "info", `${item.type}: no rows found for this mapping.`);
          return;
        }

        const commitSummary = await upsertGoogleSheetRows(item.type, parsedRows);
        const statusLevel = commitSummary.imported > 0 ? "success" : "info";
        const message = commitSummary.imported > 0
          ? `Sheet refresh added ${commitSummary.imported} new row(s).`
          : "Sheet refresh found the mapped rows, but no new transactions were added.";

        appendImportHistory({
          source: "google_sheet",
          domain: item.type,
          imported: commitSummary.imported,
          skipped: commitSummary.skipped,
          invalid: 0,
          status: statusLevel,
          message,
        });
        setSheetMappingMeta((current) => ({ ...current, [item.type]: new Date().toISOString() }));
        setSectionStatus("data", statusLevel, `${item.type}: fetched ${parsedRows.length}, added ${commitSummary.imported}, already in app ${commitSummary.updated}, skipped ${commitSummary.skipped}.`);
        onRefresh();
        return;
      }

      const rows = await getFullSheetGridRows(token, spreadsheetId, item.sheetTabName);
      const mappingEntries = Object.entries(item.config.mapping || {});
      if (mappingEntries.length === 0) {
        throw new Error("No mapping ranges saved for this type.");
      }

      const valuesByField: Record<string, string[]> = {};
      mappingEntries.forEach(([field, selection]) => {
        const range = selection as PublicSheetImportRangeSelection;
        const sourceRows = rows.slice(range.start.rowIndex);
        const columnValues = sourceRows.map((row) => (row[range.start.columnIndex] || "").trim());
        // For incremental refresh we always scan downward from the mapped start row:
        // - No End Column: expected streaming behavior.
        // - Fixed End Column (Option B): allow newly appended rows below prior fixed end.
        valuesByField[field] = trimValuesAtEmptyRun(columnValues);
      });

      const requiredFieldsByType: Record<string, string[]> = {
        expenses: ["date", "vendor", "amount", "category"],
        income: ["date", "source", "amount", "category"],
        expenseCategories: ["name"],
        incomeCategories: ["name"],
      };
      const required = requiredFieldsByType[item.type] || Object.keys(valuesByField);
      const rowCount = Math.max(...required.map((field) => valuesByField[field]?.length || 0), 0);
      if (rowCount <= 0) {
        setSectionStatus("data", "info", `No rows found for ${item.type} mapping.`);
        return;
      }

      const cursor = sheetMappingCursors[item.type];
      const getFallbackImportedOffset = () => {
        if (item.type === "expenses") {
          const maxRow = transactions.reduce((max, record) => {
            if (record.import_source !== "google_sheet" || !record.source_id) return max;
            const match = record.source_id.match(/row-(\d+)$/);
            if (!match) return max;
            const n = Number.parseInt(match[1], 10);
            return Number.isFinite(n) ? Math.max(max, n - 1) : max;
          }, -1);
          return maxRow;
        }
        if (item.type === "income") {
          const maxRow = incomeRecords.reduce((max, record) => {
            if (record.import_source !== "google_sheet" || !record.source_id) return max;
            const match = record.source_id.match(/row-(\d+)$/);
            if (!match) return max;
            const n = Number.parseInt(match[1], 10);
            return Number.isFinite(n) ? Math.max(max, n - 1) : max;
          }, -1);
          return maxRow;
        }
        return -1;
      };
      const isFixedRange = !mappingEntries.some(([, selection]) => Boolean((selection as PublicSheetImportRangeSelection).extendToSheetEnd));
      const previousOffset = cursor?.lastImportedOffset ?? getFallbackImportedOffset();
      const previousSegmentHash = previousOffset >= 0 ? buildSegmentHash(valuesByField, Math.min(previousOffset, rowCount - 1)) : "";

      if (isFixedRange && cursor && cursor.previousSegmentHash && cursor.previousSegmentHash !== previousSegmentHash) {
        setSectionStatus("data", "warning", `${item.type}: earlier rows changed in the previously imported range. Use Edit/Re-import for full reconciliation.`);
      }

      const newStartOffset = Math.max(previousOffset + 1, 0);
      const newEndOffset = rowCount - 1;
      if (newStartOffset > newEndOffset) {
        setSectionStatus("data", "info", `${item.type}: no new rows to import.`);
        return;
      }

      const { parsedRows, skippedRows } = parseMappedRowsForType(item.type, valuesByField, newStartOffset, newEndOffset);
      if (parsedRows.length === 0) {
        setSectionStatus("data", "info", `${item.type}: no valid appended rows found.`);
        return;
      }

      const payloadRows = parsedRows.map(({ offset, row }) => ({
        __row: row,
        __sourceId: `google_sheet-row-${offset + 1}`,
      }));
      const batch = previewImport("google_sheet", payloadRows, { type: item.type as any, hasHeader: false });
      const commitSummary = await commitImport(batch, { includeDuplicates: false });

      const baseStartRow = Math.max(...mappingEntries.map(([, selection]) => (selection as PublicSheetImportRangeSelection).start.rowIndex + 1));
      const nextCursor: SheetMappingRefreshCursor = {
        lastImportedOffset: newEndOffset,
        lastImportedAbsoluteRow: baseStartRow + newEndOffset,
        previousSegmentHash: buildSegmentHash(valuesByField, newEndOffset),
        updatedAt: new Date().toISOString(),
      };
      setSheetMappingCursors((current) => ({ ...current, [item.type]: nextCursor }));
      setSheetMappingMeta((current) => ({ ...current, [item.type]: new Date().toISOString() }));

      appendImportHistory({
        source: "google_sheet",
        domain: item.type,
        imported: commitSummary.imported,
        skipped: commitSummary.skipped + skippedRows,
        invalid: commitSummary.invalid,
        status: commitSummary.imported > 0 ? "success" : "info",
        message: commitSummary.imported > 0
          ? `Incremental refresh imported ${commitSummary.imported} row(s).`
          : "Incremental refresh found rows, but none were imported (duplicates/invalid).",
      });
      if (commitSummary.imported > 0) {
        setSectionStatus("data", "success", `${item.type}: imported ${commitSummary.imported} row(s). Skipped ${commitSummary.skipped + skippedRows}, invalid ${commitSummary.invalid}.`);
      } else {
        setSectionStatus("data", "info", `${item.type}: no new records committed. Skipped ${commitSummary.skipped + skippedRows}, invalid ${commitSummary.invalid}.`);
      }
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? getGoogleSheetsAccessErrorMessage(error) : `Failed to refresh ${item.type}.`;
      setSectionStatus("data", "error", message);
    } finally {
      setRefreshingMappingType(null);
    }
  };

  const getActiveSheetSource = () => {
    const shared = readJson<{ sheetUrl?: string }>("googleSheetImport_shared", {});
    if (googleSheetsConfig?.spreadsheetUrl) {
      return { type: "CloudSync" as const, url: googleSheetsConfig.spreadsheetUrl };
    }
    return { type: "Local" as const, url: shared.sheetUrl || "" };
  };

  const clearSavedMapping = (type: string) => {
    localStorage.removeItem(`googleSheetImport_${type}`);
    setSheetMappingMeta((current) => {
      const next = { ...current };
      delete next[type];
      return next;
    });
    setSheetMappingCursors((current) => {
      const next = { ...current };
      delete next[type];
      return next;
    });
    setSectionStatus("data", "info", `Cleared saved mapping for ${type}.`);
  };

  const editSavedMapping = (type: string) => {
    const domain = domains.find((d) => d.type === type);
    if (!domain) return;
    setActiveDomain(domain);
    setShowGoogleSheetImporter(true);
  };

  const exchangeRates = preferences?.exchangeRates || [];
  const baseCurrency = preferences?.baseCurrency || "CAD";

  const currenciesSeenInData = useMemo(() => {
    const fromExpenses = transactions.map((t) => t.currency).filter(Boolean) as string[];
    const fromIncome = incomeRecords.map((i) => i.currency).filter(Boolean) as string[];
    return Array.from(new Set([...fromExpenses, ...fromIncome])).filter((c) => c !== baseCurrency);
  }, [transactions, incomeRecords, baseCurrency]);

  const missingCoverageCurrencies = useMemo(() => {
    const covered = new Set(exchangeRates.map((r) => r.currency));
    return currenciesSeenInData.filter((currency) => !covered.has(currency));
  }, [currenciesSeenInData, exchangeRates]);

  const staleCurrencies = useMemo(() => {
    const now = Date.now();
    return exchangeRates
      .map((r) => {
        const meta = fxMeta[r.currency];
        if (!meta?.lastUpdated) return r.currency;
        const ageHours = (now - new Date(meta.lastUpdated).getTime()) / (1000 * 60 * 60);
        return ageHours > 24 ? r.currency : null;
      })
      .filter((v): v is string => Boolean(v));
  }, [exchangeRates, fxMeta]);

  const updateRateMeta = (currency: string, source: "manual" | "seeded") => {
    setFxMeta((current) => ({
      ...current,
      [currency]: {
        source,
        lastUpdated: new Date().toISOString(),
      },
    }));
  };

  const handleAddRate = () => {
    const suggestion = CURRENCIES.find((c) => c.code !== baseCurrency && !exchangeRates.find((r) => r.currency === c.code));
    if (!suggestion || !updatePreferences) return;
    const nextRate: ExchangeRate = { currency: suggestion.code, rateToBase: 1 };
    void updatePreferences({ ...preferences, exchangeRates: [...exchangeRates, nextRate] });
    updateRateMeta(suggestion.code, "seeded");
  };

  const handleChangeBaseCurrency = async () => {
    if (!updatePreferences) return;
    await updatePreferences({ ...preferences, baseCurrency: pendingBaseCurrency });
    setShowBaseCurrencyModal(false);
    setSectionStatus("currency", "success", `Primary currency updated to ${pendingBaseCurrency}. Totals will recalculate in this currency.`);
  };

  // Plaid Link integration
  const generateLinkToken = useCallback(async () => {
    if (!plaidCredentials) return;
    setGeneratingLinkToken(true);
    try {
      const response = await fetch("/api/plaid/create_link_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: plaidCredentials.clientId,
          secret: plaidCredentials.secret,
          environment: plaidCredentials.environment,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create link token");
      }
      const data = await response.json();
      setLinkToken(data.link_token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate link token.";
      setSectionStatus("finance_feeds", "error", message);
    } finally {
      setGeneratingLinkToken(false);
    }
  }, [plaidCredentials]);

  const { open: openPlaidLink, ready: plaidLinkReady } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      try {
        await connectPlaid(publicToken);
        setLinkToken(null);
        setSectionStatus("finance_feeds", "success", `Connected to ${metadata.institution?.name || "bank"}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to exchange public token.";
        setSectionStatus("finance_feeds", "error", message);
      }
    },
    onExit: (err) => {
      setLinkToken(null);
      if (err) {
        setSectionStatus("finance_feeds", "error", err.error_message || "Plaid Link exited with an error.");
      }
    },
  });

  // Auto-open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && plaidLinkReady) {
      openPlaidLink();
    }
  }, [linkToken, plaidLinkReady, openPlaidLink]);

  // Teller Connect - uses Teller Connect JS SDK
  const openTellerConnect = useCallback(() => {
    if (!tellerCredentials?.applicationId) return;
    // Teller Connect is loaded via script tag; we call the global TellerConnect.setup()
    const TellerConnect = (window as any).TellerConnect;
    if (!TellerConnect) {
      setSectionStatus("finance_feeds", "error", "Teller Connect SDK not loaded. Please refresh the page.");
      return;
    }
    const connect = TellerConnect.setup({
      applicationId: tellerCredentials.applicationId,
      environment: tellerCredentials.environment,
      onSuccess: async (enrollment: any) => {
        try {
          await connectTeller({
            accessToken: enrollment.accessToken,
            user: {
              id: enrollment.user?.id || "unknown",
              name: enrollment.user?.name,
              email: enrollment.user?.email,
            },
            enrollment: {
              id: enrollment.enrollment?.id || enrollment.id || "unknown",
              institution: {
                id: enrollment.enrollment?.institution?.id || enrollment.institution?.id || "unknown",
                name: enrollment.enrollment?.institution?.name || enrollment.institution?.name || "Unknown",
              },
            },
          });
          setSectionStatus("finance_feeds", "success", `Connected to ${enrollment.enrollment?.institution?.name || enrollment.institution?.name || "bank"}.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to complete Teller connection.";
          setSectionStatus("finance_feeds", "error", message);
        }
      },


      onExit: () => {
        setSectionStatus("finance_feeds", "info", "Teller Connect closed.");
      },
    });
    connect.open();
  }, [tellerCredentials, connectTeller]);


  const canConfirmWipe = confirmWipeText.trim().toUpperCase() === "DELETE" && (maintenanceExportConfirmed || Boolean(lastLocalExportAt));

  const renderMappingSelect = (label: string, value: string, options: string[], onChange: (value: string) => void) => (
    <label className="space-y-1">
      <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border bg-[var(--app-ghost)] px-3 py-2 text-sm"
        style={{ borderColor: "var(--app-border)" }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  const renderRangePreview = (draft: RangeDraft) => {
    const first = draft.startCell || "C1";
    const second = first.replace(/(\d+)/, (_, n) => String(Number(n) + 1));
    const third = first.replace(/(\d+)/, (_, n) => String(Number(n) + 2));
    const last = draft.noEnd ? "auto-last" : (draft.endCell || "C19");
    return `${first}, ${second}, ${third} ... ${last}`;
  };

  const getColumnLetterFromHeader = (headers: string[], headerName: string) => {
    const normalized = headerName.trim().toLowerCase();
    const index = headers.findIndex((header) => header.trim().toLowerCase() === normalized);
    if (index < 0) return "A";
    let n = index + 1;
    let label = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  };

  const getRowFromCellRef = (cellRef: string, fallback = 2) => {
    const match = cellRef.trim().toUpperCase().match(/^[A-Z]+(\d+)$/);
    if (!match) return fallback;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed + 1 : fallback;
  };

  const updatePreview = async (key: string, sheetName: string, draft: RangeDraft) => {
    if (!sheetUrl || !sheetName || !draft.startCell) return;
    if (!googleSheetsAccessToken) {
      setColumnPreviewByKey((current) => ({ ...current, [key]: "Authorize Google first to load preview" }));
      return;
    }
    try {
      const result = await previewGoogleSheetColumn(
        sheetUrl,
        sheetName,
        draft.startCell,
        draft.endCell || null,
        draft.noEnd
      );
      const head = result.headerValue ? `${draft.startCell}: ${result.headerValue}` : `${draft.startCell}: (empty)`;
      const samples = result.samples.length > 0
        ? result.samples.map((sample) => `${sample.cell}: ${sample.value}`).join(" | ")
        : "(no data rows)";
      const tail = result.last ? ` ... last ${result.last.cell}: ${result.last.value}` : "";
      setColumnPreviewByKey((current) => ({ ...current, [key]: `${head} | ${samples}${tail}` }));
    } catch {
      setColumnPreviewByKey((current) => ({ ...current, [key]: "Preview unavailable" }));
    }
  };

  useEffect(() => {
    if (!sheetUrl || !googleSheetsConnected) return;
    let cancelled = false;
    const refreshHeadersForSelectedTabs = async () => {
      try {
        const result = await inspectGoogleSheetsSpreadsheet(
          sheetUrl,
          expensesSheetName,
          incomeSheetName,
          expenseCategoriesSheetName.trim() || undefined,
          incomeCategoriesSheetName.trim() || undefined
        );
        if (cancelled) return;
        setExpenseHeaders(ensureMappingOption(result.expenseHeaders, "VibeBudget ID"));
        setIncomeHeaders(ensureMappingOption(result.incomeHeaders, "VibeBudget ID"));
        setExpenseCategoryHeaders(result.expenseCategoryHeaders || []);
        setIncomeCategoryHeaders(result.incomeCategoryHeaders || []);
      } catch {
        // Keep existing options if tab-refresh fails.
      }
    };
    void refreshHeadersForSelectedTabs();
    return () => {
      cancelled = true;
    };
  }, [
    sheetUrl,
    googleSheetsConnected,
    expensesSheetName,
    incomeSheetName,
    expenseCategoriesSheetName,
    incomeCategoriesSheetName,
    inspectGoogleSheetsSpreadsheet,
    googleSheetsAccessToken,
  ]);

  const renderRangeRow = (
    label: string,
    draft: RangeDraft,
    onDraftChange: (next: RangeDraft) => void,
    previewKey: string,
    sheetName: string
  ) => (
    <tr className="border-t" style={{ borderColor: "var(--app-border)" }}>
      <td className="px-2 py-1.5 text-xs font-semibold text-fintech-muted">{label}</td>
      <td className="px-2 py-1.5">
        <input value={draft.startCell} onChange={(e) => onDraftChange({ ...draft, startCell: e.target.value.toUpperCase() })} onBlur={() => void updatePreview(previewKey, sheetName, draft)} placeholder="C1" className="w-full rounded-md border bg-[var(--app-panel-strong)] px-2 py-1.5 text-xs font-mono" style={{ borderColor: "var(--app-border)" }} />
        <div className="mt-1 text-[10px] text-fintech-muted">{columnPreviewByKey[previewKey] || renderRangePreview(draft)}</div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <input disabled={draft.noEnd} value={draft.endCell} onChange={(e) => onDraftChange({ ...draft, endCell: e.target.value.toUpperCase() })} onBlur={() => void updatePreview(previewKey, sheetName, draft)} placeholder={draft.noEnd ? "" : "C19"} className="w-full rounded-md border bg-[var(--app-panel-strong)] px-2 py-1.5 text-xs font-mono disabled:opacity-50" style={{ borderColor: "var(--app-border)" }} />
          <label className="inline-flex min-w-fit items-center gap-1 text-[10px] text-fintech-muted">
          <input type="checkbox" checked={draft.noEnd} onChange={(e) => onDraftChange({ ...draft, noEnd: e.target.checked })} />
          No end range
        </label>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="relative space-y-10 pb-24">
      <AnimatePresence>
        {importProgress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-6 backdrop-blur-md"
            style={{ backgroundColor: "var(--app-overlay)" }}
          >
            <div className="w-full space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-fintech-accent/10">
                <Upload size={30} className="text-fintech-accent" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Importing Data...</h3>
                <p className="text-sm text-fintech-muted">Processing {importProgress.current} / {importProgress.total}</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--app-ghost)]">
                <motion.div
                  className="h-full bg-fintech-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${(importProgress.current / Math.max(importProgress.total, 1)) * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {confirmWipe && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 backdrop-blur-sm"
            style={{ backgroundColor: "var(--app-overlay)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md space-y-5 rounded-3xl border bg-fintech-card p-6"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-center gap-3 text-fintech-danger">
                <Trash2 size={18} />
                <h3 className="font-bold">Danger Zone Confirmation</h3>
              </div>
              <p className="text-xs text-fintech-muted">
                You are about to wipe <span className="font-bold text-[var(--app-text)]">{confirmWipe}</span>. Export a backup first, then type <span className="font-bold">DELETE</span> to continue.
              </p>

              <button
                type="button"
                onClick={downloadFullBudgetExport}
                className="w-full rounded-xl bg-[var(--app-ghost)] px-4 py-2 text-sm font-semibold hover:bg-[var(--app-ghost-strong)]"
              >
                Export Full Budget Backup First
              </button>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={maintenanceExportConfirmed}
                  onChange={(e) => setMaintenanceExportConfirmed(e.target.checked)}
                />
                I confirm I have a recent export backup.
              </label>

              <input
                type="text"
                value={confirmWipeText}
                onChange={(e) => setConfirmWipeText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full rounded-xl border bg-[var(--app-panel-strong)] px-3 py-2 text-sm"
                style={{ borderColor: "var(--app-border)" }}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void handleWipeAction(confirmWipe)}
                  disabled={!canConfirmWipe || Boolean(wiping)}
                  className="flex-1 rounded-xl bg-fintech-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {wiping ? "Wiping..." : "Confirm Wipe"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmWipe(null);
                    setConfirmWipeText("");
                  }}
                  className="flex-1 rounded-xl bg-[var(--app-ghost)] px-4 py-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showBaseCurrencyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 backdrop-blur-sm"
            style={{ backgroundColor: "var(--app-overlay)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg space-y-4 rounded-3xl border bg-fintech-card p-6"
              style={{ borderColor: "var(--app-border)" }}
            >
              <h3 className="text-lg font-bold">Change Primary Currency</h3>
              <p className="text-sm text-fintech-muted">
                Budget totals, targets, and rollups will recalculate in <span className="font-semibold text-[var(--app-text)]">{pendingBaseCurrency}</span>. Raw transaction rows remain unchanged.
              </p>
              <div className="rounded-xl border bg-[var(--app-ghost)] p-3 text-xs text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
                Example: transaction currency stays as entered, but dashboard and analysis normalize to your primary currency.
              </div>
              <div className="flex gap-3">
                <button onClick={() => void handleChangeBaseCurrency()} className="flex-1 rounded-xl bg-fintech-accent px-4 py-2 text-sm font-bold text-[#002919]">Confirm Change</button>
                <button onClick={() => setShowBaseCurrencyModal(false)} className="flex-1 rounded-xl bg-[var(--app-ghost)] px-4 py-2 text-sm font-semibold">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeDomain && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveDomain(null)}
              className="fixed inset-0 z-[100] backdrop-blur-sm"
              style={{ backgroundColor: "var(--app-overlay)" }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-2xl rounded-t-[34px] border-t bg-fintech-card p-7"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{activeDomain.title}</h3>
                  <p className="text-xs text-fintech-muted">Import preview required before commit. Firestore remains canonical.</p>
                </div>
                <button onClick={() => setActiveDomain(null)} className="rounded-full p-2 hover:bg-[var(--app-ghost)]"><X size={18} /></button>
              </div>

              <div className="space-y-3">
                <button onClick={templates[activeDomain.type as keyof typeof templates]} className="w-full rounded-xl bg-[var(--app-ghost)] px-4 py-3 text-left text-sm font-semibold hover:bg-[var(--app-ghost-strong)]">Download CSV Template</button>
                <label className="flex cursor-pointer items-center justify-between rounded-xl bg-[var(--app-ghost)] px-4 py-3 hover:bg-fintech-import/10">
                  <span className="text-sm font-semibold text-fintech-import">Import CSV</span>
                  <input type="file" accept=".csv" onChange={(e) => void handleImport(e, activeDomain.type)} className="hidden" disabled={Boolean(loading)} />
                  {loading === activeDomain.type ? <RefreshCw size={16} className="animate-spin text-fintech-import" /> : <Upload size={16} className="text-fintech-import" />}
                </label>

                <label className="flex items-center gap-2 rounded-xl bg-[var(--app-ghost)] px-4 py-3 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(isUpsertByType[activeDomain.type])}
                    onChange={(e) => setIsUpsertByType((current) => ({ ...current, [activeDomain.type]: e.target.checked }))}
                  />
                  Duplicate behavior: <span className="font-semibold">{isUpsertByType[activeDomain.type] ? "Upsert (merge)" : "Append (allow duplicates)"}</span>
                </label>

                <button onClick={() => setShowGoogleSheetImporter(true)} className="w-full rounded-xl bg-[var(--app-ghost)] px-4 py-3 text-left text-sm font-semibold text-fintech-import hover:bg-fintech-import/10">Import from Shared Google Sheet</button>
                <button onClick={() => void handleExport(activeDomain.exportType, activeDomain.title)} className="w-full rounded-xl bg-fintech-accent/10 px-4 py-3 text-left text-sm font-semibold text-fintech-accent hover:bg-fintech-accent/20">Export Current Data</button>
              </div>

              <AnimatePresence>
                {showGoogleSheetImporter && (
                  <GoogleSheetImporter initialType={activeDomain.type as any} onClose={handleCloseGoogleSheetImporter} onImport={handleGoogleSheetImport} />
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-fintech-muted">Budget controls organized by imports, live sync, currency, bank feeds, and safety actions.</p>
      </header>

      <div className="flex w-fit flex-wrap gap-2 rounded-xl border bg-[var(--app-ghost)] p-1" style={{ borderColor: "var(--app-border)" }}>
        <button onClick={() => setActiveTab("data")} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "data" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>1. ImpEx</button>
        <button onClick={() => setActiveTab("currency")} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "currency" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>2. Currency</button>
        <button onClick={() => setActiveTab("google_workspace")} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "google_workspace" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>3. Google Workspace</button>
        <button onClick={() => setActiveTab("finance_feeds")} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "finance_feeds" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>4. Finance Feeds</button>
        <button onClick={() => setActiveTab("maintenance")} className={`rounded-lg px-4 py-2 text-xs font-bold ${activeTab === "maintenance" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>5. Maintenance</button>

      </div>

      <div className="space-y-6">
        {activeTab === "data" && <ImpExCenter onRefresh={onRefresh} onNavigateToConnections={() => setActiveTab("google_workspace")} />}

        {activeTab === "currency" && (
          <section className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted"><Globe size={16} className="text-fintech-accent" /> Currency</div>
            <p className="text-xs text-fintech-muted">Primary currency defines all budget rollups. FX rates cover non-base transactions.</p>
            {renderStatusStrip("currency")}

            {(missingCoverageCurrencies.length > 0 || staleCurrencies.length > 0) && (
              <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/10 p-3 text-xs text-yellow-300">
                {missingCoverageCurrencies.length > 0 && <div>Missing FX coverage: {missingCoverageCurrencies.join(", ")}.</div>}
                {staleCurrencies.length > 0 && <div className="mt-1">Stale FX rates (&gt;24h): {staleCurrencies.join(", ")}.</div>}
              </div>
            )}

            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-fintech-muted">Primary Currency</div>
              <div className="sticky top-0 z-10 rounded-xl bg-[var(--app-panel)] pb-3">
                <select
                  value={pendingBaseCurrency}
                  onChange={(e) => setPendingBaseCurrency(e.target.value)}
                  className="w-full rounded-xl border bg-[var(--app-ghost)] px-4 py-3 text-sm font-bold"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name} ({c.symbol})</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-fintech-muted">Budget totals and analytics normalize into {pendingBaseCurrency}.</p>
              <button
                onClick={() => setShowBaseCurrencyModal(true)}
                disabled={pendingBaseCurrency === baseCurrency}
                className="mt-3 rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50"
              >
                Save Primary Currency
              </button>
            </div>

            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Tracked Currencies</h3>
                <span className="text-xs text-fintech-muted">{trackedCurrencies.length} tracked</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {trackedCurrencies.map((code) => (
                  <span key={code} className="inline-flex items-center gap-2 rounded-full bg-[var(--app-ghost)] px-3 py-1 text-xs font-semibold">
                    {code}
                    <button
                      type="button"
                      onClick={() => setTrackedCurrencies((current) => current.filter((c) => c !== code))}
                      className="text-fintech-danger"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3">
                <select
                  value=""
                  onChange={(e) => {
                    const code = e.target.value;
                    if (!code) return;
                    setTrackedCurrencies((current) => Array.from(new Set([...current, code])));
                    e.target.value = "";
                  }}
                  className="w-full rounded-xl border bg-[var(--app-ghost)] px-3 py-2 text-sm"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <option value="">Add tracked currency...</option>
                  {CURRENCIES.filter((c) => c.code !== baseCurrency && !trackedCurrencies.includes(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">FX Management</h3>
                <button onClick={handleAddRate} className="rounded-lg bg-fintech-accent/10 px-3 py-1.5 text-xs font-bold text-fintech-accent">+ Add Rate</button>
              </div>
              {exchangeRates.length === 0 ? (
                <p className="text-xs text-fintech-muted">No FX rates configured. Non-base amounts may convert incorrectly.</p>
              ) : (
                <div className="space-y-2">
                  {exchangeRates.map((rate, index) => {
                    const meta = fxMeta[rate.currency];
                    return (
                      <div key={`${rate.currency}-${index}`} className="rounded-xl border bg-[var(--app-ghost)] p-3" style={{ borderColor: "var(--app-border)" }}>
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold">{rate.currency} → {baseCurrency}</span>
                          <span className="rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">
                            {(meta?.source || "manual").toUpperCase()} RATE
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.0001"
                            value={rate.rateToBase}
                            onChange={(e) => {
                              if (!updatePreferences) return;
                              const next = [...exchangeRates];
                              next[index] = { ...next[index], rateToBase: Number.parseFloat(e.target.value) || 0 };
                              void updatePreferences({ ...preferences, exchangeRates: next });
                              updateRateMeta(rate.currency, "manual");
                            }}
                            className="flex-1 rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm"
                            style={{ borderColor: "var(--app-border)" }}
                          />
                          <span className="w-12 text-xs font-semibold text-fintech-muted">{baseCurrency}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!updatePreferences) return;
                              const next = [...exchangeRates];
                              next.splice(index, 1);
                              void updatePreferences({ ...preferences, exchangeRates: next });
                            }}
                            className="rounded-md p-2 text-fintech-danger hover:bg-fintech-danger/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="mt-2 text-[11px] text-fintech-muted">Last updated: {meta?.lastUpdated ? new Date(meta.lastUpdated).toLocaleString() : "Not set"}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 rounded-lg bg-[var(--app-ghost)] p-3 text-xs text-fintech-muted">
                Example: 100 USD x 1.35 = {getCurrencySymbol(baseCurrency)}135.00 in budget rollups.
              </div>
            </div>
          </section>
        )}

        {activeTab === "google_workspace" && (
          <section className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted"><Cloud size={16} className="text-fintech-accent" /> Google Workspace</div>
            <p className="text-xs text-fintech-muted">Manage your Google Sheets data source and Drive backup vault in one place.</p>
            {renderStatusStrip("google_workspace")}

            {/* Step 1 — Connection Hub */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fintech-accent/10 text-[10px] font-bold text-fintech-accent">1</span>
                <h3 className="font-bold">Connect Your Accounts</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {/* Google Account */}
                <div className="flex flex-col gap-2 rounded-lg bg-[var(--app-ghost)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Google Account</span>
                    {googleSheetsConnected ? (
                      <span className="rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">Connected</span>
                    ) : (
                      <span className="rounded-full bg-[var(--app-panel)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted">Not Connected</span>
                    )}
                  </div>
                  <p className="text-[10px] leading-relaxed text-fintech-muted">Authorization is requested only when you interact with a sheet.</p>
                  <div>
                    {!googleSheetsConnected ? (
                      <button onClick={handleGoogleSheetsConnect} className="rounded-md bg-fintech-accent/10 px-3 py-1.5 text-[11px] font-bold text-fintech-accent hover:bg-fintech-accent/20 transition-colors">Authorize</button>
                    ) : (
                      <button onClick={disconnectGoogleSheets} className="rounded-md bg-[var(--app-panel)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--app-border)] transition-colors">Disconnect</button>
                    )}
                  </div>
                </div>

                {/* Google Sheet Status */}
                <div className="flex flex-col gap-2 rounded-lg bg-[var(--app-ghost)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Google Sheet</span>
                    {googleSheetsConfig ? (
                      <span className="rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">Configured</span>
                    ) : (
                      <span className="rounded-full bg-[var(--app-panel)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted">Not Set</span>
                    )}
                  </div>
                  <p className="truncate text-[10px] leading-relaxed text-fintech-muted">{googleSheetsConfig?.spreadsheetTitle || "No spreadsheet linked yet"}</p>
                  {googleSheetsConfig && (
                    <div className="space-y-0.5 text-[10px] text-fintech-muted">
                      <div>Tabs: {googleSheetsConfig.expensesSheetName} / {googleSheetsConfig.incomeSheetName}</div>
                      {googleSheetsConfig.lastPullAt && <div>Last pull: {new Date(googleSheetsConfig.lastPullAt).toLocaleDateString()}</div>}
                    </div>
                  )}
                </div>

                {/* Drive Mirror Status */}
                <div className="flex flex-col gap-2 rounded-lg bg-[var(--app-ghost)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Drive Mirror</span>
                    {driveConnected ? (
                      <span className="rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">Connected</span>
                    ) : (
                      <span className="rounded-full bg-[var(--app-panel)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted">Not Connected</span>
                    )}
                  </div>
                  <p className="truncate text-[10px] leading-relaxed text-fintech-muted">{driveConnection?.folderName || "No drive folder linked"}</p>
                  {driveConnection?.lastMirrorAt && <p className="text-[10px] text-fintech-muted">Last mirror: {new Date(driveConnection.lastMirrorAt).toLocaleDateString()}</p>}
                  {driveConnection?.folderUrl && (
                    <a className="mt-auto text-[10px] font-medium text-fintech-accent hover:underline" href={driveConnection.folderUrl} target="_blank" rel="noreferrer">Open Drive Folder</a>
                  )}
                </div>
              </div>
            </div>

            {/* Section A — Google Sheets Source */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fintech-accent/10 text-[10px] font-bold text-fintech-accent">A</span>
                <h3 className="font-bold">Google Sheets Source</h3>
                {sheetTitle && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-fintech-muted">{sheetTitle}</span>}
              </div>

              {/* Mode Chooser */}
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--app-ghost)] p-1 w-fit">
                <button onClick={() => setSheetMode("live_sync")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${sheetMode === "live_sync" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Live Sync</button>
                <button onClick={() => setSheetMode("one_time")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${sheetMode === "one_time" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>One-time Pull</button>
              </div>

              {sheetMode === "live_sync" ? (
                <>
                  <p className="mb-3 text-xs text-fintech-muted">Paste your spreadsheet URL, then verify access. Mapping is configured in the next step.</p>
                  <div className="space-y-3">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Spreadsheet URL</span>
                      <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-4 py-2 text-sm" style={{ borderColor: "var(--app-border)" }} />
                    </label>
                    <button onClick={() => void handleInspectGoogleSheet()} disabled={loadingSheetConfig} className="w-full rounded-xl bg-[var(--app-ghost)] py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{loadingSheetConfig ? "Verifying Sheet Access..." : "Verify Sheet Access"}</button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-fintech-muted">One-time pulls import from a shared Google Sheet without persistent configuration. After import your mapping is saved as a preset for reuse.</p>
                  <div className="rounded-lg bg-[var(--app-ghost)] p-3 text-center">
                    <p className="text-xs text-fintech-muted">Use the <span className="font-bold text-fintech-accent">ImpEx</span> tab to trigger a one-time Google Sheet import.</p>
                    <button onClick={() => setActiveTab("data")} className="mt-2 rounded-lg bg-fintech-accent/10 px-3 py-1.5 text-[11px] font-bold text-fintech-accent hover:bg-fintech-accent/20 transition-colors">Go to ImpEx</button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3 — Map Columns & Sync (live sync only) */}
            {sheetMode === "live_sync" && (
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fintech-accent/10 text-[10px] font-bold text-fintech-accent">3</span>
                <h3 className="font-bold">Map Columns & Sync</h3>
              </div>
              {expenseHeaders.length > 0 || incomeHeaders.length > 0 ? (
                <>
                  <p className="mb-3 text-xs text-fintech-muted">Use table mapping per dataset. Pick header and range, and confirm the live preview before syncing.</p>

                  <div className="mb-4 flex flex-wrap gap-2 rounded-lg bg-[var(--app-ghost)] p-1">
                    <button onClick={() => setActiveMappingTab("expenses")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${activeMappingTab === "expenses" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Expenses</button>
                    <button onClick={() => setActiveMappingTab("income")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${activeMappingTab === "income" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Income</button>
                    <button onClick={() => setActiveMappingTab("expense_categories")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${activeMappingTab === "expense_categories" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Expense Categories</button>
                    <button onClick={() => setActiveMappingTab("income_categories")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${activeMappingTab === "income_categories" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Income Categories</button>
                    <button onClick={() => setActiveMappingTab("sync")} className={`rounded-md px-3 py-1 text-[11px] font-bold ${activeMappingTab === "sync" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted"}`}>Sync</button>
                  </div>

                  <div className="space-y-4">
                    {activeMappingTab === "expenses" && (
                    <div className="rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                      <div className="border-b px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Expenses Mapping</div>
                      <div className="p-3">
                        <label className="mb-3 block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Expenses Tab</span>
                          <select value={expensesSheetName} onChange={(e) => setExpensesSheetName(e.target.value)} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                            <option value={expensesSheetName}>{expensesSheetName}</option>
                            {availableSheetTabs.filter((tab) => tab !== expensesSheetName).map((tab) => <option key={`exp-${tab}`} value={tab}>{tab}</option>)}
                          </select>
                        </label>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-widest text-fintech-muted">
                                <th className="px-3 py-2">Field</th><th className="px-3 py-2">Start Cell + Preview</th><th className="px-3 py-2">End Cell</th>
                              </tr>
                            </thead>
                            <tbody>
                              {renderRangeRow("Date", expenseRangeDrafts.date, (n) => setExpenseRangeDrafts((c) => ({ ...c, date: n })), "expense-date", expensesSheetName)}
                              {renderRangeRow("Vendor", expenseRangeDrafts.vendor, (n) => setExpenseRangeDrafts((c) => ({ ...c, vendor: n })), "expense-vendor", expensesSheetName)}
                              {renderRangeRow("Amount", expenseRangeDrafts.amount, (n) => setExpenseRangeDrafts((c) => ({ ...c, amount: n })), "expense-amount", expensesSheetName)}
                              {renderRangeRow("Category", expenseRangeDrafts.category, (n) => setExpenseRangeDrafts((c) => ({ ...c, category: n })), "expense-category", expensesSheetName)}
                              {renderRangeRow("Notes", expenseRangeDrafts.notes, (n) => setExpenseRangeDrafts((c) => ({ ...c, notes: n })), "expense-notes", expensesSheetName)}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <button onClick={() => void handleSaveGoogleSheetsConfig()} disabled={savingSheetConfig} className="flex-1 rounded-xl bg-fintech-accent/10 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{savingSheetConfig ? "Saving..." : "Save Expenses Mapping"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("pull")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-fintech-import/10 py-2 text-sm font-bold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors">{googleSheetsSyncing ? "Syncing..." : "Pull Now"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("push")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-[var(--app-ghost)] py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{googleSheetsSyncing ? "Syncing..." : "Push Now"}</button>
                        </div>
                      </div>
                    </div>
                    )}

                    {activeMappingTab === "income" && (
                    <div className="rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                      <div className="border-b px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Income Mapping</div>
                      <div className="p-3">
                        <label className="mb-3 block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Income Tab</span>
                          <select value={incomeSheetName} onChange={(e) => setIncomeSheetName(e.target.value)} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                            <option value={incomeSheetName}>{incomeSheetName}</option>
                            {availableSheetTabs.filter((tab) => tab !== incomeSheetName).map((tab) => <option key={`inc-${tab}`} value={tab}>{tab}</option>)}
                          </select>
                        </label>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-widest text-fintech-muted">
                                <th className="px-3 py-2">Field</th><th className="px-3 py-2">Start Cell + Preview</th><th className="px-3 py-2">End Cell</th>
                              </tr>
                            </thead>
                            <tbody>
                              {renderRangeRow("Date", incomeRangeDrafts.date, (n) => setIncomeRangeDrafts((c) => ({ ...c, date: n })), "income-date", incomeSheetName)}
                              {renderRangeRow("Source", incomeRangeDrafts.source, (n) => setIncomeRangeDrafts((c) => ({ ...c, source: n })), "income-source", incomeSheetName)}
                              {renderRangeRow("Amount", incomeRangeDrafts.amount, (n) => setIncomeRangeDrafts((c) => ({ ...c, amount: n })), "income-amount", incomeSheetName)}
                              {renderRangeRow("Category", incomeRangeDrafts.category, (n) => setIncomeRangeDrafts((c) => ({ ...c, category: n })), "income-category", incomeSheetName)}
                              {renderRangeRow("Notes", incomeRangeDrafts.notes, (n) => setIncomeRangeDrafts((c) => ({ ...c, notes: n })), "income-notes", incomeSheetName)}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <button onClick={() => void handleSaveGoogleSheetsConfig()} disabled={savingSheetConfig} className="flex-1 rounded-xl bg-fintech-accent/10 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{savingSheetConfig ? "Saving..." : "Save Income Mapping"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("pull")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-fintech-import/10 py-2 text-sm font-bold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors">{googleSheetsSyncing ? "Syncing..." : "Pull Now"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("push")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-[var(--app-ghost)] py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{googleSheetsSyncing ? "Syncing..." : "Push Now"}</button>
                        </div>
                      </div>
                    </div>
                    )}

                    {activeMappingTab === "expense_categories" && (
                    <div className="rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                      <div className="border-b px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Expense Categories Mapping</div>
                      <div className="p-3">
                        <label className="mb-3 block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Expense Categories Tab (Optional)</span>
                          <select value={expenseCategoriesSheetName} onChange={(e) => setExpenseCategoriesSheetName(e.target.value)} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                            <option value={expenseCategoriesSheetName}>{expenseCategoriesSheetName}</option>
                            {availableSheetTabs.filter((tab) => tab !== expenseCategoriesSheetName).map((tab) => <option key={`exp-cat-${tab}`} value={tab}>{tab}</option>)}
                          </select>
                        </label>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-widest text-fintech-muted">
                                <th className="px-3 py-2">Field</th><th className="px-3 py-2">Start Cell + Preview</th><th className="px-3 py-2">End Cell</th>
                              </tr>
                            </thead>
                            <tbody>
                              {renderRangeRow("Name", expenseCategoryRangeDrafts.name, (n) => setExpenseCategoryRangeDrafts((c) => ({ ...c, name: n })), "expense-cat-name", expenseCategoriesSheetName)}
                              {renderRangeRow("Target", expenseCategoryRangeDrafts.target, (n) => setExpenseCategoryRangeDrafts((c) => ({ ...c, target: n })), "expense-cat-target", expenseCategoriesSheetName)}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <button onClick={() => void handleSaveGoogleSheetsConfig()} disabled={savingSheetConfig} className="flex-1 rounded-xl bg-fintech-accent/10 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{savingSheetConfig ? "Saving..." : "Save Expense Categories Mapping"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("pull")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-fintech-import/10 py-2 text-sm font-bold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors">{googleSheetsSyncing ? "Syncing..." : "Pull Now"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("push")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-[var(--app-ghost)] py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{googleSheetsSyncing ? "Syncing..." : "Push Now"}</button>
                        </div>
                      </div>
                    </div>
                    )}

                    {activeMappingTab === "income_categories" && (
                    <div className="rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                      <div className="border-b px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Income Categories Mapping</div>
                      <div className="p-3">
                        <label className="mb-3 block space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Income Categories Tab (Optional)</span>
                          <select value={incomeCategoriesSheetName} onChange={(e) => setIncomeCategoriesSheetName(e.target.value)} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                            <option value={incomeCategoriesSheetName}>{incomeCategoriesSheetName}</option>
                            {availableSheetTabs.filter((tab) => tab !== incomeCategoriesSheetName).map((tab) => <option key={`inc-cat-${tab}`} value={tab}>{tab}</option>)}
                          </select>
                        </label>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-widest text-fintech-muted">
                                <th className="px-3 py-2">Field</th><th className="px-3 py-2">Start Cell + Preview</th><th className="px-3 py-2">End Cell</th>
                              </tr>
                            </thead>
                            <tbody>
                              {renderRangeRow("Name", incomeCategoryRangeDrafts.name, (n) => setIncomeCategoryRangeDrafts((c) => ({ ...c, name: n })), "income-cat-name", incomeCategoriesSheetName)}
                              {renderRangeRow("Target", incomeCategoryRangeDrafts.target, (n) => setIncomeCategoryRangeDrafts((c) => ({ ...c, target: n })), "income-cat-target", incomeCategoriesSheetName)}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <button onClick={() => void handleSaveGoogleSheetsConfig()} disabled={savingSheetConfig} className="flex-1 rounded-xl bg-fintech-accent/10 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{savingSheetConfig ? "Saving..." : "Save Income Categories Mapping"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("pull")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-fintech-import/10 py-2 text-sm font-bold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors">{googleSheetsSyncing ? "Syncing..." : "Pull Now"}</button>
                          <button onClick={() => void handleGoogleSheetsSync("push")} disabled={!googleSheetsConfig || googleSheetsSyncing} className="flex-1 rounded-xl bg-[var(--app-ghost)] py-2 text-sm font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{googleSheetsSyncing ? "Syncing..." : "Push Now"}</button>
                        </div>
                      </div>
                    </div>
                    )}

                    {activeMappingTab === "sync" && (
                    <div className="rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                      <div className="border-b px-3 py-2 text-sm font-bold" style={{ borderColor: "var(--app-border)" }}>Sync Settings</div>
                      <div className="p-3 grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 block">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Auto-Sync Interval (sec)</span>
                          <input type="number" min="15" value={syncIntervalSeconds} onChange={(e) => setSyncIntervalSeconds(e.target.value)} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }} />
                        </label>
                        <label className="flex items-end gap-2 pb-2 text-sm">
                          <input type="checkbox" checked={sheetAutoSync} onChange={(e) => setSheetAutoSync(e.target.checked)} />
                          Enable auto-sync while app is open
                        </label>
                      </div>
                      <div className="px-3 pb-3">
                        <button onClick={() => void handleSaveGoogleSheetsConfig()} disabled={savingSheetConfig} className="w-full rounded-xl bg-fintech-accent/10 py-2 text-sm font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{savingSheetConfig ? "Saving..." : "Save Sync Settings"}</button>
                      </div>
                    </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs text-fintech-muted">Verify a sheet in Section A to populate column headers and set up mappings here.</p>
                </div>
              )}
            </div>
            )}

            {/* Saved Mapping Presets */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Saved Mapping Presets</h3>
                <span className="rounded-full bg-[var(--app-ghost)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted">{mappingSummaries.length}</span>
              </div>
              <p className="mb-3 text-xs text-fintech-muted">Presets are saved when you import from a shared Google Sheet in the ImpEx tab. You can refresh, edit, or clear them here.</p>
              {mappingSummaries.length === 0 ? (
                <p className="py-3 text-center text-xs text-fintech-muted">No saved mapping presets yet. They will appear here after you import from a sheet in the ImpEx tab.</p>
              ) : (
                <div className="space-y-2">
                  {mappingSummaries.map((item) => (
                    <div key={item.type} className="rounded-lg bg-[var(--app-ghost)] p-3 text-xs">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold capitalize">{item.type}</span>
                            <span className="rounded bg-[var(--app-panel)] px-1.5 py-0.5 text-[10px] font-medium text-fintech-muted">{item.override ? "Replace" : "Upsert"}</span>
                          </div>
                          <div className="mt-1 text-fintech-muted">
                            Tab: {item.sheetTabName} · {item.fieldsMapped} fields mapped · Last updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "Unknown"}
                          </div>
                          {sheetMappingCursors[item.type] && (
                            <div className="mt-1 text-fintech-muted">
                              Incremental checkpoint: row {sheetMappingCursors[item.type].lastImportedAbsoluteRow} at {new Date(sheetMappingCursors[item.type].updatedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => void refreshSavedMapping(item)}
                            disabled={refreshingMappingType === item.type}
                            className="rounded-md bg-fintech-import/10 px-2 py-1 text-[11px] font-semibold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors"
                          >
                            {refreshingMappingType === item.type ? "Refreshing..." : "Refresh"}
                          </button>
                          <button onClick={() => editSavedMapping(item.type)} className="rounded-md bg-[var(--app-panel)] px-2 py-1 text-[11px] font-semibold hover:bg-[var(--app-border)] transition-colors">Edit</button>
                          <button onClick={() => void validateSavedMapping()} className="rounded-md bg-[var(--app-panel)] px-2 py-1 text-[11px] font-semibold hover:bg-[var(--app-border)] transition-colors">Test</button>
                          <button onClick={() => clearSavedMapping(item.type)} className="rounded-md bg-fintech-danger/10 px-2 py-1 text-[11px] font-semibold text-fintech-danger hover:bg-fintech-danger/20 transition-colors">Clear</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B — Drive Backup Vault */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fintech-accent/10 text-[10px] font-bold text-fintech-accent">B</span>
                <h3 className="font-bold">Drive Backup Vault</h3>
              </div>
              <p className="mb-3 text-xs text-fintech-muted">The canonical full-budget recovery mechanism. Backs up data + preferences only — no bank credentials are ever included.</p>
              <label className="mb-3 block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Optional Folder URL / ID</span>
                <input value={folderInput} onChange={(e) => setFolderInput(e.target.value)} placeholder="Existing Drive folder URL or ID" className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }} />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button onClick={handleConnectDriveFolder} disabled={isSyncing} className="rounded-xl bg-[var(--app-ghost)] py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">{driveConnected ? "Reconnect Drive" : "Connect Drive"}</button>
                <button onClick={handleBackup} disabled={!driveConnected || backingUp} className="rounded-xl bg-fintech-accent/10 py-2 text-xs font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors">{backingUp ? "Mirroring..." : "Mirror Now"}</button>
                <button onClick={() => void handlePreviewDriveRestore()} disabled={!driveConnected || isSyncing} className="rounded-xl bg-[var(--app-ghost)] py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors">Restore Preview</button>
                <button onClick={() => { void loadBudgetFromDrive().then(() => { setSectionStatus("google_workspace", "success", "Budget restored from Drive. Reconnect finance feeds to resume transaction sync."); onRefresh(); }).catch((e: Error) => setSectionStatus("google_workspace", "error", e.message)); }} disabled={!driveConnected || isSyncing} className="rounded-xl bg-fintech-import/10 py-2 text-xs font-bold text-fintech-import disabled:opacity-50 hover:bg-fintech-import/20 transition-colors">Restore Now</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={disconnectDriveFolder} disabled={!driveConnected} className="rounded-xl bg-fintech-danger/10 px-3 py-1.5 text-[11px] font-bold text-fintech-danger disabled:opacity-50 hover:bg-fintech-danger/20 transition-colors">Disconnect Drive</button>
                {lastSynced && <p className="text-[11px] text-fintech-muted">Last app-level sync: {lastSynced.toLocaleString()}</p>}
                {driveConnection?.lastMirrorAt && <p className="text-[11px] text-fintech-muted">Last mirror: {new Date(driveConnection.lastMirrorAt).toLocaleString()}</p>}
                {driveConnection?.lastRestoreAt && <p className="text-[11px] text-fintech-muted">Last restore: {new Date(driveConnection.lastRestoreAt).toLocaleString()}</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "finance_feeds" && (
          <section className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted"><Banknote size={16} className="text-fintech-accent" /> Finance Feeds</div>
            <p className="text-xs text-fintech-muted">Log transactions from bank feeds. Credentials are session-only and never saved to Firestore or Drive backups.</p>
            {renderStatusStrip("finance_feeds")}

            {/* ─── Plaid ─── */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-3">
                <span className="rounded-md bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fintech-accent">Plaid</span>
                {plaidConnected ? (
                  <span className="flex items-center gap-1 rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent"><CheckCircle2 size={10} /> Connected</span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--app-ghost)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted"><AlertCircle size={10} /> Not Connected</span>
                )}
              </div>

              {/* Plaid Credentials */}
              <details className="mb-4 rounded-lg bg-[var(--app-ghost)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-fintech-muted">API Credentials</summary>
                <p className="mt-2 text-[10px] text-fintech-muted">
                  Get these from the <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="text-fintech-accent hover:underline">Plaid Dashboard</a>. Use sandbox for testing.
                </p>
                <div className="mt-2 space-y-2">
                  <input value={plaidCredentials?.clientId || ""} onChange={(e) => setPlaidCredentials({ ...plaidCredentials || { clientId: "", secret: "", environment: "sandbox" }, clientId: e.target.value })} placeholder="Client ID" className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs" style={{ borderColor: "var(--app-border)" }} />
                  <input type="password" value={plaidCredentials?.secret || ""} onChange={(e) => setPlaidCredentials({ ...plaidCredentials || { clientId: "", secret: "", environment: "sandbox" }, secret: e.target.value })} placeholder="Secret" className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs" style={{ borderColor: "var(--app-border)" }} />
                  <select value={plaidCredentials?.environment || "sandbox"} onChange={(e) => setPlaidCredentials({ ...plaidCredentials || { clientId: "", secret: "", environment: "sandbox" }, environment: e.target.value as PlaidEnv })} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <option value="sandbox">Sandbox</option>
                    <option value="development">Development</option>
                    <option value="production">Production</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => { setPlaidCredentials({ ...plaidCredentials! }); setSectionStatus("finance_feeds", "success", "Plaid credentials saved to session."); }} className="rounded-md bg-fintech-accent/10 px-3 py-1.5 text-[11px] font-bold text-fintech-accent">Save</button>
                    <button onClick={() => setPlaidCredentials(null)} className="rounded-md bg-fintech-danger/10 px-3 py-1.5 text-[11px] font-bold text-fintech-danger">Clear</button>
                  </div>
                </div>
              </details>

              {/* Plaid Connection */}
              {plaidConnection && (
                <div className="mb-4 rounded-lg bg-[var(--app-ghost)] p-3 text-xs">
                  <div className="flex justify-between"><span className="text-fintech-muted">Institution</span><span className="font-semibold">{plaidConnection.institutionName || "Unknown"}</span></div>
                  <div className="flex justify-between"><span className="text-fintech-muted">Connected</span><span>{new Date(plaidConnection.connectedAt).toLocaleDateString()}</span></div>
                  <div className="flex justify-between"><span className="text-fintech-muted">Last Sync</span><span>{plaidConnection.lastSyncAt ? new Date(plaidConnection.lastSyncAt).toLocaleString() : "Never"}</span></div>
                  {plaidConnection.accounts.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Accounts</div>
                      {plaidConnection.accounts.map((a) => (
                        <div key={a.id} className="flex justify-between rounded bg-[var(--app-panel)] px-2 py-1 text-[11px]"><span>{a.name}</span><span className="text-fintech-muted">{a.mask ? `••••${a.mask}` : a.type}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {plaidError && <div className="mb-4 rounded-lg bg-fintech-danger/10 px-3 py-2 text-xs text-fintech-danger">{plaidError}</div>}

              {/* Plaid Actions */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <button onClick={() => void generateLinkToken()} disabled={!plaidCredentials || generatingLinkToken} className="rounded-lg bg-fintech-accent/10 py-2 text-xs font-bold text-fintech-accent disabled:opacity-50">{generatingLinkToken ? "Opening Link..." : "Connect a Bank"}</button>
                <button onClick={async () => { try { const s = await syncPlaidTransactions(); setSectionStatus("finance_feeds", "success", `Synced ${s.imported} transactions.`); } catch (e) { setSectionStatus("finance_feeds", "error", e instanceof Error ? e.message : "Sync failed."); } }} disabled={!plaidConnected || plaidSyncing} className="rounded-lg bg-[var(--app-ghost)] py-2 text-xs font-bold disabled:opacity-50">{plaidSyncing ? "Syncing..." : "Sync Now"}</button>
                <button onClick={async () => { await disconnectPlaid(); setSectionStatus("finance_feeds", "info", "Plaid disconnected."); }} disabled={!plaidConnected} className="rounded-lg bg-fintech-danger/10 py-2 text-xs font-bold text-fintech-danger disabled:opacity-50">Disconnect</button>
              </div>

              {/* Plaid Category Mapping */}
              <details className="mt-4 rounded-lg bg-[var(--app-ghost)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-fintech-muted">Category Mapping ({plaidCategoryMappings.length} override(s))</summary>
                <p className="mt-1 text-[10px] text-fintech-muted">Plaid categories are auto-mapped. Add overrides for specific categories.</p>
                <div className="mt-2 space-y-2">
                  {plaidCategoryMappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={m.plaidCategory} onChange={(e) => { const n = [...plaidCategoryMappings]; n[i] = { ...n[i], plaidCategory: e.target.value }; setPlaidCategoryMappings(n); }} placeholder="Plaid category" className="flex-1 rounded border bg-[var(--app-panel-strong)] px-2 py-1 text-[11px]" style={{ borderColor: "var(--app-border)" }} />
                      <span className="text-fintech-muted text-[10px]">→</span>
                      <input value={m.vibeBudgetCategory} onChange={(e) => { const n = [...plaidCategoryMappings]; n[i] = { ...n[i], vibeBudgetCategory: e.target.value }; setPlaidCategoryMappings(n); }} placeholder="VB category" className="flex-1 rounded border bg-[var(--app-panel-strong)] px-2 py-1 text-[11px]" style={{ borderColor: "var(--app-border)" }} />
                      <button onClick={() => setPlaidCategoryMappings(plaidCategoryMappings.filter((_, idx) => idx !== i))} className="rounded p-0.5 text-fintech-danger hover:bg-fintech-danger/10"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => setPlaidCategoryMappings([...plaidCategoryMappings, { plaidCategory: "", vibeBudgetCategory: "" }])} className="text-[11px] font-bold text-fintech-muted hover:text-fintech-accent">+ Add Override</button>
                </div>
              </details>
            </div>

            {/* ─── Teller ─── */}
            <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
              <div className="mb-4 flex items-center gap-3">
                <span className="rounded-md bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fintech-accent">Teller</span>
                {tellerConnected ? (
                  <span className="flex items-center gap-1 rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent"><CheckCircle2 size={10} /> Connected</span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--app-ghost)] px-2 py-0.5 text-[10px] font-bold text-fintech-muted"><AlertCircle size={10} /> Not Connected</span>
                )}
              </div>

              {/* Teller Credentials */}
              <details className="mb-4 rounded-lg bg-[var(--app-ghost)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-fintech-muted">Application Credentials</summary>
                <p className="mt-2 text-[10px] text-fintech-muted">
                  Get these from the <a href="https://dashboard.teller.io" target="_blank" rel="noreferrer" className="text-fintech-accent hover:underline">Teller Dashboard</a>. Use sandbox for testing.
                </p>
                <div className="mt-2 space-y-2">
                  <input type="password" value={tellerCredentials?.applicationId || ""} onChange={(e) => setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, applicationId: e.target.value })} placeholder="Application ID" className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs" style={{ borderColor: "var(--app-border)" }} />
                  <div>
                    <div className="flex items-center gap-2">
                      <textarea value={tellerCredentials?.certificate || ""} onChange={(e) => setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, certificate: e.target.value })} placeholder="Client Certificate (PEM)" rows={2} className="flex-1 rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs font-mono" style={{ borderColor: "var(--app-border)" }} />
                      <label className="cursor-pointer rounded-md bg-[var(--app-panel)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--app-border)]"><Upload size={12} className="inline" /> .pem<input type="file" accept=".pem,.crt,.cert,.cer,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, certificate: (await f.text()).trim() }); } catch { setSectionStatus("finance_feeds", "error", "Failed to read certificate."); } e.target.value = ""; }} /></label>
                    </div>
                    {tellerCredentials?.certificate && <span className="text-[10px] text-fintech-accent">Certificate loaded</span>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <textarea value={tellerCredentials?.privateKey || ""} onChange={(e) => setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, privateKey: e.target.value })} placeholder="Private Key (PEM)" rows={2} className="flex-1 rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs font-mono" style={{ borderColor: "var(--app-border)" }} />
                      <label className="cursor-pointer rounded-md bg-[var(--app-panel)] px-2 py-1 text-[10px] font-bold hover:bg-[var(--app-border)]"><Upload size={12} className="inline" /> .pem<input type="file" accept=".pem,.key,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, privateKey: (await f.text()).trim() }); } catch { setSectionStatus("finance_feeds", "error", "Failed to read key."); } e.target.value = ""; }} /></label>
                    </div>
                    {tellerCredentials?.privateKey && <span className="text-[10px] text-fintech-accent">Key loaded</span>}
                  </div>
                  <select value={tellerCredentials?.environment || "sandbox"} onChange={(e) => setTellerCredentials({ ...tellerCredentials || { applicationId: "", certificate: "", privateKey: "", environment: "sandbox" }, environment: e.target.value as TellerEnv })} className="w-full rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <option value="sandbox">Sandbox</option>
                    <option value="development">Development</option>
                    <option value="production">Production</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => { setTellerCredentials({ ...tellerCredentials! }); setSectionStatus("finance_feeds", "success", "Teller credentials saved to session."); }} className="rounded-md bg-fintech-accent/10 px-3 py-1.5 text-[11px] font-bold text-fintech-accent">Save</button>
                    <button onClick={() => setTellerCredentials(null)} className="rounded-md bg-fintech-danger/10 px-3 py-1.5 text-[11px] font-bold text-fintech-danger">Clear</button>
                  </div>
                </div>
              </details>

              {/* Teller Connection */}
              {tellerConnected && tellerConnection && (
                <div className="mb-4 rounded-lg bg-[var(--app-ghost)] p-3 text-xs">
                  <div className="flex justify-between"><span className="text-fintech-muted">Institution</span><span className="font-semibold">{tellerConnection.institutionName}</span></div>
                  <div className="flex justify-between"><span className="text-fintech-muted">Connected</span><span>{new Date(tellerConnection.connectedAt).toLocaleDateString()}</span></div>
                  {tellerConnection.lastSyncAt && <div className="flex justify-between"><span className="text-fintech-muted">Last Sync</span><span>{new Date(tellerConnection.lastSyncAt).toLocaleString()}</span></div>}
                  <div className="flex justify-between"><span className="text-fintech-muted">Accounts</span><span>{tellerConnection.accounts.length} linked</span></div>
                </div>
              )}

              {tellerError && <div className="mb-4 rounded-lg bg-fintech-danger/10 px-3 py-2 text-xs text-fintech-danger">{tellerError}</div>}

              {/* Teller Actions */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <button onClick={() => { if (!tellerCredentials?.applicationId) { setSectionStatus("finance_feeds", "error", "Enter your Teller Application ID first."); return; } openTellerConnect(); }} disabled={!tellerCredentials || tellerSyncing} className="rounded-lg bg-fintech-accent/10 py-2 text-xs font-bold text-fintech-accent disabled:opacity-50">{tellerSyncing ? "Connecting..." : "Connect a Bank"}</button>
                <button onClick={async () => { try { const s = await syncTellerTransactions(); setSectionStatus("finance_feeds", "success", `Synced ${s.imported} transactions.`); } catch (e) { setSectionStatus("finance_feeds", "error", e instanceof Error ? e.message : "Sync failed."); } }} disabled={!tellerConnected || tellerSyncing} className="rounded-lg bg-[var(--app-ghost)] py-2 text-xs font-bold disabled:opacity-50">{tellerSyncing ? "Syncing..." : "Sync Now"}</button>
                <button onClick={async () => { await disconnectTeller(); setSectionStatus("finance_feeds", "info", "Teller disconnected."); }} disabled={!tellerConnected} className="rounded-lg bg-fintech-danger/10 py-2 text-xs font-bold text-fintech-danger disabled:opacity-50">Disconnect</button>
              </div>

              {/* Teller Category Mapping */}
              <details className="mt-4 rounded-lg bg-[var(--app-ghost)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-fintech-muted">Category Mapping ({tellerCategoryMappings.length} override(s))</summary>
                <p className="mt-1 text-[10px] text-fintech-muted">Override the default mapping for specific Teller transaction descriptions.</p>
                <div className="mt-2 space-y-2">
                  {tellerCategoryMappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={m.tellerCategory} onChange={(e) => { const n = [...tellerCategoryMappings]; n[i] = { ...n[i], tellerCategory: e.target.value }; setTellerCategoryMappings(n); }} placeholder="Teller description" className="flex-1 rounded border bg-[var(--app-panel-strong)] px-2 py-1 text-[11px]" style={{ borderColor: "var(--app-border)" }} />
                      <span className="text-fintech-muted text-[10px]">→</span>
                      <input value={m.vibeBudgetCategory} onChange={(e) => { const n = [...tellerCategoryMappings]; n[i] = { ...n[i], vibeBudgetCategory: e.target.value }; setTellerCategoryMappings(n); }} placeholder="VB category" className="flex-1 rounded border bg-[var(--app-panel-strong)] px-2 py-1 text-[11px]" style={{ borderColor: "var(--app-border)" }} />
                      <button onClick={() => setTellerCategoryMappings(tellerCategoryMappings.filter((_, idx) => idx !== i))} className="rounded p-0.5 text-fintech-danger hover:bg-fintech-danger/10"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => setTellerCategoryMappings([...tellerCategoryMappings, { tellerCategory: "", vibeBudgetCategory: "" }])} className="text-[11px] font-bold text-fintech-muted hover:text-fintech-accent">+ Add Override</button>
                </div>
              </details>
            </div>
          </section>
        )}

        {activeTab === "maintenance" && (
          <section className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted"><Shield size={16} className="text-fintech-accent" /> Maintenance</div>
            <p className="text-xs text-fintech-muted">Operational safety tools and scoped destructive actions only.</p>
            {renderStatusStrip("maintenance")}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
                <div className="text-sm font-bold">Recovery Aids</div>
                <div className="mt-2 text-xs text-fintech-muted">Latest local export: {lastLocalExportAt ? new Date(lastLocalExportAt).toLocaleString() : "None"}</div>
                <div className="text-xs text-fintech-muted">Latest cloud mirror: {driveConnection?.lastMirrorAt ? new Date(driveConnection.lastMirrorAt).toLocaleString() : "None"}</div>
                <button onClick={downloadFullBudgetExport} className="mt-3 rounded-xl bg-[var(--app-ghost)] px-3 py-2 text-xs font-bold">Export Full Backup Now</button>
              </div>

              <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
                <div className="text-sm font-bold">Operational Tools</div>
                <p className="mt-2 text-xs text-fintech-muted">Re-run cloud restore to rebuild local state from Drive mirror.</p>
                <button onClick={syncToCloud} disabled={isSyncing} className="mt-3 rounded-xl bg-[var(--app-ghost)] px-3 py-2 text-xs font-bold disabled:opacity-50">{isSyncing ? "Reloading..." : "Reload from Drive"}</button>
              </div>
            </div>

            <div className="rounded-xl border border-fintech-danger/40 bg-fintech-danger/5 p-5">
              <div className="mb-2 text-sm font-bold text-fintech-danger">Danger Zone</div>
              <p className="mb-4 text-xs text-fintech-muted">Each wipe is scoped and requires typed confirmation plus backup acknowledgement.</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  { id: "expenses", label: "Wipe Expenses" },
                  { id: "income", label: "Wipe Income" },
                  { id: "expenseCategories", label: "Reset Expense Categories" },
                  { id: "incomeCategories", label: "Reset Income Categories" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setConfirmWipe(item.id);
                      setConfirmWipeText("");
                    }}
                    disabled={Boolean(wiping)}
                    className="flex items-center justify-between rounded-xl bg-[var(--app-ghost)] px-4 py-3 text-sm font-semibold hover:bg-fintech-danger/10 disabled:opacity-50"
                  >
                    {item.label}
                    <Trash2 size={16} className="text-fintech-danger" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="py-8 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-fintech-muted">VibeBudget v1.0.0</p>
      </footer>
    </div>
  );
};
