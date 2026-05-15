# Graph Report - vibebudget  (2026-05-14)

## Corpus Check
- 166 files · ~170,734 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1563 nodes · 2524 edges · 112 communities (105 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bc14cc4d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 107|Community 107]]

## God Nodes (most connected - your core abstractions)
1. `useFirebase()` - 24 edges
2. `Transaction` - 23 edges
3. `normalizeDateString()` - 21 edges
4. `ExpenseCategory` - 18 edges
5. `Income` - 17 edges
6. `IncomeCategory` - 16 edges
7. `renderWithProviders()` - 15 edges
8. `getCurrencySymbol()` - 15 edges
9. `Troubleshooting Guide` - 15 edges
10. `formatDate()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `handler()` --calls--> `callAiChat()`  [INFERRED]
  api/chat.ts → src/server/aiClient.ts
- `handler()` --calls--> `detectDuplicateGroups()`  [EXTRACTED]
  api/transactions/detect-duplicates.ts → src/utils/duplicateDetection.ts
- `createApp()` --calls--> `registerAiChatRoute()`  [EXTRACTED]
  server.ts → src/server/aiChat.ts
- `createApp()` --calls--> `createDependencies()`  [EXTRACTED]
  server.ts → src/server/aiChat.ts
- `createApp()` --calls--> `registerPlaidRoutes()`  [EXTRACTED]
  server.ts → src/server/plaid.ts

## Communities (112 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (52): ExpenseSheetMapping, IncomeSheetMapping, appendSheetValues(), batchUpdateSpreadsheet(), buildExpenseRow(), buildGridRows(), buildIncomeRow(), buildRowRange() (+44 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (44): ImportPreviewOptions, ImportRecordKind, raw, result, AndroidNotificationImportResult, AndroidNotificationImportType, cleanCounterparty(), DEFAULT_CATEGORY_BY_TYPE (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (34): ErrorBoundary, Props, State, SelfHostSetup(), SelfHostSetupProps, SelfHostStatus, SetupPhase, isEmbeddedBrowser() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (30): FAB(), FABProps, AddState, CategoryManager(), CategoryType, DeleteConfirm, EditState, Dashboard() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (38): AI Providers, Browser-Visible Env Vars, BYOK Provider Setup Guide, code:env (GEMINI_API_KEY="your_api_key_here"), Common Failure States, Common failure states, Common failure states, Common failure states (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (33): PublicSheetImportConfig, PublicSheetImportRangeSelection, PublicSheetImportSharedConfig, getGoogleSheetsAccessErrorMessage(), parseSpreadsheetId(), buildRowFingerprint(), checkForNewSheetData(), clearAllCursors() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (29): AI_CHAT_CACHE_TTL_MS, AiCategory, AiIncome, AiTransaction, ApiMessage, ApiMessageRole, BASE_SYSTEM_PROMPT, BudgetData (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (33): 3a. Fill Firebase values in `.env.local` (optional in browser setup), 3b. Set the data namespace, 3c. Add a service account for server-side operations, 3d. (Optional) Add an AI key, 4. Start the app, API Endpoints, code:bash (# 1. Clone the repo), code:bash (npx vercel --prod --yes) (+25 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (18): User, CANONICAL_EXPENSE_CATEGORY_NAME_SET, CANONICAL_EXPENSE_CATEGORY_NAMES, clearSessionCache(), DEFAULT_CATEGORY_NAMES, DEFAULT_CORE_EXCLUDED, DEFAULT_INCOME_CATEGORY_NAMES, DEFAULT_PREFERENCES (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (27): handler(), handler(), createLinkToken(), CreateLinkTokenParams, CreateLinkTokenResult, decryptAccessToken(), deriveKey(), encryptAccessToken() (+19 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (29): DataDomain, DataHubMode, domains, FxRateMeta, getSettingsStorage(), ImportHistoryEntry, MappingTab, memoryStorage (+21 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (23): AI_CHAT_CACHE_TTL_MS, AiCategory, AiIncome, AiTransaction, BudgetData, budgetDataCache, BudgetSummary, buildBudgetSummary() (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (27): 1) Dashboard (Home), 2) Transactions, 3) Stats (Analysis), 4) Settings, Bring Your Own Firebase, code:bash (npm install), code:bash (npx playwright install chromium), code:bash (npx vercel --prod --yes) (+19 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (19): convertLegacySelection(), FieldPreview, FieldPreviewMap, FieldRangeDraft, getImportConfigKey(), getSelectionFirstDataCell(), getSelectionHeaderCell(), getSelectionLastDataCell() (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (20): CONTENTS, Docs(), DocSection, DocsProps, SECTIONS, defaultProps, MockIntersectionObserver, onBack (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (25): Accepted Values, code:bash (cp .env.staging.example .env.local), code:env (VITE_FIREBASE_DATA_NAMESPACE="staging"), code:block3 (> import.meta.env.VITE_FIREBASE_DATA_NAMESPACE), code:env (VITE_FIREBASE_DATA_NAMESPACE="staging"), code:bash (npx vercel env pull .env.vercel.preview), code:block6 (/environments/), Data Namespace Environment Variables (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (21): Category, ConnectionStatus, ExportJob, ExtractedTransactionCandidate, ExtractTransactionsRequest, FeedProvider, GoogleSheetsSyncDirection, ImpExActionType (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (24): Architecture, BYOK And Provider Setup, Current-State Notes, Data Movement, Deployment Modes, Docs And Help As Product, Editions, Engineering Baselines (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (22): handler(), agentCache, getAccountBalances(), GetAccountBalancesParams, GetAccountBalancesResult, getAccountDetails(), GetAccountDetailsParams, GetAccountDetailsResult (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (17): BottomSheet(), BottomSheetProps, DateRangeSelector(), DateRangeSelectorProps, LoggedOutHome(), LoggedOutHomeProps, outcomes, providers (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (16): useFirebase(), OnboardingWizard(), OnboardingWizardProps, STEP_LABELS, CategoriesStep(), CategoriesStepProps, CurrencyStep(), CurrencyStepProps (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (19): Analysis(), AnalysisProps, COLORS, COMPARISON_OPTIONS, ComparisonPeriodOption, range, compareDateStrings(), formatDate() (+11 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (16): UpcomingRecurringInstance, insights, smartAlerts, DashboardInsight, DashboardInsightAlert, DashboardInsightTile, formatMoney(), formatMoneyCompact() (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.1
Nodes (20): 1. Product Identity And Public Surface, 2. Onboarding And Setup Guidance, 3. Data Import, Sync, And Provider Trust, 4. BYOK And Self-Hosting Documentation, 5. Hosted Convenience Product Layer, 6. Core Budgeting Polish, 7. Mobile Maturity, Current Standing (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.1
Nodes (20): Client-Side Architecture, code:block1 (┌─────────────────────────────────────────────────────────┐), code:block2 (/environments/{namespace}/users/{uid}), code:block3 (categories, transactions, income, recurring_rules), code:block4 (Source (CSV/Excel/Sheets/Android)), Data Flow Pattern, Data Storage, Firestore Schema (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.1
Nodes (15): aheadCount, aheadRaw, [, aheadStr], args, body, config, configPath, currentBranch (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.1
Nodes (19): Auth expired, Gating test 1: No config, Gating test 2: Mapping not saved, Gating test 3: During sync, Incremental (default), Invalid URL, Manual Test: Google Sheets UX + Flow Improvements, Prerequisites (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (16): RecurringRule, results, rule, rules, upcoming, addMonthsToKey(), buildDateForMonth(), clampDayOfMonth() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (14): BulkAddModal(), BulkAddModalProps, EditableRowValues, OcrMeta, STATUS_STYLES, AiProviderConfig, ExtractTransactionsResponse, ImportBatch (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (18): Bring Your Own Firebase (Browser Config), code:bash (cp .env.example .env.local), code:bash (npm run build), Deployment, Hosted (Official), Local Development, Mode Comparison, No Env Vars? Use the Browser Setup (+10 more)

### Community 30 - "Community 30"
Cohesion: 0.2
Nodes (17): DriveConnection, BudgetDataFile, buildMultipartBody(), createBudgetFileInFolder(), createDriveFolder(), driveFetch(), DriveFile, DriveListResponse (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (13): GoogleSheetsInspectionResult, ImportCommitSummary, TellerCategoryMapping, TellerConnection, TellerCredentials, defaultExpenseCategories, defaultIncome, defaultIncomeCategories (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (15): GooglePullSummary, GoogleSheetsSyncOptions, batch, commitCandidates, config, duplicateRow, existing, incomeRows (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.12
Nodes (11): configWithoutSaved, pullButton, getCloudActionableError(), Settings(), config, inspectGoogleSheetsSpreadsheet, onRefresh, saveConfig (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.21
Nodes (12): AiChatDependencies, createDependencies(), registerAiChatRoute(), registerPlaidRoutes(), registerTellerRoutes(), createApp(), createDatabase(), defaultDbPath (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (12): { container }, MockIntersectionObserver, syncGoogleSheets, goBtn, onNavigate, onViewHistory, monthSelector, makeExpenseCategory() (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (10): ConfiguredImport, DATA_TYPE_CONFIGS, DataTypeConfig, ExcelImporterProps, FieldMapping, ImportDataType, parseDate(), ExcelParseResult (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (16): Backend / API, code:bash (npm install), code:block2 (vibebudget/), Development Setup (macOS-specific), Environment Variables, Firebase, Frontend, Google Integrations (+8 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (13): handler(), INITIAL_CATEGORIES, resolveAiConfig(), UploadedFile, AiChatMessage, AiChatResponse, AiClientError, AiOcrResponse (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (11): CHECKLIST_ITEMS, ChecklistItemConfig, SetupChecklist(), SetupChecklistProps, { container }, goButtons, onClose, onNavigate (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.12
Nodes (9): BackupPreview, FullBudgetBackupPayload, ImpExActionType, ImpExCenter(), ImpExCenterProps, ImpExHistoryEntry, RestoreMode, StatusLabel (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.12
Nodes (15): Auth/Sign-In PR Playbook, Backend/API PR Playbook, code:bash (# 1. Checkout the PR branch), code:bash (# Check all markdown links reference existing files), code:block3 (# Expected for Plaid:), code:text (Decision: [Safe for docs-only merge | Merge recommended | Ne), Deployment/Env PR Playbook, Docs-Only PR Playbook (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (10): handler(), a, b, base, fp1, fp2, groups, txs (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.16
Nodes (12): { container }, dateInputs, onChange, range, btn, onClick, FirebaseContext, FirebaseContextType (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (10): EmptyState(), EmptyStateAction, EmptyStateProps, DevSectionProps, COLORS, getMonthInputValue(), MONTH_NAMES, MonthlyAnalysis() (+2 more)

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (10): DuplicateDetectionPanel(), DuplicateDetectionPanelProps, PanelState, TransactionIcon(), TransactionIconProps, CATEGORY_ICONS, getCategoryIcon(), getVendorLogo() (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.26
Nodes (10): deduped, targetFingerprints, dedupeExpensesByImportFingerprint(), getExpenseImportFingerprint(), getIncomeImportFingerprint(), getStableImportedExpenseId(), getStableImportedIncomeId(), hashString() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.26
Nodes (11): epochMsToISO(), error(), getEnvOrThrow(), getSupabaseUidByEmail(), info(), initFirebase(), loadFirebaseAdmin(), main() (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.15
Nodes (12): Agent PR Flow, Backlog Capture Rule, Branch, Commit, And PR Conventions, code:bash (npm run agent:start -- <agent> <task-slug> [base-branch]), graphify, Guardrails, Local Validation Standard, Product Context (+4 more)

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (12): 1. `src/components/Settings.tsx` — 1 error, 2. `src/contexts/FirebaseContext.tsx` — 3 errors, 3. `src/testing/mockFirebase.tsx` — 2 errors, 4. `tests/unit/googleSheetsPull.test.ts` — 2 errors, Baseline Lint/Typecheck Validation Status, Failures, Guidance for PR Reviewers, Previously-observed failures (not in current baseline) (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.15
Nodes (12): Admin Credentials (Server), API Key Restrictions, Authenticated Server Routes, Client Config (Browser), Credential Storage for Provider Integrations, Diagnostics Safety, Firebase Configuration, Firestore Security Rules (+4 more)

### Community 51 - "Community 51"
Cohesion: 0.2
Nodes (10): formatDateTime(), ProviderStatusCard(), ProviderStatusCardProps, ProviderStatusInfo, ProviderStatusLevel, STATUS_STYLES, link, onPrimary (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (11): Agent handoff requirements, code:env (VITE_FIREBASE_DATA_NAMESPACE="staging"), code:text (Decision: Merge recommended | Needs changes | Merge blocked ), Codex validation checklist, Local browser validation, Merge decision format, Overview, Rollback expectations (+3 more)

### Community 53 - "Community 53"
Cohesion: 0.18
Nodes (9): emailRow, geminiRow, modelRow, nonOwnerToken, ownerToken, row, token, token1 (+1 more)

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (7): config, configPath, currentBranch, cwd, effectiveEmail, effectiveName, keys

### Community 55 - "Community 55"
Cohesion: 0.24
Nodes (11): createDefaultExpenseCategories(), createDefaultIncomeCategories(), createEmptyLocalState(), createIncomeCategoriesFromRecords(), dedupeCategoriesByName(), loadLocalState(), migrateExpenseCategories(), migrateIncomeCategories() (+3 more)

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (10): 1. Choose Your Mode, 2. Sign In, 3. Add Your First Transaction, 4. Set Up Categories and Targets, 5. Optional: Connect Providers, 6. Explore the Dashboard and Stats, 7. Import and Export, 8. Verify Your Setup (Self-Hosted) (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.18
Nodes (10): Backlog Capture, code:bash (npm run lint), Development Workflow, Durable Context To Read First, Local Validation, Operating Loop, PR And Validation Gates, Required Handoff From Implementation Agents (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.18
Nodes (10): ✅ Completed, Core Application, Features, 🚧 In Progress / Current, Infrastructure, 📋 Planned / Known Gaps, Progress, ✅ Recently Completed (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.2
Nodes (7): ImportCenter(), ImportCenterSource, ImportTarget, SOURCE_LABELS, STATUS_STYLES, TEMPLATE_ROWS, ImportSource

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (9): DataHub(), DataHubProps, ImportMode, NewDataInfo, RefreshSummary, ExcelImporter(), GoogleSheetImporter(), hasSavedTransactionSheetImportConfig() (+1 more)

### Community 61 - "Community 61"
Cohesion: 0.2
Nodes (9): Architecture Cleanup, Changelog: Google Sheets UX + Flow Improvements, Manual Test Script, New Types (`src/types.ts`), Pull Pipeline Unification (`src/contexts/FirebaseContext.tsx`), Regression Safety, Summary, Tests Added (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.2
Nodes (9): Hosted vs Self-Hosted, Important Security Model Points, Needed for Hosted Users, Needed for Self-Hosters, Privacy and Data Ownership Tradeoffs, Recommended Choice, What Hosted Gives, What Self-Hosting Gives (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.36
Nodes (8): CommitMode, CommitRow, getBearerToken(), getSupabaseAdmin(), handler(), hashString(), normalizeRows(), toCategoryRows()

### Community 64 - "Community 64"
Cohesion: 0.22
Nodes (8): authError, permissionError, result, buildA1Range(), detectHeaderRow(), parseA1CellReference(), trimValuesAtEmptyRun(), fetchRangeValuesFromRows()

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (8): After PR delivery, Agent PR Workflow, Branch and commit conventions, code:bash (# Start work), Commands, Required PR handoff checklist, What agents must NOT do, Workflow

### Community 66 - "Community 66"
Cohesion: 0.25
Nodes (7): addIncome, addTransaction, createRecurringRule, now, onRefresh, previous, updateTransaction

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (6): ChecklistItem, GettingStartedChecklist(), GettingStartedChecklistProps, ITEMS, ITEMS_MAP, onNavigate

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (7): Development, Getting Started, Operations, Provider Configuration, Quick Links, Setup & Deployment, VibeBudget Docs

### Community 69 - "Community 69"
Cohesion: 0.25
Nodes (7): Active Context, Active Decisions, Current Task, New files, Next Steps, Recent Changes, Updated files

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (5): deleteButtons, duplicateGroup, fetchMock, onDelete, user

### Community 71 - "Community 71"
Cohesion: 0.38
Nodes (7): clearTransactionsCache(), getLastTxSyncKey(), getTransactionsCacheKey(), incrementalTransactionSync(), loadTransactionsCache(), migrateTransactions(), saveTransactionsCache()

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (6): AiChat(), ChatMessage, getSessionKey(), MessageRole, readStoredMessages(), STARTER_PROMPTS

### Community 73 - "Community 73"
Cohesion: 0.29
Nodes (6): Core Goal, Deployment, Product Principles, Target Users, VibeBudget — Project Brief, What the App Does

### Community 74 - "Community 74"
Cohesion: 0.33
Nodes (4): branch, cwd, email, name

### Community 75 - "Community 75"
Cohesion: 0.47
Nodes (5): loadGapiScript(), loadPickerApi(), openGoogleSheetPicker(), PickedSheet, Window

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (5): Codebase Map (graphify), Hosted vs Self-Hosted, Product Context, VibeBudget — Claude Code Session Rules, Working Agreement

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (6): Drive backup shows "folder not found", "Google Drive API has not been used in project", "Google Sheets API has not been used in project", Google Sheets / Drive API Issues, "Insufficient authentication scopes" when syncing, OAuth consent screen not configured

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (6): API works but Vite dev server doesn't, code:bash (# Find the process), Local Dev Server / API Proxy Issues, Port 3000 already in use, SQLite database locked, Vite proxy: "Cannot GET /api/..."

### Community 79 - "Community 79"
Cohesion: 0.33
Nodes (5): App crashes on load: "Missing Firebase environment variables", "Cannot read properties of undefined (reading 'firebaseApp')", Firebase Env/Config Failures, Quick Reference: Where to Check, Troubleshooting Guide

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (6): "ITEM_LOGIN_REQUIRED" during sync, "PLAID_ENCRYPTION_PEPPER is not configured", Plaid Link opens but cannot find institution, Plaid Link says "Something went wrong", Plaid Setup / Connect / Sync Issues, "PRODUCT_NOT_READY"

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): How It Should Feel, Key User Workflows, Product Context, User Experience Principles, Why This Exists

### Community 83 - "Community 83"
Cohesion: 0.4
Nodes (4): file, parsed, createBudgetDataFile(), parseBudgetDataFile()

### Community 84 - "Community 84"
Cohesion: 0.4
Nodes (3): INTEGRATION_CARDS, IntegrationCard, IntegrationsStepProps

### Community 85 - "Community 85"
Cohesion: 0.4
Nodes (5): "Failed to initialize Firebase. Check your config values.", Firebase initialized but sign-in redirects back to logged-out state, Firebase Setup / Diagnostics, Self-host setup form does not appear, Setup diagnostics shows "Not configured" for Firebase Admin

### Community 86 - "Community 86"
Cohesion: 0.4
Nodes (5): Certificate/key errors, Enrolled but accounts don't appear, "Teller API error (401)" during sync, Teller Connect doesn't open, Teller Setup / Connect / Sync Issues

### Community 87 - "Community 87"
Cohesion: 0.4
Nodes (5): "AI API key is not configured", AI Chat Issues, Chat responds without user data, "Firestore quota exceeded" / 503, "Token UID does not match request UID"

### Community 88 - "Community 88"
Cohesion: 0.4
Nodes (4): 2026-05-09 - Workflow alignment bootstrap, 2026-05-11 — Firebase → Supabase Migration (Complete), Entries, Prompt Log

### Community 89 - "Community 89"
Cohesion: 0.4
Nodes (4): 2026-05-09 - Bootstrap backlog from Nexus workflow alignment, 2026-05-09 - OAuth app verification for Google sensitive scopes, Backlog, Open

### Community 91 - "Community 91"
Cohesion: 0.83
Nodes (3): getBearerToken(), getSupabaseAdmin(), handler()

### Community 92 - "Community 92"
Cohesion: 0.83
Nodes (3): getBearerToken(), getSupabaseAdmin(), handler()

### Community 93 - "Community 93"
Cohesion: 0.67
Nodes (4): hasMeaningfulLocalData(), isSameAsDefaultPreferences(), migrateExcludedCategories(), normalizePreferences()

### Community 94 - "Community 94"
Cohesion: 0.5
Nodes (4): Build fails: "Missing environment variable", Deployed app shows white screen, Serverless function timeout, Vercel Deployment / Env Var Issues

### Community 95 - "Community 95"
Cohesion: 0.5
Nodes (4): Import Duplicate / Warning / Invalid Outcomes, Imports show all records as "duplicate", Records marked as "invalid", Records marked as "warning"

### Community 96 - "Community 96"
Cohesion: 0.5
Nodes (4): Google Sign-In Failures, Popup blocked or closed, Sign-in works but immediately redirects to logged-out state, unauthorized-domain

### Community 97 - "Community 97"
Cohesion: 0.5
Nodes (4): AI chat returns 401: "Invalid or expired authentication token", AI chat returns 500: "Firebase Admin init failed", AI chat works locally but fails on Vercel, Firebase Admin / Service Account Issues

### Community 98 - "Community 98"
Cohesion: 0.5
Nodes (4): "A new version is available" but nothing changes, App doesn't reflect latest deploy, Offline mode not working, PWA / Cache Stale Build Issues

### Community 99 - "Community 99"
Cohesion: 0.5
Nodes (4): code:bash (firebase deploy --only firestore:rules), Data appears in Firestore but app shows nothing, Firestore Permission / Namespace Issues, "Missing or insufficient permissions"

### Community 100 - "Community 100"
Cohesion: 0.5
Nodes (3): config, ok1, ok2

## Knowledge Gaps
- **760 isolated node(s):** `env`, `defaultDbPath`, `INITIAL_CATEGORIES`, `ServerOptions`, `config` (+755 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handler()` connect `Community 6` to `Community 38`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `Transaction` connect `Community 3` to `Community 0`, `Community 1`, `Community 34`, `Community 35`, `Community 8`, `Community 42`, `Community 10`, `Community 44`, `Community 45`, `Community 46`, `Community 16`, `Community 21`, `Community 22`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `getTodayStr()` connect `Community 20` to `Community 1`, `Community 34`, `Community 3`, `Community 8`, `Community 40`, `Community 10`, `Community 21`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `normalizeDateString()` (e.g. with `isValidYmd()` and `formatYmd()`) actually correct?**
  _`normalizeDateString()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `env`, `defaultDbPath`, `INITIAL_CATEGORIES` to the rest of the system?**
  _760 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._