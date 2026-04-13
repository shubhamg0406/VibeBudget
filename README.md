# VibeBudget

VibeBudget is a personal budgeting product that helps users understand spending, track income, set targets, and stay in control of monthly cash flow without spreadsheet sprawl.

This app is built for people who want one clear financial command center: fast daily logging, clean trends, and practical visibility into where money is going.

## Product Snapshot

### What users can do
- Sign in with Google and keep their data tied to their own account.
- Track both expenses and income in one timeline.
- Set category targets and monitor progress in real time.
- Analyze spending patterns across flexible date ranges.
- Import/export data (CSV and Google Sheets workflows).
- Configure base currency and exchange rates for multi-currency tracking.
- Connect Google Drive for backup/load (`budget.json`) and optional cloud continuity.

### Who this is for
- Individuals managing monthly budgets.
- Users transitioning from spreadsheets to a structured budgeting workflow.
- Anyone who wants to track income + expenses together (not just spending).

### Product principles
- Clarity first: dashboards emphasize decisions, not noise.
- Local-first feel with cloud safety nets.
- User-controlled data movement through Drive/Sheets integrations.

## Feature Walkthrough

### 1) Dashboard (Home)
- Financial KPIs: total income, total spent, balance, tracked targets.
- Budget pace and target-performance indicators.
- Date range controls (this month, last month, 3/6/12 months, YTD, custom).
- Prior-period comparison context to quickly see momentum.

### 2) Transactions
- Unified ledger for both expense and income records.
- Quick add/edit/delete entries.
- Search + advanced filters (type, category, amount range, date range).
- Sort by date or amount.
- Supports original transaction currency and converted base-currency view.

### 3) Stats (Analysis)
- Category-level spending and income breakdowns.
- Comparison views: current vs previous period or last year equivalents.
- Date-range aware trend analysis.
- Core-vs-all expense analysis controls.

### 4) Settings
- **Data Hub**: import/export and selective data-domain operations.
- **Currency**: choose base currency and maintain custom exchange rates.
- **Cloud Sync**:
  - Connect Drive folder for `budget.json` load/save flows.
  - Connect Google Sheets for optional two-way mirror/sync.
  - Configure sheet tabs, column mapping, and sync cadence.
- **Maintenance**: controlled reset/cleanup operations by data domain.

## Data & Access Model

- Authentication: Google Sign-In (Firebase Auth).
- App data: isolated per signed-in user and namespace.
- Multi-user shared budgets are intentionally disabled in the current product.
- Optional integrations:
  - Google Drive: backup/load budget file.
  - Google Sheets: structured external editing/mirroring.

## Run Locally

### Prerequisites
- Node.js 20+

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Fill Firebase values in `.env.local`.
4. Start app:
   ```bash
   npm run dev
   ```

### Environment separation (important)
- Use `VITE_FIREBASE_DATA_NAMESPACE="local-dev"` in local development.
- Use `VITE_FIREBASE_DATA_NAMESPACE="prod"` in production.
- This keeps local/dev data isolated from live production data, even in the same Firebase project.

### Local mock identity for tests
- `VITE_TEST_USER_EMAIL` sets the default user email when running `VITE_TEST_MODE=mock`.

## Scripts

- `npm run dev` - run dev server.
- `npm run dev:test` - run deterministic mock-mode app for smoke tests.
- `npm run build` - build production artifacts to `dist/`.
- `npm run preview` - preview production build locally.
- `npm run lint` - TypeScript typecheck.
- `npm run test:unit` - utility/unit tests (Vitest).
- `npm run test:component` - React component tests.
- `npm run test:api` - API-focused tests for `server.ts`.
- `npm run test:smoke` - browser smoke tests (Playwright).
- `npm run test` - full test pipeline.
- `npm run verify` - tests + build + typecheck.

## Testing Stack

- `Vitest` + `Testing Library` for unit/component confidence.
- `Supertest` for API coverage.
- `Playwright` for browser smoke coverage.

First-time Playwright setup:
```bash
npx playwright install chromium
```

## Deploying To Vercel

Set these env vars in the Vercel project:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (optional)
- `VITE_FIREBASE_DATA_NAMESPACE` (`prod` in production)

Recommended production checks:
1. `npm run verify`
2. Deploy to preview
3. Validate Google auth + data namespace + Sheets/Drive connections
4. Promote to production
