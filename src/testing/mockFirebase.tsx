import React, { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { FirebaseContext, type FirebaseContextType } from "../contexts/FirebaseContext";
import type {
  ExpenseCategory,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  Income,
  IncomeCategory,
  Preferences,
  RecurringRule,
  Transaction,
} from "../types";

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
    importData: noop,
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
    syncGoogleSheets: noop,
    backingUp: false,
    isSyncing: false,
    lastSynced: null,
    driveConnection: null,
    driveConnected: false,
    driveSyncError: null,
    connectDriveFolder: noop,
    loadBudgetFromDrive: noop,
    disconnectDriveFolder: () => {},
    googleSheetsAccessToken: "mock-token",
  };
};

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const seed = useMemo(() => window.__VIBEBUDGET_TEST_STATE__, []);
  const [expenseCategories, setExpenseCategories] = useState(seed?.expenseCategories || defaultExpenseCategories);
  const [transactions, setTransactions] = useState(seed?.transactions || defaultTransactions);
  const [incomeCategories] = useState(seed?.incomeCategories || defaultIncomeCategories);
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
    wipeData: async (type) => {
      if (type === "expenses") setTransactions([]);
      if (type === "income") setIncome([]);
      if (type === "categories") setExpenseCategories([]);
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
