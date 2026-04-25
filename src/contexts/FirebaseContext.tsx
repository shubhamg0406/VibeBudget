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
  Category,
  DriveConnection,
  ExpenseCategory,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncDirection,
  Income,
  IncomeCategory,
  Preferences,
  RecurringRule,
  Transaction,
  UpcomingRecurringInstance,
} from "../types";
import {
  ensureSheetAndHeaders,
  getRequiredHeadersForConfig,
  inspectSpreadsheet,
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
import {
  dedupeExpensesByImportFingerprint,
  dedupeIncomeByImportFingerprint,
  getExpenseImportFingerprint,
  getIncomeImportFingerprint,
  getStableImportedExpenseId,
  getStableImportedIncomeId,
} from "../utils/importDedupe";

const GOOGLE_ACCESS_TOKEN_KEY = "vibebudgetGoogleAccessToken";
const LOCAL_STATE_KEY = "vibebudgetLocalState";
const TRANSACTIONS_CACHE_KEY_PREFIX = "vb_transactions_cache";
const DEFAULT_SYNC_INTERVAL_SECONDS = 30;
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
  lastSyncedAt?: string | null;
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
  importData: (type: string, data: any[], isUpsert?: boolean, onProgress?: (current: number, total: number) => void) => Promise<void>;
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
  inspectGoogleSheetsSpreadsheet: (spreadsheetUrl: string, expensesSheetName: string, incomeSheetName: string) => Promise<GoogleSheetsInspectionResult>;
  saveGoogleSheetsConfig: (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => Promise<void>;
  syncGoogleSheets: (direction?: GoogleSheetsSyncDirection) => Promise<void>;
  backingUp: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  driveConnection: DriveConnection | null;
  driveConnected: boolean;
  driveSyncError: string | null;
  connectDriveFolder: (folderRef?: string) => Promise<void>;
  loadBudgetFromDrive: () => Promise<void>;
  disconnectDriveFolder: () => void;
  googleSheetsAccessToken: string | null;
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
  const [googleSheetsAccessToken, setGoogleSheetsAccessToken] = useState<string | null>(sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY));
  const [googleSheetsSyncing, setGoogleSheetsSyncing] = useState(false);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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
      sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  };

  const saveUserProfilePatch = useCallback(async (patch: Partial<UserProfileDocument>) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    const currentUser = auth.currentUser;
    await setDoc(
      getUserDocRef(currentUser.uid),
      {
        budgetId: currentUser.uid,
        email: currentUser.email || "",
        displayName: currentUser.displayName || null,
        photoURL: currentUser.photoURL || null,
        ...patch,
      },
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
      if (withDriveScopes) {
        storeAccessToken(credential?.accessToken || null);
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
        setLastSynced(data?.lastSyncedAt ? new Date(data.lastSyncedAt) : null);
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
        nextDriveConnection: currentConnection,
        nextLastSynced: new Date(),
      });
      setDriveSyncError(null);
    } finally {
      loadingDriveRef.current = false;
      setIsSyncing(false);
    }
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
          setDriveSyncError(error instanceof Error ? error.message : "Failed to save budget.json to Drive.");
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
    incomeSheetName: string
  ) => {
    if (!googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }

    return inspectSpreadsheet(googleSheetsAccessToken, spreadsheetUrl, expensesSheetName, incomeSheetName);
  };

  const connectGoogleSheets = async () => {
    await ensureSignedInWithDriveScopes();
  };

  const disconnectGoogleSheets = () => {
    setGoogleSheetsError(null);
    void saveUserProfilePatch({ googleSheetsConfig: null });
  };

  const saveGoogleSheetsConfig = async (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => {
    if (!user || !googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }

    const payload: GoogleSheetsSyncConfig = {
      ...config,
      connectedAt: sheetsConfigRef.current?.connectedAt || getIsoNow(),
      connectedBy: user.email || user.uid,
      lastError: null,
      lastSyncedAt: sheetsConfigRef.current?.lastSyncedAt || null,
      lastPullAt: sheetsConfigRef.current?.lastPullAt || null,
      lastPushAt: sheetsConfigRef.current?.lastPushAt || null,
    };

    await ensureSheetAndHeaders(
      googleSheetsAccessToken,
      payload.spreadsheetId,
      payload.expensesSheetName,
      getRequiredHeadersForConfig(payload, "expenses")
    );
    await ensureSheetAndHeaders(
      googleSheetsAccessToken,
      payload.spreadsheetId,
      payload.incomeSheetName,
      getRequiredHeadersForConfig(payload, "income")
    );

    await saveUserProfilePatch({ googleSheetsConfig: payload });
    setGoogleSheetsError(null);
  };

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

  const syncGoogleSheets = async (direction: GoogleSheetsSyncDirection = "both") => {
    if (!googleSheetsAccessToken || !sheetsConfigRef.current) {
      throw new Error("Configure Google Sheets first.");
    }
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setGoogleSheetsSyncing(true);
    setGoogleSheetsError(null);

    try {
      if (direction === "pull" || direction === "both") {
        await syncSheetDataToApp({
          token: googleSheetsAccessToken,
          config: sheetsConfigRef.current,
          transactions: transactionsRef.current,
          income: incomeRef.current,
          ensureCategoryId: ensureExpenseCategoryId,
          upsertTransaction: upsertTransactionFromSync,
          upsertIncome: upsertIncomeFromSync,
        });
      }

      const configAfterPull = sheetsConfigRef.current;
      if (!configAfterPull) {
        throw new Error("Google Sheets config missing after pull.");
      }

      if (direction === "push" || direction === "both") {
        await syncAppDataToSheet(
          googleSheetsAccessToken,
          configAfterPull,
          transactionsRef.current,
          incomeRef.current
        );
      }

      const timestamp = getIsoNow();
      const nextConfig: GoogleSheetsSyncConfig = {
        ...configAfterPull,
        lastSyncedAt: timestamp,
        lastPullAt: direction === "push" ? configAfterPull.lastPullAt || null : timestamp,
        lastPushAt: direction === "pull" ? configAfterPull.lastPushAt || null : timestamp,
        lastError: null,
      };

      await saveUserProfilePatch({
        googleSheetsConfig: nextConfig,
        lastSyncedAt: timestamp,
      });
      setGoogleSheetsError(null);
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

  useEffect(() => {
    if (!googleSheetsAccessToken || !googleSheetsConfig?.autoSync) return;

    const interval = Math.max(15, googleSheetsConfig.syncIntervalSeconds || DEFAULT_SYNC_INTERVAL_SECONDS) * 1000;
    const timer = window.setInterval(() => {
      void syncGoogleSheets("push").catch(() => undefined);
    }, interval);

    return () => window.clearInterval(timer);
  }, [googleSheetsAccessToken, googleSheetsConfig]);

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

  const importData = async (type: string, rows: any[], isUpsert = false, onProgress?: (current: number, total: number) => void) => {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google first.");
    }

    let nextExpenseCategories = migrateExpenseCategories([...expenseCategoriesRef.current]);
    let nextIncomeCategories = migrateIncomeCategories([...incomeCategoriesRef.current]);
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];
    const importedExpenseFingerprints = new Set<string>();
    const importedIncomeFingerprints = new Set<string>();

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

    rows.forEach((row, index) => {
      if (type === "targets" || type === "expenseCategories") {
        const [name, target] = row;
        const id = getOrCreateExpenseCategoryId(name);
        nextExpenseCategories = nextExpenseCategories.map((item) => item.id === id ? { ...item, target_amount: target } : item);
      }

      if (type === "incomeCategories") {
        const [name, target] = row;
        const id = getOrCreateIncomeCategoryId(name);
        nextIncomeCategories = nextIncomeCategories.map((item) => item.id === id ? { ...item, target_amount: target } : item);
      }

      if (type === "expenses") {
        const [date, vendor, amount, categoryName, notes] = row;
        const normalizedCategoryName = normalizeExpenseCategoryName(categoryName);
        const categoryId = getOrCreateExpenseCategoryId(normalizedCategoryName);
        const fingerprint = getExpenseImportFingerprint({
          date,
          vendor,
          amount,
          category_name: normalizedCategoryName,
          notes,
        });
        importedExpenseFingerprints.add(fingerprint);
        const existingIndex = isUpsert
          ? nextTransactions.findIndex((item) => getExpenseImportFingerprint(item) === fingerprint)
          : -1;
        const payload: Transaction = {
          id: existingIndex >= 0
            ? nextTransactions[existingIndex].id
            : isUpsert
              ? getStableImportedExpenseId({
                  date,
                  vendor,
                  amount,
                  category_name: normalizedCategoryName,
                  notes,
                })
              : crypto.randomUUID(),
          date,
          vendor,
          amount,
          category_id: categoryId,
          category_name: normalizedCategoryName,
          notes,
          updated_at: getIsoNow(),
        };
        if (existingIndex >= 0) {
          nextTransactions[existingIndex] = payload;
        } else {
          nextTransactions.push(payload);
        }
      }

      if (type === "income") {
        const [date, source, amount, category, notes] = row;
        const normalizedCategoryName = normalizeCategoryName(category);
        const categoryId = getOrCreateIncomeCategoryId(normalizedCategoryName);
        const fingerprint = getIncomeImportFingerprint({
          date,
          source,
          amount,
          category: normalizedCategoryName,
          notes,
        });
        importedIncomeFingerprints.add(fingerprint);
        const existingIndex = isUpsert
          ? nextIncome.findIndex((item) => getIncomeImportFingerprint(item) === fingerprint)
          : -1;
        const payload: Income = {
          id: existingIndex >= 0
            ? nextIncome[existingIndex].id
            : isUpsert
              ? getStableImportedIncomeId({
                  date,
                  source,
                  amount,
                  category: normalizedCategoryName,
                  notes,
                })
              : crypto.randomUUID(),
          date,
          source,
          amount,
          category_id: existingIndex >= 0 ? nextIncome[existingIndex].category_id || categoryId : categoryId,
          category: normalizedCategoryName,
          notes,
          updated_at: getIsoNow(),
        };
        if (existingIndex >= 0) {
          nextIncome[existingIndex] = payload;
        } else {
          nextIncome.push(payload);
        }
      }

      onProgress?.(index + 1, rows.length);
    });

    if (isUpsert) {
      if (type === "expenses") {
        nextTransactions = dedupeExpensesByImportFingerprint(nextTransactions, importedExpenseFingerprints);
      }
      if (type === "income") {
        nextIncome = dedupeIncomeByImportFingerprint(nextIncome, importedIncomeFingerprints);
      }
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
    if (auth.currentUser) {
      saveTransactionsCache(auth.currentUser.uid, nextTransactions);
    }

    void persistImport.catch((error) => {
      console.error("Failed to persist imported data", error);
      setAuthError(error instanceof Error ? error.message : "Failed to persist imported data.");
    }).finally(() => {
      pendingImportRef.current = null;
    });
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
        importData,
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
        saveGoogleSheetsConfig,
        syncGoogleSheets,
        backingUp,
        isSyncing,
        lastSynced,
        driveConnection,
        driveConnected: Boolean(driveConnection),
        driveSyncError,
        connectDriveFolder,
        loadBudgetFromDrive,
        disconnectDriveFolder,
        googleSheetsAccessToken,
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
