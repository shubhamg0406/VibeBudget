export interface ExpenseCategory {
  id: string;
  name: string;
  target_amount: number;
}

export interface IncomeCategory {
  id: string;
  name: string;
  target_amount: number;
}

export type Category = ExpenseCategory;

export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  currency?: string;
  category_id: string;
  category_name: string;
  notes: string;
  updated_at?: string;
}

export interface Income {
  id: string;
  date: string;
  source: string;
  amount: number;
  currency?: string;
  category_id?: string;
  category: string;
  notes?: string;
  updated_at?: string;
}

export interface ExchangeRate {
  currency: string;   // e.g., "USD"
  rateToBase: number; // e.g., 1.35 (1 USD = 1.35 Base Currency)
}

export interface Preferences {
  baseCurrency: string;       // e.g., "CAD"
  exchangeRates: ExchangeRate[];
  coreExcludedCategories?: string[]; // Categories excluded from "Core" logic
}

export type View = "dashboard" | "transactions" | "analysis" | "settings";

export type DateRangeOption = "this-month" | "last-month" | "last-3-months" | "last-6-months" | "ytd" | "last-12-months" | "custom";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  option: DateRangeOption;
}

export type GoogleSheetsSyncDirection = "pull" | "push" | "both";

export interface ExpenseSheetMapping {
  date: string;
  vendor: string;
  amount: string;
  category: string;
  notes: string;
  id: string;
  updatedAt: string;
}

export interface IncomeSheetMapping {
  date: string;
  source: string;
  amount: string;
  category: string;
  notes: string;
  id: string;
  updatedAt: string;
}

export interface GoogleSheetsSyncConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  expensesSheetName: string;
  incomeSheetName: string;
  expenseMapping: ExpenseSheetMapping;
  incomeMapping: IncomeSheetMapping;
  autoSync: boolean;
  syncIntervalSeconds: number;
  connectedAt: string;
  connectedBy: string;
  lastSyncedAt?: string | null;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export interface GoogleSheetsInspectionResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  expenseHeaders: string[];
  incomeHeaders: string[];
  suggestedExpenseMapping: ExpenseSheetMapping;
  suggestedIncomeMapping: IncomeSheetMapping;
}

export interface DriveConnection {
  folderId: string;
  folderName: string;
  folderUrl?: string | null;
  budgetFileId?: string | null;
  budgetFileName: string;
  connectedAt: string;
}

export type PublicSheetImportMapping = Record<string, string>;

export interface PublicSheetImportColumnSelection {
  rowIndex: number;
  columnIndex: number;
  headerLabel: string;
}

export interface PublicSheetImportConfig {
  sheetUrl: string;
  spreadsheetId?: string;
  sheetTabName: string;
  headerRowIndex?: number;
  mapping: Record<string, PublicSheetImportColumnSelection>;
  override: boolean;
}
