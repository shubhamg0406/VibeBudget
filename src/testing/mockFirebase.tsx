import React, { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { FirebaseContext, type FirebaseContextType } from "../contexts/FirebaseContext";
import type {
  ExpenseCategory,
  GooglePullSummary,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncOptions,
  ImportBatch,
  ImportCommitSummary,
  ImportPreviewOptions,
  ImportSource,
  Income,
  IncomeCategory,
  Preferences,
  RecurringRule,
  TellerCategoryMapping,
  TellerConnection,
  TellerCredentials,
  Transaction,
} from "../types";
import { previewImportBatch } from "../utils/importPipeline";

export interface MockFirebaseSeed {
  user?: Partial<User> | null;
  expenseCategories?: ExpenseCategory[];
  incomeCategories?: IncomeCategory[];
  transactions?: Transaction[];
  income?: Income[];
  recurringRules?: RecurringRule[];
  preferences?: Preferences;
  googleSheetsConfig?: GoogleSheetsSyncConfig | null;
}

declare global {
  interface Window {
    __VIBEBUDGET_TEST_STATE__?: MockFirebaseSeed;
  }
}

const defaultUser = {
  uid: "mock-user",
  email: import.meta.env.VITE_TEST_USER_EMAIL || "shubhamg266@gmail.com",
  displayName: "Shubham Test User",
} as User;

const defaultExpenseCategories: ExpenseCategory[] = [
  { id: "expense-rent", name: "Rent", target_amount: 1800 },
  { id: "expense-food", name: "Groceries", target_amount: 500 },
];

const defaultIncomeCategories: IncomeCategory[] = [
  { id: "income-salary", name: "Salary", target_amount: 5000 },
  { id: "income-freelance", name: "Freelance", target_amount: 1000 },
];

const defaultTransactions: Transaction[] = [
  {
    id: "txn-1",
    date: "2026-04-02",
    vendor: "Save-On Foods",
    amount: 128.55,
    currency: "CAD",
    category_id: "expense-food",
    category_name: "Groceries",
    notes: "Weekly groceries",
  },
];

const defaultIncome: Income[] = [
  {
    id: "inc-1",
    date: "2026-04-01",
    source: "Day Job",
    amount: 4200,
    currency: "CAD",
    category_id: "income-salary",
    category: "Salary",
    notes: "Monthly salary",
  },
];

const defaultPreferences: Preferences = {
  baseCurrency: "CAD",
  exchangeRates: [{ currency: "USD", rateToBase: 1.37 }],
  coreExcludedCategories: [],
};

const defaultInspection: GoogleSheetsInspectionResult = {
  spreadsheetId: "mock-sheet",
  spreadsheetTitle: "Mock Budget Sheet",
  expenseHeaders: ["Date", "Vendor", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
  incomeHeaders: ["Date", "Source", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
  suggestedExpenseMapping: {
    date: "Date",
    vendor: "Vendor",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  },
  suggestedIncomeMapping: {
    date: "Date",
    source: "Source",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  },
};

export const createMockFirebaseValue = (seed?: MockFirebaseSeed): FirebaseContextType => {
  const expenseCategories = seed?.expenseCategories || defaultExpenseCategories;
  const incomeCategories = seed?.incomeCategories || defaultIncomeCategories;
  const transactions = seed?.transactions || defaultTransactions;
  const income = seed?.income || defaultIncome;
  const preferences = seed?.preferences || defaultPreferences;
  const recurringRules = seed?.recurringRules || [];
  const googleSheetsConfig = seed?.googleSheetsConfig || null;
  const user = (seed?.user === undefined ? defaultUser : seed.user) as User | null;
  const noop = async () => {};
  const previewImport = (
    source: ImportSource,
    payload: string | unknown[] | Record<string, unknown>,
    options?: ImportPreviewOptions,
  ): ImportBatch => previewImportBatch({
    source,
    payload,
    options,
    existing: {
      transactions,
      income,
      expenseCategories,
      incomeCategories,
    },
  });

  return {
    user,
    loading: false,
    authError: null,
    clearAuthError: () => {},
    budgetId: "mock-budget",
    ownerEmail: user?.email || null,
    sharedUsers: [],
    expenseCategories,
    incomeCategories,
    categories: expenseCategories,
    transactions,
    income,
    recurringRules,
    preferences,
    updatePreferences: noop,
    signIn: noop,
    logout: noop,
    addTransaction: noop,
    updateTransaction: noop,
    deleteTransaction: noop,
    addIncome: noop,
    updateIncome: noop,
    deleteIncome: noop,
    createRecurringRule: async () => "mock-rule",
    updateRecurringRule: noop,
    deleteRecurringRule: noop,
    generateRecurringTransactions: async () => ({ generated: 0, skipped: 0 }),
    getUpcomingRecurring: () => [],
    updateExpenseCategoryTarget: noop,
    updateIncomeCategoryTarget: noop,
    updateCategoryTarget: noop,
    previewImport,
    commitImport: async () => ({ imported: 0, skipped: 0, invalid: 0 } satisfies ImportCommitSummary),
    importData: noop,
    upsertGoogleSheetRows: async () => ({ imported: 0, updated: 0, skipped: 0 }),
    wipeData: noop,
    backupToDrive: noop,
    syncToCloud: noop,
    shareBudget: noop,
    googleSheetsConfig,
    googleSheetsConnected: true,
    googleSheetsSyncing: false,
    googleSheetsError: null,
    connectGoogleSheets: noop,
    disconnectGoogleSheets: () => {},
    inspectGoogleSheetsSpreadsheet: async () => defaultInspection,
    saveGoogleSheetsConfig: noop,
    syncGoogleSheets: async (_direction?: string, _options?: GoogleSheetsSyncOptions) => ({
      fetched: 10,
      imported: 5,
      duplicateSkipped: 3,
      invalidSkipped: 1,
      netNew: 5,
      mode: _options?.mode || "incremental",
    } satisfies GooglePullSummary),
    validateGoogleSheetsMapping: () => ({ valid: true, missing: [] }),
    googlePullSummary: null,
    backingUp: false,
    isSyncing: false,
    lastSynced: null,
    driveConnection: null,
    driveConnected: false,
    driveSyncError: null,
    connectDriveFolder: noop,
    previewBudgetFromDrive: async () => previewImport("manual_backup", JSON.stringify({
      expenseCategories,
      incomeCategories,
      transactions,
      income,
    })),
    loadBudgetFromDrive: noop,
    disconnectDriveFolder: () => {},
    googleSheetsAccessToken: "mock-token",

    // Plaid
    plaidConnected: false,
    plaidConnection: null,
    plaidSyncing: false,
    plaidError: null,
    plaidCredentials: null,
    plaidCategoryMappings: [],
    connectPlaid: noop,
    disconnectPlaid: noop,
    syncPlaidTransactions: async () => ({ imported: 0, skipped: 0, invalid: 0 }),
    fetchPlaidAccounts: async () => [],
    setPlaidCredentials: noop,
    setPlaidCategoryMappings: noop,

    // Teller
    tellerConnected: false,
    tellerConnection: null,
    tellerSyncing: false,
    tellerError: null,
    tellerCredentials: null,
    tellerCategoryMappings: [],
    connectTeller: noop,
    disconnectTeller: noop,
    syncTellerTransactions: async () => ({ imported: 0, skipped: 0, invalid: 0 }),
    fetchTellerAccounts: async () => [],
    setTellerCredentials: noop,
    setTellerCategoryMappings: noop,

    // AI
    aiConfig: null,
    saveAiConfig: async () => {},
  };
};

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const seed = useMemo(() => window.__VIBEBUDGET_TEST_STATE__, []);
  const [expenseCategories, setExpenseCategories] = useState(seed?.expenseCategories || defaultExpenseCategories);
  const [transactions, setTransactions] = useState(seed?.transactions || defaultTransactions);
  const [incomeCategories, setIncomeCategories] = useState(seed?.incomeCategories || defaultIncomeCategories);
  const [income, setIncome] = useState(seed?.income || defaultIncome);
  const [recurringRules, setRecurringRules] = useState(seed?.recurringRules || []);
  const [preferences, setPreferences] = useState(seed?.preferences || defaultPreferences);
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(seed?.googleSheetsConfig || null);
  const user = (seed?.user === undefined ? defaultUser : seed.user) as User | null;

  const value = useMemo<FirebaseContextType>(() => ({
    ...createMockFirebaseValue({
      user,
      expenseCategories,
      incomeCategories,
      transactions,
      income,
      recurringRules,
      preferences,
      googleSheetsConfig,
    }),
    updatePreferences: async (partial) => {
      setPreferences((current) => ({ ...current, ...partial }));
    },
    addTransaction: async (data) => {
      setTransactions((current) => current.concat({ id: `txn-${current.length + 1}`, ...data }));
    },
    updateTransaction: async (id, data) => {
      setTransactions((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
    },
    deleteTransaction: async (id) => {
      setTransactions((current) => current.filter((item) => item.id !== id));
    },
    addIncome: async (data) => {
      setIncome((current) => current.concat({ id: `inc-${current.length + 1}`, ...data }));
    },
    updateIncome: async (id, data) => {
      setIncome((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
    },
    deleteIncome: async (id) => {
      setIncome((current) => current.filter((item) => item.id !== id));
    },
    createRecurringRule: async (data) => {
      const nextId = `rule-${recurringRules.length + 1}`;
      setRecurringRules((current) => current.concat({
        ...data,
        id: nextId,
        uid: user?.uid || "mock-user",
        frequency: "monthly",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      return nextId;
    },
    updateRecurringRule: async (id, data) => {
      setRecurringRules((current) => current.map((item) => (item.id === id ? { ...item, ...data } : item)));
    },
    deleteRecurringRule: async (id) => {
      setRecurringRules((current) => current.map((item) => (item.id === id ? { ...item, is_active: false } : item)));
    },
    generateRecurringTransactions: async () => ({ generated: 0, skipped: 0 }),
    getUpcomingRecurring: () => [],
    updateExpenseCategoryTarget: async (id, target) => {
      setExpenseCategories((current) => current.map((item) => (item.id === id ? { ...item, target_amount: target } : item)));
    },
    updateCategoryTarget: async (id, target) => {
      setExpenseCategories((current) => current.map((item) => (item.id === id ? { ...item, target_amount: target } : item)));
    },
    previewImport: (source, payload, options) => previewImportBatch({
      source,
      payload,
      options,
      existing: {
        transactions,
        income,
        expenseCategories,
        incomeCategories,
      },
    }),
    commitImport: async (batch, options) => {
      const allowedIds = options?.recordIds ? new Set(options.recordIds) : null;
      const records = batch.records.filter((record) => {
        if (allowedIds && !allowedIds.has(record.id)) return false;
        if (record.status === "invalid") return false;
        if (record.status === "duplicate" && !options?.includeDuplicates) return false;
        return true;
      });
      setTransactions((current) => current.concat(records
        .filter((record) => record.kind === "expense")
        .map((record, index) => ({
          id: `imported-expense-${current.length + index + 1}`,
          date: record.date || "2026-04-01",
          vendor: record.merchant || "Imported expense",
          amount: record.amount || 0,
          category_id: "expense-food",
          category_name: record.category || "Misc.",
          notes: record.notes || "",
          import_source: record.source,
          source_id: record.source_id,
          import_batch_id: batch.id,
        }))));
      setIncome((current) => current.concat(records
        .filter((record) => record.kind === "income")
        .map((record, index) => ({
          id: `imported-income-${current.length + index + 1}`,
          date: record.date || "2026-04-01",
          source: record.merchant || "Imported income",
          amount: record.amount || 0,
          category_id: "income-salary",
          category: record.category || "Uncategorized",
          notes: record.notes || "",
          import_source: record.source,
          source_id: record.source_id,
          import_batch_id: batch.id,
        }))));
      return {
        imported: records.length,
        skipped: batch.records.length - records.length,
        invalid: batch.summary.invalid,
      };
    },
    upsertGoogleSheetRows: async (type, rows) => {
      if (type === "expenses") {
        setTransactions((current) => current.concat(rows.map((row, index) => {
          const [date, vendor, amount, category, notes] = Array.isArray(row) ? row : [];
          return {
            id: `sheet-expense-${current.length + index + 1}`,
            date: String(date || "2026-04-01"),
            vendor: String(vendor || "Imported expense"),
            amount: Number(amount) || 0,
            category_id: "expense-food",
            category_name: String(category || "Misc."),
            notes: String(notes || ""),
            import_source: "google_sheet" as const,
            source_id: `mock-sheet-expense-${current.length + index + 1}`,
          };
        })));
      }
      if (type === "income") {
        setIncome((current) => current.concat(rows.map((row, index) => {
          const [date, source, amount, category, notes] = Array.isArray(row) ? row : [];
          return {
            id: `sheet-income-${current.length + index + 1}`,
            date: String(date || "2026-04-01"),
            source: String(source || "Imported income"),
            amount: Number(amount) || 0,
            category_id: "income-salary",
            category: String(category || "Uncategorized"),
            notes: String(notes || ""),
            import_source: "google_sheet" as const,
            source_id: `mock-sheet-income-${current.length + index + 1}`,
          };
        })));
      }
      return { imported: rows.length, updated: 0, skipped: 0 };
    },
    wipeData: async (type) => {
      if (type === "expenses") setTransactions([]);
      if (type === "income") setIncome([]);
      if (type === "categories" || type === "expenseCategories") setExpenseCategories(defaultExpenseCategories);
      if (type === "incomeCategories") setIncomeCategories([]);
      if (type === "targets") {
        setExpenseCategories((current) => current.map((item) => ({ ...item, target_amount: 0 })));
      }
    },
    saveGoogleSheetsConfig: async (config) => {
      setGoogleSheetsConfig({
        ...config,
        connectedAt: new Date().toISOString(),
        connectedBy: user?.email || defaultUser.email || "shubhamg266@gmail.com",
      });
    },
  }), [expenseCategories, googleSheetsConfig, income, incomeCategories, preferences, recurringRules, transactions, user]);

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
};
