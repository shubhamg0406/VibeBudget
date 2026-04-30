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
  import_source?: ImportSource;
  source_id?: string;
  import_batch_id?: string;
  raw_description?: string;
  status?: TransactionStatus;
  recurring_rule_id?: string;
  is_recurring_instance?: boolean;
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
  import_source?: ImportSource;
  source_id?: string;
  import_batch_id?: string;
  raw_description?: string;
  status?: TransactionStatus;
  recurring_rule_id?: string;
  is_recurring_instance?: boolean;
  updated_at?: string;
}

export type ImportSource = "csv" | "google_sheet" | "android_notifications" | "manual_backup" | "bank_feed" | "plaid" | "document_ocr";
export type ImportRecordKind = "expense" | "income" | "expenseCategory" | "incomeCategory";
export type ImportRecordStatus = "new" | "duplicate" | "warning" | "invalid";
export type TransactionStatus = "posted" | "pending";

export interface ImportRecord {
  id: string;
  kind: ImportRecordKind;
  status: ImportRecordStatus;
  source: ImportSource;
  source_id?: string;
  date?: string;
  merchant?: string;
  amount?: number;
  category?: string;
  notes?: string;
  raw_description?: string;
  confidence: number;
  warnings: string[];
  raw_payload?: unknown;
}

export interface ImportBatch {
  id: string;
  source: ImportSource;
  createdAt: string;
  records: ImportRecord[];
  ignoredRows: number;
  warnings: string[];
  summary: {
    total: number;
    new: number;
    duplicate: number;
    warning: number;
    invalid: number;
  };
}

export interface ImportPreviewOptions {
  type?: "expenses" | "income" | "expenseCategories" | "incomeCategories";
  hasHeader?: boolean;
}

export interface ImportCommitOptions {
  includeDuplicates?: boolean;
  recordIds?: string[];
}

export interface ImportCommitSummary {
  imported: number;
  skipped: number;
  invalid: number;
}

export interface ExtractedTransactionCandidate {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  notes: string;
  confidence: number;
  warnings: string[];
  source_file: string;
  page?: number;
}

export interface ExtractTransactionsRequest {
  files: Array<{ name: string; type: string; content: string }>;
  targetType: "expenses" | "income";
}

export interface ExtractTransactionsResponse {
  candidates: ExtractedTransactionCandidate[];
  errors: Array<{ file: string; error: string }>;
  summary: {
    filesProcessed: number;
    filesFailed: number;
    totalCandidates: number;
  };
}

export type ImpExActionType =
  | "import_csv"
  | "import_excel"
  | "import_json_backup"
  | "export_csv_zip"
  | "export_excel"
  | "export_json_backup"
  | "import_document_ocr";

export interface ImportSession {
  source: "csv" | "excel";
  target: "expenses" | "income" | "expenseCategories" | "incomeCategories";
  duplicatePolicy: "skip" | "include";
  preview: ImportBatch | null;
}

export interface RestoreSession {
  mode: "safe_merge" | "replace_all";
  typedConfirmation?: string;
  previewCounts: {
    expenseCategories: number;
    incomeCategories: number;
    transactions: number;
    income: number;
  };
}

export interface ExportJob {
  actionType: ImpExActionType;
  artifactType: "zip" | "xlsx" | "json";
  createdAt: string;
  scope: string;
}

export interface RecurringRule {
  id: string;
  uid: string;
  type: "expense" | "income";
  amount: number;
  vendor?: string;
  source?: string;
  category_id?: string;
  category_name?: string;
  category?: string;
  notes?: string;
  original_currency?: string;
  original_amount?: number;
  day_of_month: number;
  frequency: "monthly";
  start_date: string;
  end_date?: string;
  last_generated_month: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpcomingRecurringInstance {
  rule_id: string;
  projected_date: string;
  type: "expense" | "income";
  amount: number;
  vendor?: string;
  source?: string;
  category_name?: string;
  notes?: string;
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

export type View = "dashboard" | "transactions" | "analysis" | "monthly-analysis" | "settings";
export type Theme = "dark" | "light";

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

export interface SheetRangeDraft {
  startCell: string;
  endCell: string;
  noEnd: boolean;
}

export interface GoogleSheetsSyncConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  expensesSheetName: string;
  incomeSheetName: string;
  expenseCategoriesSheetName?: string;
  incomeCategoriesSheetName?: string;
  expensesDataStartRow?: number;
  incomeDataStartRow?: number;
  expenseCategoriesDataStartRow?: number;
  incomeCategoriesDataStartRow?: number;
  expenseCategoryNameColumn?: string;
  expenseCategoryTargetColumn?: string;
  incomeCategoryNameColumn?: string;
  incomeCategoryTargetColumn?: string;
  expenseMapping: ExpenseSheetMapping;
  incomeMapping: IncomeSheetMapping;
  /** Cell range drafts — persisted so the UI restores on refresh */
  expenseRangeDrafts?: Record<string, SheetRangeDraft>;
  incomeRangeDrafts?: Record<string, SheetRangeDraft>;
  expenseCategoryRangeDrafts?: Record<string, SheetRangeDraft>;
  incomeCategoryRangeDrafts?: Record<string, SheetRangeDraft>;
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
  sheetTitles: string[];
  expenseHeaders: string[];
  incomeHeaders: string[];
  expenseCategoryHeaders?: string[];
  incomeCategoryHeaders?: string[];
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
  lastMirrorAt?: string | null;
  lastRestoreAt?: string | null;
  lastError?: string | null;
}

export type PublicSheetImportMapping = Record<string, string>;

export interface PublicSheetImportCellCoordinate {
  rowIndex: number;
  columnIndex: number;
  cellRef: string;
  displayValue: string;
}

export interface PublicSheetImportRangeSelection {
  start: PublicSheetImportCellCoordinate;
  end: PublicSheetImportCellCoordinate;
  extendToSheetEnd?: boolean;
}

export interface PublicSheetImportConfig {
  sheetTabName: string;
  mapping: Record<string, PublicSheetImportRangeSelection>;
  override: boolean;
}

export interface PublicSheetImportSharedConfig {
  sheetUrl: string;
  spreadsheetId?: string;
}

export type PlaidEnv = "sandbox" | "development" | "production";

export interface PlaidCredentials {
  clientId: string;
  secret: string;
  environment: PlaidEnv;
}

export interface PlaidAccount {
  id: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
  balances?: {
    current?: number;
    available?: number;
    limit?: number;
    currency: string;
  };
}

export interface PlaidConnection {
  itemId: string;
  institutionName?: string;
  institutionId?: string;
  accounts: PlaidAccount[];
  connectedAt: string;
  lastSyncAt?: string;
  syncCursor?: string;
  encryptedAccessToken: string;
  error?: string | null;
}

export interface PlaidTransaction {
  transactionId: string;
  accountId: string;
  accountName: string;
  date: string;
  name: string;
  merchantName?: string;
  amount: number;
  currency: string;
  category?: string[];
  pending: boolean;
}

export interface PlaidCategoryMapping {
  plaidCategory: string;
  vibeBudgetCategory: string;
}

// ─── Teller Types ─────────────────────────────────────────────────────

export type TellerEnv = "sandbox" | "development" | "production";

export interface TellerCredentials {
  applicationId: string;
  certificate: string;   // PEM-encoded client certificate
  privateKey: string;    // PEM-encoded private key
  environment: TellerEnv;
}

export interface TellerAccount {
  id: string;
  name: string;
  lastFour: string;
  type: string;
  subtype: string;
  institution: {
    id: string;
    name: string;
  };
  currency: string;
  balances?: {
    available?: number;
    ledger?: number;
    currency: string;
  };
}

export interface TellerEnrollment {
  accessToken: string;
  user: {
    id: string;
    name?: string;
    email?: string;
  };
  enrollment: {
    id: string;
    institution: {
      id: string;
      name: string;
    };
  };
}

export interface TellerConnection {
  enrollmentId: string;
  accessToken: string;
  institutionName: string;
  institutionId: string;
  userId: string;
  accounts: TellerAccount[];
  connectedAt: string;
  lastSyncAt?: string;
  error?: string | null;
}

export interface TellerTransaction {
  transactionId: string;
  accountId: string;
  accountName: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "deposit" | "withdrawal";
  status: "posted" | "pending";
  details?: {
    category?: string;
    merchant?: string;
    counterparty_name?: string;
  };
}

export interface TellerCategoryMapping {
  tellerCategory: string;
  vibeBudgetCategory: string;
}

export type IntegrationHub = "google_workspace" | "finance_feeds";

export type WorkspaceFlow = "sheets_source" | "drive_vault";

export type FeedProvider = "plaid" | "teller";

export type ConnectionStatus = "not_connected" | "configured" | "connected" | "needs_attention";

export interface SyncStatusSummary {
  provider: FeedProvider;
  lastSyncAt: string | null;
  imported: number;
  skipped: number;
  invalid: number;
  status: "idle" | "syncing" | "success" | "error";
  errorMessage?: string;
}

export interface RestoreStatusSummary {
  lastRestoreAt: string | null;
  lastPreviewAt: string | null;
  previewCounts?: {
    expenseCategories: number;
    incomeCategories: number;
    transactions: number;
    income: number;
  };
}
