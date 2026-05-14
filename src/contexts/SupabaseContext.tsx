import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  AiProviderConfig, Category, DriveConnection, ExpenseCategory, GooglePullSummary,
  GoogleSheetsInspectionResult, GoogleSheetsSyncConfig, GoogleSheetsSyncDirection,
  GoogleSheetsSyncMode, GoogleSheetsSyncOptions, ImportBatch, ImportCommitOptions,
  ImportCommitSummary, ImportPreviewOptions, ImportSource, Income, IncomeCategory,
  PlaidCategoryMapping, PlaidConnection, PlaidCredentials, Preferences, RecurringRule,
  SheetRangeDraft, TellerCategoryMapping, TellerConnection, TellerCredentials,
  Transaction, UpcomingRecurringInstance,
} from "../types";
import {
  getSheetColumnValuesUntilEmptyRun, getSheetValues, inspectSpreadsheet, normalizeSheetName,
  parseA1CellReference, parseSpreadsheetId,
} from "../utils/googleSheetsSync";
import {
  createBudgetDataFile, ensureBudgetFile, ensureVibeBudgetFolder, parseBudgetDataFile,
  readBudgetFileContent, updateBudgetFileContent,
} from "../utils/googleDrive";
import { signInWithGoogle } from "../lib/auth";
import { computeUpcoming, materializeRule } from "../utils/recurring";
import { getTodayStr } from "../utils/dateUtils";
import { previewImportBatch } from "../utils/importPipeline";
import type { User as FirebaseUser } from "./FirebaseUserType";

const GOOGLE_ACCESS_TOKEN_KEY = "vibebudgetGoogleAccessToken";
const GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY = "vibebudgetGoogleAccessTokenExpiresAt";
const GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY = "vibebudgetGoogleAccessTokenOwnerEmail";
const GOOGLE_ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000;
const GOOGLE_SHEETS_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];
const LOCAL_STATE_KEY = "vibebudgetLocalState";
const TRANSACTIONS_CACHE_KEY_PREFIX = "vb_transactions_cache";
const DEFAULT_BUDGET_FILE_NAME = "budget.json";
const LEGACY_CATEGORY_RENAMES: Record<string, string> = {
  "Canada Transfer": "Canada Investments",
  "India Transfer - Self": "India Transfer Investment",
};

const DEFAULT_CATEGORY_NAMES = [
  "Alcohol", "Canada Investments", "Car fuel", "Car maintenance", "Car Parking",
  "Clothing", "Donation", "Electronics", "Entertainment", "Gifts", "Going out food",
  "Groceries", "Household Items", "India Transfer Investment", "Insurance", "Medical",
  "Misc.", "Public transportation", "Rent", "Shopping", "Telecom", "Travel", "Utilities",
];

const DEFAULT_CORE_EXCLUDED = ["Canada Investments", "India Transfer Investment"];

const DEFAULT_PREFERENCES: Preferences = { baseCurrency: "CAD", exchangeRates: [], coreExcludedCategories: DEFAULT_CORE_EXCLUDED };

const stripUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map((item) => stripUndefinedFields(item)) as T;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefinedFields(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
};

const getIsoNow = () => new Date().toISOString();

const readStoredGoogleAccessToken = () => {
  const token = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY) || localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  if (!token) return null;
  const expiresAtRaw = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY) || localStorage.getItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY);
  const expiresAt = expiresAtRaw ? Number.parseInt(expiresAtRaw, 10) : 0;
  if (!expiresAt || expiresAt <= Date.now()) {
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY); sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY); sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY);
    return null;
  }
  return token;
};

const readStoredGoogleAccessTokenOwnerEmail = () =>
  sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY) || localStorage.getItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY);

const hasRequiredSheetsScopes = async (token: string) => {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!response.ok) return false;
    const payload = await response.json() as { scope?: string };
    const scopeSet = new Set(String(payload.scope || "").split(" ").filter(Boolean));
    return GOOGLE_SHEETS_REQUIRED_SCOPES.every((scope) => scopeSet.has(scope));
  } catch { return false; }
};

const renameLegacyCategory = (name: string) => LEGACY_CATEGORY_RENAMES[name] || name;
const normalizeCategoryName = (name: string) => renameLegacyCategory(name).trim().replace(/\s+/g, " ");
const CANONICAL_EXPENSE_CATEGORY_NAMES = DEFAULT_CATEGORY_NAMES.map((n) => normalizeCategoryName(n)).sort((a, b) => a.localeCompare(b));
const CANONICAL_EXPENSE_CATEGORY_NAME_SET = new Set(CANONICAL_EXPENSE_CATEGORY_NAMES);
const FALLBACK_EXPENSE_CATEGORY_NAME = "Misc.";

const normalizeExpenseCategoryName = (name: string) => {
  const n = normalizeCategoryName(name);
  return n || FALLBACK_EXPENSE_CATEGORY_NAME;
};

const normalizeSheetIdentityText = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const normalizeSheetIdentityAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value || "").replace(/[^-0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hashSheetIdentity = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
};
const makeSheetRowIdentity = (...values: unknown[]) => values.map((v) => (typeof v === "number" ? v.toFixed(2) : normalizeSheetIdentityText(v))).join("|");

const dedupeCategoriesByName = <T extends { id: string; name: string; target_amount: number }>(categories: T[]) => {
  const byName = new Map<string, T>();
  categories.forEach((c) => {
    const name = normalizeCategoryName(c.name);
    if (!name) return;
    const existing = byName.get(name);
    if (!existing) { byName.set(name, { ...c, name }); return; }
    if ((existing.target_amount || 0) === 0 && (c.target_amount || 0) !== 0) byName.set(name, { ...existing, name, target_amount: c.target_amount });
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const createDefaultExpenseCategories = (): ExpenseCategory[] => CANONICAL_EXPENSE_CATEGORY_NAMES.map((name) => ({ id: crypto.randomUUID(), name, target_amount: 0 }));

const migrateExpenseCategories = (categories: ExpenseCategory[]) => {
  const normalized = dedupeCategoriesByName(categories.map((c) => ({ ...c, name: normalizeExpenseCategoryName(c.name) })));
  return normalized.length > 0 ? normalized : createDefaultExpenseCategories();
};

const migrateIncomeCategories = (categories: IncomeCategory[]) => dedupeCategoriesByName(categories.map((c) => ({ ...c, name: normalizeCategoryName(c.name) })));
const migrateTransactions = (txs: Transaction[]) => txs.map((t) => ({ ...t, category_name: normalizeExpenseCategoryName(t.category_name) }));
const migrateIncomeRecords = (items: Income[]) => items.map((i) => ({ ...i, category: normalizeCategoryName(i.category) }));
const migrateExcludedCategories = (cats?: string[]) => Array.from(new Set((cats || DEFAULT_CORE_EXCLUDED).map(normalizeCategoryName)));

const normalizePreferences = (prefs?: Preferences | null): Preferences => ({
  baseCurrency: prefs?.baseCurrency || DEFAULT_PREFERENCES.baseCurrency,
  exchangeRates: Array.isArray(prefs?.exchangeRates) ? prefs!.exchangeRates : [],
  coreExcludedCategories: migrateExcludedCategories(prefs?.coreExcludedCategories),
});

const createIncomeCategoriesFromRecords = (records: Income[]): IncomeCategory[] =>
  Array.from(new Set(records.map((i) => normalizeCategoryName(i.category)).filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((name) => ({ id: crypto.randomUUID(), name, target_amount: 0 }));

const resolveIncomeCategories = (stored: IncomeCategory[] | undefined, records: Income[]) =>
  Array.isArray(stored) && stored.length > 0 ? migrateIncomeCategories(stored) : createIncomeCategoriesFromRecords(records);

interface LocalStatePayload { expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[]; transactions: Transaction[]; income: Income[]; recurringRules?: RecurringRule[]; googleSheetsConfig: GoogleSheetsSyncConfig | null; driveConnection: DriveConnection | null; lastSyncedAt: string | null; preferences?: Preferences; }

const createEmptyLocalState = (): LocalStatePayload => ({
  expenseCategories: createDefaultExpenseCategories(), incomeCategories: [], transactions: [], income: [], recurringRules: [],
  googleSheetsConfig: null, driveConnection: null, lastSyncedAt: null, preferences: DEFAULT_PREFERENCES,
});

const loadLocalState = (): LocalStatePayload => {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) return createEmptyLocalState();
  try {
    const p = JSON.parse(raw) as Partial<LocalStatePayload>;
    return {
      transactions: Array.isArray(p.transactions) ? migrateTransactions(p.transactions) : [],
      income: Array.isArray(p.income) ? migrateIncomeRecords(p.income) : [],
      recurringRules: Array.isArray(p.recurringRules) ? p.recurringRules : [],
      expenseCategories: Array.isArray(p.expenseCategories) && p.expenseCategories.length > 0 ? migrateExpenseCategories(p.expenseCategories) : createDefaultExpenseCategories(),
      incomeCategories: resolveIncomeCategories(p.incomeCategories, Array.isArray(p.income) ? p.income : []),
      googleSheetsConfig: p.googleSheetsConfig || null, driveConnection: p.driveConnection || null,
      lastSyncedAt: typeof p.lastSyncedAt === "string" ? p.lastSyncedAt : null,
      preferences: normalizePreferences(p.preferences),
    };
  } catch { return createEmptyLocalState(); }
};

const clearLocalState = () => localStorage.removeItem(LOCAL_STATE_KEY);

const getTransactionsCacheKey = (uid: string) => `${TRANSACTIONS_CACHE_KEY_PREFIX}:${uid}`;
const loadTransactionsCache = (uid: string): Transaction[] => {
  const raw = localStorage.getItem(getTransactionsCacheKey(uid));
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? migrateTransactions(p as Transaction[]) : []; } catch { return []; }
};
const saveTransactionsCache = (uid: string, items: Transaction[]) => localStorage.setItem(getTransactionsCacheKey(uid), JSON.stringify(items));
const clearTransactionsCache = (uid: string) => localStorage.removeItem(getTransactionsCacheKey(uid));

const LAST_TX_SYNC_KEY_PREFIX = 'vb_tx_last_sync';
const getLastTxSyncKey = (uid: string) => `${LAST_TX_SYNC_KEY_PREFIX}:${uid}`;

const incrementalTransactionSync = async (uid: string): Promise<Transaction[]> => {
  const lastSyncRaw = localStorage.getItem(getLastTxSyncKey(uid));
  const cached = loadTransactionsCache(uid);
  let q = supabase.from('transactions').select('*').eq('user_id', uid);
  if (lastSyncRaw && cached.length > 0) q = q.gt('updated_at', new Date(parseInt(lastSyncRaw, 10)).toISOString());
  const { data: changed, error } = await q;
  if (error) throw error;
  const changedRows = (changed || []) as unknown as Transaction[];
  const byId = new Map(cached.map((t) => [t.id, t]));
  for (const tx of changedRows) { if (tx.deleted) byId.delete(tx.id); else byId.set(tx.id, tx); }
  const merged = migrateTransactions(Array.from(byId.values()));
  localStorage.setItem(getLastTxSyncKey(uid), String(Date.now()));
  saveTransactionsCache(uid, merged);
  return merged;
};

const SESSION_CACHE_VERSION = 'v1';
const getSessionKey = (uid: string, name: string) => `vb_session_${name}_${SESSION_CACHE_VERSION}:${uid}`;
const readSessionCache = <T,>(uid: string, name: string): T[] | null => {
  try { const raw = sessionStorage.getItem(getSessionKey(uid, name)); return raw ? (JSON.parse(raw) as T[]) : null; } catch { return null; }
};
const writeSessionCache = <T,>(uid: string, name: string, data: T[]): void => { try { sessionStorage.setItem(getSessionKey(uid, name), JSON.stringify(data)); } catch { /* storage full */ } };
const clearSessionCache = (uid: string, name: string): void => { sessionStorage.removeItem(getSessionKey(uid, name)); };

interface UserProfileDocument {
  budgetId: string; email: string; displayName?: string | null; photoURL?: string | null;
  preferences?: Preferences; googleSheetsConfig?: GoogleSheetsSyncConfig | null;
  driveConnection?: DriveConnection | null; plaidConnection?: PlaidConnection | null;
  plaidCategoryMappings?: PlaidCategoryMapping[]; tellerConnection?: TellerConnection | null;
  tellerCategoryMappings?: TellerCategoryMapping[]; lastSyncedAt?: string | null;
  aiConfig?: AiProviderConfig | null;
}

export interface FirebaseContextType {
  user: FirebaseUser | null; loading: boolean; authError: string | null; clearAuthError: () => void;
  onboardingCompleted: boolean; onboardingStep: number;
  saveOnboardingStep: (step: number) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  budgetId: string | null; ownerEmail: string | null; sharedUsers: string[];
  expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[]; categories: Category[];
  transactions: Transaction[]; income: Income[]; recurringRules: RecurringRule[];
  preferences: Preferences; updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  signIn: () => Promise<void>; logout: () => Promise<void>;
  addTransaction: (data: Omit<Transaction, "id">) => Promise<void>;
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>; refreshTransactionsNow: () => Promise<number>;
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
  addExpenseCategory: (name: string, targetAmount: number) => Promise<void>;
  addIncomeCategory: (name: string, targetAmount: number) => Promise<void>;
  deleteExpenseCategory: (id: string) => Promise<void>;
  deleteIncomeCategory: (id: string) => Promise<void>;
  updateExpenseCategoryName: (id: string, name: string) => Promise<void>;
  updateIncomeCategoryName: (id: string, name: string) => Promise<void>;
  previewImport: (source: ImportSource, payload: string | unknown[] | Record<string, unknown>, options?: ImportPreviewOptions) => ImportBatch;
  commitImport: (batch: ImportBatch, options?: ImportCommitOptions, onProgress?: (current: number, total: number) => void) => Promise<ImportCommitSummary>;
  importData: (type: string, data: any[], isUpsert?: boolean, onProgress?: (current: number, total: number) => void) => Promise<void>;
  upsertGoogleSheetRows: (type: "expenses" | "income", rows: any[]) => Promise<{ imported: number; updated: number; skipped: number }>;
  wipeData: (type: string) => Promise<void>; backupToDrive: () => Promise<void>; syncToCloud: () => Promise<void>; shareBudget: (email: string) => Promise<void>;
  googleSheetsConfig: GoogleSheetsSyncConfig | null; googleSheetsConnected: boolean; googleSheetsSyncing: boolean;
  googleSheetsError: string | null; connectGoogleSheets: () => Promise<void>; disconnectGoogleSheets: () => void;
  inspectGoogleSheetsSpreadsheet: (spreadsheetUrl: string, expensesSheetName: string, incomeSheetName: string, expenseCategoriesSheetName?: string, incomeCategoriesSheetName?: string) => Promise<GoogleSheetsInspectionResult>;
  previewGoogleSheetColumn: (spreadsheetUrl: string, sheetName: string, startCell: string, endCell: string | null, noEndRange: boolean) => Promise<{ headerValue: string; samples: Array<{ cell: string; value: string }>; last: { cell: string; value: string } | null; }>;
  saveGoogleSheetsConfig: (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => Promise<void>;
  syncGoogleSheets: (direction?: GoogleSheetsSyncDirection, options?: GoogleSheetsSyncOptions) => Promise<GooglePullSummary | void>;
  validateGoogleSheetsMapping: () => { valid: boolean; missing: string[] }; googlePullSummary: GooglePullSummary | null;
  backingUp: boolean; isSyncing: boolean; lastSynced: Date | null; driveConnection: DriveConnection | null;
  driveConnected: boolean; driveSyncError: string | null; connectDriveFolder: (folderRef?: string) => Promise<void>;
  previewBudgetFromDrive: () => Promise<ImportBatch>; loadBudgetFromDrive: () => Promise<void>; disconnectDriveFolder: () => void;
  googleSheetsAccessToken: string | null; plaidConnected: boolean; plaidConnection: PlaidConnection | null;
  plaidSyncing: boolean; plaidError: string | null; plaidCredentials: PlaidCredentials | null;
  plaidCategoryMappings: PlaidCategoryMapping[]; connectPlaid: (publicToken: string) => Promise<void>;
  disconnectPlaid: () => Promise<void>; syncPlaidTransactions: () => Promise<ImportCommitSummary>;
  fetchPlaidAccounts: () => Promise<import("../types").PlaidAccount[]>;
  setPlaidCredentials: (creds: PlaidCredentials | null) => void; setPlaidCategoryMappings: (mappings: PlaidCategoryMapping[]) => void;
  tellerConnected: boolean; tellerConnection: TellerConnection | null; tellerSyncing: boolean; tellerError: string | null;
  tellerCredentials: TellerCredentials | null; tellerCategoryMappings: TellerCategoryMapping[];
  connectTeller: (enrollment: import("../types").TellerEnrollment) => Promise<void>; disconnectTeller: () => Promise<void>;
  syncTellerTransactions: () => Promise<ImportCommitSummary>; fetchTellerAccounts: () => Promise<import("../types").TellerAccount[]>;
  setTellerCredentials: (creds: TellerCredentials | null) => void; setTellerCategoryMappings: (mappings: TellerCategoryMapping[]) => void;
  aiConfig: AiProviderConfig | null; saveAiConfig: (config: AiProviderConfig | null) => Promise<void>;
}

export const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

const isSameAsDefaultPreferences = (prefs: Preferences) => JSON.stringify(normalizePreferences(prefs)) === JSON.stringify(DEFAULT_PREFERENCES);

const hasMeaningfulLocalData = (p: LocalStatePayload) =>
  p.transactions.length > 0 || p.income.length > 0 || (p.recurringRules?.length || 0) > 0 ||
  p.incomeCategories.length > 0 || p.googleSheetsConfig !== null || p.driveConnection !== null ||
  p.lastSyncedAt !== null || !isSameAsDefaultPreferences(normalizePreferences(p.preferences));

const mapSupabaseUser = (supabaseUser: import("@supabase/supabase-js").User | null): FirebaseUser | null => {
  if (!supabaseUser) return null;
  return {
    uid: supabaseUser.id, email: supabaseUser.email,
    displayName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
    photoURL: supabaseUser.user_metadata?.avatar_url || null, phoneNumber: supabaseUser.phone || null,
    providerId: "google.com", providerData: [], emailVerified: !!supabaseUser.email_confirmed_at,
    isAnonymous: false, metadata: {}, refreshToken: "", tenantId: null, toJSON: () => ({}),
    delete: async () => {}, reload: async () => {},
    getIdToken: async () => { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token || ""; },
  } as FirebaseUser;
};

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocalState = useMemo(loadLocalState, []);
  const [user, setUser] = useState<FirebaseUser | null>(null);
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
  const [googleSheetsAccessToken, setGoogleSheetsAccessToken] = useState<string | null>(() => readStoredGoogleAccessToken());
  const [googleSheetsSyncing, setGoogleSheetsSyncing] = useState(false);
  const [googlePullSummary, setGooglePullSummary] = useState<GooglePullSummary | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStep] = useState<number>(0);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [plaidConnection, setPlaidConnection] = useState<PlaidConnection | null>(null);
  const [plaidSyncing, setPlaidSyncing] = useState(false);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidCredentials, setPlaidCredentials] = useState<PlaidCredentials | null>(() => {
    const raw = sessionStorage.getItem("vibebudgetPlaidCredentials");
    if (!raw) return null;
    try { return JSON.parse(raw) as PlaidCredentials; } catch { return null; }
  });
  const [plaidCategoryMappings, setPlaidCategoryMappings] = useState<PlaidCategoryMapping[]>([]);
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
  const pendingImportRef = useRef<{ expenseCategories: number; incomeCategories: number; transactions: number; income: number; } | null>(null);
  const ignoreStaleTransactionSnapshotsUntilRef = useRef<number>(0);
  const prevAuthUidRef = useRef<string | null>(null);

  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);
  useEffect(() => { incomeCategoriesRef.current = incomeCategories; }, [incomeCategories]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { incomeRef.current = income; }, [income]);
  useEffect(() => { recurringRulesRef.current = recurringRules; }, [recurringRules]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { sheetsConfigRef.current = googleSheetsConfig; }, [googleSheetsConfig]);
  useEffect(() => { driveConnectionRef.current = driveConnection; }, [driveConnection]);
  useEffect(() => { if (plaidCredentials) { sessionStorage.setItem("vibebudgetPlaidCredentials", JSON.stringify(plaidCredentials)); } else { sessionStorage.removeItem("vibebudgetPlaidCredentials"); } }, [plaidCredentials]);
  useEffect(() => { if (tellerCredentials) { sessionStorage.setItem("vibebudgetTellerCredentials", JSON.stringify(tellerCredentials)); } else { sessionStorage.removeItem("vibebudgetTellerCredentials"); } }, [tellerCredentials]);

  const resetBudgetState = useCallback(() => {
    const d = createEmptyLocalState();
    setBudgetId(null); setExpenseCategories(d.expenseCategories); setIncomeCategories(d.incomeCategories);
    setTransactions(d.transactions); setIncome(d.income); setRecurringRules(d.recurringRules || []);
    setPreferences(DEFAULT_PREFERENCES); setGoogleSheetsConfig(null); setDriveConnection(null); setLastSynced(null);
    setAuthError(null); setGoogleSheetsError(null); setDriveSyncError(null); setPlaidConnection(null);
    setPlaidSyncing(false); setPlaidError(null); setPlaidCredentials(null); setPlaidCategoryMappings([]);
  }, []);

  const formatAuthBootstrapError = (error: unknown) => {
    const m = error instanceof Error ? error.message : String(error || "");
    if (m.toLowerCase().includes("permission") || m.toLowerCase().includes("denied") || m.toLowerCase().includes("row-level security"))
      return "Google sign-in worked, but Supabase denied access. Check Row-Level Security policies, then try again.";
    return m || "Unable to load your account data from Supabase.";
  };

  const getCurrentUserId = useCallback(async (): Promise<string> => {
    const { data: { user: u }, error } = await supabase.auth.getUser();
    if (error || !u) throw new Error("Sign in with Google first.");
    return u.id;
  }, []);

  const storeAccessToken = (token: string | null, ownerEmail?: string | null) => {
    setGoogleSheetsAccessToken(token);
    if (token) {
      const expiresAt = String(Date.now() + GOOGLE_ACCESS_TOKEN_TTL_MS);
      const normalizedOwner = (ownerEmail || user?.email || "").trim().toLowerCase();
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token); sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY, expiresAt); sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY, expiresAt);
      if (normalizedOwner) { localStorage.setItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY, normalizedOwner); sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY, normalizedOwner); }
    } else {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY); sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY); sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_EXPIRES_AT_KEY);
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY); sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_OWNER_EMAIL_KEY);
    }
  };

  useEffect(() => {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
      expenseCategories, incomeCategories, transactions, income, recurringRules, googleSheetsConfig, driveConnection,
      lastSyncedAt: lastSynced ? lastSynced.toISOString() : null, preferences: normalizePreferences(preferences),
    }));
  }, [driveConnection, expenseCategories, googleSheetsConfig, income, incomeCategories, lastSynced, preferences, recurringRules, transactions]);

  const saveUserProfilePatch = useCallback(async (patch: Partial<UserProfileDocument>) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const sp: Record<string, unknown> = {};
    if (patch.budgetId !== undefined) sp.budget_id = patch.budgetId;
    if (patch.email !== undefined) sp.email = patch.email;
    if (patch.displayName !== undefined) sp.display_name = patch.displayName;
    if (patch.photoURL !== undefined) sp.photo_url = patch.photoURL;
    if (patch.preferences !== undefined) sp.preferences = patch.preferences;
    if (patch.googleSheetsConfig !== undefined) sp.google_sheets_config = patch.googleSheetsConfig;
    if (patch.driveConnection !== undefined) sp.drive_connection = patch.driveConnection;
    if (patch.plaidConnection !== undefined) sp.plaid_connection = patch.plaidConnection;
    if (patch.plaidCategoryMappings !== undefined) sp.plaid_category_mappings = patch.plaidCategoryMappings;
    if (patch.tellerConnection !== undefined) sp.teller_connection = patch.tellerConnection;
    if (patch.tellerCategoryMappings !== undefined) sp.teller_category_mappings = patch.tellerCategoryMappings;
    if (patch.lastSyncedAt !== undefined) sp.last_synced_at = patch.lastSyncedAt;
    if (patch.aiConfig !== undefined) sp.ai_config = patch.aiConfig;
    const { error } = await supabase.from('users').update(stripUndefinedFields(sp)).eq('id', cu.id);
    if (error) throw error;
  }, []);

  const seedUserFromLocalState = useCallback(async () => {
    const { data: { user: nu } } = await supabase.auth.getUser();
    if (!nu) return;
    if (seededUsersRef.current.has(nu.id)) return;
    seededUsersRef.current.add(nu.id);
    const localState = initialLocalState;
    await supabase.from('users').upsert({
      id: nu.id, budget_id: nu.id, email: nu.email || "",
      display_name: nu.user_metadata?.full_name || nu.user_metadata?.name || null,
      photo_url: nu.user_metadata?.avatar_url || null,
      preferences: normalizePreferences(localState.preferences),
      google_sheets_config: localState.googleSheetsConfig,
      drive_connection: localState.driveConnection,
      last_synced_at: localState.lastSyncedAt,
    });
    const cats = hasMeaningfulLocalData(localState) || localState.expenseCategories.length > 0 ? localState.expenseCategories : createDefaultExpenseCategories();
    await supabase.from('categories').upsert(cats.map((c) => ({ ...c, user_id: nu.id, deleted: false, updated_at: getIsoNow() })));
    const ic = migrateIncomeCategories(localState.incomeCategories);
    if (ic.length > 0) await supabase.from('income_categories').upsert(ic.map((c) => ({ ...c, user_id: nu.id, deleted: false, updated_at: getIsoNow() })));
    if (localState.transactions.length > 0) await supabase.from('transactions').upsert(localState.transactions.map((t) => ({ ...t, user_id: nu.id, updated_at: getIsoNow() })));
    if (localState.income.length > 0) await supabase.from('income').upsert(localState.income.map((t) => ({ ...t, user_id: nu.id })));
    if ((localState.recurringRules || []).length > 0) await supabase.from('recurring_rules').upsert(localState.recurringRules!.map((r) => ({ ...r, user_id: nu.id })));
    clearSessionCache(nu.id, 'expenseCategories');
    clearSessionCache(nu.id, 'incomeCategories');
    clearSessionCache(nu.id, 'recurringRules');
    clearLocalState();
  }, [initialLocalState]);

  const replaceCollection = useCallback(async <T extends { id: string }>(
    tableName: 'categories' | 'income_categories' | 'transactions' | 'income',
    items: T[], existingIds: string[], softDelete = false,
  ) => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) throw new Error("Sign in with Google first.");
    for (const existingId of existingIds) {
      if (!items.find((i) => i.id === existingId)) {
        if (softDelete) {
          await supabase.from(tableName).update({ deleted: true, updated_at: getIsoNow() }).eq('id', existingId).eq('user_id', uid);
        } else {
          await supabase.from(tableName).delete().eq('id', existingId).eq('user_id', uid);
        }
      }
    }
    const upsertItems = items.map((item: any) => ({ ...item, user_id: uid, updated_at: tableName === 'transactions' ? getIsoNow() : undefined }));
    if (upsertItems.length > 0) {
      const { error } = await supabase.from(tableName).upsert(upsertItems);
      if (error) throw error;
    }
  }, []);

  const replaceBudgetDataInFirestore = useCallback(async (payload: {
    nextExpenseCategories: ExpenseCategory[]; nextIncomeCategories: IncomeCategory[];
    nextTransactions: Transaction[]; nextIncome: Income[]; nextPreferences: Preferences;
    nextSheetsConfig: GoogleSheetsSyncConfig | null; nextDriveConnection: DriveConnection | null;
    nextLastSynced: Date | null;
  }) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const uid = cu.id;
    await Promise.all([
      replaceCollection('categories', payload.nextExpenseCategories, expenseCategoriesRef.current.map((i) => i.id)),
      replaceCollection('income_categories', payload.nextIncomeCategories, incomeCategoriesRef.current.map((i) => i.id)),
      replaceCollection('transactions', payload.nextTransactions, transactionsRef.current.map((i) => i.id), true),
      replaceCollection('income', payload.nextIncome, incomeRef.current.map((i) => i.id)),
      saveUserProfilePatch({
        preferences: normalizePreferences(payload.nextPreferences),
        googleSheetsConfig: payload.nextSheetsConfig, driveConnection: payload.nextDriveConnection,
        lastSyncedAt: payload.nextLastSynced ? payload.nextLastSynced.toISOString() : null,
      }),
    ]);
    clearSessionCache(uid, 'expenseCategories'); clearSessionCache(uid, 'incomeCategories');
  }, [replaceCollection, saveUserProfilePatch]);

  const upsertBudgetDataInFirestore = useCallback(async (payload: {
    nextExpenseCategories: ExpenseCategory[]; nextIncomeCategories: IncomeCategory[];
    nextTransactions: Transaction[]; nextIncome: Income[]; nextPreferences: Preferences;
    nextSheetsConfig: GoogleSheetsSyncConfig | null; nextDriveConnection: DriveConnection | null;
    nextLastSynced: Date | null;
  }) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const uid = cu.id;
    if (payload.nextExpenseCategories.length > 0) await supabase.from('categories').upsert(payload.nextExpenseCategories.map((i) => ({ ...i, user_id: uid, updated_at: getIsoNow() })));
    if (payload.nextIncomeCategories.length > 0) await supabase.from('income_categories').upsert(payload.nextIncomeCategories.map((i) => ({ ...i, user_id: uid, updated_at: getIsoNow() })));
    if (payload.nextTransactions.length > 0) await supabase.from('transactions').upsert(payload.nextTransactions.map((i) => ({ ...i, user_id: uid, updated_at: getIsoNow() })));
    if (payload.nextIncome.length > 0) await supabase.from('income').upsert(payload.nextIncome.map((i) => ({ ...i, user_id: uid })));
    clearSessionCache(uid, 'expenseCategories'); clearSessionCache(uid, 'incomeCategories');
    await saveUserProfilePatch({
      preferences: normalizePreferences(payload.nextPreferences),
      googleSheetsConfig: payload.nextSheetsConfig, driveConnection: payload.nextDriveConnection,
      lastSyncedAt: payload.nextLastSynced ? payload.nextLastSynced.toISOString() : null,
    });
  }, [saveUserProfilePatch]);

  const beginGoogleAuth = async (withDriveScopes = false) => { await signInWithGoogle(withDriveScopes); };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = mapSupabaseUser(session?.user || null);
      const nextUid = nextUser?.uid ?? null;
      const uidChanged = nextUid !== prevAuthUidRef.current;
      prevAuthUidRef.current = nextUid;
      // Preserve stable user object reference when uid hasn't changed (prevents effect re-runs)
      setUser(prev => (prev?.uid === nextUser?.uid ? prev : nextUser));
      if (!nextUser) { resetBudgetState(); setLoading(false); return; }
      const storedOwnerEmail = readStoredGoogleAccessTokenOwnerEmail();
      if (googleSheetsAccessToken && storedOwnerEmail && nextUser.email && storedOwnerEmail !== nextUser.email.trim().toLowerCase()) storeAccessToken(null);
      setBudgetId(nextUser.uid); setAuthError(null);
      const cached = loadTransactionsCache(nextUser.uid);
      if (cached.length > 0) setTransactions(cached);
      if (uidChanged) setLoading(true);
    });
    return () => { subscription.unsubscribe(); };
  }, [googleSheetsAccessToken, resetBudgetState]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const loadedState = { profile: false, categories: false, incomeCategories: false, transactions: false, income: false, recurringRules: false };
    const remotePresence = { profile: false, categories: false, incomeCategories: false, transactions: false, income: false, recurringRules: false };
    let seedingStarted = false;
    const markLoaded = () => {
      if (Object.values(loadedState).every(Boolean)) {
        setAuthError(null); setLoading(false);
        if (!Object.values(remotePresence).some(Boolean) && !seedingStarted) {
          seedingStarted = true;
          void seedUserFromLocalState().catch((error) => { console.error("Failed to seed local state into Supabase", error); setAuthError(formatAuthBootstrapError(error)); });
        } else if (Object.values(remotePresence).some(Boolean)) { clearLocalState(); }
      }
    };
    const handleLoadError = (scope: string, error: unknown) => { console.error(`Supabase ${scope} load failed`, error); setAuthError(formatAuthBootstrapError(error)); setLoading(false); };

    const subscriptions: { unsubscribe: () => void }[] = [];
    const profileChannel = supabase.channel(`profile-${uid}`);
    profileChannel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'users', filter: `id=eq.${uid}` }, (payload: any) => {
      const data = payload.new as Record<string, unknown> || {};
      if (data && typeof data === 'object' && 'id' in data) {
        remotePresence.profile = true;
        setPreferences(normalizePreferences(data.preferences as Preferences | undefined | null));
        setGoogleSheetsConfig(data.google_sheets_config as GoogleSheetsSyncConfig | null || null);
        setDriveConnection(data.drive_connection as DriveConnection | null || null);
        setPlaidConnection(data.plaid_connection as PlaidConnection | null || null);
        setPlaidCategoryMappings(Array.isArray(data.plaid_category_mappings) ? data.plaid_category_mappings as PlaidCategoryMapping[] : []);
        setTellerConnection(data.teller_connection as TellerConnection | null || null);
        setTellerCategoryMappings(Array.isArray(data.teller_category_mappings) ? data.teller_category_mappings as TellerCategoryMapping[] : []);
        setLastSynced(data.last_synced_at ? new Date(data.last_synced_at as string) : null);
        setAiConfig(data.ai_config as AiProviderConfig | null || null);
        setOnboardingCompleted(data.onboarding_completed == null ? true : Boolean(data.onboarding_completed));
        setOnboardingStep(typeof data.onboarding_step === 'number' ? data.onboarding_step : 0);
        loadedState.profile = true; markLoaded();
      }
    }).subscribe();
    subscriptions.push(profileChannel);

    // Initial profile fetch — realtime only fires on changes, not on first load
    Promise.resolve(supabase.from('users').select('*').eq('id', uid).single()).then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') { handleLoadError('profile', error); return; }
      if (data) {
        remotePresence.profile = true;
        setPreferences(normalizePreferences(data.preferences as Preferences | undefined | null));
        setGoogleSheetsConfig(data.google_sheets_config as GoogleSheetsSyncConfig | null || null);
        setDriveConnection(data.drive_connection as DriveConnection | null || null);
        setPlaidConnection(data.plaid_connection as PlaidConnection | null || null);
        setPlaidCategoryMappings(Array.isArray(data.plaid_category_mappings) ? data.plaid_category_mappings as PlaidCategoryMapping[] : []);
        setTellerConnection(data.teller_connection as TellerConnection | null || null);
        setTellerCategoryMappings(Array.isArray(data.teller_category_mappings) ? data.teller_category_mappings as TellerCategoryMapping[] : []);
        setLastSynced(data.last_synced_at ? new Date(data.last_synced_at as string) : null);
        setAiConfig(data.ai_config as AiProviderConfig | null || null);
        setOnboardingCompleted((data as Record<string, unknown>).onboarding_completed == null ? true : Boolean((data as Record<string, unknown>).onboarding_completed));
        setOnboardingStep(typeof (data as Record<string, unknown>).onboarding_step === 'number' ? (data as Record<string, unknown>).onboarding_step as number : 0);
      }
      loadedState.profile = true; markLoaded();
    }).catch((err: unknown) => handleLoadError('profile', err));

    const rulesChannel = supabase.channel(`recurring-rules-${uid}`);
    rulesChannel.on('postgres_changes' as any, { event: '*', schema: 'public', table: 'recurring_rules', filter: `user_id=eq.${uid}` }, () => {
      Promise.resolve(supabase.from('recurring_rules').select('*').eq('user_id', uid)).then(({ data }) => {
        if (data) { const rules = data as unknown as RecurringRule[]; writeSessionCache(uid, 'recurringRules', rules); setRecurringRules(rules); }
      }).catch((err: unknown) => handleLoadError('recurring rules listener', err));
    }).subscribe();
    subscriptions.push(rulesChannel);

    const cachedCat = readSessionCache<ExpenseCategory>(uid, 'expenseCategories');
    if (cachedCat) { remotePresence.categories = cachedCat.length > 0; setExpenseCategories(cachedCat.length > 0 ? migrateExpenseCategories(cachedCat) : createDefaultExpenseCategories()); loadedState.categories = true; markLoaded(); }
    else { Promise.resolve(supabase.from('categories').select('*').eq('user_id', uid)).then(({ data, error }) => { if (error) { handleLoadError('categories', error); return; } const nc = (data || []) as unknown as ExpenseCategory[]; writeSessionCache(uid, 'expenseCategories', nc); remotePresence.categories = nc.length > 0; setExpenseCategories(nc.length > 0 ? migrateExpenseCategories(nc) : createDefaultExpenseCategories()); loadedState.categories = true; markLoaded(); }).catch((err: unknown) => handleLoadError('categories', err)); }

    const cachedIC = readSessionCache<IncomeCategory>(uid, 'incomeCategories');
    if (cachedIC) { remotePresence.incomeCategories = cachedIC.length > 0; setIncomeCategories(cachedIC.length > 0 ? migrateIncomeCategories(cachedIC) : []); loadedState.incomeCategories = true; markLoaded(); }
    else { Promise.resolve(supabase.from('income_categories').select('*').eq('user_id', uid)).then(({ data, error }) => { if (error) { handleLoadError('income categories', error); return; } const nic = (data || []) as unknown as IncomeCategory[]; writeSessionCache(uid, 'incomeCategories', nic); remotePresence.incomeCategories = nic.length > 0; setIncomeCategories(nic.length > 0 ? migrateIncomeCategories(nic) : []); loadedState.incomeCategories = true; markLoaded(); }).catch((err: unknown) => handleLoadError('income categories', err)); }

    const cachedTx = loadTransactionsCache(uid);
    if (cachedTx.length > 0) { remotePresence.transactions = true; setTransactions(cachedTx); transactionsRef.current = cachedTx; }
    Promise.resolve(incrementalTransactionSync(uid)).then((merged) => { remotePresence.transactions = merged.length > 0; setTransactions(merged); transactionsRef.current = merged; loadedState.transactions = true; markLoaded(); }).catch((err: unknown) => handleLoadError("transactions", err));

    Promise.resolve(supabase.from('income').select('*').eq('user_id', uid)).then(({ data, error }) => { if (error) { handleLoadError('income', error); return; } const ni = migrateIncomeRecords((data || []) as unknown as Income[]); remotePresence.income = ni.length > 0; setIncome(ni); loadedState.income = true; markLoaded(); }).catch((err: unknown) => handleLoadError("income", err));

    const cachedRR = readSessionCache<RecurringRule>(uid, 'recurringRules');
    if (cachedRR) { remotePresence.recurringRules = cachedRR.length > 0; setRecurringRules(cachedRR); loadedState.recurringRules = true; markLoaded(); }
    else { Promise.resolve(supabase.from('recurring_rules').select('*').eq('user_id', uid)).then(({ data, error }) => { if (error) { handleLoadError('recurring rules', error); return; } const nrr = (data || []) as unknown as RecurringRule[]; writeSessionCache(uid, 'recurringRules', nrr); remotePresence.recurringRules = nrr.length > 0; setRecurringRules(nrr); loadedState.recurringRules = true; markLoaded(); }).catch((err: unknown) => handleLoadError('recurring rules', err)); }

    return () => { subscriptions.forEach((s) => s.unsubscribe()); };
  }, [seedUserFromLocalState, user]);

  const ensureSignedInWithDriveScopes = async () => {
    let currentToken = googleSheetsAccessToken;
    const signedInEmail = user?.email?.trim().toLowerCase() || "";
    const tokenOwnerEmail = readStoredGoogleAccessTokenOwnerEmail();
    if (currentToken && tokenOwnerEmail && signedInEmail && tokenOwnerEmail !== signedInEmail) { storeAccessToken(null); currentToken = null; }
    if (currentToken) { const scopeOk = await hasRequiredSheetsScopes(currentToken); if (!scopeOk) { storeAccessToken(null); currentToken = null; } }
    if (!user || !currentToken) { await beginGoogleAuth(true); throw new Error("Redirecting to Google to authorize Drive access."); }
  };

  const updatePreferences = async (prefs: Partial<Preferences>) => {
    const next = { ...preferencesRef.current, ...prefs, coreExcludedCategories: prefs.coreExcludedCategories ? migrateExcludedCategories(prefs.coreExcludedCategories) : preferencesRef.current.coreExcludedCategories };
    await saveUserProfilePatch({ preferences: normalizePreferences(next) });
  };

  const saveBudgetToDrive = async () => {
    const token = googleSheetsAccessToken; const cc = driveConnectionRef.current;
    if (!token || !cc) throw new Error("Connect your VibeBudget Drive folder first.");
    const payload = createBudgetDataFile(expenseCategoriesRef.current, incomeCategoriesRef.current, transactionsRef.current, incomeRef.current, sheetsConfigRef.current);
    const content = JSON.stringify(payload, null, 2);
    const ensuredFile = await ensureBudgetFile(token, cc, content);
    const nextConnection: DriveConnection = { ...cc, budgetFileId: ensuredFile.fileId, budgetFileName: ensuredFile.fileName, lastMirrorAt: getIsoNow(), lastError: null };
    await updateBudgetFileContent(token, ensuredFile.fileId, content);
    const syncedAt = new Date();
    await saveUserProfilePatch({ driveConnection: nextConnection, lastSyncedAt: syncedAt.toISOString() });
    setDriveSyncError(null);
  };

  const loadBudgetFromDrive = async () => {
    const token = googleSheetsAccessToken; const cc = driveConnectionRef.current;
    if (!token || !cc?.budgetFileId) throw new Error("No Drive budget file connected yet.");
    setIsSyncing(true); loadingDriveRef.current = true;
    try {
      const raw = await readBudgetFileContent(token, cc.budgetFileId);
      const parsed = parseBudgetDataFile(raw);
      await replaceBudgetDataInFirestore({
        nextExpenseCategories: parsed.expenseCategories.length > 0 ? parsed.expenseCategories : createDefaultExpenseCategories(),
        nextIncomeCategories: parsed.incomeCategories, nextTransactions: parsed.transactions, nextIncome: parsed.income,
        nextPreferences: preferencesRef.current, nextSheetsConfig: parsed.googleSheetsConfig,
        nextDriveConnection: { ...cc, lastRestoreAt: getIsoNow(), lastError: null }, nextLastSynced: new Date(),
      });
      setDriveSyncError(null);
    } finally { loadingDriveRef.current = false; setIsSyncing(false); }
  };

  const previewBudgetFromDrive = async () => {
    const token = googleSheetsAccessToken; const cc = driveConnectionRef.current;
    if (!token || !cc?.budgetFileId) throw new Error("No Drive budget file connected yet.");
    const raw = await readBudgetFileContent(token, cc.budgetFileId);
    return previewImport("manual_backup", raw, {});
  };

  const connectDriveFolder = async (folderRef?: string) => {
    await ensureSignedInWithDriveScopes();
    const token = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    if (!token) return;
    setIsSyncing(true);
    try {
      const folder = await ensureVibeBudgetFolder(token, folderRef);
      const payload = createBudgetDataFile(expenseCategoriesRef.current, incomeCategoriesRef.current, transactionsRef.current, incomeRef.current, sheetsConfigRef.current);
      const budgetFile = await ensureBudgetFile(token, { folderId: folder.folderId, budgetFileName: DEFAULT_BUDGET_FILE_NAME }, JSON.stringify(payload, null, 2));
      const nextConnection: DriveConnection = { folderId: folder.folderId, folderName: folder.folderName, folderUrl: folder.folderUrl, budgetFileId: budgetFile.fileId, budgetFileName: budgetFile.fileName, connectedAt: getIsoNow(), lastMirrorAt: null, lastRestoreAt: null, lastError: null };
      await saveUserProfilePatch({ driveConnection: nextConnection }); setDriveSyncError(null);
      try { await loadBudgetFromDrive(); } catch { await saveBudgetToDrive(); }
    } finally { setIsSyncing(false); }
  };

  const disconnectDriveFolder = () => { void saveUserProfilePatch({ driveConnection: null }); setDriveSyncError(null); };

  useEffect(() => {
    if (!googleSheetsAccessToken || !driveConnection || loadingDriveRef.current) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      setBackingUp(true);
      void saveBudgetToDrive().catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to save budget.json to Drive.";
        setDriveSyncError(message);
        if (driveConnectionRef.current) void saveUserProfilePatch({ driveConnection: { ...driveConnectionRef.current, lastError: message } });
      }).finally(() => setBackingUp(false));
    }, 1200);
    return () => { if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current); };
  }, [driveConnection, expenseCategories, googleSheetsAccessToken, googleSheetsConfig, income, incomeCategories, transactions]);

  const signIn = async () => { await beginGoogleAuth(false); };

  const logout = async () => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    const uid = cu?.id;
    clearLocalState();
    if (uid) { clearTransactionsCache(uid); clearSessionCache(uid, 'expenseCategories'); clearSessionCache(uid, 'incomeCategories'); clearSessionCache(uid, 'recurringRules'); }
    storeAccessToken(null);
    await supabase.auth.signOut();
  };

  const buildSheetRowsForPull = async (
    token: string,
    config: GoogleSheetsSyncConfig,
    mode: GoogleSheetsSyncMode,
  ): Promise<{ rows: any[]; count: number }> => {
    const allRows: any[] = [];
    let totalCount = 0;
    const expMapping = config.expenseMapping;
    const incMapping = config.incomeMapping;
    const expenseReady = Boolean(expMapping.date && expMapping.vendor && expMapping.amount && expMapping.category);
    const incomeReady = Boolean(incMapping.date && incMapping.source && incMapping.amount && incMapping.category);
    const readDraftValues = async (sheetName: string, draft: SheetRangeDraft | undefined): Promise<{ values: string[]; dataStartRowNumber: number }> => {
      const sanitizedSheetName = normalizeSheetName(sheetName);
      const startCell = draft?.startCell || "";
      const parsedStart = parseA1CellReference(startCell);
      if (!parsedStart) return { values: [], dataStartRowNumber: 2 };
      const dataStartRowNumber = parsedStart.rowIndex + 1;
      if (draft?.noEnd || !draft?.endCell) {
        const values = await getSheetColumnValuesUntilEmptyRun(token, config.spreadsheetId, sanitizedSheetName, parsedStart.columnIndex, dataStartRowNumber);
        return { values, dataStartRowNumber };
      }
      const range = `'${sanitizedSheetName.replace(/'/g, "''")}'!${parsedStart.cellRef}:${draft.endCell}`;
      const response = await getSheetValues(token, config.spreadsheetId, range);
      const rows = response.values || [];
      const values = rows.slice(1).map((row) => (row[0] || "").trim());
      return { values, dataStartRowNumber };
    };
    const readErrors: string[] = [];
    if (expenseReady) {
      try {
        const expDate = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.date);
        const expVendor = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.vendor);
        const expAmount = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.amount);
        const expCategory = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.category);
        const expNotes = await readDraftValues(config.expensesSheetName, config.expenseRangeDrafts?.notes);
        const expStartRow = expDate.dataStartRowNumber || config.expensesDataStartRow || 2;
        const expCursor = mode === "incremental" ? (config.incrementalCursor?.expenses || 0) : 0;
        const expRowCount = Math.max(expDate.values.length, expVendor.values.length, expAmount.values.length, expCategory.values.length, expNotes.values.length);
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
          allRows.push({ __row: [date, vendor, amount, category, notes], __sourceId: `google_sheet-row-${absRowIndex}`, __rawDescription: [date, vendor, amount, category, notes].join(", ") });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Google Sheets read error";
        readErrors.push(`Expenses read failed (${config.expensesSheetName}): ${message}`);
      }
    }
    if (incomeReady) {
      try {
        const incDate = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.date);
        const incSource = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.source);
        const incAmount = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.amount);
        const incCategory = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.category);
        const incNotes = await readDraftValues(config.incomeSheetName, config.incomeRangeDrafts?.notes);
        const incStartRow = incDate.dataStartRowNumber || config.incomeDataStartRow || 2;
        const incCursor = mode === "incremental" ? (config.incrementalCursor?.income || 0) : 0;
        const incRowCount = Math.max(incDate.values.length, incSource.values.length, incAmount.values.length, incCategory.values.length, incNotes.values.length);
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
          allRows.push({ __row: [date, source, amount, category, notes], __sourceId: `google_sheet-income-row-${absRowIndex}`, __rawDescription: [date, source, amount, category, notes].join(", ") });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Google Sheets read error";
        readErrors.push(`Income read failed (${config.incomeSheetName}): ${message}`);
      }
    }
    if (allRows.length === 0 && readErrors.length > 0) throw new Error(readErrors.join(" | "));
    return { rows: allRows, count: totalCount };
  };

  const syncGoogleSheets = async (direction: GoogleSheetsSyncDirection = "pull", options?: GoogleSheetsSyncOptions): Promise<GooglePullSummary | void> => {
    if (!googleSheetsAccessToken || !sheetsConfigRef.current) throw new Error("Configure Google Sheets first.");
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setGoogleSheetsSyncing(true);
    setGoogleSheetsError(null);
    setGooglePullSummary(null);
    try {
      if (direction === "pull" || direction === "both") {
        const mode = options?.mode || "incremental";
        const { rows, count } = await buildSheetRowsForPull(googleSheetsAccessToken, sheetsConfigRef.current, mode);
        let fetched = count;
        let imported = 0; let duplicateSkipped = 0; let invalidSkipped = 0;
        const expenseRows = rows.filter((r: any) => !r.__sourceId?.includes("income-"));
        const incomeRows = rows.filter((r: any) => r.__sourceId?.includes("income-"));
        if (rows.length > 0) {
          if (expenseRows.length > 0) {
            const batch = previewImportBatch({ source: "google_sheet", payload: expenseRows, options: { type: "expenses", hasHeader: false }, existing: { transactions: transactionsRef.current, income: incomeRef.current, expenseCategories: expenseCategoriesRef.current, incomeCategories: incomeCategoriesRef.current } });
            const summary = await commitImport(batch, { includeDuplicates: false });
            imported += summary.imported; duplicateSkipped += batch.summary.duplicate; invalidSkipped += batch.summary.invalid;
          }
          if (incomeRows.length > 0) {
            const batch = previewImportBatch({ source: "google_sheet", payload: incomeRows, options: { type: "income", hasHeader: false }, existing: { transactions: transactionsRef.current, income: incomeRef.current, expenseCategories: expenseCategoriesRef.current, incomeCategories: incomeCategoriesRef.current } });
            const summary = await commitImport(batch, { includeDuplicates: false });
            imported += summary.imported; duplicateSkipped += batch.summary.duplicate; invalidSkipped += batch.summary.invalid;
          }
        }
        const netNew = imported;
        const pullSummary: GooglePullSummary = { fetched, imported, duplicateSkipped, invalidSkipped, netNew, mode };
        setGooglePullSummary(pullSummary);
        const configAfterPull = sheetsConfigRef.current;
        if (configAfterPull && mode === "incremental") {
          const newCursor: Record<string, number> = { ...(configAfterPull.incrementalCursor || {}) };
          const maxExpenseRow = expenseRows.reduce((max: number, r: any) => { const match = (r.__sourceId || "").match(/row-(\d+)/); return match ? Math.max(max, Number.parseInt(match[1], 10)) : max; }, newCursor.expenses || 0);
          const maxIncomeRow = incomeRows.reduce((max: number, r: any) => { const match = (r.__sourceId || "").match(/row-(\d+)/); return match ? Math.max(max, Number.parseInt(match[1], 10)) : max; }, newCursor.income || 0);
          newCursor.expenses = Math.max(newCursor.expenses || 0, maxExpenseRow); newCursor.income = Math.max(newCursor.income || 0, maxIncomeRow);
          const nextConfig: GoogleSheetsSyncConfig = { ...configAfterPull, incrementalCursor: newCursor, lastPullSummary: pullSummary, lastPullAt: getIsoNow(), lastError: null };
          await saveUserProfilePatch({ googleSheetsConfig: nextConfig }); setGoogleSheetsError(null); return pullSummary;
        }
        const configAfterPullSimple = sheetsConfigRef.current;
        if (configAfterPullSimple) {
          const nextConfig: GoogleSheetsSyncConfig = { ...configAfterPullSimple, lastPullSummary: pullSummary, lastPullAt: getIsoNow(), lastError: null };
          await saveUserProfilePatch({ googleSheetsConfig: nextConfig });
        }
        setGoogleSheetsError(null); return pullSummary;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
      setGoogleSheetsError(message);
      if (sheetsConfigRef.current) await saveUserProfilePatch({ googleSheetsConfig: { ...sheetsConfigRef.current, lastError: message } });
      throw error;
    } finally { syncInFlightRef.current = false; setGoogleSheetsSyncing(false); }
  };

  const addTransaction = async (data: Omit<Transaction, "id">) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const id = crypto.randomUUID();
    await supabase.from('transactions').upsert({ id, user_id: cu.id, ...data, updated_at: getIsoNow() });
  };

  const refreshTransactionsNow = useCallback(async (): Promise<number> => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const merged = await incrementalTransactionSync(cu.id);
    setTransactions(merged); transactionsRef.current = merged;
    return merged.length;
  }, []);

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = transactionsRef.current.find((i) => i.id === id);
    if (!existing) return;
    await supabase.from('transactions').upsert({ ...existing, ...data, id, user_id: cu.id, updated_at: getIsoNow() });
  };

  const deleteTransaction = async (id: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    await supabase.from('transactions').update({ deleted: true, updated_at: getIsoNow() }).eq('id', id).eq('user_id', cu.id);
  };

  const addIncome = async (data: Omit<Income, "id">) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const categoryId = await ensureIncomeCategoryId(data.category);
    const id = crypto.randomUUID();
    await supabase.from('income').upsert({ id, user_id: cu.id, ...data, category_id: data.category_id || categoryId, updated_at: getIsoNow() });
  };

  const updateIncome = async (id: string, data: Partial<Income>) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = incomeRef.current.find((i) => i.id === id);
    if (!existing) return;
    const categoryId = data.category ? await ensureIncomeCategoryId(data.category) : undefined;
    await supabase.from('income').upsert({ ...existing, ...data, id, user_id: cu.id, category_id: categoryId || data.category_id || existing.category_id, updated_at: getIsoNow() });
  };

  const deleteIncome = async (id: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    await supabase.from('income').delete().eq('id', id).eq('user_id', cu.id);
  };

  const ensureExpenseCategoryId = async (name: string) => {
    const nn = normalizeExpenseCategoryName(name);
    const existing = expenseCategoriesRef.current.find((c) => normalizeCategoryName(c.name) === nn);
    if (existing) return existing.id;
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const nextCategory: ExpenseCategory = { id: crypto.randomUUID(), name: nn, target_amount: 0 };
    await supabase.from('categories').upsert({ id: nextCategory.id, user_id: cu.id, name: nextCategory.name, target_amount: nextCategory.target_amount, deleted: false, updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'expenseCategories');
    return nextCategory.id;
  };

  const ensureIncomeCategoryId = async (name: string) => {
    const nn = normalizeCategoryName(name);
    const existing = incomeCategoriesRef.current.find((c) => normalizeCategoryName(c.name) === nn);
    if (existing) return existing.id;
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const nextCategory: IncomeCategory = { id: crypto.randomUUID(), name: nn, target_amount: 0 };
    await supabase.from('income_categories').upsert({ id: nextCategory.id, user_id: cu.id, name: nextCategory.name, target_amount: nextCategory.target_amount, deleted: false, updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'incomeCategories');
    return nextCategory.id;
  };

  const createRecurringRule = async (data: Omit<RecurringRule, "id" | "uid" | "created_at" | "updated_at" | "frequency">) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const id = crypto.randomUUID(); const now = getIsoNow();
    const payload: RecurringRule = { ...data, id, uid: cu.id, frequency: "monthly", day_of_month: Math.max(1, Math.min(28, Math.trunc(data.day_of_month || 1))), created_at: now, updated_at: now };
    await supabase.from('recurring_rules').upsert({ ...payload, user_id: cu.id });
    clearSessionCache(cu.id, 'recurringRules');
    return id;
  };

  const updateRecurringRule = async (id: string, data: Partial<Pick<RecurringRule, "is_active" | "end_date" | "amount" | "notes">>) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = recurringRulesRef.current.find((i) => i.id === id);
    if (!existing) return;
    await supabase.from('recurring_rules').upsert({ ...existing, ...data, id, uid: cu.id, user_id: cu.id, updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'recurringRules');
  };

  const deleteRecurringRule = async (id: string) => { await updateRecurringRule(id, { is_active: false, end_date: getTodayStr() }); };

  const generateRecurringTransactions = useCallback(async () => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const today = getTodayStr();
    const rules = recurringRulesRef.current.filter((r) => r.is_active);
    if (rules.length === 0) return { generated: 0, skipped: 0 };
    const expenseKeys = new Set(transactionsRef.current.filter((i) => i.recurring_rule_id).map((i) => `${i.recurring_rule_id}::${i.date}`));
    const incomeKeys = new Set(incomeRef.current.filter((i) => i.recurring_rule_id).map((i) => `${i.recurring_rule_id}::${i.date}`));
    let generated = 0; let skipped = 0;
    const txUpserts: any[] = []; const incUpserts: any[] = []; const ruleUpserts: any[] = [];
    for (const rule of rules) {
      const dueOccurrences = materializeRule(rule, today);
      for (const occurrence of dueOccurrences) {
        const key = `${rule.id}::${occurrence.dueDate}`;
        if (rule.type === "expense") {
          if (expenseKeys.has(key)) { skipped += 1; continue; }
          txUpserts.push({ id: crypto.randomUUID(), user_id: cu.id, date: occurrence.dueDate, vendor: rule.vendor || "Recurring expense", amount: rule.amount, currency: rule.original_currency, category_id: rule.category_id || "", category_name: rule.category_name || "Misc.", notes: rule.notes || "", recurring_rule_id: rule.id, is_recurring_instance: true, updated_at: getIsoNow() });
          expenseKeys.add(key); generated += 1;
        } else {
          if (incomeKeys.has(key)) { skipped += 1; continue; }
          incUpserts.push({ id: crypto.randomUUID(), user_id: cu.id, date: occurrence.dueDate, source: rule.source || "Recurring income", amount: rule.amount, currency: rule.original_currency, category_id: rule.category_id, category: rule.category || "Recurring", notes: rule.notes || "", recurring_rule_id: rule.id, is_recurring_instance: true, updated_at: getIsoNow() });
          incomeKeys.add(key); generated += 1;
        }
      }
      ruleUpserts.push({ ...rule, id: rule.id, user_id: cu.id, last_generated_month: dueOccurrences.length > 0 ? dueOccurrences[dueOccurrences.length - 1].month : rule.last_generated_month, updated_at: getIsoNow() });
    }
    if (txUpserts.length > 0) await supabase.from('transactions').upsert(txUpserts);
    if (incUpserts.length > 0) await supabase.from('income').upsert(incUpserts);
    if (ruleUpserts.length > 0) await supabase.from('recurring_rules').upsert(ruleUpserts);
    clearSessionCache(cu.id, 'recurringRules');
    return { generated, skipped };
  }, []);

  const getUpcomingRecurring = (days = 30) => computeUpcoming(recurringRulesRef.current.filter((r) => r.is_active), getTodayStr(), days);

  useEffect(() => {
    if (!user) return;
    const sessionKey = `vibebudget-recurring-generated-${user.uid}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");
    void generateRecurringTransactions().catch(() => undefined);
  }, [generateRecurringTransactions, user]);

  const updateExpenseCategoryTarget = async (id: string, target: number) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = expenseCategoriesRef.current.find((i) => i.id === id);
    if (!existing) return;
    await supabase.from('categories').upsert({ ...existing, user_id: cu.id, target_amount: target, updated_at: getIsoNow() });
  };

  const updateIncomeCategoryTarget = async (id: string, target: number) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = incomeCategoriesRef.current.find((i) => i.id === id);
    if (!existing) return;
    await supabase.from('income_categories').upsert({ ...existing, user_id: cu.id, target_amount: target, updated_at: getIsoNow() });
  };

  const updateCategoryTarget = updateExpenseCategoryTarget;

  const addExpenseCategory = async (name: string, targetAmount: number) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const next: ExpenseCategory = { id: crypto.randomUUID(), name: name.trim(), target_amount: targetAmount };
    await supabase.from('categories').upsert({ ...next, user_id: cu.id, deleted: false, updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'expenseCategories');
  };

  const addIncomeCategory = async (name: string, targetAmount: number) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const next: IncomeCategory = { id: crypto.randomUUID(), name: name.trim(), target_amount: targetAmount };
    await supabase.from('income_categories').upsert({ ...next, user_id: cu.id, deleted: false, updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'incomeCategories');
  };

  const deleteExpenseCategory = async (id: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    await supabase.from('categories').update({ deleted: true, updated_at: getIsoNow() }).eq('id', id).eq('user_id', cu.id);
    clearSessionCache(cu.id, 'expenseCategories');
  };

  const deleteIncomeCategory = async (id: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    await supabase.from('income_categories').update({ deleted: true, updated_at: getIsoNow() }).eq('id', id).eq('user_id', cu.id);
    clearSessionCache(cu.id, 'incomeCategories');
  };

  const updateExpenseCategoryName = async (id: string, name: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = expenseCategoriesRef.current.find((c) => c.id === id);
    if (!existing) return;
    await supabase.from('categories').upsert({ ...existing, user_id: cu.id, name: name.trim(), updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'expenseCategories');
  };

  const updateIncomeCategoryName = async (id: string, name: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const existing = incomeCategoriesRef.current.find((c) => c.id === id);
    if (!existing) return;
    await supabase.from('income_categories').upsert({ ...existing, user_id: cu.id, name: name.trim(), updated_at: getIsoNow() });
    clearSessionCache(cu.id, 'incomeCategories');
  };

  const previewImport = (source: ImportSource, payload: string | unknown[] | Record<string, unknown>, options?: ImportPreviewOptions) =>
    previewImportBatch({ source, payload, options, existing: { transactions: transactionsRef.current, income: incomeRef.current, expenseCategories: expenseCategoriesRef.current, incomeCategories: incomeCategoriesRef.current } });

  const commitImport = async (batch: ImportBatch, options: ImportCommitOptions = {}, onProgress?: (current: number, total: number) => void): Promise<ImportCommitSummary> => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    let nextExpenseCategories = migrateExpenseCategories([...expenseCategoriesRef.current]);
    let nextIncomeCategories = migrateIncomeCategories([...incomeCategoriesRef.current]);
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];
    const touchedExpenseCategories = new Map<string, ExpenseCategory>();
    const touchedIncomeCategories = new Map<string, IncomeCategory>();
    const touchedTransactions = new Map<string, Transaction>();
    const touchedIncomeRecords = new Map<string, Income>();
    const allowedIds = options.recordIds ? new Set(options.recordIds) : null;
    const records = batch.records.filter((r) => { if (allowedIds && !allowedIds.has(r.id)) return false; if (r.status === "invalid") return false; if (r.status === "duplicate" && !options.includeDuplicates) return false; return true; });
    let skipped = batch.records.length - records.length;
    const getOrCreateExpenseCategoryId = (name: string) => {
      const nn = normalizeExpenseCategoryName(name);
      const existing = nextExpenseCategories.find((i) => normalizeCategoryName(i.name) === nn);
      if (existing) { touchedExpenseCategories.set(existing.id, existing); return existing.id; }
      const created: ExpenseCategory = { id: crypto.randomUUID(), name: nn, target_amount: 0 };
      nextExpenseCategories = [...nextExpenseCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      touchedExpenseCategories.set(created.id, created); return created.id;
    };
    const getOrCreateIncomeCategoryId = (name: string) => {
      const nn = normalizeCategoryName(name);
      const existing = nextIncomeCategories.find((i) => normalizeCategoryName(i.name) === nn);
      if (existing) { touchedIncomeCategories.set(existing.id, existing); return existing.id; }
      const created: IncomeCategory = { id: crypto.randomUUID(), name: nn, target_amount: 0 };
      nextIncomeCategories = [...nextIncomeCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      touchedIncomeCategories.set(created.id, created); return created.id;
    };
    records.forEach((record, index) => {
      if (record.kind === "expenseCategory") { /* handled below */ }
      if (record.kind === "incomeCategory") { /* handled below */ }
      if (record.kind === "expense") {
        const nn = normalizeExpenseCategoryName(record.category || FALLBACK_EXPENSE_CATEGORY_NAME);
        const catId = getOrCreateExpenseCategoryId(nn);
        const existingIndex = record.source_id ? nextTransactions.findIndex((i) => i.import_source === record.source && i.source_id === record.source_id) : -1;
        const now = getIsoNow();
        const payload: Transaction = {
          id: existingIndex >= 0 ? nextTransactions[existingIndex].id : record.source_id ? `${record.source}-expense-${record.source_id}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) : crypto.randomUUID(),
          date: record.date || getTodayStr(), vendor: record.merchant || "Imported expense", amount: record.amount || 0,
          category_id: catId, category_name: nn, notes: record.notes || "", import_source: record.source,
          source_id: record.source_id, import_batch_id: batch.id, raw_description: record.raw_description, status: "posted", updated_at: now,
        };
        if (existingIndex >= 0) nextTransactions[existingIndex] = payload; else nextTransactions.push(payload);
        touchedTransactions.set(payload.id, payload);
      }
      if (record.kind === "income") {
        const nn = normalizeCategoryName(record.category || "Uncategorized");
        const catId = getOrCreateIncomeCategoryId(nn);
        const existingIndex = record.source_id ? nextIncome.findIndex((i) => i.import_source === record.source && i.source_id === record.source_id) : -1;
        const now = getIsoNow();
        const payload: Income = {
          id: existingIndex >= 0 ? nextIncome[existingIndex].id : record.source_id ? `${record.source}-income-${record.source_id}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) : crypto.randomUUID(),
          date: record.date || getTodayStr(), source: record.merchant || "Imported income", amount: record.amount || 0,
          category_id: existingIndex >= 0 ? nextIncome[existingIndex].category_id || catId : catId, category: nn, notes: record.notes || "",
          import_source: record.source, source_id: record.source_id, import_batch_id: batch.id, raw_description: record.raw_description, status: "posted", updated_at: now,
        };
        if (existingIndex >= 0) nextIncome[existingIndex] = payload; else nextIncome.push(payload);
        touchedIncomeRecords.set(payload.id, payload);
      }
      onProgress?.(index + 1, records.length);
    });
    const persistImport = upsertBudgetDataInFirestore({
      nextExpenseCategories: Array.from(touchedExpenseCategories.values()), nextIncomeCategories: Array.from(touchedIncomeCategories.values()),
      nextTransactions: Array.from(touchedTransactions.values()), nextIncome: Array.from(touchedIncomeRecords.values()),
      nextPreferences: preferencesRef.current, nextSheetsConfig: sheetsConfigRef.current,
      nextDriveConnection: driveConnectionRef.current, nextLastSynced: lastSynced,
    });
    setExpenseCategories(nextExpenseCategories); setIncomeCategories(nextIncomeCategories);
    setTransactions(nextTransactions); setIncome(nextIncome);
    expenseCategoriesRef.current = nextExpenseCategories; incomeCategoriesRef.current = nextIncomeCategories;
    transactionsRef.current = nextTransactions; incomeRef.current = nextIncome;
    saveTransactionsCache(cu.id, nextTransactions);
    try { await persistImport; } catch (error) { console.error("Failed to persist imported data", error); setAuthError(error instanceof Error ? error.message : "Failed to persist imported data."); throw error; }
    return { imported: records.length, skipped, invalid: batch.summary.invalid };
  };

  const importData = async (type: string, rows: any[], isUpsert = false, onProgress?: (current: number, total: number) => void) => {
    const source: ImportSource = "csv";
    const previewType = type === "targets" ? "expenseCategories" : type as ImportPreviewOptions["type"];
    const batch = previewImport(source, rows, { type: previewType, hasHeader: false });
    await commitImport(batch, { includeDuplicates: !isUpsert }, onProgress);
  };

  const upsertGoogleSheetRows = async (type: "expenses" | "income", rows: any[]): Promise<{ imported: number; updated: number; skipped: number }> => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    let nextExpenseCategories = migrateExpenseCategories([...expenseCategoriesRef.current]);
    let nextIncomeCategories = migrateIncomeCategories([...incomeCategoriesRef.current]);
    let nextTransactions = [...transactionsRef.current]; let nextIncome = [...incomeRef.current];
    let imported = 0; let updated = 0; let skipped = 0; const now = getIsoNow();
    if (type === "expenses") { /* deduplicate and inject into nextTransactions based on sheet row identity */ }
    if (type === "income") { /* same for income */ }
    await upsertBudgetDataInFirestore({ nextExpenseCategories, nextIncomeCategories, nextTransactions, nextIncome, nextPreferences: preferencesRef.current, nextSheetsConfig: sheetsConfigRef.current, nextDriveConnection: driveConnectionRef.current, nextLastSynced: lastSynced });
    setExpenseCategories(nextExpenseCategories); setIncomeCategories(nextIncomeCategories);
    setTransactions(nextTransactions); setIncome(nextIncome);
    expenseCategoriesRef.current = nextExpenseCategories; incomeCategoriesRef.current = nextIncomeCategories;
    transactionsRef.current = nextTransactions; incomeRef.current = nextIncome;
    saveTransactionsCache(cu.id, nextTransactions);
    return { imported, updated, skipped };
  };

  const wipeData = async (type: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    if (type === "expenses") { for (const item of transactionsRef.current) { await supabase.from('transactions').update({ deleted: true, updated_at: getIsoNow() }).eq('id', item.id).eq('user_id', cu.id); } return; }
    if (type === "income") { for (const item of incomeRef.current) { await supabase.from('income').delete().eq('id', item.id).eq('user_id', cu.id); } return; }
    if (type === "categories" || type === "targets" || type === "expenseCategories") {
      for (const item of expenseCategoriesRef.current) { await supabase.from('categories').delete().eq('id', item.id).eq('user_id', cu.id); }
      await supabase.from('categories').upsert(createDefaultExpenseCategories().map((c) => ({ ...c, user_id: cu.id, deleted: false, updated_at: getIsoNow() }))); return;
    }
    if (type === "incomeCategories") {
      for (const item of incomeCategoriesRef.current) { await supabase.from('income_categories').delete().eq('id', item.id).eq('user_id', cu.id); }
      const ci = createIncomeCategoriesFromRecords(incomeRef.current);
      if (ci.length > 0) { await supabase.from('income_categories').upsert(ci.map((c) => ({ ...c, user_id: cu.id, deleted: false, updated_at: getIsoNow() }))); }
    }
  };

  const shareBudget = async () => { throw new Error("Shared budgets are disabled. Each Google account only sees its own data."); };
  const backupToDrive = async () => { await ensureSignedInWithDriveScopes(); setBackingUp(true); try { if (!driveConnectionRef.current) { await connectDriveFolder(); } else { await saveBudgetToDrive(); } } finally { setBackingUp(false); } };
  const syncToCloud = async () => { await loadBudgetFromDrive(); };

  const plaidConnected = Boolean(plaidConnection);
  const plaidApiFetch = useCallback(async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    const su = process.env.VITE_PLAID_SERVER_URL || ""; const uid = cu.id;
    if (su) { const r = await fetch(`${su}/api/plaid/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, uid }) }); if (!r.ok) { const eb = await r.json().catch(() => ({})); throw new Error((eb as any).error || `Plaid ${action} failed (${r.status})`); } return r.json() as Promise<T>; }
    const r = await fetch("/api/plaid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body, uid }) }); if (!r.ok) { const eb = await r.json().catch(() => ({})); throw new Error((eb as any).error || `Plaid ${action} failed (${r.status})`); } return r.json() as Promise<T>;
  }, []);

  const connectPlaid = useCallback(async (publicToken: string) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    if (!plaidCredentials) throw new Error("Configure your Plaid API credentials in Settings first.");
    setPlaidSyncing(true); setPlaidError(null);
    try {
      const result = await plaidApiFetch<any>("exchange", { publicToken, clientId: plaidCredentials.clientId, secret: plaidCredentials.secret, environment: plaidCredentials.environment });
      const connection: PlaidConnection = { itemId: result.itemId, institutionName: result.institutionName || "Unknown Bank", institutionId: result.institutionId, accounts: [], encryptedAccessToken: result.encryptedAccessToken, connectedAt: getIsoNow(), lastSyncAt: undefined, syncCursor: undefined };
      await saveUserProfilePatch({ plaidConnection: connection }); setPlaidConnection(connection); setPlaidError(null);
    } catch (error) { const message = error instanceof Error ? error.message : "Failed to connect Plaid."; setPlaidError(message); throw error; }
    finally { setPlaidSyncing(false); }
  }, [plaidCredentials, plaidApiFetch, saveUserProfilePatch]);

  const disconnectPlaid = useCallback(async () => { await saveUserProfilePatch({ plaidConnection: null, plaidCategoryMappings: [] }); setPlaidConnection(null); setPlaidCategoryMappings([]); setPlaidError(null); }, [saveUserProfilePatch]);

  const syncPlaidTransactions = useCallback(async (): Promise<ImportCommitSummary> => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in with Google first.");
    if (!plaidCredentials || !plaidConnection) throw new Error("Connect a bank account first.");
    setPlaidSyncing(true); setPlaidError(null);
    try {
      const result = await plaidApiFetch<any>("transactions", { encryptedAccessToken: plaidConnection.encryptedAccessToken, clientId: plaidCredentials.clientId, secret: plaidCredentials.secret, environment: plaidCredentials.environment, cursor: plaidConnection.syncCursor });
      if (result.added.length === 0) { const uc: PlaidConnection = { ...plaidConnection, syncCursor: result.nextCursor, lastSyncAt: getIsoNow() }; await saveUserProfilePatch({ plaidConnection: uc }); setPlaidConnection(uc); return { imported: 0, skipped: 0, invalid: 0 }; }
      const { mapPlaidCategory } = await import("../utils/plaidCategoryMap");
      const importRows = result.added.map((tx: any) => { const cn = mapPlaidCategory(tx.category, plaidCategoryMappings); return [tx.date, tx.merchantName || tx.name, String(tx.amount), cn, `Plaid: ${tx.name}`]; });
      const batch = previewImportBatch({ source: "plaid", payload: importRows, options: { type: "expenses", hasHeader: false }, existing: { transactions: transactionsRef.current, income: incomeRef.current, expenseCategories: expenseCategoriesRef.current, incomeCategories: incomeCategoriesRef.current } });
      const summary = await commitImport(batch, { includeDuplicates: false });
      const uc: PlaidConnection = { ...plaidConnection, syncCursor: result.nextCursor, lastSyncAt: getIsoNow() }; await saveUserProfilePatch({ plaidConnection: uc }); setPlaidConnection(uc);
      return summary;
    } catch (error) { const message = error instanceof Error ? error.message : "Failed to sync Plaid transactions."; setPlaidError(message); throw error; }
    finally { setPlaidSyncing(false); }
  }, [plaidCredentials, plaidConnection, plaidCategoryMappings, plaidApiFetch, saveUserProfilePatch, commitImport]);

  const fetchPlaidAccounts = useCallback(async (): Promise<import("../types").PlaidAccount[]> => {
    const { data: { user: cu } } = await supabase.auth.getUser(); if (!cu) throw new Error("Sign in with Google first.");
    if (!plaidCredentials || !plaidConnection) throw new Error("Connect a bank account first.");
    const result = await plaidApiFetch<{ accounts: import("../types").PlaidAccount[] }>("accounts", { encryptedAccessToken: plaidConnection.encryptedAccessToken, clientId: plaidCredentials.clientId, secret: plaidCredentials.secret, environment: plaidCredentials.environment });
    return result.accounts;
  }, [plaidCredentials, plaidConnection, plaidApiFetch]);

  const tellerConnected = Boolean(tellerConnection);
  const tellerApiFetch = useCallback(async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    const { data: { user: cu } } = await supabase.auth.getUser(); if (!cu) throw new Error("Sign in with Google first.");
    const su = process.env.VITE_PLAID_SERVER_URL || ""; const uid = cu.id;
    if (su) { const r = await fetch(`${su}/api/teller`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body, uid }) }); if (!r.ok) { const eb = await r.json().catch(() => ({})); throw new Error((eb as any).error || `Teller ${action} failed (${r.status})`); } return r.json() as Promise<T>; }
    const r = await fetch("/api/teller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body, uid }) }); if (!r.ok) { const eb = await r.json().catch(() => ({})); throw new Error((eb as any).error || `Teller ${action} failed (${r.status})`); } return r.json() as Promise<T>;
  }, []);

  const connectTeller = useCallback(async (enrollment: import("../types").TellerEnrollment) => {
    const { data: { user: cu } } = await supabase.auth.getUser(); if (!cu) throw new Error("Sign in with Google first.");
    if (!tellerCredentials) throw new Error("Configure your Teller application credentials in Settings first.");
    setTellerSyncing(true); setTellerError(null);
    try {
      const result = await tellerApiFetch<{ accounts: import("../types").TellerAccount[] }>("accounts", { accessToken: enrollment.accessToken, certificate: tellerCredentials.certificate, privateKey: tellerCredentials.privateKey, environment: tellerCredentials.environment });
      const connection: TellerConnection = { enrollmentId: enrollment.enrollment.id, accessToken: enrollment.accessToken, institutionName: enrollment.enrollment.institution.name, institutionId: enrollment.enrollment.institution.id, userId: enrollment.user.id, accounts: result.accounts, connectedAt: getIsoNow(), lastSyncAt: undefined };
      await saveUserProfilePatch({ tellerConnection: connection }); setTellerConnection(connection); setTellerError(null);
    } catch (error) { const message = error instanceof Error ? error.message : "Failed to connect Teller."; setTellerError(message); throw error; }
    finally { setTellerSyncing(false); }
  }, [tellerCredentials, tellerApiFetch, saveUserProfilePatch]);

  const disconnectTeller = useCallback(async () => { await saveUserProfilePatch({ tellerConnection: null, tellerCategoryMappings: [] }); setTellerConnection(null); setTellerCategoryMappings([]); setTellerError(null); }, [saveUserProfilePatch]);

  const syncTellerTransactions = useCallback(async (): Promise<ImportCommitSummary> => {
    const { data: { user: cu } } = await supabase.auth.getUser(); if (!cu) throw new Error("Sign in with Google first.");
    if (!tellerCredentials || !tellerConnection) throw new Error("Connect a bank account first.");
    setTellerSyncing(true); setTellerError(null);
    try {
      const result = await tellerApiFetch<{ transactions: import("../types").TellerTransaction[] }>("sync-all", { accessToken: tellerConnection.accessToken, certificate: tellerCredentials.certificate, privateKey: tellerCredentials.privateKey, environment: tellerCredentials.environment, accounts: tellerConnection.accounts });
      if (result.transactions.length === 0) { const uc: TellerConnection = { ...tellerConnection, lastSyncAt: getIsoNow() }; await saveUserProfilePatch({ tellerConnection: uc }); setTellerConnection(uc); return { imported: 0, skipped: 0, invalid: 0 }; }
      const { mapTellerCategory } = await import("../utils/tellerCategoryMap");
      const importRows = result.transactions.filter((tx: any) => tx.type === "withdrawal").map((tx: any) => { const cn = mapTellerCategory({ description: tx.description, details: tx.details }, tellerCategoryMappings); return [tx.date, tx.details?.merchant || tx.description, String(tx.amount), cn, `Teller: ${tx.description}`]; });
      if (importRows.length === 0) { const uc: TellerConnection = { ...tellerConnection, lastSyncAt: getIsoNow() }; await saveUserProfilePatch({ tellerConnection: uc }); setTellerConnection(uc); return { imported: 0, skipped: 0, invalid: 0 }; }
      const batch = previewImportBatch({ source: "bank_feed", payload: importRows, options: { type: "expenses", hasHeader: false }, existing: { transactions: transactionsRef.current, income: incomeRef.current, expenseCategories: expenseCategoriesRef.current, incomeCategories: incomeCategoriesRef.current } });
      const summary = await commitImport(batch, { includeDuplicates: false });
      const uc: TellerConnection = { ...tellerConnection, lastSyncAt: getIsoNow() }; await saveUserProfilePatch({ tellerConnection: uc }); setTellerConnection(uc);
      return summary;
    } catch (error) { const message = error instanceof Error ? error.message : "Failed to sync Teller transactions."; setTellerError(message); throw error; }
    finally { setTellerSyncing(false); }
  }, [tellerCredentials, tellerConnection, tellerCategoryMappings, tellerApiFetch, saveUserProfilePatch, commitImport]);

  const fetchTellerAccounts = useCallback(async (): Promise<import("../types").TellerAccount[]> => {
    const { data: { user: cu } } = await supabase.auth.getUser(); if (!cu) throw new Error("Sign in with Google first.");
    if (!tellerCredentials || !tellerConnection) throw new Error("Connect a bank account first.");
    const result = await tellerApiFetch<{ accounts: import("../types").TellerAccount[] }>("accounts", { accessToken: tellerConnection.accessToken, certificate: tellerCredentials.certificate, privateKey: tellerCredentials.privateKey, environment: tellerCredentials.environment });
    return result.accounts;
  }, [tellerCredentials, tellerConnection, tellerApiFetch]);

  const saveAiConfigFn = useCallback(async (config: AiProviderConfig | null) => {
    if (!user) throw new Error("Sign in with Google first.");
    await saveUserProfilePatch({ aiConfig: config });
    setAiConfig(config);
  }, [user, saveUserProfilePatch]);

  const saveOnboardingStep = useCallback(async (step: number) => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in first.");
    setOnboardingStep(step);
    await supabase.from('users').update({ onboarding_step: step }).eq('id', cu.id);
  }, []);

  const completeOnboarding = useCallback(async () => {
    const { data: { user: cu } } = await supabase.auth.getUser();
    if (!cu) throw new Error("Sign in first.");
    setOnboardingCompleted(true);
    await supabase.from('users').update({ onboarding_completed: true, onboarding_step: 6 }).eq('id', cu.id);
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        user, loading, authError, clearAuthError: () => setAuthError(null),
        onboardingCompleted, onboardingStep, saveOnboardingStep, completeOnboarding,
        budgetId,
        ownerEmail: user?.email || null, sharedUsers: [], expenseCategories, incomeCategories,
        categories: expenseCategories, transactions, income, recurringRules, preferences,
        updatePreferences, signIn, logout, addTransaction, refreshTransactionsNow, updateTransaction,
        deleteTransaction, addIncome, updateIncome, deleteIncome, createRecurringRule,
        updateRecurringRule, deleteRecurringRule, generateRecurringTransactions, getUpcomingRecurring,
        updateExpenseCategoryTarget, updateIncomeCategoryTarget, updateCategoryTarget,
        addExpenseCategory, addIncomeCategory, deleteExpenseCategory, deleteIncomeCategory,
        updateExpenseCategoryName, updateIncomeCategoryName,
        previewImport, commitImport, importData, upsertGoogleSheetRows, wipeData, backupToDrive,
        syncToCloud, shareBudget, googleSheetsConfig, googleSheetsConnected: Boolean(googleSheetsAccessToken && user),
        googleSheetsSyncing, googleSheetsError, connectGoogleSheets: async () => { await ensureSignedInWithDriveScopes(); },
        disconnectGoogleSheets: () => { storeAccessToken(null); setGoogleSheetsError(null); },
        inspectGoogleSheetsSpreadsheet: async (...args) => { if (!googleSheetsAccessToken) throw new Error("Sign in with Google first."); return inspectSpreadsheet(googleSheetsAccessToken!, ...args); },
        previewGoogleSheetColumn: async () => ({ headerValue: "", samples: [], last: null }),
        saveGoogleSheetsConfig: async (config) => { if (!user) throw new Error("Sign in with Google first."); const prev = sheetsConfigRef.current; const pv = prev?.mappingVersion || 0; const payload: GoogleSheetsSyncConfig = { ...config, mappingSavedAt: getIsoNow(), mappingVersion: pv + 1, incrementalCursor: prev?.incrementalCursor || config.incrementalCursor, lastPullSummary: prev?.lastPullSummary || config.lastPullSummary || null, connectedAt: prev?.connectedAt || getIsoNow(), connectedBy: user.email || user.uid, lastError: null, lastSyncedAt: prev?.lastSyncedAt || null, lastPullAt: prev?.lastPullAt || null, lastPushAt: prev?.lastPushAt || null }; await saveUserProfilePatch({ googleSheetsConfig: payload }); setGoogleSheetsConfig(payload); setGoogleSheetsError(null); },
        syncGoogleSheets, validateGoogleSheetsMapping: () => ({ valid: true, missing: [] }), googlePullSummary,
        backingUp, isSyncing, lastSynced, driveConnection, driveConnected: Boolean(driveConnection),
        driveSyncError, connectDriveFolder, previewBudgetFromDrive, loadBudgetFromDrive, disconnectDriveFolder,
        googleSheetsAccessToken, plaidConnected, plaidConnection, plaidSyncing, plaidError,
        plaidCredentials, plaidCategoryMappings, connectPlaid, disconnectPlaid, syncPlaidTransactions,
        fetchPlaidAccounts, setPlaidCredentials, setPlaidCategoryMappings, tellerConnected, tellerConnection,
        tellerSyncing, tellerError, tellerCredentials, tellerCategoryMappings, connectTeller, disconnectTeller,
        syncTellerTransactions, fetchTellerAccounts, setTellerCredentials, setTellerCategoryMappings,
        aiConfig, saveAiConfig: saveAiConfigFn,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error("useFirebase must be used within a FirebaseProvider");
  return context;
};
