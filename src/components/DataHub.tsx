import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Sheet,
  Upload,
  Info,
  ArrowRight,
  DownloadCloud,
} from "lucide-react";
import { useFirebase } from "../contexts/FirebaseContext";
import { ExcelImporter } from "./ExcelImporter";
import { GoogleSheetImporter } from "./GoogleSheetImporter";
import {
  hasSavedTransactionSheetImportConfig,
  refreshSavedTransactionSheetImportsDelta,
  checkForNewSheetData,
  clearAllCursors,
  SheetImportDeltaResult,
} from "../utils/publicSheetImport";
import { getGoogleSheetsAccessErrorMessage } from "../utils/googleSheetsSync";

interface DataHubProps {
  onClose: () => void;
}

type ImportMode = "excel" | "google_sheet" | null;

interface NewDataInfo {
  expenses: number;
  income: number;
  total: number;
  hasChanges: boolean;
  changedExpenses: number;
  changedIncome: number;
}

interface RefreshSummary {
  expenses: SheetImportDeltaResult;
  income: SheetImportDeltaResult;
  timestamp: string;
}

export const DataHub: React.FC<DataHubProps> = ({ onClose }) => {
  const {
    transactions,
    income,
    user,
    googleSheetsAccessToken,
    upsertGoogleSheetRows,
    importData,
  } = useFirebase();

  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newDataInfo, setNewDataInfo] = useState<NewDataInfo | null>(null);
  const [lastRefreshSummary, setLastRefreshSummary] = useState<RefreshSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [isFetchingNewData, setIsFetchingNewData] = useState(false);

  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine if user has existing Google Sheet data
  const hasGoogleSheetData = useCallback(() => {
    const sheetTransactions = transactions.some((t) => t.import_source === "google_sheet");
    const sheetIncome = income.some((i) => i.import_source === "google_sheet");
    return sheetTransactions || sheetIncome;
  }, [transactions, income]);

  const hasSavedConfig = hasSavedTransactionSheetImportConfig();

  // Auto-detect new data on mount and on interval using cursor-based delta detection
  const checkForNewData = useCallback(async () => {
    if (!hasSavedConfig) return;
    if (!user) return;

    setIsChecking(true);
    setError(null);

    try {
      const token = googleSheetsAccessToken;
      if (!token) {
        setIsChecking(false);
        return;
      }

      // Use cursor-based delta detection
      const [expenseResult, incomeResult] = await Promise.all([
        checkForNewSheetData("expenses", token),
        checkForNewSheetData("income", token),
      ]);

      const hasNewData = expenseResult.hasNewData || incomeResult.hasNewData;
      const totalNew = expenseResult.newRowCount + incomeResult.newRowCount;
      const totalChanged = expenseResult.changedRowCount + incomeResult.changedRowCount;

      if (hasNewData) {
        setNewDataInfo({
          expenses: expenseResult.newRowCount,
          income: incomeResult.newRowCount,
          total: totalNew,
          hasChanges: totalChanged > 0,
          changedExpenses: expenseResult.changedRowCount,
          changedIncome: incomeResult.changedRowCount,
        });
      } else {
        setNewDataInfo(null);
      }
    } catch (err) {
      console.debug("DataHub: checkForNewData failed", err);
    } finally {
      setIsChecking(false);
    }
  }, [hasSavedConfig, user, googleSheetsAccessToken]);

  // Auto-sync timer
  useEffect(() => {
    if (!hasSavedConfig) return;

    // Check immediately on mount
    checkForNewData();

    // Then check every 30 seconds
    autoSyncTimerRef.current = setInterval(checkForNewData, 30000);

    return () => {
      if (autoSyncTimerRef.current) {
        clearInterval(autoSyncTimerRef.current);
      }
    };
  }, [hasSavedConfig, checkForNewData]);

  const handleRefresh = async () => {
    if (!user) return;

    setIsRefreshing(true);
    setError(null);
    setSuccessMessage(null);
    setShowSummary(false);

    try {
      const token = googleSheetsAccessToken;
      if (!token) {
        setError("Please connect Google Sheets first.");
        setIsRefreshing(false);
        return;
      }

      // Use delta refresh - only imports new/changed rows
      const result = await refreshSavedTransactionSheetImportsDelta(token, upsertGoogleSheetRows);

      const totalNew = result.expenses.newRows + result.income.newRows;
      const totalUpdated = result.expenses.updatedRows + result.income.updatedRows;
      const totalSkipped = result.expenses.skippedDuplicates + result.income.skippedDuplicates;

      setLastRefreshSummary({
        expenses: result.expenses,
        income: result.income,
        timestamp: new Date().toLocaleTimeString(),
      });

      if (totalNew > 0 || totalUpdated > 0) {
        const parts: string[] = [];
        if (totalNew > 0) parts.push(`${totalNew} new`);
        if (totalUpdated > 0) parts.push(`${totalUpdated} updated`);
        setSuccessMessage(`Fetched ${parts.join(", ")} record(s) from Google Sheet.`);
        setShowSummary(true);
        setNewDataInfo(null); // Clear new data indicator
      } else {
        setSuccessMessage("No new data found. Your data is up to date.");
        if (totalSkipped > 0) {
          setSuccessMessage(`No new data found. ${totalSkipped} duplicate(s) skipped.`);
        }
      }
    } catch (err) {
      setError(getGoogleSheetsAccessErrorMessage(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFetchNewData = async () => {
    if (!user) return;

    setIsFetchingNewData(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = googleSheetsAccessToken;
      if (!token) {
        setError("Please connect Google Sheets first.");
        setIsFetchingNewData(false);
        return;
      }

      const result = await refreshSavedTransactionSheetImportsDelta(token, upsertGoogleSheetRows);

      const totalNew = result.expenses.newRows + result.income.newRows;
      const totalUpdated = result.expenses.updatedRows + result.income.updatedRows;
      const totalSkipped = result.expenses.skippedDuplicates + result.income.skippedDuplicates;

      setLastRefreshSummary({
        expenses: result.expenses,
        income: result.income,
        timestamp: new Date().toLocaleTimeString(),
      });

      const parts: string[] = [];
      if (totalNew > 0) parts.push(`${totalNew} new`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} updated`);
      if (totalSkipped > 0) parts.push(`${totalSkipped} duplicates skipped`);

      setSuccessMessage(`Fetched: ${parts.join(", ")}.`);
      setShowSummary(true);
      setNewDataInfo(null);
    } catch (err) {
      setError(getGoogleSheetsAccessErrorMessage(err));
    } finally {
      setIsFetchingNewData(false);
    }
  };

  const handleExcelImported = () => {
    setSuccessMessage("Excel data imported successfully!");
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleGoogleSheetImport = async (
    type: "expenseCategories" | "incomeCategories" | "expenses" | "income",
    data: any[],
    override: boolean
  ) => {
    await importData(type, data, !override);
  };

  const handleGoogleSheetImported = () => {
    setSuccessMessage("Google Sheet data imported successfully!");
    setNewDataInfo(null);
    // Clear cursors so next refresh does a full re-import
    clearAllCursors();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const isRepeatUser = hasGoogleSheetData() || hasSavedConfig;

  return (
    <>
      {/* Main Data Hub overlay */}
      <div className="fixed inset-0 z-[130] backdrop-blur-sm" style={{ backgroundColor: "var(--app-overlay)" }}>
        <button
          type="button"
          aria-label="Close data hub"
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
                  <Database size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Data Hub</h3>
                  <p className="text-sm text-fintech-muted">
                    Import, refresh, and manage your financial data
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-[var(--app-ghost)]">
                <span className="text-2xl leading-none text-fintech-muted">&times;</span>
              </button>
            </div>

            {/* Error / Success messages */}
            {error && (
              <div className="mx-6 mb-2 mt-3 flex items-center gap-3 rounded-xl bg-fintech-danger/10 p-4 text-fintech-danger sm:mx-8">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">{error}</span>
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
              {/* Import Options */}
              {!importMode && (
                <div className="space-y-6">
                  {/* Google Sheet - Primary for repeat users, equally prominent for new users */}
                  <div
                    className={`rounded-2xl border-2 p-6 transition-all ${
                      isRepeatUser
                        ? "border-fintech-accent bg-fintech-accent/5"
                        : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
                    }`}
                    style={{
                      borderColor: isRepeatUser ? undefined : "var(--app-border)",
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`rounded-2xl p-3 ${isRepeatUser ? "bg-fintech-accent/15 text-fintech-accent" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>
                          <Sheet size={28} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold">Google Sheet</h4>
                          <p className="mt-1 text-sm text-fintech-muted">
                            {isRepeatUser
                              ? "Your data source is connected. Refresh to fetch the latest data."
                              : "Load data from a Google Sheet. Connect and map your columns."}
                          </p>

                          {/* New data indicator with detailed info */}
                          {newDataInfo && (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2 rounded-xl bg-fintech-accent/10 px-4 py-2">
                                <RefreshCw size={16} className="animate-spin text-fintech-accent" />
                                <span className="text-sm font-bold text-fintech-accent">
                                  {newDataInfo.total} new record(s) available
                                  {newDataInfo.expenses > 0 && ` (${newDataInfo.expenses} expenses)`}
                                  {newDataInfo.income > 0 && ` (${newDataInfo.income} income)`}
                                </span>
                              </div>
                              {newDataInfo.hasChanges && (
                                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2">
                                  <Info size={16} className="text-amber-500" />
                                  <span className="text-sm font-medium text-amber-500">
                                    {newDataInfo.changedExpenses + newDataInfo.changedIncome} existing row(s) have changed
                                    {newDataInfo.changedExpenses > 0 && ` (${newDataInfo.changedExpenses} expenses)`}
                                    {newDataInfo.changedIncome > 0 && ` (${newDataInfo.changedIncome} income)`}
                                  </span>
                                </div>
                              )}
                              <button
                                onClick={handleFetchNewData}
                                disabled={isFetchingNewData}
                                className="flex items-center gap-2 rounded-lg bg-fintech-accent px-4 py-2 text-sm font-bold text-[#002919] transition-all hover:bg-fintech-accent/90 disabled:opacity-50"
                              >
                                {isFetchingNewData ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#002919] border-t-transparent" />
                                ) : (
                                  <DownloadCloud size={16} />
                                )}
                                {isFetchingNewData ? "Fetching..." : "Fetch New Data"}
                              </button>
                            </div>
                          )}

                          {/* Last refresh detailed summary */}
                          {lastRefreshSummary && showSummary && (
                            <div className="mt-3 space-y-1 rounded-xl bg-[var(--app-ghost)] p-3 text-xs">
                              <div className="flex items-center gap-2 text-fintech-muted">
                                <CheckCircle2 size={12} className="text-fintech-accent" />
                                <span>Last refresh: {lastRefreshSummary.timestamp}</span>
                              </div>
                              {lastRefreshSummary.expenses.totalParsed > 0 && (
                                <div className="pl-5 text-fintech-muted">
                                  Expenses: {lastRefreshSummary.expenses.newRows} new, {lastRefreshSummary.expenses.updatedRows} updated, {lastRefreshSummary.expenses.skippedDuplicates} duplicates skipped
                                </div>
                              )}
                              {lastRefreshSummary.income.totalParsed > 0 && (
                                <div className="pl-5 text-fintech-muted">
                                  Income: {lastRefreshSummary.income.newRows} new, {lastRefreshSummary.income.updatedRows} updated, {lastRefreshSummary.income.skippedDuplicates} duplicates skipped
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isRepeatUser && (
                          <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="flex items-center gap-2 rounded-xl bg-fintech-accent px-5 py-2.5 text-sm font-bold text-[#002919] transition-all hover:bg-fintech-accent/90 disabled:opacity-50"
                          >
                            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                            {isRefreshing ? "Refreshing..." : "Refresh"}
                          </button>
                        )}
                        <button
                          onClick={() => setImportMode("google_sheet")}
                          className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-bold transition-all hover:bg-[var(--app-ghost)]"
                          style={{ borderColor: "var(--app-border)" }}
                        >
                          {isRepeatUser ? "Reconfigure" : "Connect & Import"}
                        </button>
                      </div>
                    </div>

                    {/* Auto-sync status */}
                    {isRepeatUser && (
                      <div className="mt-4 flex items-center gap-2 text-xs text-fintech-muted">
                        <div className={`h-2 w-2 rounded-full ${isChecking ? "bg-fintech-accent animate-pulse" : "bg-fintech-muted"}`} />
                        {isChecking ? "Checking for new data..." : "Auto-sync active (every 30s)"}
                      </div>
                    )}
                  </div>

                  {/* Excel / CSV - Secondary for repeat users, equally prominent for new users */}
                  <div
                    className={`rounded-2xl border-2 p-6 transition-all ${
                      !isRepeatUser
                        ? "border-fintech-accent bg-fintech-accent/5"
                        : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
                    }`}
                    style={{
                      borderColor: !isRepeatUser ? undefined : "var(--app-border)",
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`rounded-2xl p-3 ${!isRepeatUser ? "bg-fintech-accent/15 text-fintech-accent" : "bg-[var(--app-ghost)] text-fintech-muted"}`}>
                          <FileSpreadsheet size={28} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold">Excel / CSV</h4>
                          <p className="mt-1 text-sm text-fintech-muted">
                            Upload an Excel file (.xlsx) or CSV. Map columns and import categories, expenses, or income.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setImportMode("excel")}
                        className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-bold transition-all hover:bg-[var(--app-ghost)]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <Upload size={16} />
                        Import
                      </button>
                    </div>
                  </div>

                  {/* Data Stats */}
                  <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                    <h4 className="mb-3 text-sm font-bold">Current Data Summary</h4>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                        <div className="text-xs text-fintech-muted">Expenses</div>
                        <div className="mt-1 text-lg font-bold">{transactions.length}</div>
                      </div>
                      <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                        <div className="text-xs text-fintech-muted">Income</div>
                        <div className="mt-1 text-lg font-bold">{income.length}</div>
                      </div>
                      <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                        <div className="text-xs text-fintech-muted">From Google Sheet</div>
                        <div className="mt-1 text-lg font-bold">
                          {transactions.filter((t) => t.import_source === "google_sheet").length +
                            income.filter((i) => i.import_source === "google_sheet").length}
                        </div>
                      </div>
                      <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                        <div className="text-xs text-fintech-muted">From Excel/CSV</div>
                        <div className="mt-1 text-lg font-bold">
                          {transactions.filter((t) => t.import_source === "csv").length +
                            income.filter((i) => i.import_source === "csv").length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Excel Importer */}
              {importMode === "excel" && (
                <ExcelImporter
                  onClose={() => setImportMode(null)}
                  onImported={handleExcelImported}
                />
              )}

              {/* Google Sheet Importer */}
              {importMode === "google_sheet" && (
                <GoogleSheetImporter
                  initialType="expenses"
                  onClose={() => setImportMode(null)}
                  onImport={handleGoogleSheetImport}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
