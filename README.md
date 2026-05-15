# VibeBudget

VibeBudget is a personal budgeting product that helps you understand spending, track income, set targets, and stay in control of monthly cash flow — without spreadsheet sprawl.

Built for people who want one clear financial command center: fast daily logging, clean trends, and practical visibility into where money is going.

## Live Production

- **Stable URL**: https://vibebudget-chi.vercel.app
- Sign in with Google and start in under two minutes.

## Quick Start (For Users)

1. Open https://vibebudget-chi.vercel.app and sign in with Google.
2. Complete the onboarding wizard: set your currency, configure budget categories, add your first transaction.
3. Use the **Dashboard** to see your balance, spending pace, and insights.
4. Use the **Transactions** view to add, edit, search, and filter all records.
5. Use **Stats** and **Monthly** for category-level analysis and month-by-month trends.
6. Ask the **AI Chat** (floating button, bottom-right) anything about your finances.

Optional:
- Connect **Google Drive** for budget backup/restore.
- Connect **Google Sheets** for two-way sync with a spreadsheet.
- Connect **Plaid** or **Teller** for automatic bank feed import.
- Configure **AI provider** (Gemini or DeepSeek) for enhanced chat and document OCR.

---

## Product Snapshot

### What users can do

- Sign in with Google — data is private and tied to their account.
- Track expenses and income in one unified timeline.
- Set monthly budget targets per category (expense and income).
- Monitor budget pace in real time on the Dashboard.
- Analyze spending patterns across flexible date ranges.
- Compare current vs. prior periods or vs. last year.
- View month-by-month breakdown with pie charts.
- Ask an AI assistant questions about their financial data.
- Import from CSV/Excel, Google Sheets, Plaid, or Teller bank feeds.
- Export data as JSON or CSV.
- Use Google Drive for cloud backup and restore.
- Track multi-currency transactions with live or fixed exchange rates.
- Set up recurring transactions with rule-based automation.

### Who this is for

- Individuals managing monthly budgets.
- Users migrating from spreadsheets to a structured workflow.
- Anyone who wants to track income and expenses together, not just spending.

### Product principles

- Clarity first: dashboards show decisions, not noise.
- Local-first feel with optional cloud safety nets.
- User-controlled data movement (Drive, Sheets, CSV).
- Bring Your Own Key: all provider integrations are optional.

---

## Views

### Dashboard

Financial command center for the selected date range.

- **KPI strip**: Total Income, Total Spent, Current Balance, Tracked Targets.
- **Insights panel**: Budget used, Net take-home, Projected balance, Top category, Savings rate, Spend trend. Toggle between This Month and YTD. Expand with "See more".
- **Smart alerts**: actionable warnings (over-budget categories, upcoming recurring items, etc.).
- **Available Balance card**: spending ratio progress bar, net flow, spend pace, Smart Forecast, Saving Velocity.
- **Expense Targets**: all categories with spend vs. prorated target, progress bars, inline edit.
- **Income Targets**: income categories with received vs. target progress.
- **Date range selector**: This Month, Last Month, 3/6/12 Months, YTD, Custom.
- **Prior-period comparison**: percentage change badges on KPIs.
- **Getting Started checklist**: shown on empty state to guide new users.

### Transactions

Unified ledger for all expense and income records.

- **Quick add**: `+` button (FAB on mobile) opens the add transaction form. Choose expense or income. Enter date, vendor/source, amount, category, optional notes and currency.
- **Bulk add**: add multiple rows at once.
- **Edit / Delete**: tap any row to open inline edit or delete.
- **Search**: full-text search across vendor, category, and notes.
- **Filters**: filter by type (all/expense/income), category, amount range, date range.
- **Sort**: by date or amount, ascending or descending.
- **Recurring transactions**: rules generate recurring instances. Badge shown on recurring rows.
- **Duplicate detection**: panel identifies likely duplicates across import sources.
- **OCR import**: scan a receipt or document to import transactions.
- **Sheet refresh**: if a Google Sheets import is configured, pull latest rows from that view.
- **Multi-currency**: original currency and base-currency converted amount shown.

### Stats

Category-level spending and income analysis.

- **Overview tab**: pie chart of expense breakdown by category, bar chart of income vs. expenses, top-category table with spend and percentage.
- **Comparison tab**: compare any two periods side by side. Options: this month vs. last month, this month vs. same month last year, past 3/6/12 months vs. last year, YTD vs. last year, or custom. Expense mode toggles between All and Core (non-fixed) spend.
- **Deep Dive tab**: drill into a single category across time.
- **Date range selector**: independent range control on the Stats view.

### Monthly

Month-by-month breakdown for a selected calendar month.

- Navigate to any month using the month picker.
- Summary KPIs: income, expenses, balance, savings rate.
- Pie chart of expense categories for the selected month.
- Category table with spend, target, and over/under indicator.
- Quick comparison to the previous month.

### Settings

See [Settings Reference](#settings-reference) below.

### AI Chat

Floating chat panel (sparkle button, bottom-right corner).

- Powered by Gemini on the backend (or a custom AI provider configured in Settings → AI).
- Answers questions about your financial data: budgets, categories, spending trends, comparisons.
- Starter prompts: "How am I tracking against my budget targets?", "What's my biggest spending category this month?", "Show me all transactions above $100", "How does this month compare to last month?", "Am I saving money?".
- Chat history persists for the session; clears on sign-out.
- Requires an AI provider configured either server-side (hosted) or in Settings → AI (self-hosted/BYOK).

### Data Hub

Quick-access import panel (upload icon in the header toolbar).

- Import from CSV/Excel: drag and drop or pick a file.
- Import from Google Sheets: connect to a public or authorized sheet.
- Check for new sheet data and pull delta updates.
- Distinct from the full Data Hub in Settings; this is the fast-access entry point.

---

## Settings Reference

Settings is organized into tabs. Navigate to **Settings** from the sidebar or bottom nav.

### Data (Import / Export)

Full-featured data import and export hub.

- **Import domains**: Expense Categories, Income Categories, Expense History, Income Records.
- **Import from CSV**: upload a CSV file for any domain. Preview duplicates, warnings, and new records before committing. Option to upsert (update existing) or insert-only.
- **Import from Google Sheets**: connect a Google Sheet and map columns to VibeBudget fields.
- **Import history**: timestamped log of all past imports with counts (imported, skipped, invalid).
- **Export**: download any domain as CSV or full budget as JSON.
- **Live sync mode**: configure a Google Sheet for ongoing two-way sync vs. one-time import.

### Categories

Manage expense and income categories.

- **Expense categories**: add, rename, delete, reorder. Set monthly target amounts.
- **Income categories**: add, rename, delete. Set monthly income targets.
- Targets set here power the progress bars on the Dashboard and Stats views.

### Currency

Multi-currency configuration.

- **Base currency**: choose your primary display currency (e.g., CAD, USD, EUR). All amounts on dashboards convert to this currency.
- **Exchange rates**: add rates for any currency appearing in your transactions.
  - **Live mode**: rate auto-fetched from Yahoo Finance. Stale after 24 hours.
  - **Fixed mode**: you set the rate manually.
  - **Per Transaction mode**: rate captured at the time each transaction was added.
- Changing base currency prompts confirmation; existing records are unaffected, only display converts.

### Google Workspace

Connect Google Drive and Google Sheets.

**Google Drive**:
- Connect a Drive folder as your backup destination.
- **Backup**: save current budget data as `budget.json` to Drive.
- **Restore**: load from the saved `budget.json`.
- **Disconnect**: unlink the folder.

**Google Sheets**:
- Connect a Google Sheet for structured sync.
- Pick a sheet via Google Drive picker or paste a URL.
- Configure sheet tab names for Expenses, Income, Expense Categories, Income Categories.
- Map columns: define which spreadsheet columns map to which VibeBudget fields.
- **Pull**: import new rows from the sheet into VibeBudget.
- **Push**: write VibeBudget records back to the sheet.
- **Sync mode**: incremental (new rows only) or full.
- **Auto-sync**: optional periodic background sync on a configurable interval.
- **Low-quota mode**: reduces API calls for accounts near Google API limits.

### Finance Feeds

Connect bank accounts for automatic transaction import.

**Plaid**:
- Enter Plaid credentials (Client ID, Secret, environment).
- Connect bank accounts via the Plaid Link flow.
- Sync transactions from connected accounts.
- Map Plaid transaction categories to VibeBudget expense categories.
- Disconnect at any time.

**Teller**:
- Enter Teller credentials (App ID, certificate, key, environment).
- Connect accounts via the Teller Connect flow.
- Sync transactions from connected accounts.
- Map Teller categories to VibeBudget categories.
- Disconnect at any time.

### AI

Configure the AI provider used by the AI Chat and document OCR.

- **Provider**: Gemini (default) or DeepSeek.
- **Model**: select the model version for the chosen provider.
- **API Key**: enter your provider API key (stored locally, not sent to VibeBudget servers).
- Changes take effect immediately on the next chat message.
- The hosted deployment uses a server-side Gemini key by default; configuring your own key here overrides it.

### Maintenance

Controlled data cleanup operations.

- **Per-domain wipe**: delete all records in a specific domain (Expense Categories, Income Categories, Expense History, Income Records).
- Requires typing a confirmation phrase before executing.
- 15-second window to cancel after confirmation.
- **Export before wipe**: prompted to export data before proceeding.
- **Delete Account**: permanently delete your account and all associated data. Irreversible.

### Setup (Self-Hosted Only)

Diagnostic panel — visible only when `VITE_SELF_HOSTED=true`.

- Firebase configuration status.
- Firebase Admin credentials presence.
- AI server key configuration.
- Owner claim status.
- Data namespace in use.
- Feature availability summary.
- No secrets are exposed; all checks are public-safe.

---

## Setup Modes

| Mode | Description | For Whom |
|------|-------------|----------|
| **Hosted** | Managed at [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app) — sign in and go | Users who want the fastest start |
| **Self-Hosted** | Your own Firebase + Vercel deployment | Users who want full data control |
| **Local Dev** | `npm run dev` with `.env.local` | Developers and contributors |

See [Setup Modes](docs/setup-modes.md), [Hosted vs Self-Hosted](docs/hosted-vs-self-hosted.md), and [Getting Started](docs/getting-started.md) for details.

---

## Run Locally

```bash
npm install
cp .env.example .env.local   # Fill Firebase + optional provider values
npm run dev                   # Express API on :3000 + Vite on :8888
```

Use `VITE_FIREBASE_DATA_NAMESPACE="local-dev"` locally to isolate from production data.

See [Staging Env Safety](docs/staging-env-safety.md) for namespace isolation details.

### Local mock mode (for smoke tests)

```bash
npm run dev:test   # Deterministic mock-mode at http://127.0.0.1:4173
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Full dev server (API + Vite) |
| `npm run dev:vite` | Frontend only at :8888 |
| `npm run dev:api` | API server only at :3000 |
| `npm run dev:test` | Mock-mode frontend for smoke tests |
| `npm run build` | Production build → `dist/` |
| `npm run build:api` | API bundle → `.server-dist/server.cjs` |
| `npm run lint` | TypeScript type-check only |
| `npm run test` | Full test pipeline |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:component` | Vitest component tests |
| `npm run test:api` | API tests (Supertest) |
| `npm run test:smoke` | Playwright browser smoke tests |
| `npm run verify` | Tests + build + typecheck (pre-PR gate) |

First-time Playwright setup:

```bash
npx playwright install chromium
```

---

## Deploying to Vercel (Self-Hosted)

See the [Self-Hosting Guide](docs/self-hosting.md) for the full walkthrough.

Required environment variables:

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_DATA_NAMESPACE` | `prod` in production |
| `FIREBASE_DATA_NAMESPACE` | `prod` — must match client |
| `FIREBASE_ADMIN_CREDENTIALS_JSON` | Service account JSON (server-only) |
| `GEMINI_API_KEY` | Server-side AI key (optional) |
| `GEMINI_MODEL` | Model override — defaults to `gemini-2.5-flash` |
| `VITE_SELF_HOSTED` | `true` to show the Setup tab |

For provider-specific keys (Plaid, Teller, Google APIs), see [BYOK Provider Setup](docs/byok-provider-setup.md).

Preview deployments must use `staging` namespace. See [Staging Env Safety](docs/staging-env-safety.md).

```bash
npx vercel --prod --yes
```

---

## Data & Access Model

- **Authentication**: Google Sign-In via Firebase Auth.
- **App data**: isolated per signed-in user and namespace. No shared budgets.
- **Integrations** (all optional):
  - Google Drive: backup/restore `budget.json`.
  - Google Sheets: structured import/export and live sync.
  - Plaid: automatic transaction import from bank accounts.
  - Teller: automatic transaction import from bank accounts.
  - AI provider: Gemini or DeepSeek for chat and document OCR.

---

## Guides & Documentation

| Guide | Description |
|---|---|
| [Docs Index](docs/README.md) | Full documentation index |
| [Getting Started](docs/getting-started.md) | First-run walkthrough for all modes |
| [Feature Guide](docs/feature-guide.md) | Complete reference for every view and setting |
| [Setup Modes](docs/setup-modes.md) | Local dev, self-hosted, hosted, and BYO Firebase |
| [Hosted vs Self-Hosted](docs/hosted-vs-self-hosted.md) | Practical tradeoffs and recommendations |
| [Self-Hosting Guide](docs/self-hosting.md) | Full deployment: Firebase, Vercel, namespaces, security |
| [BYOK Provider Setup](docs/byok-provider-setup.md) | AI, Google Workspace, Plaid, Teller, Firebase |
| [Security & Privacy](docs/security-privacy.md) | Data handling, credential storage |
| [Troubleshooting](docs/troubleshooting.md) | Common issues: auth, Firestore, deploy, providers |
| [North Star Strategy](docs/north-star-strategy.md) | Product vision, positioning, and engineering |
| [Roadmap](docs/roadmap.md) | Execution phases and priorities |
| [Agent PR Workflow](docs/agent-workflow.md) | Branch, commit, approval, and agent handoff rules |
| [Testing & Release Workflow](docs/testing-release-workflow.md) | Validation and release gates |
| [Staging Env Safety](docs/staging-env-safety.md) | Namespace isolation and preview deployment safety |
| [Local Browser Testing](docs/local-browser-testing.md) | PR-type testing playbooks |
