# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

**VibeBudget** — personal budgeting and finance workspace (Firebase Auth + Firestore backend).

- Deployment modes: Hosted ([vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app), Firebase-managed) / Self-Hosted (BYO Firebase + Vercel) / Local Dev
- Provider integrations: Plaid, Teller, Google Sheets, Google Drive, document OCR
- AI chat powered by Gemini (server-side) or DeepSeek (BYOK via Settings → AI)
- `VITE_SELF_HOSTED=true` gates Setup tab and self-hosted features; hidden in hosted mode
- Data namespace isolation: `local-dev` / `staging` / `prod` — client and server vars must match

Key docs:
- `README.md` — product overview, settings reference, dev quickstart, env var table
- `docs/README.md` — full documentation index
- `docs/feature-guide.md` — complete reference for every view, panel, and setting
- `docs/getting-started.md` — first-run walkthrough for all modes
- `docs/setup-modes.md` — hosted, self-hosted, local dev, browser config, mode comparison
- `docs/hosted-vs-self-hosted.md` — practical tradeoffs and recommendations
- `docs/north-star-strategy.md` — product direction
- `docs/roadmap.md` — prioritized scope
- `docs/backlog.md` — open bugs, UX polish, ideas
- `docs/testing-release-workflow.md` — release and validation expectations
- `docs/agent-workflow.md` — branch/PR handoff requirements
- `docs/development-workflow.md` — Codex + implementation-agent loop

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: build-commands -->
## Build & Development Commands

```bash
# Full dev (API + Vite frontend, concurrent)
npm run dev

# Frontend only
npm run dev:vite           # http://localhost:8888

# API server only (builds then runs)
npm run dev:api            # http://localhost:3000

# Mock/test mode frontend
npm run dev:test           # http://127.0.0.1:4173

# Build
npm run build              # Vite production build → dist/
npm run build:api          # ESBuild API bundle → .server-dist/server.cjs

# Lint (TypeScript type-check only)
npm run lint               # tsc --noEmit

# Tests
npm run test               # all: unit + component + API + smoke
npm run test:unit          # vitest run tests/unit
npm run test:component     # vitest run tests/components
npm run test:api           # vitest run --environment=node tests/api
npm run test:smoke         # playwright test

# Agent workflow
npm run agent:start -- <agent> <task-slug> [base-branch]
npm run agent:whoami
npm run agent:pr -- <agent> "<pr title>" main --approved

# Verify (pre-PR checks)
npm run verify

# Capacitor / Android
npx cap sync android        # sync web build → native Android project
npx cap open android        # open android/ in Android Studio
npx cap build android       # build Android APK/AAB (requires Android Studio SDK)
```

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```
vibebudget/
├── src/
│   ├── App.tsx              # Root: view state machine, auth gate, routing
│   ├── types.ts             # Domain types (Transaction, Income, Category, etc.)
│   ├── components/          # 32+ React components
│   │   ├── account/         # Account management
│   │   ├── transactions/    # Transactions views
│   │   ├── import/          # Import flows (CSV, Google Sheets, OCR)
│   │   ├── plaid/           # Plaid bank feed UI
│   │   ├── setup/           # Self-hosted setup (VITE_SELF_HOSTED only)
│   │   ├── onboarding/      # Onboarding wizard
│   │   ├── Dashboard.tsx    # Budget overview
│   │   ├── Settings.tsx     # Settings tabs
│   │   ├── AiChat.tsx       # Gemini AI chat panel
│   │   ├── Layout.tsx       # Shell: sidebar (desktop lg:flex), header, profile menu, page animation
│   │   └── nav/
│   │       └── BottomNav.tsx  # Mobile bottom navigation
│   ├── contexts/
│   │   ├── FirebaseContext.tsx   # Legacy Firebase (being migrated)
│   │   └── SupabaseContext.tsx   # Current hosted auth/data
│   ├── hooks/
│   │   └── useBreakpoint.ts
│   ├── lib/
│   │   ├── auth.ts          # Auth helpers
│   │   ├── supabase.ts      # Supabase client
│   │   └── supabaseTypes.ts
│   ├── utils/               # 15+ utility modules (date, currency, import, etc.)
│   └── server/              # Server-side handlers
│       ├── aiChat.ts        # Gemini AI endpoints
│       ├── aiClient.ts      # Gemini client wrapper
│       ├── plaid.ts         # Plaid API handler
│       └── teller.ts        # Teller API handler
├── server.ts                # Express entry point
├── api/                     # Vercel serverless API routes
├── supabase/
│   └── migrations/          # Supabase SQL migrations
├── android/                 # Capacitor Android platform (appId: com.vibebudget.app)
│   ├── app/build.gradle     # App module: AGP 8.13.0, versionCode=1
│   └── app/src/main/
│       └── AndroidManifest.xml  # Deep link scheme: com.vibebudget.app
├── capacitor.config.ts      # Capacitor config: webDir=dist, androidScheme=https
├── scripts/                 # Agent workflow scripts
├── tests/                   # unit/ + components/ + api/ + e2e/
└── graphify-out/            # AST knowledge graph (read before exploring code)
```

**Data flow**: `SupabaseContext` (or `FirebaseContext`) → `App.tsx` state → component props. URL routing via `react-router-dom` — `Layout.tsx` holds `VIEW_PATHS` mapping `View` → URL and calls `useNavigate` for sidebar nav. `currentView` prop still drives active state.

**Hosted vs self-hosted**: `VITE_SELF_HOSTED=true` gates Setup tab and local SQLite path. Never expose self-hosted-only features in hosted app.

**Graphify**: Always read `graphify-out/GRAPH_REPORT.md` before source files or grep searches. Run `graphify update .` after modifying code.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

**Naming**
- Components: `PascalCase.tsx` (e.g. `Dashboard.tsx`, `AiChat.tsx`)
- Utilities/hooks: `camelCase.ts` (e.g. `dateUtils.ts`, `useBreakpoint.ts`)
- Types/interfaces: PascalCase with `I`-prefix avoided (e.g. `Transaction`, `ExpenseCategory`)
- Constants: camelCase or SCREAMING_SNAKE for env vars

**Imports**
- ES modules (`"type": "module"` in package.json)
- Named imports preferred; default exports for React components
- No barrel `index.ts` files — import from specific file paths

**Styling**
- Tailwind CSS 4 utility classes; `clsx` + `tailwind-merge` for conditional classes
- No CSS modules; minimal inline styles
- Dark/light theme via Tailwind dark: variant

**TypeScript**
- Strict mode; `tsc --noEmit` is the lint gate
- Domain types in `src/types.ts`; Supabase generated types in `src/lib/supabaseTypes.ts`
- Prefer `interface` for data shapes, `type` for unions/aliases

**React patterns**
- Functional components only; hooks for state/effects
- Context for cross-cutting state (auth, transactions, categories)
- No Redux or external state management

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Feature gating**: `VITE_SELF_HOSTED` env var controls self-hosted-only features. Check before adding Setup/infrastructure UI.

**Import pipeline**: All imports flow through `src/utils/importPipeline.ts` with deduplication via `importDedupe.ts`. New import sources should hook into this pipeline. Fallback dedup key (`makeFallbackKey`) uses `notes` — not `raw_description` — because `raw_description` format varies across import sources/versions and causes false-new entries on re-pulls. When `source_id` is present, duplicate detection checks both source key AND fallback key (`sourceDuplicate || fallbackDuplicate`).

**Recurring transactions**: `src/utils/recurring.ts` handles rule-based recurring logic. `is_recurring_instance` flag on `Transaction`.

**Currency handling**: Multi-currency via `src/utils/currencyUtils.ts`. Secondary currency has a known race condition pattern — use `updateSingleExchangeRate` not batch updates.

**AI chat**: Server-side via `src/server/aiChat.ts` → Gemini. Client never calls Gemini directly.

**Agent scripts**: `scripts/agent-start.mjs`, `agent-pr.mjs`, `agent-whoami.mjs` — use these for branch setup and PR creation, don't do it manually.

**Migration path**: Firebase → Supabase migration ongoing. `FirebaseContext` is legacy; `SupabaseContext` is canonical. New features should use Supabase only.

**Capacitor Android**: `appId=com.vibebudget.app`, `androidScheme=https`, `webDir=dist`. Deep link URL scheme: `com.vibebudget.app`. `google-services.json` is required for push notifications but is not committed — push notifications are disabled until it is added.

**URL routing**: `VIEW_PATHS` in `Layout.tsx` maps `View` enum values to URL paths. Sidebar nav uses `useNavigate(VIEW_PATHS[item.id])`. When adding a new view, add it to `View` type, `PAGE_META`, and `VIEW_PATHS` in Layout, and register the route in `App.tsx`/`main.tsx`.

**Auth flow** (`src/lib/auth.ts`): `signInWithGoogle(withDriveScopes?)` uses three paths — (1) native Capacitor: system browser via `@capacitor/browser`, PKCE code exchanged on `appUrlOpen` deep link `com.vibebudget.app://login-callback` (must be registered in Supabase Auth > URL Configuration > Redirect URLs); (2) embedded browser (electron/webview/wv/codex UA): direct redirect flow; (3) web: popup with automatic redirect fallback on popup-closed errors. Pass `withDriveScopes=true` to include `drive.file` + `spreadsheets.readonly` scopes for Google Sheets integration. Auth state handler in `SupabaseContext` also extracts `provider_token` from the Supabase session and stores it immediately via `storeAccessToken` on sign-in.

**Google Sheets pull — content-based dedup**: Incremental pull no longer uses row-number cursors (they broke when sheets were re-sorted). Replaced with open-ended column reads (`col{N}:col`) via `getSheetValues` (removed `getSheetColumnValuesUntilEmptyRun`). Dedup uses stable source IDs from `importDedupe.ts` (`getStableImportedExpenseId` / `getStableImportedIncomeId`) + a fingerprint fallback. `normalizeDateString` is applied before ID generation. Do not reintroduce cursor-based row offsets.

**Google Sheets pull preview workflow**: `SupabaseContext` exposes `previewGoogleSheetsPull(mode?)` → returns `GooglePullPreviewResult`; and `commitGoogleSheetsPullPreview(preview, recordIds)` → returns `GooglePullSummary`. `Settings.tsx` uses these to implement a "Preview Rows First" → review + select records → "Commit Selected" flow before writing data. New import sources that pull from Google Sheets should follow this pattern.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Recent design decisions from git history:
- **Docs closeout** (2e076fc): Final docs, setup status, and self-host polish — `docs/` is now authoritative for setup modes, feature guide, and getting started
- **Currency race condition fix** (d2034c5): Rewrote currency settings, fixed secondary currency race via `updateSingleExchangeRate` — don't reintroduce batch exchange rate updates
- **Hosted/self-hosted split** (45de2fa): Setup tab hidden behind `VITE_SELF_HOSTED`; enforce this boundary strictly
- **Onboarding simplification** (ed5daad): Integrations step removed from wizard — don't re-add without explicit request
- **DataHub header button removed** (350ae95): Upload/DataHub trigger removed from `Layout.tsx` header — `DataHub` component still exists in `Settings.tsx`; do not re-add a header shortcut without explicit request
- **Agent branch convention**: `agent/<agent>/<task-slug>` — enforced by `agent-start.mjs`
- **Android platform added** (41a73ce): Capacitor Android scaffolded with `appId=com.vibebudget.app`. `google-services.json` not committed — push notifications disabled until added.
- **Google pull preview + content dedup** (142172a): Row-number cursor sync replaced with content-based dedup (stable import IDs + fingerprints). `getSheetColumnValuesUntilEmptyRun` removed. `previewGoogleSheetsPull` / `commitGoogleSheetsPullPreview` added to context — use the preview-then-commit flow for all future Google Sheets pull features.
- **Import fallback dedup uses notes not raw_description** (7ae1f9d): `makeFallbackKey` in `importPipeline.ts` now keys on `notes` exclusively — `raw_description` caused false-new on re-pulls when its format changed between versions. Also tightened: records with a `source_id` now check both source key and fallback key for duplicates.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

- Read `graphify-out/GRAPH_REPORT.md` first — saves grep searches
- Keep PRs scoped; one task per branch
- Run `npm run verify` before opening a PR
- Test UI in local browser after backend changes — type-check alone is insufficient
- Use `npm run test:api` for Express route changes
- Supabase migrations go in `supabase/migrations/` — never mutate schema directly
- Do not commit `.env*` files (gitignored); use `.env.example` as reference

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Working Agreement

- Treat this repository as the source of truth, not chat memory.
- Preserve user work already present in the working tree.
- Keep changes scoped to the requested task.
- Prefer existing patterns, components, routes, and tests.
- Add or update tests when behavior changes.
- Do not use production data for local, preview, or agent validation.
- Document untested areas and residual risk in handoff notes.

## Agent PR Flow

The owner and Codex use this loop for agent-driven development:

1. Codex and the owner identify the work.
2. Codex writes a precise prompt in `docs/prompt-log.md` or directly for the target implementation agent.
3. The implementation agent works on an `agent/<agent>/<task-slug>` branch.
4. The implementation agent runs relevant checks, commits, pushes, and opens the PR.
5. Codex pulls/checks the PR locally, starts the app, and validates the UI directly in a browser.
6. Codex reports whether local UI passes, needs a fix prompt, or needs a Codex fix.
7. The owner decides whether to merge or ask for the next prompt.

The owner should not need to manually review PR diffs or perform the first UI test pass. Local browser validation is the primary quality gate.

## Prompt Authoring Rule

When Codex writes a prompt for an implementation agent, include relevant operating instructions inline. Do not assume the agent will remember this workflow from chat or discover every rule on its own.

Every implementation prompt must include:
- Repository path
- Files and docs to read first, including `AGENTS.md`
- Branch/start command
- Scoped task summary
- Acceptance criteria
- Out-of-scope items
- Test, lint, build, and browser validation expectations
- Automatic PR creation command
- Required handoff report
- Instruction not to merge or deploy

If a prompt is important enough to send to another agent, also preserve it in `docs/prompt-log.md` unless the owner explicitly says it is throwaway.

## Backlog Capture Rule

When the owner says "add this to backlog", "save this for later", or similar, do not start implementation. Append the note to `docs/backlog.md` with a lightweight entry.

Backlog entries should include: date, source/context, short title, what was observed or requested, why it matters, optional acceptance notes, status (default: `Open`).

## Branch, Commit, And PR Conventions

- Agent branch format: `agent/<agent>/<task-slug>`
- Agent commit format: `[<agent>] <short message>`
- Agent PR title format: `[<agent>] <task summary>`
- Codex-authored branches should use the `codex/` prefix unless the owner asks for another branch name.

## Guardrails

- Do not merge your own PR.
- Do not deploy to production.
- Do not create a PR until the owner explicitly approves it.
- Do not use production credentials or data for testing.
- Do not commit secrets, API keys, or personal data.
- Do not bypass the required handoff checklist.
- Do not revert user or other-agent changes.
- Do not touch Nexus/shared canonical work unless explicitly assigned.

## Local Validation Standard

When validating a PR, lead with local product behavior. Check the diff as needed, but do not stop at diff review when UI behavior is testable.

Verify: user-facing behavior and acceptance criteria, relevant flow in a local browser, auth/integration boundaries when applicable, data safety expectations, API route behavior when backend changes, local testability and rollback clarity.

If no issues are found, say so clearly and call out any remaining test gaps. If the UI fails locally, prepare the next fix prompt or fix directly when asked.

<!-- END MANUAL -->
