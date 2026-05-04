# Baseline Lint/Typecheck Validation Status

Generated: 2026-05-03
Command: `npm run lint` (runs `tsc --noEmit`)
Baseline result: **9 errors across 4 files** (on `main` @ `020619a`)

---

## Purpose

Catalogues pre-existing typecheck failures so PR validation can distinguish:

1. **Baseline failures** — pre-existing, not caused by the PR.
2. **PR-introduced failures** — new type errors the PR must fix.

**Reviewers**: Block a PR if it adds new lint failures. If only baseline failures remain, note them but do not blame the PR.

---

## Failures

### 1. `src/components/Settings.tsx` — 1 error

| Code | Line | Summary |
|------|------|---------|
| TS2322 | 1021 | `GoogleSheetsInspectionResult` not assignable to local type — `expenseCategoryHeaders` is optional in the return type but required in the local variable annotation |

**Root cause**: The local type at lines 1008–1018 declares `expenseCategoryHeaders` and `incomeCategoryHeaders` as required (`string[]`). The `inspectGoogleSheetsSpreadsheet` function returns `GoogleSheetsInspectionResult` where those fields are optional (`expenseCategoryHeaders?: string[]`). Assignment fails.

**Impact**: Typecheck only. Runtime works because the optional fields are present when the function succeeds.

**Recommended fix**: Make `expenseCategoryHeaders` and `incomeCategoryHeaders` optional in the local type annotation (add `?`).

---

### 2. `src/contexts/FirebaseContext.tsx` — 3 errors

| Code | Line | Summary |
|------|------|---------|
| TS2352 | 1558 | Cast `config.expenseMapping as Record<string, string>` fails — `ExpenseSheetMapping` has no index signature |
| TS2352 | 1564 | Same for `config.incomeMapping as Record<string, string>` |
| TS2304 | 1594 | Cannot find name `SheetRangeDraft` — type is not imported |

**Root cause**:
- Lines 1558/1564: `ExpenseSheetMapping` and `IncomeSheetMapping` are specific interfaces. Casting them to `Record<string, string>` is rejected because neither has an index signature.
- Line 1594: `SheetRangeDraft` (defined in `src/types.ts:261`) is used in a `useCallback` parameter type but never imported.

**Impact**: Typecheck mostly. The `SheetRangeDraft` reference (TS2304) would cause a runtime `ReferenceError` if that code path executes, though the surrounding function may be unreachable without the import.

**Recommended fix**:
- Replace `as Record<string, string>` casts with field-by-field access or add an index signature to `ExpenseSheetMapping`/`IncomeSheetMapping`.
- Import `SheetRangeDraft` from `../../src/types`.

---

### 3. `src/testing/mockFirebase.tsx` — 2 errors

| Code | Line | Summary |
|------|------|---------|
| TS2741 | 90 | `sheetTitles` missing in `defaultInspection` object |
| TS2741 | 141 | `previewGoogleSheetColumn` missing in returned mock context object |

**Root cause**: Two properties were added to their respective types (`GoogleSheetsInspectionResult` and `FirebaseContextType`) after the mock was written. The mock was never updated.

**Impact**: Typecheck only. No current test calls `previewGoogleSheetColumn` on the mock, and the inspection mock is only used in tests that don't access `sheetTitles` by name.

**Recommended fix**:
- Add `sheetTitles: ["Expenses", "Income"]` to `defaultInspection` (line 90).
- Add `previewGoogleSheetColumn: vi.fn()` to the returned context object (line 141).

---

### 4. `tests/unit/googleSheetsPull.test.ts` — 2 errors

| Code | Line | Summary |
|------|------|---------|
| TS2352 | 239 | Cast `config.expenseMapping as Record<string, string>` fails |
| TS2352 | 244 | Same for `config.incomeMapping as Record<string, string>` |

**Root cause**: Same as FirebaseContext.tsx lines 1558/1564. The test duplicates the same validation logic.

**Impact**: Typecheck only. Test passes at runtime.

**Recommended fix**: Same as FirebaseContext.tsx — safer cast or check pattern.

---

## Summary Table

| File | Errors | Blocks runtime? | Blocks tests? | Blocks typecheck? |
|------|--------|----------------|---------------|-------------------|
| `src/components/Settings.tsx` | 1 | No | No | Yes |
| `src/contexts/FirebaseContext.tsx` | 3 | Possible (TS2304) | No | Yes |
| `src/testing/mockFirebase.tsx` | 2 | No | No | Yes |
| `tests/unit/googleSheetsPull.test.ts` | 2 | No | No | Yes |

**9 errors across 4 files, 4 unique root causes.**

---

## Previously-observed failures (not in current baseline)

The following files were mentioned in the task description but are **not present** on `main`:

| File | Note |
|------|------|
| `api/import/extract-transactions.ts` | Untracked file, not committed. May appear in some local/feature branches with 3 errors (TS2307, TS2305, TS2353). |
| `tests/components/Settings.test.tsx` | No typecheck errors on `main`. The reported TS2322 only occurs when coupled with untracked files that change module resolution context. |

If these appear in a PR diff, treat them as baseline-originated noise.

---

## Guidance for PR Reviewers

1. Run `npm run lint` before merging any PR that touches runtime code.
2. Compare the error count to **9 errors across 4 files**.
3. **PR adds new failures**: block. Author must fix.
4. **Only baseline failures remain**: note in PR summary but do not block.
5. **PR removes a baseline failure**: celebrate and update this document.

---

## Recommended Fix Order

| Priority | File | Effort | Impact |
|----------|------|--------|--------|
| 1 | `src/testing/mockFirebase.tsx` | Trivial (2 property additions) | Fixes 2 errors, unblocks test typecheck |
| 2 | `src/components/Settings.tsx` | Trivial (add `?` to 2 fields) | Fixes 1 error in component |
| 3 | `src/contexts/FirebaseContext.tsx` | Medium (import + fix casts) | Fixes 3 errors, one may affect runtime |
| 4 | `tests/unit/googleSheetsPull.test.ts` | Small (fix casts) | Fixes 2 errors in test |

---

## Related

See [docs/testing-release-workflow.md](./testing-release-workflow.md) for the broader validation workflow.
