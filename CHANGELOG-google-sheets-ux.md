# Changelog: Google Sheets UX + Flow Improvements

## Summary
Implemented a clear mapping-first, then pull experience for Google Sheets with reliable save, pull modes, duplicate skipping, and pull summary.

## New Types (`src/types.ts`)
- `GooglePullSummary` — `{ fetched, imported, duplicateSkipped, invalidSkipped, netNew, mode }`
- `GoogleSheetsSyncMode` — `"incremental" | "full_reconcile"`
- `GoogleSheetsSyncOptions` — `{ mode?: GoogleSheetsSyncMode }`
- Extended `GoogleSheetsSyncConfig`:
  - `mappingSavedAt`, `mappingVersion` (mapping metadata)
  - `incrementalCursor` (per-type row cursor)
  - `lastPullSummary` (persisted pull result)

## Pull Pipeline Unification (`src/contexts/FirebaseContext.tsx`)
- `syncGoogleSheets()` now accepts `GoogleSheetsSyncOptions` with mode parameter
- Pull direction routes through preview/commit pipeline:
  - `buildSheetRowsForPull()` builds typed rows from mapped sheet ranges
  - Rows pass through `previewImportBatch` → `commitImport` (respects dedup)
- Returns `GooglePullSummary` with accurate counts
- Incremental mode uses cursor tracking stored in config
- Full reconcile mode re-processes all rows but still skips duplicates

## Architecture Cleanup
- `validateGoogleSheetsMapping()` exposes mapping validation (checks required fields)
- `migrateLocalStorageMappings()` auto-migrates legacy localStorage presets to Firestore on first load
- Firestore `googleSheetsConfig` is the canonical source of truth
- Legacy localStorage mapping is cleaned up after migration

## UI: Staged Flow (`src/components/Settings.tsx`)
**Step 1: Connect Google Sheets**
- URL input + Verify button with actionable error display
- Authorize/Disconnect Google account controls

**Step 2: Map Columns**
- Tab bar: Expenses, Income, Expense Categories, Income Categories
- Each tab shows field mapping status (Mapped/Missing indicator)
- Save Mapping button with timestamp ("Mapping saved at <time>")

**Step 3: Pull Data**
- Pull mode selector: Incremental (default) / Re-import All
- Pull Now disabled when:
  - No sheet verified
  - Mapping not saved
  - Sync in progress
- Post-pull summary card: Fetched, Imported, Duplicates Skipped, Invalid Skipped, Net New
- Push App Data to Sheet button

**Stage Indicator**
- Status bar across top of section: Disconnected / Connected / Mapped / Ready to Pull / Syncing / Complete / Error

## Tests Added
- `tests/unit/googleSheetsPull.test.ts` — 16 tests:
  - GooglePullSummary construction (incremental, full_reconcile modes)
  - SyncOptions mode validation
  - Pull pipeline preview/commit (new, duplicate, invalid classification)
  - Mapping validation logic (valid, missing fields, null config)
- `tests/components/GoogleSheetsGating.test.tsx` — 8 tests:
  - Pull button enabled/disabled by state
  - Stage indicator rendering
  - Pull summary card rendering
  - Conditional visibility of Step 2 / Step 3

## Regression Safety
- CSV/Excel/JSON import paths are untouched
- Push-to-sheet behavior preserved
- Auth/connect Google scopes unchanged
- All 74 existing tests continue to pass

## Manual Test Script
See `docs/manual-test-google-sheets-ux.md`
