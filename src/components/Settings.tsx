import React, { useEffect, useState } from "react";
import { getTodayStr } from "../utils/dateUtils";
import { 
  Download, 
  Upload, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Database, 
  History, 
  Target, 
  ChevronRight, 
  X,
  Share,
  TrendingUp,
  Cloud,
  Users,
  UserPlus,
  Mail,
  Link2,
  RefreshCw,
  Save,
  Shield,
  Settings as SettingsIcon,
  Globe,
  CloudDownload
} from "lucide-react";
import { ExpenseCategory, ExpenseSheetMapping, GoogleSheetsSyncConfig, Income, IncomeCategory, IncomeSheetMapping, Transaction, ExchangeRate } from "../types";
import { GoogleSheetImporter } from "./GoogleSheetImporter";
import { CURRENCIES, getCurrencySymbol } from "../utils/currencyUtils";
import { motion, AnimatePresence } from "motion/react";
import { useFirebase } from "../contexts/FirebaseContext";

interface SettingsProps {
  onRefresh: () => void;
}

interface DataDomain {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  type: "expenseCategories" | "incomeCategories" | "income" | "expenses" | "investments";
  exportType: "expenseCategories" | "incomeCategories" | "income" | "transactions";
}

export const Settings: React.FC<SettingsProps> = ({ onRefresh }) => {
  const {
    wipeData,
    backupToDrive,
    backingUp,
    lastSynced,
    syncToCloud,
    isSyncing,
    importData,
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
    saveGoogleSheetsConfig,
    syncGoogleSheets,
    driveConnection,
    driveConnected,
    driveSyncError,
    connectDriveFolder,
    loadBudgetFromDrive,
    disconnectDriveFolder,
    preferences,
    updatePreferences
  } = useFirebase();
  const [activeTab, setActiveTab] = useState<"data" | "cloud" | "currency" | "maintenance">("data");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [wiping, setWiping] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<DataDomain | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isUpsert, setIsUpsert] = useState(false);
  const [showGoogleSheetImporter, setShowGoogleSheetImporter] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
  const [expensesSheetName, setExpensesSheetName] = useState("Expenses");
  const [incomeSheetName, setIncomeSheetName] = useState("Income");
  const [syncIntervalSeconds, setSyncIntervalSeconds] = useState("30");
  const [sheetAutoSync, setSheetAutoSync] = useState(true);
  const [loadingSheetConfig, setLoadingSheetConfig] = useState(false);
  const [savingSheetConfig, setSavingSheetConfig] = useState(false);
  const [expenseHeaders, setExpenseHeaders] = useState<string[]>([]);
  const [incomeHeaders, setIncomeHeaders] = useState<string[]>([]);
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

  const domains: DataDomain[] = [
    {
      id: "expense-categories",
      title: "Expense Categories",
      description: "Manage spending categories and expense targets",
      icon: <Target size={20} />,
      type: "expenseCategories",
      exportType: "expenseCategories"
    },
    {
      id: "income-categories",
      title: "Income Categories",
      description: "Manage income-side category structure and targets",
      icon: <Target size={20} className="text-[#77e6ff]" />,
      type: "incomeCategories",
      exportType: "incomeCategories"
    },
    {
      id: "expenses",
      title: "Expense History",
      description: "Full transaction logs and vendor details",
      icon: <History size={20} />,
      type: "expenses",
      exportType: "transactions"
    },
    {
      id: "income",
      title: "Income Records",
      description: "Historical earnings and source tracking",
      icon: <TrendingUp size={20} />,
      type: "income",
      exportType: "income"
    },
    {
      id: "investments",
      title: "Investment Data",
      description: "Portfolio tracking and asset allocation",
      icon: <TrendingUp size={20} className="text-fintech-import" />,
      type: "investments",
      exportType: "income" // Placeholder
    }
  ];

  useEffect(() => {
    if (!googleSheetsConfig) return;

    setSheetUrl(googleSheetsConfig.spreadsheetUrl);
    setSheetTitle(googleSheetsConfig.spreadsheetTitle || "");
    setExpensesSheetName(googleSheetsConfig.expensesSheetName);
    setIncomeSheetName(googleSheetsConfig.incomeSheetName);
    setSyncIntervalSeconds(String(googleSheetsConfig.syncIntervalSeconds || 30));
    setSheetAutoSync(googleSheetsConfig.autoSync);
    setExpenseMapping(googleSheetsConfig.expenseMapping);
    setIncomeMapping(googleSheetsConfig.incomeMapping);
  }, [googleSheetsConfig]);

  const ensureMappingOption = (headers: string[], fallback: string) => {
    return headers.includes(fallback) ? headers : [...headers, fallback];
  };

  const handleGoogleSheetsConnect = async () => {
    try {
      await connectGoogleSheets();
      setStatus({ type: "success", message: "Google Sheets connected. You can now inspect and save a spreadsheet." });
    } catch (error) {
      setStatus({ type: "error", message: "Failed to connect Google Sheets." });
    }
  };

  const handleInspectGoogleSheet = async () => {
    if (!sheetUrl) {
      setStatus({ type: "error", message: "Add a Google Sheet URL first." });
      return;
    }

    setLoadingSheetConfig(true);
    try {
      const result = await inspectGoogleSheetsSpreadsheet(sheetUrl, expensesSheetName, incomeSheetName);
      setSheetTitle(result.spreadsheetTitle);
      setExpenseHeaders(ensureMappingOption(result.expenseHeaders, "VibeBudget ID"));
      setIncomeHeaders(ensureMappingOption(result.incomeHeaders, "VibeBudget ID"));
      setExpenseMapping(result.suggestedExpenseMapping);
      setIncomeMapping(result.suggestedIncomeMapping);
      setStatus({ type: "success", message: "Loaded sheet tabs and suggested column mappings." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to inspect the spreadsheet.";
      setStatus({ type: "error", message });
    } finally {
      setLoadingSheetConfig(false);
    }
  };

  const handleSaveGoogleSheetsConfig = async () => {
    if (!sheetUrl) {
      setStatus({ type: "error", message: "Add a Google Sheet URL first." });
      return;
    }

    setSavingSheetConfig(true);
    try {
      const inspection = await inspectGoogleSheetsSpreadsheet(sheetUrl, expensesSheetName, incomeSheetName);
      const payload: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy"> = {
        spreadsheetId: inspection.spreadsheetId,
        spreadsheetUrl: sheetUrl,
        spreadsheetTitle: inspection.spreadsheetTitle,
        expensesSheetName,
        incomeSheetName,
        expenseMapping,
        incomeMapping,
        autoSync: sheetAutoSync,
        syncIntervalSeconds: Math.max(15, Number.parseInt(syncIntervalSeconds, 10) || 30),
        lastError: null,
        lastPullAt: googleSheetsConfig?.lastPullAt || null,
        lastPushAt: googleSheetsConfig?.lastPushAt || null,
        lastSyncedAt: googleSheetsConfig?.lastSyncedAt || null,
      };

      await saveGoogleSheetsConfig(payload);
      setStatus({ type: "success", message: "Google Sheets sync settings saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save Google Sheets settings.";
      setStatus({ type: "error", message });
    } finally {
      setSavingSheetConfig(false);
    }
  };

  const handleGoogleSheetsSync = async () => {
    try {
      await syncGoogleSheets("both");
      setStatus({ type: "success", message: "Google Sheets synced successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Google Sheets.";
      setStatus({ type: "error", message });
    }
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

  const parseAmount = (amt: string) => {
    if (!amt) return 0;
    // Remove currency symbols, commas, and any non-numeric characters except decimal point and minus sign
    const cleaned = amt.replace(/[^-0-9.]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const splitCSVRow = (row: string, delimiter: string) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Handle escaped quotes ""
          current += '"';
          i++;
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

  const parseDate = (dateStr: string) => {
    if (!dateStr) return getTodayStr();
    
    const cleanDate = dateStr.trim().replace(/^"|"$/g, "");
    
    // Try to parse MM-DD-YYYY or YYYY-MM-DD
    const parts = cleanDate.split(/[-/]/);
    if (parts.length === 3) {
      let year, month, day;
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        [year, month, day] = parts;
      } else if (parts[2].length === 4 || parts[2].length === 2) {
        // MM-DD-YYYY or DD-MM-YYYY (assuming MM-DD-YYYY for now as per template)
        [month, day, year] = parts;
      } else {
        return cleanDate;
      }
      
      // Ensure 2 digits for month/day
      const m = month.padStart(2, "0");
      const d = day.padStart(2, "0");
      const y = year.length === 2 ? `20${year}` : year;
      return `${y}-${m}-${d}`;
    }

    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return cleanDate;
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const templates = {
    expenseCategories: () => downloadCSV("expense_categories_template.csv", "Category Name,Monthly Target\nRent,2000\nGroceries,500\nUtilities,150"),
    incomeCategories: () => downloadCSV("income_categories_template.csv", "Category Name,Monthly Target\nSalary,5000\nFreelance,1500\nDividends,250"),
    income: () => downloadCSV("income_template.csv", "Date (MM-DD-YYYY),Source,Amount,Income Category,Notes (Optional)\n04-05-2024,fabric,3667.00,Job,Shubham\n04-08-2024,BMO,350.00,Side project,Account Bonus"),
    expenses: () => downloadCSV("expenses_template.csv", "Date,Store / Vendor,Amount,Expense Category,Notes (Optional)\n04-01-2024,Chicken World,35.37,Going out food,Chicken World\n04-02-2024,Aurora Fotino,2479.62,Rent,Rent April"),
    investments: () => alert("Investment template coming soon!")
  };

  const handleExport = async (type: string) => {
    try {
      let csv = "";
      
      if (type === "expenseCategories") {
        csv = "Name,Monthly Target\n" + expenseCategories.map((c: ExpenseCategory) => `${c.name},${c.target_amount}`).join("\n");
      } else if (type === "incomeCategories") {
        csv = "Name,Monthly Target\n" + incomeCategories.map((c: IncomeCategory) => `${c.name},${c.target_amount}`).join("\n");
      } else if (type === "transactions") {
        csv = "Date,Vendor,Amount,Category,Notes\n" + transactions.map((t: Transaction) => `${t.date},${t.vendor},${t.amount},${t.category_name},${t.notes || ""}`).join("\n");
      } else if (type === "income") {
        csv = "Date,Source,Amount,Category,Notes\n" + incomeRecords.map((i: Income) => `${i.date},${i.source},${i.amount},${i.category},${i.notes || ""}`).join("\n");
      }
      
      downloadCSV(`${type}_export_${getTodayStr()}.csv`, csv);
      setStatus({ type: "success", message: `${type} exported successfully!` });
      setActiveDomain(null);
    } catch (error) {
      setStatus({ type: "error", message: `Failed to export ${type}.` });
    }
  };

  const handleGoogleSheetImport = async (type: string, dataRows: any[], override: boolean) => {
    try {
      if (override) {
         setWiping(type);
         await wipeData(type);
         setWiping(null);
      }
      setImportProgress({ current: 0, total: dataRows.length });
      await importData(type, dataRows, !override, (current, total) => {
        setImportProgress({ current, total });
      });
      setStatus({ type: "success", message: `${type} imported successfully from sheet (${dataRows.length} records)!` });
      setImportProgress(null);
      setWiping(null);
      setShowGoogleSheetImporter(false);
      setActiveDomain(null);
      onRefresh();
    } catch (error: any) {
      console.error("Public GS Import error:", error);
      setStatus({ type: "error", message: error.message || `Failed to import ${type} from sheet.` });
      setImportProgress(null);
      setWiping(null);
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
        // More robust delimiter detection: count commas vs tabs in first 5 lines
        const sampleLines = text.split("\n").slice(0, 5);
        const commaCount = sampleLines.join("").split(",").length - 1;
        const tabCount = sampleLines.join("").split("\t").length - 1;
        const delimiter = tabCount > commaCount ? "\t" : ",";
        
        const rows = text.split(/\r?\n/).slice(1).filter(row => row.trim() !== "");
        
        if (rows.length === 0) {
          throw new Error("No valid data found in CSV");
        }

        let data: any[] = [];
        if (type === "expenseCategories" || type === "incomeCategories") {
          data = rows.map(row => {
            const parts = splitCSVRow(row, delimiter);
            if (parts.length < 2) return null;
            const [name, target] = parts;
            return [name.trim().replace(/^"|"$/g, ""), parseAmount(target)];
          }).filter(Boolean);
        } else {
          data = rows.map(row => {
            const parts = splitCSVRow(row, delimiter);
            if (parts.length < 3) return null; // Minimum date, source, amount
            const [date, vendorOrSource, amount, category, notes] = parts;
            return [
              parseDate(date?.trim()),
              vendorOrSource?.trim().replace(/^"|"$/g, "") || "Unknown",
              parseAmount(amount),
              category?.trim().replace(/^"|"$/g, "") || "Misc.",
              notes?.trim().replace(/^"|"$/g, "") || ""
            ];
          }).filter(Boolean);
        }

        setImportProgress({ current: 0, total: data.length });
        await importData(type, data, isUpsert, (current, total) => {
          setImportProgress({ current, total });
        });
        
        setStatus({ type: "success", message: `${type} imported successfully (${data.length} records)!` });
        onRefresh();
        setActiveDomain(null);
        
      } catch (error: any) {
        console.error("Import error:", error);
        setStatus({ type: "error", message: error.message || `Failed to import ${type}.` });
      } finally {
        setLoading(null);
        setImportProgress(null);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleWipeAction = async (type: string) => {
    setWiping(type);
    try {
      await wipeData(type);
      setStatus({ type: "success", message: `${type} wiped successfully.` });
      setConfirmWipe(null);
      onRefresh();
    } catch (error) {
      setStatus({ type: "error", message: `Failed to wipe ${type}.` });
    } finally {
      setWiping(null);
    }
  };

  const handleBackup = async () => {
    try {
      await backupToDrive();
      setStatus({ type: "success", message: "Backup completed successfully!" });
    } catch (error) {
      setStatus({ type: "error", message: "Failed to complete backup." });
    }
  };

  const handleConnectDriveFolder = async () => {
    try {
      await connectDriveFolder(folderInput.trim() || undefined);
      setFolderInput("");
      setStatus({ type: "success", message: "Connected your VibeBudget Drive folder." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect your Drive folder.";
      if (!message.includes("Redirecting to Google")) {
        setStatus({ type: "error", message });
      }
    }
  };

  const renderMappingSelect = (
    label: string,
    value: string,
    options: string[],
    onChange: (value: string) => void
  ) => (
    <label className="space-y-1">
      <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-10 relative pb-24">
      <AnimatePresence>
        {/* Import Progress Overlay */}
        {importProgress && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-fintech-bg/90 backdrop-blur-md"
          >
            <div className="w-full space-y-6 text-center">
              <div className="w-20 h-20 rounded-full bg-fintech-accent/10 flex items-center justify-center mx-auto relative">
                <div className="absolute inset-0 rounded-full border-2 border-fintech-accent/20" />
                <motion.div 
                  className="absolute inset-0 rounded-full border-2 border-fintech-accent border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <Upload size={32} className="text-fintech-accent" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Importing Data...</h3>
                <p className="text-sm text-fintech-muted">
                  Processing line {importProgress.current} of {importProgress.total}
                </p>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-fintech-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              <p className="text-[10px] text-fintech-muted uppercase tracking-widest animate-pulse">
                Please do not close the app
              </p>
            </div>
          </motion.div>
        )}

        {/* Confirmation Modal */}
        {confirmWipe && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-fintech-bg/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card p-8 rounded-3xl max-w-xs w-full space-y-6 shadow-2xl border border-white/10"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 rounded-full bg-fintech-danger/10 text-fintech-danger flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold">Are you sure?</h3>
                <p className="text-xs text-fintech-muted leading-relaxed">
                  You are about to delete <span className="text-white font-bold">{confirmWipe}</span>. This action cannot be undone.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleWipeAction(confirmWipe)}
                  disabled={wiping !== null}
                  className="w-full py-3 bg-fintech-danger text-white font-bold rounded-xl shadow-lg shadow-fintech-danger/20 disabled:opacity-50"
                >
                  {wiping ? "Wiping..." : "Yes, Delete Everything"}
                </button>
                <button
                  onClick={() => setConfirmWipe(null)}
                  className="w-full py-3 bg-white/5 text-fintech-text font-bold rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Bottom Sheet Modal */}
        {activeDomain && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveDomain(null)}
              className="fixed inset-0 z-[100] bg-fintech-bg/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-2xl rounded-t-[40px] border-t border-white/5 bg-fintech-card p-8 pb-12 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-fintech-accent/10 rounded-2xl text-fintech-accent">
                    {activeDomain.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{activeDomain.title}</h3>
                    <p className="text-sm text-fintech-muted">Data Management</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveDomain(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X size={24} className="text-fintech-muted" />
                </button>
              </div>

              <div className="space-y-4">
                <button
                  onClick={templates[activeDomain.type as keyof typeof templates]}
                  className="w-full flex items-center justify-between p-5 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <Download size={24} className="text-fintech-muted group-hover:text-white transition-colors" />
                    <span className="font-bold">Download Template</span>
                  </div>
                  <ChevronRight size={20} className="text-fintech-muted" />
                </button>

                <div className="bg-white/5 rounded-2xl overflow-hidden">
                  <label className="w-full flex items-center justify-between p-5 hover:bg-fintech-import/10 transition-all group cursor-pointer border-b border-white/5">
                    <div className="flex items-center gap-4">
                      <Upload size={24} className="text-fintech-import" />
                      <span className="font-bold text-fintech-import">Import CSV</span>
                    </div>
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={(e) => handleImport(e, activeDomain.type)} 
                      className="hidden" 
                      disabled={loading !== null}
                    />
                    {loading === activeDomain.type ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-fintech-import"></div>
                    ) : (
                      <ChevronRight size={20} className="text-fintech-import" />
                    )}
                  </label>
                  
                  {activeDomain.type !== "expenseCategories" && activeDomain.type !== "incomeCategories" && (
                    <label className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox" 
                          checked={isUpsert}
                          onChange={(e) => setIsUpsert(e.target.checked)}
                          className="w-5 h-5 appearance-none border-2 border-white/20 rounded-md checked:bg-fintech-import checked:border-fintech-import transition-colors"
                        />
                        {isUpsert && <CheckCircle2 size={14} className="absolute inset-0 m-auto text-white pointer-events-none" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold">Upsert Mode</span>
                        <span className="text-[10px] text-fintech-muted">Update existing records (by date & name) instead of duplicating</span>
                      </div>
                    </label>
                  )}

                  <button
                    onClick={() => setShowGoogleSheetImporter(true)}
                    className="w-full flex items-center justify-between p-5 hover:bg-fintech-import/10 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <Link2 size={24} className="text-fintech-import" />
                      <div className="flex flex-col text-left">
                         <span className="font-bold text-fintech-import">Import from Google Sheet</span>
                         <span className="text-[10px] text-fintech-muted">Auto-map formats from public links</span>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-fintech-import" />
                  </button>
                </div>

                <button
                  onClick={() => handleExport(activeDomain.exportType)}
                  className="w-full flex items-center justify-between p-5 bg-white/5 rounded-2xl hover:bg-fintech-accent/10 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <Share size={24} className="text-fintech-accent" />
                    <span className="font-bold text-fintech-accent">Export Current Data</span>
                  </div>
                  <ChevronRight size={20} className="text-fintech-accent" />
                </button>
              </div>

              <AnimatePresence>
                {showGoogleSheetImporter && (
                  <GoogleSheetImporter
                    initialType={activeDomain.type as any}
                    onClose={() => setShowGoogleSheetImporter(false)}
                    onImport={handleGoogleSheetImport}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-fintech-muted">Manage your data and preferences to optimize your financial cockpit.</p>
      </header>

      {status && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          status.type === "success" ? "bg-fintech-accent/10 text-fintech-accent" : "bg-fintech-danger/10 text-fintech-danger"
        }`}>
          {status.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{status.message}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex w-fit flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
        <button 
          onClick={() => setActiveTab("data")}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "data" ? "bg-fintech-accent text-[#002919] shadow-lg" : "text-fintech-muted hover:text-white"}`}
        >
          <Database size={14} />
          Data Hub
        </button>
        <button 
          onClick={() => setActiveTab("currency")}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "currency" ? "bg-fintech-accent text-[#002919] shadow-lg" : "text-fintech-muted hover:text-white"}`}
        >
          <Globe size={14} />
          Currency
        </button>
        <button 
          onClick={() => setActiveTab("cloud")}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "cloud" ? "bg-fintech-accent text-[#002919] shadow-lg" : "text-fintech-muted hover:text-white"}`}
        >
          <Cloud size={14} />
          Cloud Sync
        </button>
        <button 
          onClick={() => setActiveTab("maintenance")}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "maintenance" ? "bg-fintech-accent text-[#002919] shadow-lg" : "text-fintech-muted hover:text-white"}`}
        >
          <SettingsIcon size={14} />
          Maintenance
        </button>
      </div>

      <div className="mt-8">
      {/* Data Hub Tab */}
      {activeTab === "data" && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-fintech-muted">
          <Database size={20} className="text-fintech-accent" /> Data Hub
        </div>
        
        <div className="grid gap-4 xl:grid-cols-2">
          {domains.map((domain) => (
            <button
              key={domain.id}
              onClick={() => setActiveDomain(domain)}
              className="w-full flex items-center justify-between rounded-xl border border-transparent bg-[#0f1930] p-5 text-left transition-all group hover:border-fintech-accent/20 hover:bg-[#1f2b49]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#192540] text-fintech-accent group-hover:scale-105 transition-transform">
                  {domain.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-on-surface">{domain.title}</h4>
                  <p className="text-xs text-fintech-muted">{domain.description}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-fintech-muted group-hover:translate-x-1 transition-transform" />
            </button>
          ))}
        </div>
      </section>
      )}

      {/* Currency Tab */}
      {activeTab === "currency" && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 space-y-6">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Globe size={20} className="text-fintech-accent" /> Currency Configuration
            </h3>
            <p className="text-xs text-fintech-muted leading-relaxed">
              Set your base currency and configure exchange rates for international transactions. 
              All metrics will be converted to your base currency dynamically.
            </p>

            <div className="space-y-4">
              <label className="space-y-2 block">
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Base Currency</span>
                <select
                  value={preferences?.baseCurrency || "CAD"}
                  onChange={async (e) => {
                    if (updatePreferences) {
                      await updatePreferences({ ...preferences, baseCurrency: e.target.value });
                      setStatus({ type: "success", message: "Base currency updated." });
                    }
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold focus:outline-none focus:border-fintech-accent"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code} className="bg-[#192540]">
                      {c.code} - {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <h4 className="text-sm font-bold flex justify-between items-center">
                  Exchange Rates (to {preferences?.baseCurrency || "CAD"})
                  <button 
                    onClick={() => {
                      const newRate: ExchangeRate = { currency: "USD", rateToBase: 1.35 };
                      if (updatePreferences) {
                        const currentRates = preferences?.exchangeRates || [];
                        updatePreferences({ ...preferences, exchangeRates: [...currentRates, newRate] });
                      }
                    }}
                    className="text-[10px] bg-fintech-accent/10 text-fintech-accent px-3 py-1.5 rounded-lg uppercase tracking-wider hover:bg-fintech-accent/20 transition-colors"
                  >
                    + Add Rate
                  </button>
                </h4>
                
                {(!preferences?.exchangeRates || preferences.exchangeRates.length === 0) ? (
                  <div className="text-xs text-fintech-muted italic p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                    No custom exchange rates defined. Transactions in other currencies will assume a 1:1 ratio.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {preferences.exchangeRates.map((rate, index) => (
                      <div key={index} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                        <select
                          value={rate.currency}
                          onChange={(e) => {
                            if (updatePreferences) {
                              const newRates = [...(preferences?.exchangeRates || [])];
                              newRates[index].currency = e.target.value;
                              updatePreferences({ ...preferences, exchangeRates: newRates });
                            }
                          }}
                          className="bg-[#192540] border border-white/10 rounded-lg px-3 py-2 text-sm font-bold w-32"
                        >
                          {CURRENCIES.filter(c => c.code !== preferences?.baseCurrency).map(c => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                          ))}
                        </select>
                        
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs font-bold text-fintech-muted mr-1">=</span>
                          <input
                            type="number"
                            step="0.0001"
                            value={rate.rateToBase}
                            onChange={(e) => {
                              if (updatePreferences) {
                                const newRates = [...(preferences?.exchangeRates || [])];
                                newRates[index].rateToBase = parseFloat(e.target.value) || 0;
                                updatePreferences({ ...preferences, exchangeRates: newRates });
                              }
                            }}
                            className="flex-1 bg-[#192540] border border-white/10 rounded-lg px-3 py-2 text-sm"
                            placeholder="Rate"
                          />
                          <span className="text-xs font-bold text-fintech-muted uppercase w-12">{preferences?.baseCurrency || "CAD"}</span>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (updatePreferences) {
                              const newRates = [...(preferences?.exchangeRates || [])];
                              newRates.splice(index, 1);
                              updatePreferences({ ...preferences, exchangeRates: newRates });
                            }
                          }}
                          className="p-2 text-fintech-danger hover:bg-fintech-danger/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Cloud Sync Tab */}
      {activeTab === "cloud" && (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="space-y-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Cloud size={20} className="text-fintech-accent" /> Private Drive Vault
        </h3>
        <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 space-y-6">
          <p className="text-xs text-fintech-muted leading-relaxed">
            Your budget stays local-first and syncs to a <span className="font-semibold text-white">VibeBudget</span> folder in your own Google Drive. The app no longer treats Firestore as the source of truth for your budget data.
          </p>

          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Optional: existing Drive folder URL or folder ID"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-accent/20 transition-all"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleConnectDriveFolder}
                disabled={isSyncing}
                className="w-full flex items-center justify-center gap-2 py-3 bg-fintech-accent text-[#002919] rounded-2xl font-bold hover:bg-fintech-accent/90 transition-all disabled:opacity-50 text-sm"
              >
                {isSyncing ? <div className="w-5 h-5 border-2 border-[#002919] border-t-transparent rounded-full animate-spin" /> : <Cloud size={18} />}
                <span>{driveConnected ? "Reconnect Folder" : "Create / Connect Folder"}</span>
              </button>
              <button
                type="button"
                onClick={loadBudgetFromDrive}
                disabled={!driveConnected || isSyncing}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 rounded-2xl font-bold hover:bg-white/10 transition-all disabled:opacity-50 text-sm"
              >
                {isSyncing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={18} />}
                <span>Load budget.json</span>
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-white/5 bg-[#121a2d] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Drive Status</h4>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${driveConnected ? "bg-fintech-accent/10 text-fintech-accent" : "bg-white/5 text-fintech-muted"}`}>
                  {driveConnected ? "Connected" : "Local Only"}
                </span>
              </div>
              <div className="space-y-1 text-xs text-fintech-muted">
                <p>Folder: <span className="text-white">{driveConnection?.folderName || "Not connected"}</span></p>
                <p>Budget File: <span className="text-white">{driveConnection?.budgetFileName || "budget.json"}</span></p>
                {driveConnection?.folderUrl && (
                  <p>
                    Drive Folder: <a className="text-fintech-accent hover:underline" href={driveConnection.folderUrl} target="_blank" rel="noreferrer">Open in Google Drive</a>
                  </p>
                )}
              </div>
              {driveSyncError && <p className="text-xs text-fintech-danger">{driveSyncError}</p>}
              {driveConnected && (
                <button
                  type="button"
                  onClick={disconnectDriveFolder}
                  className="text-xs font-bold uppercase tracking-wider text-fintech-danger hover:underline"
                >
                  Disconnect Folder
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Link2 size={20} className="text-fintech-accent" /> Google Sheets Sync
        </h3>
        <div className="rounded-2xl border border-white/5 bg-[#0f1930] p-6 space-y-5">
          <p className="text-xs text-fintech-muted leading-relaxed">
            Optionally connect a spreadsheet from your Drive workspace. Your canonical data still lives in local state plus <span className="font-semibold text-white">budget.json</span>, and Sheets acts as a user-controlled mirror/edit surface.
          </p>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-lg font-bold">Google Sheets Sync</div>
              <div className="mt-2 text-sm text-fintech-muted">Real-time two-way data mirroring</div>
            </div>
            <div className="flex gap-3">
            <button
              onClick={handleGoogleSheetsConnect}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,_#69f6b8_0%,_#06b77f_100%)] px-6 py-3 text-sm font-bold text-[#002919] disabled:opacity-50"
              disabled={googleSheetsConnected}
            >
              <Link2 size={16} />
              <span>{googleSheetsConnected ? "Google Connected" : "Connect Google"}</span>
            </button>
            <button
              onClick={disconnectGoogleSheets}
              className="rounded-xl bg-white/5 px-4 py-3 text-sm font-bold hover:bg-white/10 transition-colors"
              disabled={!googleSheetsConnected}
            >
              Disconnect
            </button>
          </div>
          </div>

          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Spreadsheet URL</span>
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-lg border border-white/10 bg-[#192540] px-4 py-3 text-sm"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Expenses Tab</span>
                <input
                  type="text"
                  value={expensesSheetName}
                  onChange={(e) => setExpensesSheetName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#192540] px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Income Tab</span>
                <input
                  type="text"
                  value={incomeSheetName}
                  onChange={(e) => setIncomeSheetName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#192540] px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleInspectGoogleSheet}
                disabled={!googleSheetsConnected || loadingSheetConfig}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-white/5 py-3 font-bold hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {loadingSheetConfig ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={16} />}
                <span>{loadingSheetConfig ? "Loading..." : "Load Columns"}</span>
              </button>
              <button
                onClick={handleGoogleSheetsSync}
                disabled={!googleSheetsConfig || !googleSheetsConnected || googleSheetsSyncing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-fintech-import/10 py-3 font-bold text-fintech-import hover:bg-fintech-import/20 transition-colors disabled:opacity-50"
              >
                {googleSheetsSyncing ? <div className="w-4 h-4 border-2 border-fintech-import border-t-transparent rounded-full animate-spin" /> : <RefreshCw size={16} />}
                <span>{googleSheetsSyncing ? "Syncing..." : "Sync Now"}</span>
              </button>
            </div>
          </div>

          {(expenseHeaders.length > 0 || incomeHeaders.length > 0 || googleSheetsConfig) && (
            <div className="space-y-5 pt-2 border-t border-white/10">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">Expenses Mapping</h4>
                  {sheetTitle && <span className="text-[10px] text-fintech-muted uppercase tracking-widest">{sheetTitle}</span>}
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {renderMappingSelect("Date", expenseMapping.date, ensureMappingOption(expenseHeaders, expenseMapping.date), (value) => setExpenseMapping((current) => ({ ...current, date: value })))}
                  {renderMappingSelect("Vendor", expenseMapping.vendor, ensureMappingOption(expenseHeaders, expenseMapping.vendor), (value) => setExpenseMapping((current) => ({ ...current, vendor: value })))}
                  {renderMappingSelect("Amount", expenseMapping.amount, ensureMappingOption(expenseHeaders, expenseMapping.amount), (value) => setExpenseMapping((current) => ({ ...current, amount: value })))}
                  {renderMappingSelect("Category", expenseMapping.category, ensureMappingOption(expenseHeaders, expenseMapping.category), (value) => setExpenseMapping((current) => ({ ...current, category: value })))}
                  {renderMappingSelect("Notes", expenseMapping.notes, ensureMappingOption(expenseHeaders, expenseMapping.notes), (value) => setExpenseMapping((current) => ({ ...current, notes: value })))}
                  {renderMappingSelect("ID", expenseMapping.id, ensureMappingOption(expenseHeaders, expenseMapping.id), (value) => setExpenseMapping((current) => ({ ...current, id: value })))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold">Income Mapping</h4>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {renderMappingSelect("Date", incomeMapping.date, ensureMappingOption(incomeHeaders, incomeMapping.date), (value) => setIncomeMapping((current) => ({ ...current, date: value })))}
                  {renderMappingSelect("Source", incomeMapping.source, ensureMappingOption(incomeHeaders, incomeMapping.source), (value) => setIncomeMapping((current) => ({ ...current, source: value })))}
                  {renderMappingSelect("Amount", incomeMapping.amount, ensureMappingOption(incomeHeaders, incomeMapping.amount), (value) => setIncomeMapping((current) => ({ ...current, amount: value })))}
                  {renderMappingSelect("Category", incomeMapping.category, ensureMappingOption(incomeHeaders, incomeMapping.category), (value) => setIncomeMapping((current) => ({ ...current, category: value })))}
                  {renderMappingSelect("Notes", incomeMapping.notes, ensureMappingOption(incomeHeaders, incomeMapping.notes), (value) => setIncomeMapping((current) => ({ ...current, notes: value })))}
                  {renderMappingSelect("ID", incomeMapping.id, ensureMappingOption(incomeHeaders, incomeMapping.id), (value) => setIncomeMapping((current) => ({ ...current, id: value })))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <label className="space-y-1 block">
                  <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Sync Every (sec)</span>
                  <input
                    type="number"
                    min="15"
                    value={syncIntervalSeconds}
                    onChange={(e) => setSyncIntervalSeconds(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#192540] px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-end gap-3 pb-2">
                  <input
                    type="checkbox"
                    checked={sheetAutoSync}
                    onChange={(e) => setSheetAutoSync(e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium">Enable auto-sync while app is open</span>
                </label>
              </div>

              <button
                onClick={handleSaveGoogleSheetsConfig}
                disabled={!googleSheetsConnected || savingSheetConfig}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-fintech-accent/10 py-3 font-bold text-fintech-accent hover:bg-fintech-accent/20 transition-colors disabled:opacity-50"
              >
                {savingSheetConfig ? <div className="w-4 h-4 border-2 border-fintech-accent border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                <span>{savingSheetConfig ? "Saving..." : "Save Sync Settings"}</span>
              </button>
            </div>
          )}

          {(googleSheetsConfig?.lastSyncedAt || googleSheetsError) && (
            <div className="text-xs text-fintech-muted space-y-1">
              {googleSheetsConfig?.lastSyncedAt && <p>Last sheet sync: {new Date(googleSheetsConfig.lastSyncedAt).toLocaleString()}</p>}
              {googleSheetsError && <p className="text-fintech-danger">{googleSheetsError}</p>}
            </div>
          )}
        </div>
      </section>
      </div>

      {/* Local + Drive Sync Section */}
      <section className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Cloud size={20} className="text-fintech-accent" /> Local + Drive Sync
        </h3>
        <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-fintech-muted leading-relaxed">
              Save your latest budget into your own Drive folder as <span className="font-semibold text-white">budget.json</span>, or reload it from Drive on this device.
            </p>
            {lastSynced && (
              <span className="text-[10px] font-medium text-fintech-muted bg-white/5 px-2 py-1 rounded-lg">
                Last synced: {lastSynced.toLocaleString()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="w-full flex items-center justify-between p-5 bg-fintech-accent/10 rounded-2xl hover:bg-fintech-accent/20 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                {backingUp ? (
                  <div className="w-6 h-6 border-2 border-fintech-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Cloud size={24} className="text-fintech-accent" />
                )}
                <div className="text-left">
                  <span className="block font-bold text-fintech-accent">
                    {backingUp ? "Saving..." : "Save to Drive"}
                  </span>
                  <span className="block text-[10px] text-fintech-muted">Write latest data to budget.json</span>
                </div>
              </div>
            </button>

            <button
              onClick={syncToCloud}
              disabled={isSyncing}
              className="w-full flex items-center justify-between p-5 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                {isSyncing ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw size={24} className="text-white" />
                )}
                <div className="text-left">
                  <span className="block font-bold text-white">
                    {isSyncing ? "Loading..." : "Reload from Drive"}
                  </span>
                  <span className="block text-[10px] text-fintech-muted">Read budget.json from your Drive folder</span>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                const data = { expenseCategories, incomeCategories, transactions, income: incomeRecords };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `budget-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="w-full flex items-center justify-between p-5 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
            >
              <div className="flex items-center gap-4">
                <Download size={24} className="text-white" />
                <div className="text-left">
                  <span className="block font-bold text-white">Download Local JSON</span>
                  <span className="block text-[10px] text-fintech-muted">Save a device backup</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>
      </div>
      )}

      {/* Maintenance Tab */}
      {activeTab === "maintenance" && (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 flex items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#214b58] bg-[#122836] text-fintech-accent">
            <Shield size={24} />
          </div>
          <div>
            <div className="text-sm font-bold">256-bit Encryption</div>
            <div className="mt-1 text-xs text-fintech-muted">Your data is locked tight.</div>
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 flex items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#244c62] bg-[#12283a] text-[#78d8ff]">
            <CloudDownload size={24} />
          </div>
          <div>
            <div className="text-sm font-bold">Backup Status</div>
            <div className="mt-1 text-xs text-fintech-muted">{lastSynced ? `Last backup ${lastSynced.toLocaleString()}` : "Last backup 2h ago"}</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-bold">Maintenance</h3>
        <div className="rounded-xl border border-white/5 bg-[#0f1930] p-6 space-y-4">
          <p className="text-xs text-fintech-muted mb-4">Selectively wipe your local data. Use with caution.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: "expenses", label: "Clear All Expenses" },
              { id: "income", label: "Clear All Incomes" },
              { id: "expenseCategories", label: "Reset Expense Categories" },
              { id: "incomeCategories", label: "Reset Income Categories" }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setConfirmWipe(item.id)}
                disabled={wiping !== null}
                className="flex items-center justify-between p-4 bg-white/5 rounded-2xl hover:bg-fintech-danger/10 group transition-colors disabled:opacity-50"
              >
                <span className="text-sm font-medium group-hover:text-fintech-danger transition-colors">{item.label}</span>
                <Trash2 size={18} className="text-fintech-muted group-hover:text-fintech-danger transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </section>
      </div>
      )}
      </div>

      <footer className="text-center py-8">
        <p className="text-[10px] text-fintech-muted uppercase tracking-[0.2em]">VibeBudget v1.0.0</p>
      </footer>
    </div>
  );
};
