import React, { useMemo, useState } from "react";
import { FirebaseContext, type FirebaseContextType } from "../contexts/SupabaseContext";
import type { User as FirebaseUser } from "../contexts/FirebaseUserType";
import type {
  ExpenseCategory, GooglePullSummary, GoogleSheetsInspectionResult, GoogleSheetsSyncConfig,
  GoogleSheetsSyncOptions, ImportBatch, ImportCommitSummary, ImportPreviewOptions, ImportSource,
  Income, IncomeCategory, Preferences, RecurringRule, TellerCategoryMapping, TellerConnection,
  TellerCredentials, Transaction,
} from "../types";
import { previewImportBatch } from "../utils/importPipeline";

export interface MockSupabaseSeed {
  user?: Partial<FirebaseUser> | null;
  expenseCategories?: ExpenseCategory[]; incomeCategories?: IncomeCategory[];
  transactions?: Transaction[]; income?: Income[]; recurringRules?: RecurringRule[];
  preferences?: Preferences; googleSheetsConfig?: GoogleSheetsSyncConfig | null;
}

const defaultUser = {
  uid: "mock-user", email: import.meta.env.VITE_TEST_USER_EMAIL || "shubhamg266@gmail.com",
  displayName: "Shubham Test User", photoURL: null, phoneNumber: null, providerId: "google.com",
  providerData: [], emailVerified: false, isAnonymous: false, metadata: {}, refreshToken: "",
  tenantId: null, toJSON: () => ({}), delete: async () => {}, reload: async () => {}, getIdToken: async () => "",
} as FirebaseUser;

const defaultExpenseCategories: ExpenseCategory[] = [
  { id: "expense-rent", name: "Rent", target_amount: 1800 },
  { id: "expense-food", name: "Groceries", target_amount: 500 },
];
const defaultIncomeCategories: IncomeCategory[] = [
  { id: "income-salary", name: "Salary", target_amount: 5000 },
  { id: "income-freelance", name: "Freelance", target_amount: 1000 },
];
const defaultTransactions: Transaction[] = [{
  id: "txn-1", date: "2026-04-02", vendor: "Save-On Foods", amount: 128.55, currency: "CAD",
  category_id: "expense-food", category_name: "Groceries", notes: "Weekly groceries",
}];
const defaultIncome: Income[] = [{
  id: "inc-1", date: "2026-04-01", source: "Day Job", amount: 4200, currency: "CAD",
  category_id: "income-salary", category: "Salary", notes: "Monthly salary",
}];
const defaultPreferences: Preferences = { baseCurrency: "CAD", exchangeRates: [{ currency: "USD", rateToBase: 1.37 }], coreExcludedCategories: [] };
const defaultInspection: GoogleSheetsInspectionResult = {
  spreadsheetId: "mock-sheet", spreadsheetTitle: "Mock Budget Sheet",
  sheetTitles: ["Expenses", "Income", "Expense Categories", "Income Categories"],
  expenseHeaders: ["Date", "Vendor", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
  incomeHeaders: ["Date", "Source", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
  suggestedExpenseMapping: { date: "Date", vendor: "Vendor", amount: "Amount", category: "Category", notes: "Notes", id: "VibeBudget ID", updatedAt: "Updated At" },
  suggestedIncomeMapping: { date: "Date", source: "Source", amount: "Amount", category: "Category", notes: "Notes", id: "VibeBudget ID", updatedAt: "Updated At" },
};

export const createMockSupabaseValue = (seed?: MockSupabaseSeed): FirebaseContextType => {
  const expenseCategories = seed?.expenseCategories || defaultExpenseCategories;
  const incomeCategories = seed?.incomeCategories || defaultIncomeCategories;
  const transactions = seed?.transactions || defaultTransactions;
  const income = seed?.income || defaultIncome;
  const preferences = seed?.preferences || defaultPreferences;
  const recurringRules = seed?.recurringRules || [];
  const googleSheetsConfig = seed?.googleSheetsConfig || null;
  const user = (seed?.user === undefined ? defaultUser : seed.user) as FirebaseUser | null;
  const noop = async () => {};
  const previewImport = (source: ImportSource, payload: string | unknown[] | Record<string, unknown>, options?: ImportPreviewOptions): ImportBatch =>
    previewImportBatch({ source, payload, options, existing: { transactions, income, expenseCategories, incomeCategories } });
  return {
    user, loading: false, authError: null, clearAuthError: () => {}, budgetId: "mock-budget",
    ownerEmail: user?.email || null, sharedUsers: [], expenseCategories, incomeCategories,
    categories: expenseCategories, transactions, income, recurringRules, preferences,
    updatePreferences: noop, signIn: noop, logout: noop, addTransaction: noop,
    refreshTransactionsNow: async () => 0, updateTransaction: noop, deleteTransaction: noop,
    addIncome: noop, updateIncome: noop, deleteIncome: noop, createRecurringRule: async () => "mock-rule",
    updateRecurringRule: noop, deleteRecurringRule: noop, generateRecurringTransactions: async () => ({ generated: 0, skipped: 0 }),
    getUpcomingRecurring: () => [], updateExpenseCategoryTarget: noop, updateIncomeCategoryTarget: noop,
    updateCategoryTarget: noop, previewImport, commitImport: async () => ({ imported: 0, skipped: 0, invalid: 0 }),
    importData: noop, upsertGoogleSheetRows: async () => ({ imported: 0, updated: 0, skipped: 0 }),
    wipeData: noop, backupToDrive: noop, syncToCloud: noop, shareBudget: noop, googleSheetsConfig,
    googleSheetsConnected: true, googleSheetsSyncing: false, googleSheetsError: null,
    connectGoogleSheets: noop, disconnectGoogleSheets: () => {},
    inspectGoogleSheetsSpreadsheet: async () => defaultInspection,
    previewGoogleSheetColumn: async () => ({ headerValue: "Date", samples: [], last: null }),
    saveGoogleSheetsConfig: noop, syncGoogleSheets: async (_direction?: string, _options?: GoogleSheetsSyncOptions) => ({ fetched: 10, imported: 5, duplicateSkipped: 3, invalidSkipped: 1, netNew: 5, mode: _options?.mode || "incremental" }),
    validateGoogleSheetsMapping: () => ({ valid: true, missing: [] }), googlePullSummary: null,
    backingUp: false, isSyncing: false, lastSynced: null, driveConnection: null, driveConnected: false,
    driveSyncError: null, connectDriveFolder: noop, previewBudgetFromDrive: async () => previewImport("manual_backup", JSON.stringify({ expenseCategories, incomeCategories, transactions, income })),
    loadBudgetFromDrive: noop, disconnectDriveFolder: () => {}, googleSheetsAccessToken: "mock-token",
    plaidConnected: false, plaidConnection: null, plaidSyncing: false, plaidError: null,
    plaidCredentials: null, plaidCategoryMappings: [], connectPlaid: noop, disconnectPlaid: noop,
    syncPlaidTransactions: async () => ({ imported: 0, skipped: 0, invalid: 0 }), fetchPlaidAccounts: async () => [],
    setPlaidCredentials: noop, setPlaidCategoryMappings: noop, tellerConnected: false, tellerConnection: null,
    tellerSyncing: false, tellerError: null, tellerCredentials: null, tellerCategoryMappings: [],
    connectTeller: noop, disconnectTeller: noop, syncTellerTransactions: async () => ({ imported: 0, skipped: 0, invalid: 0 }),
    fetchTellerAccounts: async () => [], setTellerCredentials: noop, setTellerCategoryMappings: noop,
    aiConfig: null, saveAiConfig: async () => {},
  };
};

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const seed = useMemo(() => (window as any).__VIBEBUDGET_TEST_STATE__, []);
  const [expenseCategories, setExpenseCategories] = useState(seed?.expenseCategories || defaultExpenseCategories);
  const [transactions, setTransactions] = useState(seed?.transactions || defaultTransactions);
  const [incomeCategories, setIncomeCategories] = useState(seed?.incomeCategories || defaultIncomeCategories);
  const [income, setIncome] = useState(seed?.income || defaultIncome);
  const [recurringRules, setRecurringRules] = useState(seed?.recurringRules || []);
  const [preferences, setPreferences] = useState(seed?.preferences || defaultPreferences);
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(seed?.googleSheetsConfig || null);
  const user = (seed?.user === undefined ? defaultUser : seed.user) as FirebaseUser | null;
  const value = useMemo<FirebaseContextType>(() => ({
    ...createMockSupabaseValue({ user, expenseCategories, incomeCategories, transactions, income, recurringRules, preferences, googleSheetsConfig }),
    updatePreferences: async (partial) => { setPreferences((c) => ({ ...c, ...partial })); },
    addTransaction: async (data) => { setTransactions((c) => c.concat({ id: `txn-${c.length + 1}`, ...data })); },
    updateTransaction: async (id, data) => { setTransactions((c) => c.map((i) => (i.id === id ? { ...i, ...data } : i))); },
    deleteTransaction: async (id) => { setTransactions((c) => c.filter((i) => i.id !== id)); },
    addIncome: async (data) => { setIncome((c) => c.concat({ id: `inc-${c.length + 1}`, ...data })); },
    updateIncome: async (id, data) => { setIncome((c) => c.map((i) => (i.id === id ? { ...i, ...data } : i))); },
    deleteIncome: async (id) => { setIncome((c) => c.filter((i) => i.id !== id)); },
    createRecurringRule: async (data) => {
      const nextId = `rule-${recurringRules.length + 1}`;
      setRecurringRules((c) => c.concat({ ...data, id: nextId, uid: user?.uid || "mock-user", frequency: "monthly", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
      return nextId;
    },
    updateRecurringRule: async (id, data) => { setRecurringRules((c) => c.map((i) => (i.id === id ? { ...i, ...data } : i))); },
    deleteRecurringRule: async (id) => { setRecurringRules((c) => c.map((i) => (i.id === id ? { ...i, is_active: false } : i))); },
    generateRecurringTransactions: async () => ({ generated: 0, skipped: 0 }),
    getUpcomingRecurring: () => [],
    updateExpenseCategoryTarget: async (id, target) => { setExpenseCategories((c) => c.map((i) => (i.id === id ? { ...i, target_amount: target } : i))); },
    updateCategoryTarget: async (id, target) => { setExpenseCategories((c) => c.map((i) => (i.id === id ? { ...i, target_amount: target } : i))); },
    previewImport: (source, payload, options) => previewImportBatch({ source, payload, options, existing: { transactions, income, expenseCategories, incomeCategories } }),
    commitImport: async (batch, options) => {
      const allowedIds = options?.recordIds ? new Set(options.recordIds) : null;
      const records = batch.records.filter((r) => { if (allowedIds && !allowedIds.has(r.id)) return false; if (r.status === "invalid") return false; if (r.status === "duplicate" && !options?.includeDuplicates) return false; return true; });
      setTransactions((c) => c.concat(records.filter((r) => r.kind === "expense").map((r, i) => ({ id: `imported-expense-${c.length + i + 1}`, date: r.date || "2026-04-01", vendor: r.merchant || "Imported expense", amount: r.amount || 0, category_id: "expense-food", category_name: r.category || "Misc.", notes: r.notes || "", import_source: r.source, source_id: r.source_id, import_batch_id: batch.id }))));
      setIncome((c) => c.concat(records.filter((r) => r.kind === "income").map((r, i) => ({ id: `imported-income-${c.length + i + 1}`, date: r.date || "2026-04-01", source: r.merchant || "Imported income", amount: r.amount || 0, category_id: "income-salary", category: r.category || "Uncategorized", notes: r.notes || "", import_source: r.source, source_id: r.source_id, import_batch_id: batch.id }))));
      return { imported: records.length, skipped: batch.records.length - records.length, invalid: batch.summary.invalid };
    },
    upsertGoogleSheetRows: async (type, rows) => {
      if (type === "expenses") setTransactions((c) => c.concat(rows.map((row: any, i: number) => { const [d, v, a, cat, n] = Array.isArray(row) ? row : []; return { id: `sheet-expense-${c.length + i + 1}`, date: String(d || "2026-04-01"), vendor: String(v || "Imported expense"), amount: Number(a) || 0, category_id: "expense-food", category_name: String(cat || "Misc."), notes: String(n || ""), import_source: "google_sheet" as const, source_id: `mock-sheet-expense-${c.length + i + 1}` }; })));
      if (type === "income") setIncome((c) => c.concat(rows.map((row: any, i: number) => { const [d, s, a, cat, n] = Array.isArray(row) ? row : []; return { id: `sheet-income-${c.length + i + 1}`, date: String(d || "2026-04-01"), source: String(s || "Imported income"), amount: Number(a) || 0, category_id: "income-salary", category: String(cat || "Uncategorized"), notes: String(n || ""), import_source: "google_sheet" as const, source_id: `mock-sheet-income-${c.length + i + 1}` }; })));
      return { imported: rows.length, updated: 0, skipped: 0 };
    },
    wipeData: async (type) => { if (type === "expenses") setTransactions([]); if (type === "income") setIncome([]); if (type === "categories" || type === "expenseCategories") setExpenseCategories(defaultExpenseCategories); if (type === "incomeCategories") setIncomeCategories([]); if (type === "targets") setExpenseCategories((c) => c.map((i) => ({ ...i, target_amount: 0 }))); },
    saveGoogleSheetsConfig: async (config) => { setGoogleSheetsConfig({ ...config, connectedAt: new Date().toISOString(), connectedBy: user?.email || defaultUser.email || "shubhamg266@gmail.com" }); },
  }), [expenseCategories, googleSheetsConfig, income, incomeCategories, preferences, recurringRules, transactions, user]);
  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
};
