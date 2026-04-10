import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import {
  Category,
  DriveConnection,
  ExpenseCategory,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncDirection,
  Income,
  IncomeCategory,
  Transaction,
  Preferences,
} from "../types";
import {
  clearSheetRowForItem,
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

const GOOGLE_ACCESS_TOKEN_KEY = "vibebudgetGoogleAccessToken";
const GOOGLE_REDIRECT_KEY = "vibebudgetGoogleRedirectInProgress";
const LOCAL_STATE_KEY = "vibebudgetLocalState";
const LOCAL_BUDGET_ID_KEY = "vibebudgetLocalBudgetId";
const DEFAULT_SYNC_INTERVAL_SECONDS = 30;
const DEFAULT_BUDGET_FILE_NAME = "budget.json";
const LEGACY_CATEGORY_RENAMES: Record<string, string> = {
  "Canada Investments": "Canada Transfer",
  "India Transfer Investment": "India Transfer - Self",
};

const DEFAULT_CATEGORY_NAMES = [
  "Alcohol + Weed",
  "Canada Transfer",
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
  "India Transfer - Self",
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
  "Canada Transfer", 
  "India Transfer - Self", 
  "India Transfer - Parents", 
  "Nagar/Bamor Expenses"
];

const getIsoNow = () => new Date().toISOString();

const renameLegacyCategory = (name: string) => LEGACY_CATEGORY_RENAMES[name] || name;

const createDefaultExpenseCategories = (): ExpenseCategory[] => (
  DEFAULT_CATEGORY_NAMES
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    }))
);

const migrateExpenseCategories = (categories: ExpenseCategory[]) => (
  categories.map((category) => ({
    ...category,
    name: renameLegacyCategory(category.name),
  }))
);

const migrateTransactions = (transactions: Transaction[]) => (
  transactions.map((transaction) => ({
    ...transaction,
    category_name: renameLegacyCategory(transaction.category_name),
  }))
);

const migrateIncomeRecords = (incomeRecords: Income[]) => (
  incomeRecords.map((record) => ({
    ...record,
    category: renameLegacyCategory(record.category),
  }))
);

const migrateExcludedCategories = (categories?: string[]) => (
  (categories || DEFAULT_CORE_EXCLUDED).map(renameLegacyCategory)
);

const createIncomeCategoriesFromRecords = (incomeRecords: Income[]): IncomeCategory[] => (
  Array.from(new Set(incomeRecords.map((item) => item.category).filter(Boolean)))
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
    return storedIncomeCategories;
  }
  return createIncomeCategoriesFromRecords(incomeRecords);
};

const getLocalBudgetId = () => {
  const existing = localStorage.getItem(LOCAL_BUDGET_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(LOCAL_BUDGET_ID_KEY, next);
  return next;
};

interface LocalStatePayload {
  categories?: ExpenseCategory[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  transactions: Transaction[];
  income: Income[];
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
  driveConnection: DriveConnection | null;
  lastSyncedAt: string | null;
  preferences?: Preferences;
}

const loadLocalState = (): LocalStatePayload => {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) {
    return {
      categories: createDefaultExpenseCategories(),
      expenseCategories: createDefaultExpenseCategories(),
      incomeCategories: [],
      transactions: [],
      income: [],
      googleSheetsConfig: null,
      driveConnection: null,
      lastSyncedAt: null,
      preferences: { baseCurrency: "CAD", exchangeRates: [], coreExcludedCategories: DEFAULT_CORE_EXCLUDED },
    };
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
      expenseCategories: parsedExpenseCategories,
      incomeCategories: resolveIncomeCategories(parsed.incomeCategories, parsedIncome),
      googleSheetsConfig: parsed.googleSheetsConfig || null,
      driveConnection: parsed.driveConnection || null,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      preferences: parsed.preferences ? {
        ...parsed.preferences, 
        coreExcludedCategories: migrateExcludedCategories(parsed.preferences.coreExcludedCategories)
      } : { baseCurrency: "CAD", exchangeRates: [], coreExcludedCategories: DEFAULT_CORE_EXCLUDED },
    };
  } catch {
    return {
      categories: createDefaultExpenseCategories(),
      expenseCategories: createDefaultExpenseCategories(),
      incomeCategories: [],
      transactions: [],
      income: [],
      googleSheetsConfig: null,
      driveConnection: null,
      lastSyncedAt: null,
      preferences: { baseCurrency: "CAD", exchangeRates: [], coreExcludedCategories: DEFAULT_CORE_EXCLUDED },
    };
  }
};

const persistLocalState = (payload: LocalStatePayload) => {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(payload));
};

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  budgetId: string | null;
  ownerEmail: string | null;
  sharedUsers: string[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  categories: Category[];
  transactions: Transaction[];
  income: Income[];
  preferences: Preferences;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  addTransaction: (data: any) => Promise<void>;
  updateTransaction: (id: string, data: any) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addIncome: (data: any) => Promise<void>;
  updateIncome: (id: string, data: any) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
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

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocalState = useMemo(loadLocalState, []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetId] = useState<string>(getLocalBudgetId);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(initialLocalState.expenseCategories);
  const [incomeCategories, setIncomeCategories] = useState<IncomeCategory[]>(initialLocalState.incomeCategories);
  const [transactions, setTransactions] = useState<Transaction[]>(initialLocalState.transactions);
  const [income, setIncome] = useState<Income[]>(initialLocalState.income);
  const [preferences, setPreferences] = useState<Preferences>(initialLocalState.preferences || { baseCurrency: "CAD", exchangeRates: [], coreExcludedCategories: DEFAULT_CORE_EXCLUDED });
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(initialLocalState.googleSheetsConfig);
  const [driveConnection, setDriveConnection] = useState<DriveConnection | null>(initialLocalState.driveConnection);
  const [lastSynced, setLastSynced] = useState<Date | null>(initialLocalState.lastSyncedAt ? new Date(initialLocalState.lastSyncedAt) : null);
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
  const preferencesRef = useRef(preferences);
  const sheetsConfigRef = useRef(googleSheetsConfig);
  const driveConnectionRef = useRef(driveConnection);
  const autoSaveTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const loadingDriveRef = useRef(false);

  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);
  useEffect(() => { incomeCategoriesRef.current = incomeCategories; }, [incomeCategories]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { incomeRef.current = income; }, [income]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { sheetsConfigRef.current = googleSheetsConfig; }, [googleSheetsConfig]);
  useEffect(() => { driveConnectionRef.current = driveConnection; }, [driveConnection]);

  const persistSnapshot = (
    nextExpenseCategories = expenseCategoriesRef.current,
    nextIncomeCategories = incomeCategoriesRef.current,
    nextTransactions = transactionsRef.current,
    nextIncome = incomeRef.current,
    nextPreferences = preferencesRef.current,
    nextSheetsConfig = sheetsConfigRef.current,
    nextDriveConnection = driveConnectionRef.current,
    nextLastSynced = lastSynced
  ) => {
    persistLocalState({
      categories: nextExpenseCategories,
      expenseCategories: nextExpenseCategories,
      incomeCategories: nextIncomeCategories,
      transactions: nextTransactions,
      income: nextIncome,
      preferences: nextPreferences,
      googleSheetsConfig: nextSheetsConfig,
      driveConnection: nextDriveConnection,
      lastSyncedAt: nextLastSynced ? nextLastSynced.toISOString() : null,
    });
  };

  const setBudgetState = ({
    nextExpenseCategories = expenseCategoriesRef.current,
    nextIncomeCategories = incomeCategoriesRef.current,
    nextTransactions = transactionsRef.current,
    nextIncome = incomeRef.current,
    nextPreferences = preferencesRef.current,
    nextSheetsConfig = sheetsConfigRef.current,
    nextDriveConnection = driveConnectionRef.current,
    nextLastSynced = lastSynced,
  }: {
    nextExpenseCategories?: ExpenseCategory[];
    nextIncomeCategories?: IncomeCategory[];
    nextTransactions?: Transaction[];
    nextIncome?: Income[];
    nextPreferences?: Preferences;
    nextSheetsConfig?: GoogleSheetsSyncConfig | null;
    nextDriveConnection?: DriveConnection | null;
    nextLastSynced?: Date | null;
  }) => {
    expenseCategoriesRef.current = nextExpenseCategories;
    incomeCategoriesRef.current = nextIncomeCategories;
    transactionsRef.current = nextTransactions;
    incomeRef.current = nextIncome;
    preferencesRef.current = nextPreferences;
    sheetsConfigRef.current = nextSheetsConfig;
    driveConnectionRef.current = nextDriveConnection;

    setExpenseCategories(nextExpenseCategories);
    setIncomeCategories(nextIncomeCategories);
    setTransactions(nextTransactions);
    setIncome(nextIncome);
    setPreferences(nextPreferences);
    setGoogleSheetsConfig(nextSheetsConfig);
    setDriveConnection(nextDriveConnection);
    setLastSynced(nextLastSynced);

    persistSnapshot(
      nextExpenseCategories,
      nextIncomeCategories,
      nextTransactions,
      nextIncome,
      nextPreferences,
      nextSheetsConfig,
      nextDriveConnection,
      nextLastSynced
    );
  };

  const updatePreferences = async (prefs: Partial<Preferences>) => {
    setBudgetState({ nextPreferences: { ...preferencesRef.current, ...prefs } });
  };

  const storeAccessToken = (token: string | null) => {
    setGoogleSheetsAccessToken(token);
    if (token) {
      sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  };

  const beginGoogleAuth = async () => {
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, "true");
    await signInWithRedirect(auth, googleProvider);
  };

  useEffect(() => {
    const consumeRedirect = async () => {
      if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) !== "true") return;

      try {
        const result = await getRedirectResult(auth);
        const credential = result ? GoogleAuthProvider.credentialFromResult(result) : null;
        if (credential?.accessToken) {
          storeAccessToken(credential.accessToken);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google authentication failed.";
        setGoogleSheetsError(message);
        setDriveSyncError(message);
      } finally {
        sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      }
    };

    void consumeRedirect();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const ensureSignedInWithDriveScopes = async () => {
    if (!user || !googleSheetsAccessToken) {
      await beginGoogleAuth();
      throw new Error("Redirecting to Google to authorize Drive access.");
    }
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
    setBudgetState({ nextDriveConnection: nextConnection, nextLastSynced: syncedAt });
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
      setBudgetState({
        nextExpenseCategories: parsed.expenseCategories.length > 0 ? parsed.expenseCategories : createDefaultExpenseCategories(),
        nextIncomeCategories: parsed.incomeCategories,
        nextTransactions: parsed.transactions,
        nextIncome: parsed.income,
        nextSheetsConfig: parsed.googleSheetsConfig,
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
      const budgetFile = await ensureBudgetFile(token, { folderId: folder.folderId, budgetFileName: DEFAULT_BUDGET_FILE_NAME }, JSON.stringify(payload, null, 2));

      const nextConnection: DriveConnection = {
        folderId: folder.folderId,
        folderName: folder.folderName,
        folderUrl: folder.folderUrl,
        budgetFileId: budgetFile.fileId,
        budgetFileName: budgetFile.fileName,
        connectedAt: getIsoNow(),
      };

      setBudgetState({ nextDriveConnection: nextConnection });
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
    setBudgetState({ nextDriveConnection: null });
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
  }, [expenseCategories, incomeCategories, transactions, income, googleSheetsConfig, driveConnection, googleSheetsAccessToken]);

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
    setGoogleSheetsConfig(null);
    setBudgetState({ nextSheetsConfig: null });
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

    setBudgetState({ nextSheetsConfig: payload });
    setGoogleSheetsError(null);
  };

  const ensureExpenseCategoryId = async (name: string) => {
    const existing = expenseCategoriesRef.current.find((category) => category.name === name);
    if (existing) return existing.id;

    const nextCategory: ExpenseCategory = {
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    };
    const nextExpenseCategories = [...expenseCategoriesRef.current, nextCategory].sort((a, b) => a.name.localeCompare(b.name));
    setBudgetState({ nextExpenseCategories });
    return nextCategory.id;
  };

  const ensureIncomeCategoryId = async (name: string) => {
    const existing = incomeCategoriesRef.current.find((category) => category.name === name);
    if (existing) return existing.id;

    const nextCategory: IncomeCategory = {
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    };
    const nextIncomeCategories = [...incomeCategoriesRef.current, nextCategory].sort((a, b) => a.name.localeCompare(b.name));
    setBudgetState({ nextIncomeCategories });
    return nextCategory.id;
  };

  const upsertTransactionFromSync = async (id: string | null, data: Omit<Transaction, "id">) => {
    const nextTransactions = [...transactionsRef.current];
    const finalId = id || crypto.randomUUID();
    const existingIndex = nextTransactions.findIndex((item) => item.id === finalId);
    const payload: Transaction = { id: finalId, ...data };

    if (existingIndex >= 0) {
      nextTransactions[existingIndex] = payload;
    } else {
      nextTransactions.push(payload);
    }

    setBudgetState({ nextTransactions });
  };

  const upsertIncomeFromSync = async (id: string | null, data: Omit<Income, "id">) => {
    const nextIncome = [...incomeRef.current];
    const finalId = id || crypto.randomUUID();
    const existingIndex = nextIncome.findIndex((item) => item.id === finalId);
    const payload: Income = { id: finalId, ...data };

    if (existingIndex >= 0) {
      nextIncome[existingIndex] = payload;
    } else {
      nextIncome.push(payload);
    }

    setBudgetState({ nextIncome });
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

      setBudgetState({ nextSheetsConfig: nextConfig, nextLastSynced: new Date() });
      setGoogleSheetsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
      setGoogleSheetsError(message);
      const currentConfig = sheetsConfigRef.current;
      if (currentConfig) {
        setBudgetState({
          nextSheetsConfig: {
            ...currentConfig,
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
      void syncGoogleSheets("both").catch(() => undefined);
    }, interval);

    return () => window.clearInterval(timer);
  }, [googleSheetsAccessToken, googleSheetsConfig]);

  const signIn = async () => {
    await beginGoogleAuth();
  };

  const logout = async () => {
    storeAccessToken(null);
    await signOut(auth);
  };

  const addTransaction = async (data: Omit<Transaction, "id">) => {
    const nextTransactions = [
      ...transactionsRef.current,
      {
        id: crypto.randomUUID(),
        ...data,
        updated_at: getIsoNow(),
      },
    ];
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    const nextTransactions = transactionsRef.current.map((item) => (
      item.id === id ? { ...item, ...data, updated_at: getIsoNow() } : item
    ));
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteTransaction = async (id: string) => {
    const nextTransactions = transactionsRef.current.filter((item) => item.id !== id);
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      await clearSheetRowForItem(googleSheetsAccessToken, sheetsConfigRef.current, "expenses", id).catch(() => undefined);
    }
  };

  const addIncome = async (data: Omit<Income, "id">) => {
    const categoryId = await ensureIncomeCategoryId(data.category);
    const nextIncome = [
      ...incomeRef.current,
      {
        id: crypto.randomUUID(),
        ...data,
        category_id: data.category_id || categoryId,
        updated_at: getIsoNow(),
      },
    ];
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateIncome = async (id: string, data: Partial<Income>) => {
    const categoryId = data.category ? await ensureIncomeCategoryId(data.category) : undefined;
    const nextIncome = incomeRef.current.map((item) => (
      item.id === id ? { ...item, ...data, category_id: categoryId || item.category_id, updated_at: getIsoNow() } : item
    ));
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteIncome = async (id: string) => {
    const nextIncome = incomeRef.current.filter((item) => item.id !== id);
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      await clearSheetRowForItem(googleSheetsAccessToken, sheetsConfigRef.current, "income", id).catch(() => undefined);
    }
  };

  const updateExpenseCategoryTarget = async (id: string, target: number) => {
    const nextExpenseCategories = expenseCategoriesRef.current.map((item) => (
      item.id === id ? { ...item, target_amount: target } : item
    ));
    setBudgetState({ nextExpenseCategories });
  };

  const updateIncomeCategoryTarget = async (id: string, target: number) => {
    const nextIncomeCategories = incomeCategoriesRef.current.map((item) => (
      item.id === id ? { ...item, target_amount: target } : item
    ));
    setBudgetState({ nextIncomeCategories });
  };

  const updateCategoryTarget = updateExpenseCategoryTarget;

  const importData = async (type: string, rows: any[], isUpsert = false, onProgress?: (current: number, total: number) => void) => {
    let nextExpenseCategories = [...expenseCategoriesRef.current];
    let nextIncomeCategories = [...incomeCategoriesRef.current];
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];

    const getOrCreateExpenseCategoryId = (name: string) => {
      const existing = nextExpenseCategories.find((item) => item.name === name);
      if (existing) return existing.id;
      const created: ExpenseCategory = { id: crypto.randomUUID(), name, target_amount: 0 };
      nextExpenseCategories = [...nextExpenseCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    const getOrCreateIncomeCategoryId = (name: string) => {
      const existing = nextIncomeCategories.find((item) => item.name === name);
      if (existing) return existing.id;
      const created: IncomeCategory = { id: crypto.randomUUID(), name, target_amount: 0 };
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
        const categoryId = getOrCreateExpenseCategoryId(categoryName);
        const existingIndex = isUpsert ? nextTransactions.findIndex((item) => item.date === date && item.vendor === vendor) : -1;
        const payload: Transaction = {
          id: existingIndex >= 0 ? nextTransactions[existingIndex].id : crypto.randomUUID(),
          date,
          vendor,
          amount,
          category_id: categoryId,
          category_name: categoryName,
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
        const categoryId = getOrCreateIncomeCategoryId(category);
        const existingIndex = isUpsert ? nextIncome.findIndex((item) => item.date === date && item.source === source) : -1;
        const payload: Income = {
          id: existingIndex >= 0 ? nextIncome[existingIndex].id : crypto.randomUUID(),
          date,
          source,
          amount,
          category_id: existingIndex >= 0 ? nextIncome[existingIndex].category_id || categoryId : categoryId,
          category,
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

    setBudgetState({ nextExpenseCategories, nextIncomeCategories, nextTransactions, nextIncome });
  };

  const wipeData = async (type: string) => {
    if (type === "expenses") {
      setBudgetState({ nextTransactions: [] });
      return;
    }
    if (type === "income") {
      setBudgetState({ nextIncome: [] });
      return;
    }
    if (type === "categories" || type === "targets" || type === "expenseCategories") {
      setBudgetState({ nextExpenseCategories: createDefaultExpenseCategories() });
    }
    if (type === "incomeCategories") {
      setBudgetState({ nextIncomeCategories: createIncomeCategoriesFromRecords(incomeRef.current) });
    }
  };

  const shareBudget = async () => {
    throw new Error("Shared budgets are not available in private Drive mode yet.");
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
        budgetId,
        ownerEmail: user?.email || null,
        sharedUsers: [],
        expenseCategories,
        incomeCategories,
        categories: expenseCategories,
        transactions,
        income,
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
