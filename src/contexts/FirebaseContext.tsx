import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";
import {
  CollectionReference,
  DocumentData,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firebaseDataNamespace, googleDriveProvider, googleProvider } from "../firebase";
import {
  AiProviderConfig,
  Category,
  DriveConnection,
  ExpenseCategory,
  GooglePullSummary,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncDirection,
  GoogleSheetsSyncMode,
  GoogleSheetsSyncOptions,
  ImportBatch,
  ImportCommitOptions,
  ImportCommitSummary,
  ImportPreviewOptions,
  ImportSource,
  Income,
  IncomeCategory,
  PlaidCategoryMapping,
  PlaidConnection,
  PlaidCredentials,
  PlaidEnv,
  Preferences,
  RecurringRule,
  TellerCategoryMapping,
  TellerConnection,
  TellerCredentials,
  TellerEnv,
  Transaction,
  UpcomingRecurringInstance,
} from "../types";
import {
  getSheetColumnValuesUntilEmptyRun,
  getSheetValues,
  inspectSpreadsheet,
  parseA1CellReference,
  parseSpreadsheetId,
  syncAppDataToSheet,
  syncSheetDataToApp,
} from "../utils/googleSheetsSync";
import {
  createBudgetDataFile,
  ensureBudgetFile,
  ensureVibeBudgetFolder,
  parseBudgetDataFile,
  readBudgetFileContent,
  updateBudgetFileContent,
} from "../utils/googleDrive";
import { signInWithGoogle } from "../lib/auth";
import { computeUpcoming, materializeRule } from "../utils/recurring";
import { getTodayStr } from "../utils/dateUtils";
import { previewImportBatch } from "../utils/importPipeline";

const GOOGLE_ACCESS_TOKEN_KEY = "vibebudgetGoogleAccessToken";
const LOCAL_STATE_KEY = "vibebudgetLocalState";
const TRANSACTIONS_CACHE_KEY_PREFIX = "vb_transactions_cache";
const DEFAULT_BUDGET_FILE_NAME = "budget.json";
const FIRESTORE_BATCH_WRITE_LIMIT = 450;
const LEGACY_CATEGORY_RENAMES: Record<string, string> = {
  "Canada Transfer": "Canada Investments",
  "India Transfer - Self": "India Transfer Investment",
};

const DEFAULT_CATEGORY_NAMES = [
  "Alcohol + Weed",
  "Canada Investments",
  "Car fuel",
  "Car maintenance",
  "Car Parking",
  "Clothing",
  "Donation",
  "Electronics",
  "Entertainment",
  "Gifts",
  "Going out food",
  "Groceries",
  "Household Items",
  "India Transfer - Parents",
  "India Transfer Investment",
  "Insurance",
  "Medical",
  "Misc.",
  "Nagar/Bamor Expenses",
  "Public transportation",
  "Rent",
  "Shopping",
  "Telecom",
  "Travel",
  "Utilities",
];

const DEFAULT_CORE_EXCLUDED = [
  "Canada Investments",
  "India Transfer Investment",
  "India Transfer - Parents",
  "Nagar/Bamor Expenses",
];

const DEFAULT_PREFERENCES: Preferences = {
  baseCurrency: "CAD",
  exchangeRates: [],
  coreExcludedCategories: DEFAULT_CORE_EXCLUDED,
};

const stripUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedFields(item)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefinedFields(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
};

const getIsoNow = () => new Date().toISOString();

const renameLegacyCategory = (name: string) => LEGACY_CATEGORY_RENAMES[name] || name;
const normalizeCategoryName = (name: string) => renameLegacyCategory(name).trim().replace(/\s+/g, " ");
const CANONICAL_EXPENSE_CATEGORY_NAMES = DEFAULT_CATEGORY_NAMES
  .map((name) => normalizeCategoryName(name))
  .sort((a, b) => a.localeCompare(b));
const CANONICAL_EXPENSE_CATEGORY_NAME_SET = new Set(CANONICAL_EXPENSE_CATEGORY_NAMES);
const FALLBACK_EXPENSE_CATEGORY_NAME = "Misc.";

const normalizeExpenseCategoryName = (name: string) => {
  const normalizedName = normalizeCategoryName(name);
  if (CANONICAL_EXPENSE_CATEGORY_NAME_SET.has(normalizedName)) {
    return normalizedName;
  }
  return FALLBACK_EXPENSE_CATEGORY_NAME;
};

const normalizeSheetIdentityText = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const normalizeSheetIdentityAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value || "").replace(/[^-0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hashSheetIdentity = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const makeSheetRowIdentity = (...values: unknown[]) => values
  .map((value) => (typeof value === "number" ? value.toFixed(2) : normalizeSheetIdentityText(value)))
  .join("|");

const dedupeCategoriesByName = <T extends { id: string; name: string; target_amount: number }>(categories: T[]) => {
  const categoriesByName = new Map<string, T>();

  categories.forEach((category) => {
    const normalizedName = normalizeCategoryName(category.name);
    if (!normalizedName) return;

    const existing = categoriesByName.get(normalizedName);
    if (!existing) {
      categoriesByName.set(normalizedName, { ...category, name: normalizedName });
      return;
    }

    if ((existing.target_amount || 0) === 0 && (category.target_amount || 0) !== 0) {
      categoriesByName.set(normalizedName, { ...existing, name: normalizedName, target_amount: category.target_amount });
    }
  });

  return Array.from(categoriesByName.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const createDefaultExpenseCategories = (): ExpenseCategory[] => (
  CANONICAL_EXPENSE_CATEGORY_NAMES.map((name) => ({
    id: crypto.randomUUID(),
    name,
    target_amount: 0,
  }))
);

const migrateExpenseCategories = (categories: ExpenseCategory[]) => (
  (() => {
    const normalizedCategories = dedupeCategoriesByName(
      categories.map((category) => ({
        ...category,
        name: normalizeExpenseCategoryName(category.name),
      }))
    );
    const categoriesByName = new Map(normalizedCategories.map((category) => [category.name, category]));

    return CANONICAL_EXPENSE_CATEGORY_NAMES.map((name) => {
      const existing = categoriesByName.get(name);
      return existing || {
        id: crypto.randomUUID(),
        name,
        target_amount: 0,
      };
    });
  })()
);

const migrateIncomeCategories = (categories: IncomeCategory[]) => (
  dedupeCategoriesByName(
    categories.map((category) => ({
      ...category,
      name: normalizeCategoryName(category.name),
    }))
  )
);

const migrateTransactions = (transactions: Transaction[]) => (
  transactions.map((transaction) => ({
    ...transaction,
    category_name: normalizeExpenseCategoryName(transaction.category_name),
  }))
);

const migrateIncomeRecords = (incomeRecords: Income[]) => (
  incomeRecords.map((record) => ({
    ...record,
    category: normalizeCategoryName(record.category),
  }))
);

const migrateExcludedCategories = (categories?: string[]) => (
  Array.from(new Set((categories || DEFAULT_CORE_EXCLUDED).map(normalizeCategoryName)))
);

const normalizePreferences = (preferences?: Preferences | null): Preferences => ({
  baseCurrency: preferences?.baseCurrency || DEFAULT_PREFERENCES.baseCurrency,
  exchangeRates: Array.isArray(preferences?.exchangeRates) ? preferences!.exchangeRates : [],
  coreExcludedCategories: migrateExcludedCategories(preferences?.coreExcludedCategories),
});

const createIncomeCategoriesFromRecords = (incomeRecords: Income[]): IncomeCategory[] => (
  Array.from(new Set(incomeRecords.map((item) => normalizeCategoryName(item.category)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    }))
);

const resolveIncomeCategories = (
  storedIncomeCategories: IncomeCategory[] | undefined,
  incomeRecords: Income[]
) => {
  if (Array.isArray(storedIncomeCategories) && storedIncomeCategories.length > 0) {
    return migrateIncomeCategories(storedIncomeCategories);
  }
  return createIncomeCategoriesFromRecords(incomeRecords);
};

interface LocalStatePayload {
  categories?: ExpenseCategory[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  transactions: Transaction[];
  income: Income[];
  recurringRules?: RecurringRule[];
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
  driveConnection: DriveConnection | null;
  lastSyncedAt: string | null;
  preferences?: Preferences;
}

const createEmptyLocalState = (): LocalStatePayload => ({
  categories: createDefaultExpenseCategories(),
  expenseCategories: createDefaultExpenseCategories(),
  incomeCategories: [],
  transactions: [],
  income: [],
  recurringRules: [],
  googleSheetsConfig: null,
  driveConnection: null,
  lastSyncedAt: null,
  preferences: DEFAULT_PREFERENCES,
});

const loadLocalState = (): LocalStatePayload => {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) {
    return createEmptyLocalState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalStatePayload>;
    const parsedIncome = Array.isArray(parsed.income) ? migrateIncomeRecords(parsed.income) : [];
    const parsedExpenseCategories =
      Array.isArray(parsed.expenseCategories) && parsed.expenseCategories.length > 0
        ? migrateExpenseCategories(parsed.expenseCategories)
        : Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? migrateExpenseCategories(parsed.categories)
          : createDefaultExpenseCategories();
    const parsedTransactions = Array.isArray(parsed.transactions) ? migrateTransactions(parsed.transactions) : [];

    return {
      transactions: parsedTransactions,
      income: parsedIncome,
      recurringRules: Array.isArray(parsed.recurringRules) ? parsed.recurringRules : [],
      expenseCategories: parsedExpenseCategories,
      incomeCategories: resolveIncomeCategories(parsed.incomeCategories, parsedIncome),
      googleSheetsConfig: parsed.googleSheetsConfig || null,
      driveConnection: parsed.driveConnection || null,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      preferences: normalizePreferences(parsed.preferences),
    };
  } catch {
    return createEmptyLocalState();
  }
};

const clearLocalState = () => {
  localStorage.removeItem(LOCAL_STATE_KEY);
};

const getTransactionsCacheKey = (uid: string) => `${TRANSACTIONS_CACHE_KEY_PREFIX}:${uid}`;

const loadTransactionsCache = (uid: string): Transaction[] => {
  const raw = localStorage.getItem(getTransactionsCacheKey(uid));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? migrateTransactions(parsed as Transaction[]) : [];
  } catch {
    return [];
  }
};

const saveTransactionsCache = (uid: string, items: Transaction[]) => {
  localStorage.setItem(getTransactionsCacheKey(uid), JSON.stringify(items));
};

const clearTransactionsCache = (uid: string) => {
  localStorage.removeItem(getTransactionsCacheKey(uid));
};

interface UserProfileDocument {
  budgetId: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  preferences?: Preferences;
  googleSheetsConfig?: GoogleSheetsSyncConfig | null;
  driveConnection?: DriveConnection | null;
  plaidConnection?: PlaidConnection | null;
  plaidCategoryMappings?: PlaidCategoryMapping[];
  tellerConnection?: TellerConnection | null;
  tellerCategoryMappings?: TellerCategoryMapping[];
  lastSyncedAt?: string | null;
  aiConfig?: AiProviderConfig | null;
}

export interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  budgetId: string | null;
  ownerEmail: string | null;
  sharedUsers: string[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  categories: Category[];
  transactions: Transaction[];
  income: Income[];
  recurringRules: RecurringRule[];
  preferences: Preferences;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  addTransaction: (data: Omit<Transaction, "id">) => Promise<void>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addIncome: (data: Omit<Income, "id">) => Promise<void>;
  updateIncome: (id: string, data: Partial<Income>) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  createRecurringRule: (data: Omit<RecurringRule, "id" | "uid" | "created_at" | "updated_at" | "frequency">) => Promise<string>;
  updateRecurringRule: (id: string, data: Partial<Pick<RecurringRule, "is_active" | "end_date" | "amount" | "notes">>) => Promise<void>;
  deleteRecurringRule: (id: string) => Promise<void>;
  generateRecurringTransactions: () => Promise<{ generated: number; skipped: number }>;
  getUpcomingRecurring: (days?: number) => UpcomingRecurringInstance[];
  updateExpenseCategoryTarget: (id: string, target: number) => Promise<void>;
  updateIncomeCategoryTarget: (id: string, target: number) => Promise<void>;
  updateCategoryTarget: (id: string, target: number) => Promise<void>;
  previewImport: (source: ImportSource, payload: string | unknown[] | Record<string, unknown>, options?: ImportPreviewOptions) => ImportBatch;
  commitImport: (batch: ImportBatch, options?: ImportCommitOptions, onProgress?: (current: number, total: number) => void) => Promise<ImportCommitSummary>;
  importData: (type: string, data: any[], isUpsert?: boolean, onProgress?: (current: number, total: number) => void) => Promise<void>;
  upsertGoogleSheetRows: (type: "expenses" | "income", rows: any[]) => Promise<{ imported: number; updated: number; skipped: number }>;
  wipeData: (type: string) => Promise<void>;
  backupToDrive: () => Promise<void>;
  syncToCloud: () => Promise<void>;
  shareBudget: (email: string) => Promise<void>;
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
  googleSheetsConnected: boolean;
  googleSheetsSyncing: boolean;
  googleSheetsError: string | null;
  connectGoogleSheets: () => Promise<void>;
  disconnectGoogleSheets: () => void;
  inspectGoogleSheetsSpreadsheet: (
    spreadsheetUrl: string,
    expensesSheetName: string,
    incomeSheetName: string,
    expenseCategoriesSheetName?: string,
    incomeCategoriesSheetName?: string
  ) => Promise<GoogleSheetsInspectionResult>;
  previewGoogleSheetColumn: (
    spreadsheetUrl: string,
    sheetName: string,
    startCell: string,
    endCell: string | null,
    noEndRange: boolean
  ) => Promise<{
    headerValue: string;
    samples: Array<{ cell: string; value: string }>;
    last: { cell: string; value: string } | null;
  }>;
  saveGoogleSheetsConfig: (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => Promise<void>;
  syncGoogleSheets: (direction?: GoogleSheetsSyncDirection, options?: GoogleSheetsSyncOptions) => Promise<GooglePullSummary | void>;
  validateGoogleSheetsMapping: () => { valid: boolean; missing: string[] };
  googlePullSummary: GooglePullSummary | null;
  backingUp: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  driveConnection: DriveConnection | null;
  driveConnected: boolean;
  driveSyncError: string | null;
  connectDriveFolder: (folderRef?: string) => Promise<void>;
  previewBudgetFromDrive: () => Promise<ImportBatch>;
  loadBudgetFromDrive: () => Promise<void>;
  disconnectDriveFolder: () => void;
  googleSheetsAccessToken: string | null;

  // Plaid
  plaidConnected: boolean;
  plaidConnection: PlaidConnection | null;
  plaidSyncing: boolean;
  plaidError: string | null;
  plaidCredentials: PlaidCredentials | null;
  plaidCategoryMappings: PlaidCategoryMapping[];
  connectPlaid: (publicToken: string) => Promise<void>;
  disconnectPlaid: () => Promise<void>;
  syncPlaidTransactions: () => Promise<ImportCommitSummary>;
  fetchPlaidAccounts: () => Promise<import("../types").PlaidAccount[]>;
  setPlaidCredentials: (creds: PlaidCredentials | null) => void;
  setPlaidCategoryMappings: (mappings: PlaidCategoryMapping[]) => void;

  // Teller
  tellerConnected: boolean;
  tellerConnection: TellerConnection | null;
  tellerSyncing: boolean;
  tellerError: string | null;
  tellerCredentials: TellerCredentials | null;
  tellerCategoryMappings: TellerCategoryMapping[];
  connectTeller: (enrollment: import("../types").TellerEnrollment) => Promise<void>;
  disconnectTeller: () => Promise<void>;
  syncTellerTransactions: () => Promise<ImportCommitSummary>;
  fetchTellerAccounts: () => Promise<import("../types").TellerAccount[]>;
  setTellerCredentials: (creds: TellerCredentials | null) => void;
  setTellerCategoryMappings: (mappings: TellerCategoryMapping[]) => void;

  // AI
  aiConfig: AiProviderConfig | null;
  saveAiConfig: (config: AiProviderConfig | null) => Promise<void>;
}

export const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

const isSameAsDefaultPreferences = (preferences: Preferences) => (
  JSON.stringify(normalizePreferences(preferences)) === JSON.stringify(DEFAULT_PREFERENCES)
);

const hasMeaningfulLocalData = (payload: LocalStatePayload) => (
  payload.transactions.length > 0 ||
  payload.income.length > 0 ||
  (payload.recurringRules?.length || 0) > 0 ||
  payload.incomeCategories.length > 0 ||
  payload.googleSheetsConfig !== null ||
  payload.driveConnection !== null ||
  payload.lastSyncedAt !== null ||
  !isSameAsDefaultPreferences(normalizePreferences(payload.preferences))
);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocalState = useMemo(loadLocalState, []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(createDefaultExpenseCategories());
  const [incomeCategories, setIncomeCategories] = useState<IncomeCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(null);
  const [driveConnection, setDriveConnection] = useState<DriveConnection | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [googleSheetsAccessToken, setGoogleSheetsAccessToken] = useState<string | null>(
    localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY) || sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)
  );
  const [googleSheetsSyncing, setGoogleSheetsSyncing] = useState(false);
  const [googlePullSummary, setGooglePullSummary] = useState<GooglePullSummary | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Plaid state
  const [plaidConnection, setPlaidConnection] = useState<PlaidConnection | null>(null);
  const [plaidSyncing, setPlaidSyncing] = useState(false);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidCredentials, setPlaidCredentials] = useState<PlaidCredentials | null>(() => {
    const raw = sessionStorage.getItem("vibebudgetPlaidCredentials");
    if (!raw) return null;
    try { return JSON.parse(raw) as PlaidCredentials; } catch { return null; }
  });
  const [plaidCategoryMappings, setPlaidCategoryMappings] = useState<PlaidCategoryMapping[]>([]);

  // Teller state
  const [tellerConnection, setTellerConnection] = useState<TellerConnection | null>(null);
  const [tellerSyncing, setTellerSyncing] = useState(false);
  const [tellerError, setTellerError] = useState<string | null>(null);
  const [tellerCredentials, setTellerCredentials] = useState<TellerCredentials | null>(() => {
    const raw = sessionStorage.getItem("vibebudgetTellerCredentials");
    if (!raw) return null;
    try { return JSON.parse(raw) as TellerCredentials; } catch { return null; }
  });
  const [tellerCategoryMappings, setTellerCategoryMappings] = useState<TellerCategoryMapping[]>([]);

  const expenseCategoriesRef = useRef(expenseCategories);
  const incomeCategoriesRef = useRef(incomeCategories);
  const transactionsRef = useRef(transactions);
  const incomeRef = useRef(income);
  const recurringRulesRef = useRef(recurringRules);
  const preferencesRef = useRef(preferences);
  const sheetsConfigRef = useRef(googleSheetsConfig);
  const driveConnectionRef = useRef(driveConnection);
  const autoSaveTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const loadingDriveRef = useRef(false);
  const seededUsersRef = useRef<Set<string>>(new Set());
  const pendingImportRef = useRef<{
    expenseCategories: number;
    incomeCategories: number;
    transactions: number;
    income: number;
  } | null>(null);

  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);
  useEffect(() => { incomeCategoriesRef.current = incomeCategories; }, [incomeCategories]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { incomeRef.current = income; }, [income]);
  useEffect(() => { recurringRulesRef.current = recurringRules; }, [recurringRules]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { sheetsConfigRef.current = googleSheetsConfig; }, [googleSheetsConfig]);
  useEffect(() => { driveConnectionRef.current = driveConnection; }, [driveConnection]);
  useEffect(() => {
    if (plaidCredentials) {
      sessionStorage.setItem("vibebudgetPlaidCredentials", JSON.stringify(plaidCredentials));
    } else {
      sessionStorage.removeItem("vibebudgetPlaidCredentials");
    }
  }, [plaidCredentials]);

  useEffect(() => {
    if (tellerCredentials) {
      sessionStorage.setItem("vibebudgetTellerCredentials", JSON.stringify(tellerCredentials));
    } else {
      sessionStorage.removeItem("vibebudgetTellerCredentials");
    }
  }, [tellerCredentials]);

  const resetBudgetState = useCallback(() => {
    const defaults = createEmptyLocalState();
    setBudgetId(null);
    setExpenseCategories(defaults.expenseCategories);
    setIncomeCategories(defaults.incomeCategories);
    setTransactions(defaults.transactions);
    setIncome(defaults.income);
    setRecurringRules(defaults.recurringRules || []);
    setPreferences(DEFAULT_PREFERENCES);
    setGoogleSheetsConfig(null);
    setDriveConnection(null);
    setLastSynced(null);
    setAuthError(null);
    setGoogleSheetsError(null);
    setDriveSyncError(null);
    setPlaidConnection(null);
    setPlaidSyncing(false);
    setPlaidError(null);
    setPlaidCredentials(null);
    setPlaidCategoryMappings([]);
  }, []);

  const formatAuthBootstrapError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "");
    const normalized = message.toLowerCase();

    if (
      normalized.includes("missing or insufficient permissions")
      || normalized.includes("permission-denied")
      || normalized.includes("insufficient permissions")
    ) {
      return "Google sign-in worked, but Firestore denied access. Publish Firestore rules for authenticated users, then try again.";
    }

    return message || "Unable to load your account data from Firestore.";
  };

  const getUserDocRef = useCallback(
    (uid: string) => doc(db, "environments", firebaseDataNamespace, "users", uid),
    []
  );
  const getExpenseCategoriesCollection = useCallback(
    (uid: string) => collection(db, "environments", firebaseDataNamespace, "users", uid, "categories"),
    []
  );
  const getIncomeCategoriesCollection = useCallback(
    (uid: string) => collection(db, "environments", firebaseDataNamespace, "users", uid, "incomeCategories"),
    []
  );
  const getTransactionsCollection = useCallback(
    (uid: string) => collection(db, "environments", firebaseDataNamespace, "users", uid, "transactions"),
    []
  );
  const getIncomeCollection = useCallback(
    (uid: string) => collection(db, "environments", firebaseDataNamespace, "users", uid, "income"),
    []
  );
  const getRecurringRulesCollection = useCallback(
    (uid: string) => collection(db, "environments", firebaseDataNamespace, "users", uid, "recurring_rules"),
    []
  );

  const storeAccessToken = (token: string | null) => {
    setGoogleSheetsAccessToken(token);
    if (token) {
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
      sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  };

  useEffect(() => {
    const payload: LocalStatePayload = {
      expenseCategories,
      incomeCategories,
      transactions,
      income,
      recurringRules,
      googleSheetsConfig,
      driveConnection,
      lastSyncedAt: lastSynced ? lastSynced.toISOString() : null,
      preferences: normalizePreferences(preferences),
    };
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(payload));
  }, [
    driveConnection,
    expenseCategories,
    googleSheetsConfig,
    income,
    incomeCategories,
    lastSynced,
    preferences,
    recurringRules,
    transactions,
  ]);

  const saveUserProfilePatch = useCallback(async (patch: Partial<UserProfileDocument>) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const currentUser = auth.currentUser;
    await setDoc(
      getUserDocRef(currentUser.uid),
      stripUndefinedFields({
        budgetId: currentUser.uid,
        email: currentUser.email || "",
        displayName: currentUser.displayName || null,
        photoURL: currentUser.photoURL || null,
        ...patch,
      }),
      { merge: true }
    );
  }, [getUserDocRef]);

  const seedUserFromLocalState = useCallback(async (nextUser: User) => {
    if (seededUsersRef.current.has(nextUser.uid)) {
      return;
    }
    seededUsersRef.current.add(nextUser.uid);

    const localState = initialLocalState;
    const batch = writeBatch(db);

    batch.set(getUserDocRef(nextUser.uid), {
      budgetId: nextUser.uid,
      email: nextUser.email || "",
      displayName: nextUser.displayName || null,
      photoURL: nextUser.photoURL || null,
      preferences: normalizePreferences(localState.preferences),
      googleSheetsConfig: localState.googleSheetsConfig,
      driveConnection: localState.driveConnection,
      lastSyncedAt: localState.lastSyncedAt,
    } satisfies UserProfileDocument);

    const categoriesToSeed =
      hasMeaningfulLocalData(localState) || localState.expenseCategories.length > 0
        ? localState.expenseCategories
        : createDefaultExpenseCategories();

    categoriesToSeed.forEach((category) => {
      batch.set(doc(getExpenseCategoriesCollection(nextUser.uid), category.id), category);
    });
    migrateIncomeCategories(localState.incomeCategories).forEach((category) => {
      batch.set(doc(getIncomeCategoriesCollection(nextUser.uid), category.id), category);
    });
    localState.transactions.forEach((transaction) => {
      batch.set(doc(getTransactionsCollection(nextUser.uid), transaction.id), transaction);
    });
    localState.income.forEach((item) => {
      batch.set(doc(getIncomeCollection(nextUser.uid), item.id), item);
    });
    (localState.recurringRules || []).forEach((rule) => {
      batch.set(doc(getRecurringRulesCollection(nextUser.uid), rule.id), rule);
    });

    await batch.commit();
    clearLocalState();
  }, [
    getExpenseCategoriesCollection,
    getIncomeCategoriesCollection,
    getIncomeCollection,
    getRecurringRulesCollection,
    getTransactionsCollection,
    getUserDocRef,
    initialLocalState,
  ]);

  const replaceCollection = useCallback(async <T extends { id: string }>(
    collectionRef: CollectionReference<DocumentData>,
    items: T[],
    existingIds: string[],
  ) => {
    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    existingIds.forEach((existingId) => {
      operations.push((batch) => {
        batch.delete(doc(collectionRef, existingId));
      });
    });
    items.forEach((item) => {
      operations.push((batch) => {
        batch.set(doc(collectionRef, item.id), item);
      });
    });

    for (let index = 0; index < operations.length; index += FIRESTORE_BATCH_WRITE_LIMIT) {
      const batch = writeBatch(db);
      operations
        .slice(index, index + FIRESTORE_BATCH_WRITE_LIMIT)
        .forEach((runOperation) => runOperation(batch));
      await batch.commit();
    }
  }, []);

  const replaceBudgetDataInFirestore = useCallback(async (payload: {
    nextExpenseCategories: ExpenseCategory[];
    nextIncomeCategories: IncomeCategory[];
    nextTransactions: Transaction[];
    nextIncome: Income[];
    nextPreferences: Preferences;
    nextSheetsConfig: GoogleSheetsSyncConfig | null;
    nextDriveConnection: DriveConnection | null;
    nextLastSynced: Date | null;
  }) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const uid = auth.currentUser.uid;
    await Promise.all([
      replaceCollection(
        getExpenseCategoriesCollection(uid),
        payload.nextExpenseCategories,
        expenseCategoriesRef.current.map((item) => item.id),
      ),
      replaceCollection(
        getIncomeCategoriesCollection(uid),
        payload.nextIncomeCategories,
        incomeCategoriesRef.current.map((item) => item.id),
      ),
      replaceCollection(
        getTransactionsCollection(uid),
        payload.nextTransactions,
        transactionsRef.current.map((item) => item.id),
      ),
      replaceCollection(
        getIncomeCollection(uid),
        payload.nextIncome,
        incomeRef.current.map((item) => item.id),
      ),
      saveUserProfilePatch({
        preferences: normalizePreferences(payload.nextPreferences),
        googleSheetsConfig: payload.nextSheetsConfig,
        driveConnection: payload.nextDriveConnection,
        lastSyncedAt: payload.nextLastSynced ? payload.nextLastSynced.toISOString() : null,
      }),
    ]);
  }, [
    getExpenseCategoriesCollection,
    getIncomeCategoriesCollection,
    getIncomeCollection,
    getTransactionsCollection,
    replaceCollection,
    saveUserProfilePatch,
  ]);

  const beginGoogleAuth = async (withDriveScopes = false) => {
    const provider = withDriveScopes ? googleDriveProvider : googleProvider;

    if (!withDriveScopes) {
      await signInWithGoogle(auth, provider);
      return;
    }

    try {
      const result = await signInWithGoogle(auth, provider);
      if (!result) return;
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (withDriveScopes && credential?.accessToken) {
        storeAccessToken(credential.accessToken);
      }
      return;
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    const consumeRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        const credential = result?.providerId === GoogleAuthProvider.PROVIDER_ID
          ? GoogleAuthProvider.credentialFromResult(result)
          : null;
        if (credential?.accessToken) {
          storeAccessToken(credential.accessToken);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google authentication failed.";
        setGoogleSheetsError(message);
        setDriveSyncError(message);
      }
    };

    void consumeRedirect();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        resetBudgetState();
        setLoading(false);
        return;
      }

      setBudgetId(nextUser.uid);
      setAuthError(null);
      const cachedTransactions = loadTransactionsCache(nextUser.uid);
      if (cachedTransactions.length > 0) {
        setTransactions(cachedTransactions);
      }
      setLoading(true);
    });

    return unsubscribe;
  }, [resetBudgetState]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const uid = user.uid;
    const loadedState = {
      profile: false,
      categories: false,
      incomeCategories: false,
      transactions: false,
      income: false,
      recurringRules: false,
    };
    const remotePresence = {
      profile: false,
      categories: false,
      incomeCategories: false,
      transactions: false,
      income: false,
      recurringRules: false,
    };
    let seedingStarted = false;

    const markLoaded = () => {
      if (Object.values(loadedState).every(Boolean)) {
        setAuthError(null);
        setLoading(false);

        const hasRemoteData = Object.values(remotePresence).some(Boolean);
        if (!hasRemoteData && !seedingStarted) {
          seedingStarted = true;
          void seedUserFromLocalState(user).catch((error) => {
            console.error("Failed to seed local state into Firestore", error);
            setAuthError(formatAuthBootstrapError(error));
          });
        } else if (hasRemoteData) {
          clearLocalState();
        }
      }
    };

    const handleSnapshotError = (scope: string, error: unknown) => {
      console.error(`Firestore ${scope} listener failed`, error);
      setAuthError(formatAuthBootstrapError(error));
      setLoading(false);
    };

    const unsubscribers: Unsubscribe[] = [];

    unsubscribers.push(onSnapshot(
      getUserDocRef(uid),
      (snapshot) => {
        const data = snapshot.data() as UserProfileDocument | undefined;
        remotePresence.profile = snapshot.exists();
        setPreferences(normalizePreferences(data?.preferences));
        setGoogleSheetsConfig(data?.googleSheetsConfig || null);
        setDriveConnection(data?.driveConnection || null);
        setPlaidConnection(data?.plaidConnection || null);
        setPlaidCategoryMappings(Array.isArray(data?.plaidCategoryMappings) ? data.plaidCategoryMappings : []);
        setTellerConnection(data?.tellerConnection || null);
        setTellerCategoryMappings(Array.isArray(data?.tellerCategoryMappings) ? data.tellerCategoryMappings : []);
        setLastSynced(data?.lastSyncedAt ? new Date(data.lastSyncedAt) : null);
        setAiConfig(data?.aiConfig || null);
        loadedState.profile = true;
        markLoaded();
      },
      (error) => handleSnapshotError("profile", error)
    ));

    unsubscribers.push(onSnapshot(
      getExpenseCategoriesCollection(uid),
      (snapshot) => {
        const nextCategories = snapshot.docs.map((item) => item.data() as ExpenseCategory);
        if (pendingImportRef.current && nextCategories.length < pendingImportRef.current.expenseCategories) {
          loadedState.categories = true;
          markLoaded();
          return;
        }
        remotePresence.categories = nextCategories.length > 0;
        setExpenseCategories(nextCategories.length > 0 ? migrateExpenseCategories(nextCategories) : createDefaultExpenseCategories());
        loadedState.categories = true;
        markLoaded();
      },
      (error) => handleSnapshotError("categories", error)
    ));

    unsubscribers.push(onSnapshot(
      getIncomeCategoriesCollection(uid),
      (snapshot) => {
        const nextIncomeCategories = snapshot.docs.map((item) => item.data() as IncomeCategory);
        if (pendingImportRef.current && nextIncomeCategories.length < pendingImportRef.current.incomeCategories) {
          loadedState.incomeCategories = true;
          markLoaded();
          return;
        }
        remotePresence.incomeCategories = nextIncomeCategories.length > 0;
        setIncomeCategories(migrateIncomeCategories(nextIncomeCategories));
        loadedState.incomeCategories = true;
        markLoaded();
      },
      (error) => handleSnapshotError("income categories", error)
    ));

    unsubscribers.push(onSnapshot(
      getTransactionsCollection(uid),
      (snapshot) => {
        const nextTransactions = migrateTransactions(snapshot.docs.map((item) => item.data() as Transaction));
        if (pendingImportRef.current && nextTransactions.length < pendingImportRef.current.transactions) {
          loadedState.transactions = true;
          markLoaded();
          return;
        }
        remotePresence.transactions = nextTransactions.length > 0;
        setTransactions(nextTransactions);
        saveTransactionsCache(uid, nextTransactions);
        loadedState.transactions = true;
        markLoaded();
      },
      (error) => handleSnapshotError("transactions", error)
    ));

    unsubscribers.push(onSnapshot(
      getIncomeCollection(uid),
      (snapshot) => {
        const nextIncome = migrateIncomeRecords(snapshot.docs.map((item) => item.data() as Income));
        if (pendingImportRef.current && nextIncome.length < pendingImportRef.current.income) {
          loadedState.income = true;
          markLoaded();
          return;
        }
        remotePresence.income = nextIncome.length > 0;
        setIncome(nextIncome);
        loadedState.income = true;
        markLoaded();
      },
      (error) => handleSnapshotError("income", error)
    ));

    unsubscribers.push(onSnapshot(
      getRecurringRulesCollection(uid),
      (snapshot) => {
        const nextRecurringRules = snapshot.docs.map((item) => item.data() as RecurringRule);
        remotePresence.recurringRules = nextRecurringRules.length > 0;
        setRecurringRules(nextRecurringRules);
        loadedState.recurringRules = true;
        markLoaded();
      },
      (error) => handleSnapshotError("recurring rules", error)
    ));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    getExpenseCategoriesCollection,
    getIncomeCategoriesCollection,
    getIncomeCollection,
    getRecurringRulesCollection,
    getTransactionsCollection,
    getUserDocRef,
    seedUserFromLocalState,
    user,
  ]);

  const ensureSignedInWithDriveScopes = async () => {
    if (!user || !googleSheetsAccessToken) {
      await beginGoogleAuth(true);
      throw new Error("Redirecting to Google to authorize Drive access.");
    }
  };

  const updatePreferences = async (prefs: Partial<Preferences>) => {
    const nextPreferences = {
      ...preferencesRef.current,
      ...prefs,
      coreExcludedCategories: prefs.coreExcludedCategories
        ? migrateExcludedCategories(prefs.coreExcludedCategories)
        : preferencesRef.current.coreExcludedCategories,
    };
    await saveUserProfilePatch({ preferences: normalizePreferences(nextPreferences) });
  };

  const saveBudgetToDrive = async () => {
    const token = googleSheetsAccessToken;
    const currentConnection = driveConnectionRef.current;
    if (!token || !currentConnection) {
      throw new Error("Connect your VibeBudget Drive folder first.");
    }

    const payload = createBudgetDataFile(
      expenseCategoriesRef.current,
      incomeCategoriesRef.current,
      transactionsRef.current,
      incomeRef.current,
      sheetsConfigRef.current
    );
    const content = JSON.stringify(payload, null, 2);

    const ensuredFile = await ensureBudgetFile(token, currentConnection, content);
    const nextConnection: DriveConnection = {
      ...currentConnection,
      budgetFileId: ensuredFile.fileId,
      budgetFileName: ensuredFile.fileName,
      lastMirrorAt: getIsoNow(),
      lastError: null,
    };

    await updateBudgetFileContent(token, ensuredFile.fileId, content);
    const syncedAt = new Date();
    await saveUserProfilePatch({
      driveConnection: nextConnection,
      lastSyncedAt: syncedAt.toISOString(),
    });
    setDriveSyncError(null);
  };

  const loadBudgetFromDrive = async () => {
    const token = googleSheetsAccessToken;
    const currentConnection = driveConnectionRef.current;
    if (!token || !currentConnection?.budgetFileId) {
      throw new Error("No Drive budget file connected yet.");
    }

    setIsSyncing(true);
    loadingDriveRef.current = true;
    try {
      const raw = await readBudgetFileContent(token, currentConnection.budgetFileId);
      const parsed = parseBudgetDataFile(raw);
      await replaceBudgetDataInFirestore({
        nextExpenseCategories: parsed.expenseCategories.length > 0 ? parsed.expenseCategories : createDefaultExpenseCategories(),
        nextIncomeCategories: parsed.incomeCategories,
        nextTransactions: parsed.transactions,
        nextIncome: parsed.income,
        nextPreferences: preferencesRef.current,
        nextSheetsConfig: parsed.googleSheetsConfig,
        nextDriveConnection: {
          ...currentConnection,
          lastRestoreAt: getIsoNow(),
          lastError: null,
        },
        nextLastSynced: new Date(),
      });
      setDriveSyncError(null);
    } finally {
      loadingDriveRef.current = false;
      setIsSyncing(false);
    }
  };

  const previewBudgetFromDrive = async () => {
    const token = googleSheetsAccessToken;
    const currentConnection = driveConnectionRef.current;
    if (!token || !currentConnection?.budgetFileId) {
      throw new Error("No Drive budget file connected yet.");
    }

    const raw = await readBudgetFileContent(token, currentConnection.budgetFileId);
    return previewImport("manual_backup", raw, {});
  };

  const connectDriveFolder = async (folderRef?: string) => {
    await ensureSignedInWithDriveScopes();
    const token = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    if (!token) return;

    setIsSyncing(true);
    try {
      const folder = await ensureVibeBudgetFolder(token, folderRef);
      const payload = createBudgetDataFile(
        expenseCategoriesRef.current,
        incomeCategoriesRef.current,
        transactionsRef.current,
        incomeRef.current,
        sheetsConfigRef.current
      );
      const budgetFile = await ensureBudgetFile(
        token,
        { folderId: folder.folderId, budgetFileName: DEFAULT_BUDGET_FILE_NAME },
        JSON.stringify(payload, null, 2)
      );

      const nextConnection: DriveConnection = {
        folderId: folder.folderId,
        folderName: folder.folderName,
        folderUrl: folder.folderUrl,
        budgetFileId: budgetFile.fileId,
        budgetFileName: budgetFile.fileName,
        connectedAt: getIsoNow(),
        lastMirrorAt: null,
        lastRestoreAt: null,
        lastError: null,
      };

      await saveUserProfilePatch({ driveConnection: nextConnection });
      setDriveSyncError(null);

      try {
        await loadBudgetFromDrive();
      } catch {
        await saveBudgetToDrive();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const disconnectDriveFolder = () => {
    void saveUserProfilePatch({ driveConnection: null });
    setDriveSyncError(null);
  };

  useEffect(() => {
    if (!googleSheetsAccessToken || !driveConnection || loadingDriveRef.current) {
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      setBackingUp(true);
      void saveBudgetToDrive()
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Failed to save budget.json to Drive.";
          setDriveSyncError(message);
          if (driveConnectionRef.current) {
            void saveUserProfilePatch({
              driveConnection: {
                ...driveConnectionRef.current,
                lastError: message,
              },
            });
          }
        })
        .finally(() => {
          setBackingUp(false);
        });
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [driveConnection, expenseCategories, googleSheetsAccessToken, googleSheetsConfig, income, incomeCategories, transactions]);

  const inspectGoogleSheetsSpreadsheet = async (
    spreadsheetUrl: string,
    expensesSheetName: string,
    incomeSheetName: string,
    expenseCategoriesSheetName?: string,
    incomeCategoriesSheetName?: string
  ) => {
    if (!googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }

    return inspectSpreadsheet(
      googleSheetsAccessToken,
      spreadsheetUrl,
      expensesSheetName,
      incomeSheetName,
      expenseCategoriesSheetName,
      incomeCategoriesSheetName
    );
  };

  const previewGoogleSheetColumn = async (
    spreadsheetUrl: string,
    sheetName: string,
    startCell: string,
    endCell: string | null,
    noEndRange: boolean
  ) => {
    if (!googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }
    const spreadsheetId = parseSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      throw new Error("Invalid spreadsheet URL.");
    }
    const start = parseA1CellReference(startCell);
    if (!start) {
      throw new Error("Invalid start cell.");
    }

    const toColumnLabel = (columnIndex: number) => {
      let n = columnIndex + 1;
      let result = "";
      while (n > 0) {
        const rem = (n - 1) % 26;
        result = String.fromCharCode(65 + rem) + result;
        n = Math.floor((n - 1) / 26);
      }
      return result;
    };
    const col = toColumnLabel(start.columnIndex);

    if (noEndRange) {
      const headerRange = `'${sheetName.replace(/'/g, "''")}'!${start.cellRef}:${start.cellRef}`;
      const headerResponse = await getSheetValues(googleSheetsAccessToken, spreadsheetId, headerRange);
      const headerValue = headerResponse.values?.[0]?.[0] || "";
      const values = await getSheetColumnValuesUntilEmptyRun(
        googleSheetsAccessToken,
        spreadsheetId,
        sheetName,
        start.columnIndex,
        start.rowIndex + 1,
      );
      const samples = values.slice(0, 3).map((value, index) => ({
        cell: `${col}${start.rowIndex + 1 + index}`,
        value,
      }));
      const lastIndex = values.length - 1;
      const last = lastIndex >= 0
        ? { cell: `${col}${start.rowIndex + 1 + lastIndex}`, value: values[lastIndex] || "" }
        : null;
      return { headerValue, samples, last };
    }

    const end = endCell ? parseA1CellReference(endCell) : null;
    if (!end) {
      return { headerValue: "", samples: [], last: null };
    }
    const range = `'${sheetName.replace(/'/g, "''")}'!${start.cellRef}:${end.cellRef}`;
    const response = await getSheetValues(googleSheetsAccessToken, spreadsheetId, range);
    const rows = response.values || [];
    const headerValue = rows[0]?.[0] || "";
    const flattened: Array<{ rowIndex: number; colIndex: number; value: string }> = [];
    rows.forEach((row, rowOffset) => {
      // Start-cell row is the header row; preview samples should begin from the next row.
      if (rowOffset === 0) return;
      row.forEach((rawValue, colOffset) => {
        const value = String(rawValue || "");
        if (value.trim().length === 0) return;
        flattened.push({
          rowIndex: start.rowIndex + rowOffset,
          colIndex: start.columnIndex + colOffset,
          value,
        });
      });
    });

    const samples = flattened
      .slice(0, 3)
      .map((entry) => ({
        cell: `${toColumnLabel(entry.colIndex)}${entry.rowIndex}`,
        value: entry.value,
      }));

    const lastEntry = flattened.length > 0 ? flattened[flattened.length - 1] : null;
    const last = lastEntry
      ? { cell: `${toColumnLabel(lastEntry.colIndex)}${lastEntry.rowIndex}`, value: lastEntry.value }
      : null;
    return { headerValue, samples, last };
  };

  const connectGoogleSheets = async () => {
    await ensureSignedInWithDriveScopes();
  };

  const disconnectGoogleSheets = () => {
    storeAccessToken(null);
    setGoogleSheetsError(null);
  };

  const saveGoogleSheetsConfig = async (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => {
    if (!user) {
      throw new Error("Sign in with Google first.");
    }

    const prevVersion = sheetsConfigRef.current?.mappingVersion || 0;

    const payload: GoogleSheetsSyncConfig = {
      ...config,
      mappingSavedAt: getIsoNow(),
      mappingVersion: prevVersion + 1,
      incrementalCursor: sheetsConfigRef.current?.incrementalCursor || config.incrementalCursor,
      lastPullSummary: sheetsConfigRef.current?.lastPullSummary || config.lastPullSummary || null,
      connectedAt: sheetsConfigRef.current?.connectedAt || getIsoNow(),
      connectedBy: user.email || user.uid,
      lastError: null,
      lastSyncedAt: sheetsConfigRef.current?.lastSyncedAt || null,
      lastPullAt: sheetsConfigRef.current?.lastPullAt || null,
      lastPushAt: sheetsConfigRef.current?.lastPushAt || null,
    };

    await saveUserProfilePatch({ googleSheetsConfig: payload });
    setGoogleSheetsConfig(payload);
    setGoogleSheetsError(null);
  };

  /** Migrate legacy localStorage mapping to Firestore if Firestore config is missing */
  const migrateLocalStorageMappings = useCallback(async () => {
    if (!user || googleSheetsConfig) return; // Already have Firestore config

    const legacyKeys = ["googleSheetImport_expenses", "googleSheetImport_income", "googleSheetImport_shared"];
    const hasLegacy = legacyKeys.some((key) => localStorage.getItem(key));
    if (!hasLegacy) return;

    try {
      const sharedRaw = localStorage.getItem("googleSheetImport_shared");
      const shared = sharedRaw ? JSON.parse(sharedRaw) as { sheetUrl?: string; spreadsheetId?: string } : null;
      if (!shared?.sheetUrl) return;

      const expensesRaw = localStorage.getItem("googleSheetImport_expenses");
      const incomeRaw = localStorage.getItem("googleSheetImport_income");
      const expensesConfig = expensesRaw ? JSON.parse(expensesRaw) as { sheetTabName?: string; mapping?: Record<string, unknown> } : null;
      const incomeConfig = incomeRaw ? JSON.parse(incomeRaw) as { sheetTabName?: string; mapping?: Record<string, unknown> } : null;

      const config: GoogleSheetsSyncConfig = {
        spreadsheetId: shared.spreadsheetId || "",
        spreadsheetUrl: shared.sheetUrl,
        spreadsheetTitle: "Migrated from localStorage",
        expensesSheetName: expensesConfig?.sheetTabName || "Expenses",
        incomeSheetName: incomeConfig?.sheetTabName || "Income",
        expenseMapping: {
          date: "Date",
          vendor: "Vendor",
          amount: "Amount",
          category: "Category",
          notes: "Notes",
          id: "VibeBudget ID",
          updatedAt: "Updated At",
        },
        incomeMapping: {
          date: "Date",
          source: "Source",
          amount: "Amount",
          category: "Category",
          notes: "Notes",
          id: "VibeBudget ID",
          updatedAt: "Updated At",
        },
        autoSync: false,
        syncIntervalSeconds: 30,
        connectedAt: getIsoNow(),
        connectedBy: user.email || user.uid,
        mappingSavedAt: getIsoNow(),
        mappingVersion: 1,
        lastError: null,
      };

      await saveUserProfilePatch({ googleSheetsConfig: config });
      setGoogleSheetsConfig(config);
      // Mark as migrated by removing legacy keys
      legacyKeys.forEach((key) => localStorage.removeItem(key));
      console.log("Migrated legacy localStorage Google Sheets mapping to Firestore");
    } catch (error) {
      console.error("Failed to migrate legacy localStorage mapping", error);
    }
  }, [user, googleSheetsConfig, saveUserProfilePatch]);

  const saveAiConfigFn = useCallback(async (config: AiProviderConfig | null) => {
    if (!user) throw new Error("Sign in with Google first.");
    await saveUserProfilePatch({ aiConfig: config });
    setAiConfig(config);
  }, [user, saveUserProfilePatch]);

  const ensureExpenseCategoryId = async (name: string) => {
    const normalizedName = normalizeExpenseCategoryName(name);
    const existing = expenseCategoriesRef.current.find((category) => normalizeCategoryName(category.name) === normalizedName);
    if (existing) return existing.id;

    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const nextCategory: ExpenseCategory = {
      id: crypto.randomUUID(),
      name: normalizedName,
      target_amount: 0,
    };
    await setDoc(doc(getExpenseCategoriesCollection(auth.currentUser.uid), nextCategory.id), nextCategory);
    return nextCategory.id;
  };

  const ensureIncomeCategoryId = async (name: string) => {
    const normalizedName = normalizeCategoryName(name);
    const existing = incomeCategoriesRef.current.find((category) => normalizeCategoryName(category.name) === normalizedName);
    if (existing) return existing.id;

    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const nextCategory: IncomeCategory = {
      id: crypto.randomUUID(),
      name: normalizedName,
      target_amount: 0,
    };
    await setDoc(doc(getIncomeCategoriesCollection(auth.currentUser.uid), nextCategory.id), nextCategory);
    return nextCategory.id;
  };

  const upsertTransactionFromSync = async (id: string | null, data: Omit<Transaction, "id">) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const finalId = id || crypto.randomUUID();
    await setDoc(doc(getTransactionsCollection(auth.currentUser.uid), finalId), { id: finalId, ...data });
  };

  const upsertIncomeFromSync = async (id: string | null, data: Omit<Income, "id">) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const finalId = id || crypto.randomUUID();
    await setDoc(doc(getIncomeCollection(auth.currentUser.uid), finalId), { id: finalId, ...data });
  };

  const upsertExpenseCategoryTargetByName = async (name: string, targetAmount: number) => {
    if (!auth.currentUser) throw new Error("Sign in with Google first.");
    const categoryId = await ensureExpenseCategoryId(name);
    const existing = expenseCategoriesRef.current.find((item) => item.id === categoryId);
    if (!existing) return;
    await setDoc(doc(getExpenseCategoriesCollection(auth.currentUser.uid), categoryId), {
      ...existing,
      target_amount: targetAmount,
    });
  };

  const upsertIncomeCategoryTargetByName = async (name: string, targetAmount: number) => {
    if (!auth.currentUser) throw new Error("Sign in with Google first.");
    const categoryId = await ensureIncomeCategoryId(name);
    const existing = incomeCategoriesRef.current.find((item) => item.id === categoryId);
    if (!existing) return;
    await setDoc(doc(getIncomeCategoriesCollection(auth.currentUser.uid), categoryId), {
      ...existing,
      target_amount: targetAmount,
    });
  };

  const validateGoogleSheetsMappingFn = useCallback((): { valid: boolean; missing: string[] } => {
    const config = sheetsConfigRef.current;
    if (!config) return { valid: false, missing: ["No config saved"] };

    const missing: string[] = [];
    const reqExpFields = ["date", "vendor", "amount", "category"];
    const reqIncFields = ["date", "source", "amount", "category"];
    let expenseComplete = true;
    let incomeComplete = true;

    for (const field of reqExpFields) {
      if (!(config.expenseMapping as Record<string, string>)[field]?.trim()) {
        missing.push(`expenses.${field}`);
        expenseComplete = false;
      }
    }
    for (const field of reqIncFields) {
      if (!(config.incomeMapping as Record<string, string>)[field]?.trim()) {
        missing.push(`income.${field}`);
        incomeComplete = false;
      }
    }
    const valid = expenseComplete || incomeComplete;
    return { valid, missing };
  }, []);

  const buildSheetRowsForPull = useCallback(async (
    token: string,
    config: GoogleSheetsSyncConfig,
    mode: GoogleSheetsSyncMode,
  ): Promise<{ rows: any[]; count: number }> => {
    const {
      getSheetColumnValuesUntilEmptyRun,
      getSheetValues,
      parseA1CellReference,
    } = await import("../utils/googleSheetsSync");

    const allRows: any[] = [];
    let totalCount = 0;

    const expMapping = config.expenseMapping;
    const incMapping = config.incomeMapping;
    const expenseReady = Boolean(expMapping.date && expMapping.vendor && expMapping.amount && expMapping.category);
    const incomeReady = Boolean(incMapping.date && incMapping.source && incMapping.amount && incMapping.category);

    const readDraftValues = async (
      sheetName: string,
      draft: SheetRangeDraft | undefined
    ): Promise<{ values: string[]; dataStartRowNumber: number }> => {
      const startCell = draft?.startCell || "";
      const parsedStart = parseA1CellReference(startCell);
      if (!parsedStart) {
        return { values: [], dataStartRowNumber: 2 };
      }

      const dataStartRowNumber = parsedStart.rowIndex + 1;
      if (draft?.noEnd || !draft?.endCell) {
        const values = await getSheetColumnValuesUntilEmptyRun(
          token,
          config.spreadsheetId,
          sheetName,
          parsedStart.columnIndex,
          dataStartRowNumber,
        );
        return { values, dataStartRowNumber };
      }

      const range = `'${sheetName.replace(/'/g, "''")}'!${parsedStart.cellRef}:${draft.endCell}`;
      const response = await getSheetValues(token, config.spreadsheetId, range);
      const rows = response.values || [];
      const values = rows.slice(1).map((row) => (row[0] || "").trim());
      return { values, dataStartRowNumber };
    };

    // Build expense rows (optional)
    if (expenseReady) {
      try {
        const expDate = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.date);
        const expVendor = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.vendor);
        const expAmount = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.amount);
        const expCategory = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.category);
        const expNotes = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.notes);
        const expStartRow = expDate.dataStartRowNumber || config.expensesDataStartRow || 2;
        const expCursor = mode === "incremental" ? (config.incrementalCursor?.expenses || 0) : 0;
        const expRowCount = Math.max(
          expDate.values.length,
          expVendor.values.length,
          expAmount.values.length,
          expCategory.values.length,
          expNotes.values.length,
        );

        for (let offset = 0; offset < expRowCount; offset += 1) {
          const absRowIndex = expStartRow + offset - 1;
          if (mode === "incremental" && absRowIndex < expCursor) continue;

          const date = (expDate.values[offset] || "").trim();
          const vendor = (expVendor.values[offset] || "").trim();
          const amountRaw = (expAmount.values[offset] || "").trim();
          const category = (expCategory.values[offset] || "").trim();
          const notes = (expNotes.values[offset] || "").trim();
          const amount = Number.parseFloat(amountRaw.replace(/[^-0-9.]/g, "")) || 0;

          if (!date || !vendor || amount <= 0) continue;
          totalCount += 1;
          allRows.push({
            __row: [date, vendor, amount, category, notes],
            __sourceId: `google_sheet-row-${absRowIndex}`,
            __rawDescription: [date, vendor, amount, category, notes].join(", "),
          });
        }
      } catch {
        // Keep pull resilient for partial mapping setups (e.g., income-only).
      }
    }

    // Build income rows (optional)
    if (incomeReady) {
      try {
        const incDate = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.date);
        const incSource = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.source);
        const incAmount = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.amount);
        const incCategory = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.category);
        const incNotes = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.notes);
        const incStartRow = incDate.dataStartRowNumber || config.incomeDataStartRow || 2;
        const incCursor = mode === "incremental" ? (config.incrementalCursor?.income || 0) : 0;
        const incRowCount = Math.max(
          incDate.values.length,
          incSource.values.length,
          incAmount.values.length,
          incCategory.values.length,
          incNotes.values.length,
        );

        for (let offset = 0; offset < incRowCount; offset += 1) {
          const absRowIndex = incStartRow + offset - 1;
          if (mode === "incremental" && absRowIndex < incCursor) continue;

          const date = (incDate.values[offset] || "").trim();
          const source = (incSource.values[offset] || "").trim();
          const amountRaw = (incAmount.values[offset] || "").trim();
          const category = (incCategory.values[offset] || "").trim();
          const notes = (incNotes.values[offset] || "").trim();
          const amount = Number.parseFloat(amountRaw.replace(/[^-0-9.]/g, "")) || 0;

          if (!date || !source || amount <= 0) continue;
          totalCount += 1;
          allRows.push({
            __row: [date, source, amount, category, notes],
            __sourceId: `google_sheet-income-row-${absRowIndex}`,
            __rawDescription: [date, source, amount, category, notes].join(", "),
          });
        }
      } catch {
        // Keep pull resilient for partial mapping setups (e.g., expenses-only).
      }
    }

    return { rows: allRows, count: totalCount };
  }, []);

  const syncGoogleSheets = async (
    direction: GoogleSheetsSyncDirection = "both",
    options?: GoogleSheetsSyncOptions,
  ): Promise<GooglePullSummary | void> => {
    if (!googleSheetsAccessToken || !sheetsConfigRef.current) {
      throw new Error("Configure Google Sheets first.");
    }
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setGoogleSheetsSyncing(true);
    setGoogleSheetsError(null);
    setGooglePullSummary(null);

    try {
      if (direction === "pull" || direction === "both") {
        const mode = options?.mode || "incremental";

        // Build rows from mapped sheet ranges
        const { rows, count } = await buildSheetRowsForPull(
          googleSheetsAccessToken,
          sheetsConfigRef.current,
          mode,
        );

        let fetched = count;
        let imported = 0;
        let duplicateSkipped = 0;
        let invalidSkipped = 0;
        const expenseRows = rows.filter((r: any) => !r.__sourceId?.includes("income-"));
        const incomeRows = rows.filter((r: any) => r.__sourceId?.includes("income-"));

        if (rows.length > 0) {
          if (expenseRows.length > 0) {
            const batch = previewImportBatch({
              source: "google_sheet",
              payload: expenseRows,
              options: { type: "expenses", hasHeader: false },
              existing: {
                transactions: transactionsRef.current,
                income: incomeRef.current,
                expenseCategories: expenseCategoriesRef.current,
                incomeCategories: incomeCategoriesRef.current,
              },
            });
            const summary = await commitImport(batch, { includeDuplicates: false });
            imported += summary.imported;
            duplicateSkipped += batch.summary.duplicate;
            invalidSkipped += batch.summary.invalid;
          }

          if (incomeRows.length > 0) {
            const batch = previewImportBatch({
              source: "google_sheet",
              payload: incomeRows,
              options: { type: "income", hasHeader: false },
              existing: {
                transactions: transactionsRef.current,
                income: incomeRef.current,
                expenseCategories: expenseCategoriesRef.current,
                incomeCategories: incomeCategoriesRef.current,
              },
            });
            const summary = await commitImport(batch, { includeDuplicates: false });
            imported += summary.imported;
            duplicateSkipped += batch.summary.duplicate;
            invalidSkipped += batch.summary.invalid;
          }
        }

        const netNew = imported;
        const pullSummary: GooglePullSummary = {
          fetched,
          imported,
          duplicateSkipped,
          invalidSkipped,
          netNew,
          mode,
        };
        setGooglePullSummary(pullSummary);

        // Update cursor for incremental mode
        const configAfterPull = sheetsConfigRef.current;
        if (configAfterPull && mode === "incremental") {
          const newCursor: Record<string, number> = {
            ...(configAfterPull.incrementalCursor || {}),
          };
          // Find max absolute row from imports
          const maxExpenseRow = expenseRows.reduce((max: number, r: any) => {
            const match = (r.__sourceId || "").match(/row-(\d+)/);
            return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
          }, newCursor.expenses || 0);
          const maxIncomeRow = incomeRows.reduce((max: number, r: any) => {
            const match = (r.__sourceId || "").match(/row-(\d+)/);
            return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
          }, newCursor.income || 0);

          newCursor.expenses = Math.max(newCursor.expenses || 0, maxExpenseRow);
          newCursor.income = Math.max(newCursor.income || 0, maxIncomeRow);

          const nextConfig: GoogleSheetsSyncConfig = {
            ...configAfterPull,
            incrementalCursor: newCursor,
            lastPullSummary: pullSummary,
            lastPullAt: getIsoNow(),
            lastError: null,
          };
          await saveUserProfilePatch({ googleSheetsConfig: nextConfig });
          setGoogleSheetsError(null);
          return pullSummary;
        }

        const configAfterPullSimple = sheetsConfigRef.current;
        if (configAfterPullSimple) {
          const nextConfig: GoogleSheetsSyncConfig = {
            ...configAfterPullSimple,
            lastPullSummary: pullSummary,
            lastPullAt: getIsoNow(),
            lastError: null,
          };
          await saveUserProfilePatch({ googleSheetsConfig: nextConfig });
        }
        setGoogleSheetsError(null);
        return pullSummary;
      }

      // Push direction
      if (direction === "push" || direction === "both") {
        const config = sheetsConfigRef.current;
        if (!config) throw new Error("Google Sheets config missing.");
        await syncAppDataToSheet(
          googleSheetsAccessToken,
          config,
          transactionsRef.current,
          incomeRef.current,
        );
        const timestamp = getIsoNow();
        const nextConfig: GoogleSheetsSyncConfig = {
          ...config,
          lastPushAt: timestamp,
          lastError: null,
        };
        await saveUserProfilePatch({ googleSheetsConfig: nextConfig });
        setGoogleSheetsError(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
      setGoogleSheetsError(message);
      if (sheetsConfigRef.current) {
        await saveUserProfilePatch({
          googleSheetsConfig: {
            ...sheetsConfigRef.current,
            lastError: message,
          },
        });
      }
      throw error;
    } finally {
      syncInFlightRef.current = false;
      setGoogleSheetsSyncing(false);
    }
  };

  // Migrate legacy localStorage mappings to Firestore on first load
  useEffect(() => {
    if (!user || loading) return;
    if (googleSheetsConfig) return; // Already has Firestore config
    void migrateLocalStorageMappings();
  }, [user, loading, googleSheetsConfig, migrateLocalStorageMappings]);

  const signIn = async () => {
    await beginGoogleAuth(false);
  };

  const logout = async () => {
    const uid = auth.currentUser?.uid;
    clearLocalState();
    if (uid) {
      clearTransactionsCache(uid);
    }
    storeAccessToken(null);
    await signOut(auth);
  };

  const addTransaction = async (data: Omit<Transaction, "id">) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const id = crypto.randomUUID();
    await setDoc(doc(getTransactionsCollection(auth.currentUser.uid), id), {
      id,
      ...data,
      updated_at: getIsoNow(),
    });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const existing = transactionsRef.current.find((item) => item.id === id);
    if (!existing) return;

    await setDoc(doc(getTransactionsCollection(auth.currentUser.uid), id), {
      ...existing,
      ...data,
      id,
      updated_at: getIsoNow(),
    });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    await deleteDoc(doc(getTransactionsCollection(auth.currentUser.uid), id));
  };

  const addIncome = async (data: Omit<Income, "id">) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const categoryId = await ensureIncomeCategoryId(data.category);
    const id = crypto.randomUUID();
    await setDoc(doc(getIncomeCollection(auth.currentUser.uid), id), {
      id,
      ...data,
      category_id: data.category_id || categoryId,
      updated_at: getIsoNow(),
    });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateIncome = async (id: string, data: Partial<Income>) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const existing = incomeRef.current.find((item) => item.id === id);
    if (!existing) return;

    const categoryId = data.category ? await ensureIncomeCategoryId(data.category) : undefined;
    await setDoc(doc(getIncomeCollection(auth.currentUser.uid), id), {
      ...existing,
      ...data,
      id,
      category_id: categoryId || data.category_id || existing.category_id,
      updated_at: getIsoNow(),
    });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteIncome = async (id: string) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    await deleteDoc(doc(getIncomeCollection(auth.currentUser.uid), id));
  };

  const createRecurringRule = async (
    data: Omit<RecurringRule, "id" | "uid" | "created_at" | "updated_at" | "frequency">
  ) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    const id = crypto.randomUUID();
    const now = getIsoNow();
    const payload: RecurringRule = {
      ...data,
      id,
      uid: auth.currentUser.uid,
      frequency: "monthly",
      day_of_month: Math.max(1, Math.min(28, Math.trunc(data.day_of_month || 1))),
      created_at: now,
      updated_at: now,
    };
    await setDoc(doc(getRecurringRulesCollection(auth.currentUser.uid), id), payload);
    return id;
  };

  const updateRecurringRule = async (
    id: string,
    data: Partial<Pick<RecurringRule, "is_active" | "end_date" | "amount" | "notes">>
  ) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    const existing = recurringRulesRef.current.find((item) => item.id === id);
    if (!existing) return;
    await setDoc(doc(getRecurringRulesCollection(auth.currentUser.uid), id), {
      ...existing,
      ...data,
      id,
      uid: auth.currentUser.uid,
      updated_at: getIsoNow(),
    });
  };

  const deleteRecurringRule = async (id: string) => {
    await updateRecurringRule(id, {
      is_active: false,
      end_date: getTodayStr(),
    });
  };

  const generateRecurringTransactions = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const today = getTodayStr();
    const rules = recurringRulesRef.current.filter((rule) => rule.is_active);
    if (rules.length === 0) {
      return { generated: 0, skipped: 0 };
    }

    const expenseKeys = new Set(
      transactionsRef.current
        .filter((item) => item.recurring_rule_id)
        .map((item) => `${item.recurring_rule_id}::${item.date}`)
    );
    const incomeKeys = new Set(
      incomeRef.current
        .filter((item) => item.recurring_rule_id)
        .map((item) => `${item.recurring_rule_id}::${item.date}`)
    );

    let generated = 0;
    let skipped = 0;
    const batch = writeBatch(db);

    for (const rule of rules) {
      const dueOccurrences = materializeRule(rule, today);
      for (const occurrence of dueOccurrences) {
        const key = `${rule.id}::${occurrence.dueDate}`;
        if (rule.type === "expense") {
          if (expenseKeys.has(key)) {
            skipped += 1;
            continue;
          }
          const nextId = crypto.randomUUID();
          batch.set(doc(getTransactionsCollection(auth.currentUser.uid), nextId), {
            id: nextId,
            date: occurrence.dueDate,
            vendor: rule.vendor || "Recurring expense",
            amount: rule.amount,
            currency: rule.original_currency,
            category_id: rule.category_id || "",
            category_name: rule.category_name || "Misc.",
            notes: rule.notes || "",
            recurring_rule_id: rule.id,
            is_recurring_instance: true,
            updated_at: getIsoNow(),
          } satisfies Transaction);
          expenseKeys.add(key);
          generated += 1;
          continue;
        }

        if (incomeKeys.has(key)) {
          skipped += 1;
          continue;
        }
        const nextId = crypto.randomUUID();
        batch.set(doc(getIncomeCollection(auth.currentUser.uid), nextId), {
          id: nextId,
          date: occurrence.dueDate,
          source: rule.source || "Recurring income",
          amount: rule.amount,
          currency: rule.original_currency,
          category_id: rule.category_id,
          category: rule.category || "Recurring",
          notes: rule.notes || "",
          recurring_rule_id: rule.id,
          is_recurring_instance: true,
          updated_at: getIsoNow(),
        } satisfies Income);
        incomeKeys.add(key);
        generated += 1;
      }

      const nextGeneratedMonth = dueOccurrences.length > 0
        ? dueOccurrences[dueOccurrences.length - 1].month
        : rule.last_generated_month;
      batch.set(doc(getRecurringRulesCollection(auth.currentUser.uid), rule.id), {
        ...rule,
        last_generated_month: nextGeneratedMonth,
        updated_at: getIsoNow(),
      });
    }

    await batch.commit();
    return { generated, skipped };
  }, [getIncomeCollection, getRecurringRulesCollection, getTransactionsCollection]);

  const getUpcomingRecurring = (days = 30) => computeUpcoming(recurringRulesRef.current.filter((rule) => rule.is_active), getTodayStr(), days);

  useEffect(() => {
    if (!user) return;
    const sessionKey = `vibebudget-recurring-generated-${user.uid}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");
    void generateRecurringTransactions().catch(() => undefined);
  }, [generateRecurringTransactions, user]);

  const updateExpenseCategoryTarget = async (id: string, target: number) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const existing = expenseCategoriesRef.current.find((item) => item.id === id);
    if (!existing) return;
    await setDoc(doc(getExpenseCategoriesCollection(auth.currentUser.uid), id), { ...existing, target_amount: target });
  };

  const updateIncomeCategoryTarget = async (id: string, target: number) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const existing = incomeCategoriesRef.current.find((item) => item.id === id);
    if (!existing) return;
    await setDoc(doc(getIncomeCategoriesCollection(auth.currentUser.uid), id), { ...existing, target_amount: target });
  };

  const updateCategoryTarget = updateExpenseCategoryTarget;

  const previewImport = (
    source: ImportSource,
    payload: string | unknown[] | Record<string, unknown>,
    options?: ImportPreviewOptions
  ) => previewImportBatch({
    source,
    payload,
    options,
    existing: {
      transactions: transactionsRef.current,
      income: incomeRef.current,
      expenseCategories: expenseCategoriesRef.current,
      incomeCategories: incomeCategoriesRef.current,
    },
  });

  const commitImport = async (
    batch: ImportBatch,
    options: ImportCommitOptions = {},
    onProgress?: (current: number, total: number) => void,
  ): Promise<ImportCommitSummary> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    let nextExpenseCategories = migrateExpenseCategories([...expenseCategoriesRef.current]);
    let nextIncomeCategories = migrateIncomeCategories([...incomeCategoriesRef.current]);
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];
    const allowedIds = options.recordIds ? new Set(options.recordIds) : null;
    const records = batch.records.filter((record) => {
      if (allowedIds && !allowedIds.has(record.id)) return false;
      if (record.status === "invalid") return false;
      if (record.status === "duplicate" && !options.includeDuplicates) return false;
      return true;
    });
    let skipped = batch.records.length - records.length;

    const getOrCreateExpenseCategoryId = (name: string) => {
      const normalizedName = normalizeExpenseCategoryName(name);
      const existing = nextExpenseCategories.find((item) => normalizeCategoryName(item.name) === normalizedName);
      if (existing) return existing.id;
      const created: ExpenseCategory = { id: crypto.randomUUID(), name: normalizedName, target_amount: 0 };
      nextExpenseCategories = [...nextExpenseCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    const getOrCreateIncomeCategoryId = (name: string) => {
      const normalizedName = normalizeCategoryName(name);
      const existing = nextIncomeCategories.find((item) => normalizeCategoryName(item.name) === normalizedName);
      if (existing) return existing.id;
      const created: IncomeCategory = { id: crypto.randomUUID(), name: normalizedName, target_amount: 0 };
      nextIncomeCategories = [...nextIncomeCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    records.forEach((record, index) => {
      if (record.kind === "expenseCategory") {
        const id = getOrCreateExpenseCategoryId(record.merchant || "");
        nextExpenseCategories = nextExpenseCategories.map((item) => item.id === id ? { ...item, target_amount: record.amount || 0 } : item);
      }

      if (record.kind === "incomeCategory") {
        const id = getOrCreateIncomeCategoryId(record.merchant || "");
        nextIncomeCategories = nextIncomeCategories.map((item) => item.id === id ? { ...item, target_amount: record.amount || 0 } : item);
      }

      if (record.kind === "expense") {
        const normalizedCategoryName = normalizeExpenseCategoryName(record.category || FALLBACK_EXPENSE_CATEGORY_NAME);
        const categoryId = getOrCreateExpenseCategoryId(normalizedCategoryName);
        const existingIndex = record.source_id
          ? nextTransactions.findIndex((item) => item.import_source === record.source && item.source_id === record.source_id)
          : -1;
        const now = getIsoNow();
        const payload: Transaction = {
          id: existingIndex >= 0
            ? nextTransactions[existingIndex].id
            : record.source_id
              ? `${record.source}-expense-${record.source_id}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)
              : crypto.randomUUID(),
          date: record.date || getTodayStr(),
          vendor: record.merchant || "Imported expense",
          amount: record.amount || 0,
          category_id: categoryId,
          category_name: normalizedCategoryName,
          notes: record.notes || "",
          import_source: record.source,
          source_id: record.source_id,
          import_batch_id: batch.id,
          raw_description: record.raw_description,
          status: "posted",
          updated_at: now,
        };
        if (existingIndex >= 0) {
          nextTransactions[existingIndex] = payload;
        } else {
          nextTransactions.push(payload);
        }
      }

      if (record.kind === "income") {
        const normalizedCategoryName = normalizeCategoryName(record.category || "Uncategorized");
        const categoryId = getOrCreateIncomeCategoryId(normalizedCategoryName);
        const existingIndex = record.source_id
          ? nextIncome.findIndex((item) => item.import_source === record.source && item.source_id === record.source_id)
          : -1;
        const now = getIsoNow();
        const payload: Income = {
          id: existingIndex >= 0
            ? nextIncome[existingIndex].id
            : record.source_id
              ? `${record.source}-income-${record.source_id}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)
              : crypto.randomUUID(),
          date: record.date || getTodayStr(),
          source: record.merchant || "Imported income",
          amount: record.amount || 0,
          category_id: existingIndex >= 0 ? nextIncome[existingIndex].category_id || categoryId : categoryId,
          category: normalizedCategoryName,
          notes: record.notes || "",
          import_source: record.source,
          source_id: record.source_id,
          import_batch_id: batch.id,
          raw_description: record.raw_description,
          status: "posted",
          updated_at: now,
        };
        if (existingIndex >= 0) {
          nextIncome[existingIndex] = payload;
        } else {
          nextIncome.push(payload);
        }
      }

      onProgress?.(index + 1, records.length);
    });

    pendingImportRef.current = {
      expenseCategories: nextExpenseCategories.length,
      incomeCategories: nextIncomeCategories.length,
      transactions: nextTransactions.length,
      income: nextIncome.length,
    };

    const persistImport = replaceBudgetDataInFirestore({
      nextExpenseCategories,
      nextIncomeCategories,
      nextTransactions,
      nextIncome,
      nextPreferences: preferencesRef.current,
      nextSheetsConfig: sheetsConfigRef.current,
      nextDriveConnection: driveConnectionRef.current,
      nextLastSynced: lastSynced,
    });
    setExpenseCategories(nextExpenseCategories);
    setIncomeCategories(nextIncomeCategories);
    setTransactions(nextTransactions);
    setIncome(nextIncome);
    expenseCategoriesRef.current = nextExpenseCategories;
    incomeCategoriesRef.current = nextIncomeCategories;
    transactionsRef.current = nextTransactions;
    incomeRef.current = nextIncome;
    if (auth.currentUser) {
      saveTransactionsCache(auth.currentUser.uid, nextTransactions);
    }

    void persistImport.catch((error) => {
      console.error("Failed to persist imported data", error);
      setAuthError(error instanceof Error ? error.message : "Failed to persist imported data.");
    }).finally(() => {
      pendingImportRef.current = null;
    });

    return {
      imported: records.length,
      skipped,
      invalid: batch.summary.invalid,
    };
  };

  const importData = async (type: string, rows: any[], isUpsert = false, onProgress?: (current: number, total: number) => void) => {
    const source: ImportSource = "csv";
    const previewType = type === "targets" ? "expenseCategories" : type as ImportPreviewOptions["type"];
    const batch = previewImport(source, rows, { type: previewType, hasHeader: false });
    await commitImport(batch, { includeDuplicates: !isUpsert }, onProgress);
  };

  const upsertGoogleSheetRows = async (
    type: "expenses" | "income",
    rows: any[],
  ): Promise<{ imported: number; updated: number; skipped: number }> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    let nextExpenseCategories = migrateExpenseCategories([...expenseCategoriesRef.current]);
    let nextIncomeCategories = migrateIncomeCategories([...incomeCategoriesRef.current]);
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const now = getIsoNow();

    const getOrCreateExpenseCategoryId = (name: string) => {
      const normalizedName = normalizeExpenseCategoryName(name || FALLBACK_EXPENSE_CATEGORY_NAME);
      const existing = nextExpenseCategories.find((item) => normalizeCategoryName(item.name) === normalizedName);
      if (existing) return existing.id;
      const created: ExpenseCategory = { id: crypto.randomUUID(), name: normalizedName, target_amount: 0 };
      nextExpenseCategories = [...nextExpenseCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    const getOrCreateIncomeCategoryId = (name: string) => {
      const normalizedName = normalizeCategoryName(name || "Uncategorized") || "Uncategorized";
      const existing = nextIncomeCategories.find((item) => normalizeCategoryName(item.name) === normalizedName);
      if (existing) return existing.id;
      const created: IncomeCategory = { id: crypto.randomUUID(), name: normalizedName, target_amount: 0 };
      nextIncomeCategories = [...nextIncomeCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    if (type === "expenses") {
      const existingByIdentity = new Map<string, number>();
      nextTransactions.forEach((item, index) => {
        existingByIdentity.set(makeSheetRowIdentity(item.date, item.vendor, item.amount, item.category_name, item.notes || ""), index);
      });

      rows.forEach((row) => {
        const values = Array.isArray(row) ? row : [];
        const [dateRaw, vendorRaw, amountRaw, categoryRaw, notesRaw] = values;
        const date = String(dateRaw || "").trim() || getTodayStr();
        const vendor = String(vendorRaw || "").trim();
        const amount = normalizeSheetIdentityAmount(amountRaw);
        const categoryName = normalizeExpenseCategoryName(String(categoryRaw || FALLBACK_EXPENSE_CATEGORY_NAME));
        const notes = String(notesRaw || "").trim();

        if (!date || !vendor || amount <= 0) {
          skipped += 1;
          return;
        }

        const identity = makeSheetRowIdentity(date, vendor, amount, categoryName, notes);
        const existingIndex = existingByIdentity.get(identity);
        const categoryId = getOrCreateExpenseCategoryId(categoryName);
        const payload: Transaction = {
          id: existingIndex !== undefined
            ? nextTransactions[existingIndex].id
            : `google_sheet-expense-${hashSheetIdentity(identity)}`,
          date,
          vendor,
          amount,
          category_id: existingIndex !== undefined ? nextTransactions[existingIndex].category_id || categoryId : categoryId,
          category_name: categoryName,
          notes,
          import_source: "google_sheet",
          source_id: `sheet-expense-${hashSheetIdentity(identity)}`,
          import_batch_id: `sheet-refresh-${now}`,
          raw_description: [date, vendor, amount, categoryName, notes].join(", "),
          status: "posted",
          updated_at: now,
        };

        if (existingIndex !== undefined) {
          nextTransactions[existingIndex] = { ...nextTransactions[existingIndex], ...payload };
          updated += 1;
        } else {
          nextTransactions.push(payload);
          existingByIdentity.set(identity, nextTransactions.length - 1);
          imported += 1;
        }
      });
    }

    if (type === "income") {
      const existingByIdentity = new Map<string, number>();
      nextIncome.forEach((item, index) => {
        existingByIdentity.set(makeSheetRowIdentity(item.date, item.source, item.amount, item.category, item.notes || ""), index);
      });

      rows.forEach((row) => {
        const values = Array.isArray(row) ? row : [];
        const [dateRaw, sourceRaw, amountRaw, categoryRaw, notesRaw] = values;
        const date = String(dateRaw || "").trim() || getTodayStr();
        const source = String(sourceRaw || "").trim();
        const amount = normalizeSheetIdentityAmount(amountRaw);
        const categoryName = normalizeCategoryName(String(categoryRaw || "Uncategorized")) || "Uncategorized";
        const notes = String(notesRaw || "").trim();

        if (!date || !source || amount <= 0) {
          skipped += 1;
          return;
        }

        const identity = makeSheetRowIdentity(date, source, amount, categoryName, notes);
        const existingIndex = existingByIdentity.get(identity);
        const categoryId = getOrCreateIncomeCategoryId(categoryName);
        const payload: Income = {
          id: existingIndex !== undefined
            ? nextIncome[existingIndex].id
            : `google_sheet-income-${hashSheetIdentity(identity)}`,
          date,
          source,
          amount,
          category_id: existingIndex !== undefined ? nextIncome[existingIndex].category_id || categoryId : categoryId,
          category: categoryName,
          notes,
          import_source: "google_sheet",
          source_id: `sheet-income-${hashSheetIdentity(identity)}`,
          import_batch_id: `sheet-refresh-${now}`,
          raw_description: [date, source, amount, categoryName, notes].join(", "),
          status: "posted",
          updated_at: now,
        };

        if (existingIndex !== undefined) {
          nextIncome[existingIndex] = { ...nextIncome[existingIndex], ...payload };
          updated += 1;
        } else {
          nextIncome.push(payload);
          existingByIdentity.set(identity, nextIncome.length - 1);
          imported += 1;
        }
      });
    }

    pendingImportRef.current = {
      expenseCategories: nextExpenseCategories.length,
      incomeCategories: nextIncomeCategories.length,
      transactions: nextTransactions.length,
      income: nextIncome.length,
    };

    const persistImport = replaceBudgetDataInFirestore({
      nextExpenseCategories,
      nextIncomeCategories,
      nextTransactions,
      nextIncome,
      nextPreferences: preferencesRef.current,
      nextSheetsConfig: sheetsConfigRef.current,
      nextDriveConnection: driveConnectionRef.current,
      nextLastSynced: lastSynced,
    });

    setExpenseCategories(nextExpenseCategories);
    setIncomeCategories(nextIncomeCategories);
    setTransactions(nextTransactions);
    setIncome(nextIncome);
    expenseCategoriesRef.current = nextExpenseCategories;
    incomeCategoriesRef.current = nextIncomeCategories;
    transactionsRef.current = nextTransactions;
    incomeRef.current = nextIncome;
    saveTransactionsCache(auth.currentUser.uid, nextTransactions);

    void persistImport.catch((error) => {
      console.error("Failed to persist Google Sheet refresh", error);
      setAuthError(error instanceof Error ? error.message : "Failed to persist Google Sheet refresh.");
    }).finally(() => {
      pendingImportRef.current = null;
    });

    return { imported, updated, skipped };
  };

  const wipeData = async (type: string) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    if (type === "expenses") {
      await replaceCollection(
        getTransactionsCollection(auth.currentUser.uid),
        [],
        transactionsRef.current.map((item) => item.id),
      );
      return;
    }
    if (type === "income") {
      await replaceCollection(
        getIncomeCollection(auth.currentUser.uid),
        [],
        incomeRef.current.map((item) => item.id),
      );
      return;
    }
    if (type === "categories" || type === "targets" || type === "expenseCategories") {
      await replaceCollection(
        getExpenseCategoriesCollection(auth.currentUser.uid),
        createDefaultExpenseCategories(),
        expenseCategoriesRef.current.map((item) => item.id),
      );
      return;
    }
    if (type === "incomeCategories") {
      await replaceCollection(
        getIncomeCategoriesCollection(auth.currentUser.uid),
        createIncomeCategoriesFromRecords(incomeRef.current),
        incomeCategoriesRef.current.map((item) => item.id),
      );
    }
  };

  const shareBudget = async () => {
    throw new Error("Shared budgets are disabled. Each Google account only sees its own data.");
  };

  const backupToDrive = async () => {
    await ensureSignedInWithDriveScopes();
    setBackingUp(true);
    try {
      if (!driveConnectionRef.current) {
        await connectDriveFolder();
      } else {
        await saveBudgetToDrive();
      }
    } finally {
      setBackingUp(false);
    }
  };

  const syncToCloud = async () => {
    await loadBudgetFromDrive();
  };

  // ─── Plaid Methods ──────────────────────────────────────────────────

  const plaidConnected = Boolean(plaidConnection);

  const plaidApiFetch = useCallback(async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    // Try the Express server first, fall back to Vercel API route
    const serverUrl = process.env.VITE_PLAID_SERVER_URL || "";
    const uid = auth.currentUser.uid;

    if (serverUrl) {
      const response = await fetch(`${serverUrl}/api/plaid/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, uid }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as any).error || `Plaid ${action} failed (${response.status})`);
      }
      return response.json() as Promise<T>;
    }

    // Fallback to Vercel API route
    const response = await fetch("/api/plaid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body, uid }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error((errorBody as any).error || `Plaid ${action} failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }, []);

  const connectPlaid = useCallback(async (publicToken: string) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!plaidCredentials) {
      throw new Error("Configure your Plaid API credentials in Settings first.");
    }

    setPlaidSyncing(true);
    setPlaidError(null);

    try {
      const result = await plaidApiFetch<{
        encryptedAccessToken: string;
        itemId: string;
        institutionName?: string;
        institutionId?: string;
      }>("exchange", {
        publicToken,
        clientId: plaidCredentials.clientId,
        secret: plaidCredentials.secret,
        environment: plaidCredentials.environment,
      });

      const connection: PlaidConnection = {
        itemId: result.itemId,
        institutionName: result.institutionName || "Unknown Bank",
        institutionId: result.institutionId,
        accounts: [],
        encryptedAccessToken: result.encryptedAccessToken,
        connectedAt: getIsoNow(),
        lastSyncAt: undefined,
        syncCursor: undefined,
      };

      await saveUserProfilePatch({ plaidConnection: connection });
      setPlaidConnection(connection);
      setPlaidError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect Plaid.";
      setPlaidError(message);
      throw error;
    } finally {
      setPlaidSyncing(false);
    }
  }, [plaidCredentials, plaidApiFetch, saveUserProfilePatch]);

  const disconnectPlaid = useCallback(async () => {
    await saveUserProfilePatch({ plaidConnection: null, plaidCategoryMappings: [] });
    setPlaidConnection(null);
    setPlaidCategoryMappings([]);
    setPlaidError(null);
  }, [saveUserProfilePatch]);

  const syncPlaidTransactions = useCallback(async (): Promise<ImportCommitSummary> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!plaidCredentials || !plaidConnection) {
      throw new Error("Connect a bank account first.");
    }

    setPlaidSyncing(true);
    setPlaidError(null);

    try {
      const result = await plaidApiFetch<{
        added: import("../types").PlaidTransaction[];
        nextCursor: string;
        hasMore: boolean;
      }>("transactions", {
        encryptedAccessToken: plaidConnection.encryptedAccessToken,
        clientId: plaidCredentials.clientId,
        secret: plaidCredentials.secret,
        environment: plaidCredentials.environment,
        cursor: plaidConnection.syncCursor,
      });

      if (result.added.length === 0) {
        // Update cursor even if no new transactions
        const updatedConnection: PlaidConnection = {
          ...plaidConnection,
          syncCursor: result.nextCursor,
          lastSyncAt: getIsoNow(),
        };
        await saveUserProfilePatch({ plaidConnection: updatedConnection });
        setPlaidConnection(updatedConnection);
        return { imported: 0, skipped: 0, invalid: 0 };
      }

      // Map Plaid transactions to import records
      const { mapPlaidCategory } = await import("../utils/plaidCategoryMap");
      const importRows = result.added.map((tx) => {
        const categoryName = mapPlaidCategory(tx.category, plaidCategoryMappings);
        return [
          tx.date,
          tx.merchantName || tx.name,
          String(tx.amount),
          categoryName,
          `Plaid: ${tx.name}`,
        ];
      });

      // Use the existing import pipeline to commit
      const batch = previewImportBatch({
        source: "plaid",
        payload: importRows,
        options: { type: "expenses", hasHeader: false },
        existing: {
          transactions: transactionsRef.current,
          income: incomeRef.current,
          expenseCategories: expenseCategoriesRef.current,
          incomeCategories: incomeCategoriesRef.current,
        },
      });

      const summary = await commitImport(batch, { includeDuplicates: false });

      // Update cursor and sync time
      const updatedConnection: PlaidConnection = {
        ...plaidConnection,
        syncCursor: result.nextCursor,
        lastSyncAt: getIsoNow(),
      };
      await saveUserProfilePatch({ plaidConnection: updatedConnection });
      setPlaidConnection(updatedConnection);

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Plaid transactions.";
      setPlaidError(message);
      throw error;
    } finally {
      setPlaidSyncing(false);
    }
  }, [plaidCredentials, plaidConnection, plaidCategoryMappings, plaidApiFetch, saveUserProfilePatch, commitImport]);

  const fetchPlaidAccounts = useCallback(async (): Promise<import("../types").PlaidAccount[]> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!plaidCredentials || !plaidConnection) {
      throw new Error("Connect a bank account first.");
    }

    const result = await plaidApiFetch<{ accounts: import("../types").PlaidAccount[] }>("accounts", {
      encryptedAccessToken: plaidConnection.encryptedAccessToken,
      clientId: plaidCredentials.clientId,
      secret: plaidCredentials.secret,
      environment: plaidCredentials.environment,
    });

    return result.accounts;
  }, [plaidCredentials, plaidConnection, plaidApiFetch]);

  // ─── Teller Methods ─────────────────────────────────────────────────

  const tellerConnected = Boolean(tellerConnection);

  const tellerApiFetch = useCallback(async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    // Try the Express server first, fall back to Vercel API route
    const serverUrl = process.env.VITE_PLAID_SERVER_URL || "";
    const uid = auth.currentUser.uid;

    if (serverUrl) {
      const response = await fetch(`${serverUrl}/api/teller`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body, uid }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error((errorBody as any).error || `Teller ${action} failed (${response.status})`);
      }
      return response.json() as Promise<T>;
    }

    // Fallback to Vercel API route
    const response = await fetch("/api/teller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body, uid }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error((errorBody as any).error || `Teller ${action} failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }, []);

  const connectTeller = useCallback(async (enrollment: import("../types").TellerEnrollment) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!tellerCredentials) {
      throw new Error("Configure your Teller application credentials in Settings first.");
    }

    setTellerSyncing(true);
    setTellerError(null);

    try {
      // Fetch accounts using the access token from the enrollment
      const result = await tellerApiFetch<{ accounts: import("../types").TellerAccount[] }>("accounts", {
        accessToken: enrollment.accessToken,
        certificate: tellerCredentials.certificate,
        privateKey: tellerCredentials.privateKey,
        environment: tellerCredentials.environment,
      });

      const connection: TellerConnection = {
        enrollmentId: enrollment.enrollment.id,
        accessToken: enrollment.accessToken,
        institutionName: enrollment.enrollment.institution.name,
        institutionId: enrollment.enrollment.institution.id,
        userId: enrollment.user.id,
        accounts: result.accounts,
        connectedAt: getIsoNow(),
        lastSyncAt: undefined,
      };

      await saveUserProfilePatch({ tellerConnection: connection });
      setTellerConnection(connection);
      setTellerError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect Teller.";
      setTellerError(message);
      throw error;
    } finally {
      setTellerSyncing(false);
    }
  }, [tellerCredentials, tellerApiFetch, saveUserProfilePatch]);

  const disconnectTeller = useCallback(async () => {
    await saveUserProfilePatch({ tellerConnection: null, tellerCategoryMappings: [] });
    setTellerConnection(null);
    setTellerCategoryMappings([]);
    setTellerError(null);
  }, [saveUserProfilePatch]);

  const syncTellerTransactions = useCallback(async (): Promise<ImportCommitSummary> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!tellerCredentials || !tellerConnection) {
      throw new Error("Connect a bank account first.");
    }

    setTellerSyncing(true);
    setTellerError(null);

    try {
      // Fetch transactions from all accounts
      const result = await tellerApiFetch<{ transactions: import("../types").TellerTransaction[] }>("sync-all", {
        accessToken: tellerConnection.accessToken,
        certificate: tellerCredentials.certificate,
        privateKey: tellerCredentials.privateKey,
        environment: tellerCredentials.environment,
        accounts: tellerConnection.accounts,
      });

      if (result.transactions.length === 0) {
        const updatedConnection: TellerConnection = {
          ...tellerConnection,
          lastSyncAt: getIsoNow(),
        };
        await saveUserProfilePatch({ tellerConnection: updatedConnection });
        setTellerConnection(updatedConnection);
        return { imported: 0, skipped: 0, invalid: 0 };
      }

      // Map Teller transactions to import records
      const { mapTellerCategory } = await import("../utils/tellerCategoryMap");
      const importRows = result.transactions
        .filter((tx) => tx.type === "withdrawal") // Only expenses
        .map((tx) => {
          const categoryName = mapTellerCategory(
            { description: tx.description, details: tx.details },
            tellerCategoryMappings,
          );
          return [
            tx.date,
            tx.details?.merchant || tx.description,
            String(tx.amount),
            categoryName,
            `Teller: ${tx.description}`,
          ];
        });

      if (importRows.length === 0) {
        const updatedConnection: TellerConnection = {
          ...tellerConnection,
          lastSyncAt: getIsoNow(),
        };
        await saveUserProfilePatch({ tellerConnection: updatedConnection });
        setTellerConnection(updatedConnection);
        return { imported: 0, skipped: 0, invalid: 0 };
      }

      // Use the existing import pipeline to commit
      const batch = previewImportBatch({
        source: "bank_feed",
        payload: importRows,
        options: { type: "expenses", hasHeader: false },
        existing: {
          transactions: transactionsRef.current,
          income: incomeRef.current,
          expenseCategories: expenseCategoriesRef.current,
          incomeCategories: incomeCategoriesRef.current,
        },
      });

      const summary = await commitImport(batch, { includeDuplicates: false });

      // Update sync time
      const updatedConnection: TellerConnection = {
        ...tellerConnection,
        lastSyncAt: getIsoNow(),
      };
      await saveUserProfilePatch({ tellerConnection: updatedConnection });
      setTellerConnection(updatedConnection);

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Teller transactions.";
      setTellerError(message);
      throw error;
    } finally {
      setTellerSyncing(false);
    }
  }, [tellerCredentials, tellerConnection, tellerCategoryMappings, tellerApiFetch, saveUserProfilePatch, commitImport]);

  const fetchTellerAccounts = useCallback(async (): Promise<import("../types").TellerAccount[]> => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }
    if (!tellerCredentials || !tellerConnection) {
      throw new Error("Connect a bank account first.");
    }

    const result = await tellerApiFetch<{ accounts: import("../types").TellerAccount[] }>("accounts", {
      accessToken: tellerConnection.accessToken,
      certificate: tellerCredentials.certificate,
      privateKey: tellerCredentials.privateKey,
      environment: tellerCredentials.environment,
    });

    return result.accounts;
  }, [tellerCredentials, tellerConnection, tellerApiFetch]);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        authError,
        clearAuthError: () => setAuthError(null),
        budgetId,
        ownerEmail: user?.email || null,
        sharedUsers: [],
        expenseCategories,
        incomeCategories,
        categories: expenseCategories,
        transactions,
        income,
        recurringRules,
        preferences,
        updatePreferences,
        signIn,
        logout,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addIncome,
        updateIncome,
        deleteIncome,
        createRecurringRule,
        updateRecurringRule,
        deleteRecurringRule,
        generateRecurringTransactions,
        getUpcomingRecurring,
        updateExpenseCategoryTarget,
        updateIncomeCategoryTarget,
        updateCategoryTarget,
        previewImport,
        commitImport,
        importData,
        upsertGoogleSheetRows,
        wipeData,
        backupToDrive,
        syncToCloud,
        shareBudget,
        googleSheetsConfig,
        googleSheetsConnected: Boolean(googleSheetsAccessToken && user),
        googleSheetsSyncing,
        googleSheetsError,
        connectGoogleSheets,
        disconnectGoogleSheets,
        inspectGoogleSheetsSpreadsheet,
        previewGoogleSheetColumn,
        saveGoogleSheetsConfig,
        syncGoogleSheets,
        validateGoogleSheetsMapping: validateGoogleSheetsMappingFn,
        googlePullSummary,
        backingUp,
        isSyncing,
        lastSynced,
        driveConnection,
        driveConnected: Boolean(driveConnection),
        driveSyncError,
        connectDriveFolder,
        previewBudgetFromDrive,
        loadBudgetFromDrive,
        disconnectDriveFolder,
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

        // AI
        aiConfig,
        saveAiConfig: saveAiConfigFn,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
};
