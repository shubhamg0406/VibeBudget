# VibeBudget Feature Guide

Complete reference for every view, panel, and setting in VibeBudget.

---

## Navigation

The app has a sidebar on desktop (≥ 1024px) and a bottom navigation bar on mobile. Five main destinations:

| Nav Item | Icon | View |
|----------|------|------|
| Home | House | Dashboard |
| Transactions | List | Transactions |
| Stats | Bar chart | Stats (Analysis) |
| Monthly | Calendar check | Monthly Analysis |
| Settings | Gear | Settings |

Additional access points in the header toolbar:
- **Search bar** (desktop): context-sensitive search for the current view.
- **Theme toggle**: switch between dark and light mode.
- **Upload icon**: opens the Data Hub import panel.
- **Profile avatar**: opens the profile menu — shows your name and email, Sign Out button.
- **Docs link** (sidebar bottom): opens the built-in documentation viewer.
- **AI Chat button** (bottom-right floating): opens the AI chat panel.

---

## Dashboard

The Dashboard is the default view after sign-in. It gives a real-time snapshot of your financial health for the selected date range.

### Date Range Selector

Controls which period all Dashboard data reflects.

| Option | What it covers |
|--------|---------------|
| This Month | First to last day of current calendar month |
| Last Month | Previous calendar month |
| Last 3 Months | Rolling 90-day window |
| Last 6 Months | Rolling 180-day window |
| Last 12 Months | Rolling 365-day window |
| YTD | January 1 of the current year to today |
| Custom | Any start and end date you specify |

### KPI Strip

Four cards at the top of the Dashboard:

- **Total Income**: sum of all income records in the selected period. Green badge shows percentage change vs. the prior equivalent period.
- **Total Spent**: sum of all expense records. Red badge shows percentage change vs. prior period.
- **Current Balance**: Total Income minus Total Spent. Blue if positive, red if negative. No delta badge.
- **Tracked Targets**: count of active expense and income category targets combined.

All monetary values convert to your base currency using the configured exchange rates.

### Insights Panel

Data-driven signals organized into tiles. Toggle between **This Month** and **YTD** with the period selector.

**Hero tiles (large)**:
- **Budget used**: percentage of total expense target consumed in the period.
- **Net take-home**: income minus expenses for the period.
- **Projected balance**: estimated end-of-period balance based on current spend rate.

**Support tiles (smaller)**:
- **Top category**: the expense category with the highest spend.
- **Savings rate**: percentage of income not spent.
- **Spend trend**: direction of spending vs. prior period (Up, Down, Flat).

**Secondary tiles** (click "See more"):
- **Fixed spend**: total of fixed/recurring expenses.
- **Spend buffer**: headroom remaining vs. targets.

**Smart alerts** (shown below tiles when active): actionable warnings such as over-budget categories, stale exchange rates, or upcoming recurring transactions due in the next 30 days. Each alert is a color-coded pill.

### Available Balance Card

Shows your net position in the selected period.

- **Available Balance**: Total Income minus Total Spent (same as Balance KPI).
- **Net Flow**: same value expressed in thousands (e.g., 1.2k).
- **Spend Pace**: percentage of income that has been spent.
- **Spending Ratio progress bar**: visual representation of spend pace, green gradient from left. Animated on load.
- **Smart Forecast** and **Saving Velocity** sub-cards: qualitative signals about end-of-month trajectory and whether you are in an accumulation or drawdown phase.

On empty state (no transactions yet), this card shows a Getting Started checklist with links to add a transaction, set a budget target, and configure currency.

### Expense Targets

Panel showing all expense categories with their budget tracking:

- **Active**: count of categories with data in the period.
- **Over Limit**: count of categories where spend exceeds the prorated target.
- Per-category row: category name, spend vs. prorated target (in base currency), progress bar, percentage used.
  - Bar is green when under target, red when over target.
  - **Edit**: inline edit button lets you change the monthly target amount without leaving the Dashboard. Enter a new value and press the check to save.

Prorating: if the date range covers multiple months, the monthly target is multiplied by the month count. For custom ranges, it is prorated by days.

### Income Targets

Panel showing income categories with targets:

- Header shows how many categories are on track (received ≥ target).
- Per-category row: category name, received vs. prorated target, progress bar.
- Bar uses a teal gradient; does not turn red when over target (exceeding income targets is generally good).
- Shows up to 6 categories.

---

## Transactions

All expense and income records in a unified, searchable, filterable ledger.

### Adding a Transaction

**Single add**:
1. Click the `+` FAB button (mobile: bottom-right float; desktop: top of Transactions view).
2. Choose **Expense** or **Income**.
3. Fill in the form:
   - **Date**: defaults to today. Pick any date.
   - **Vendor** (expense) or **Source** (income): free text.
   - **Amount**: numeric. For formula support, prefix with `=` (e.g., `=15.99+3.00`).
   - **Currency**: defaults to your base currency. Change if the transaction was in another currency.
   - **Category**: choose from your configured categories.
   - **Notes**: optional free text.
4. Save.

**Bulk add**: click the bulk add option to enter multiple rows in a table-style form.

### Editing and Deleting

- Tap or click any transaction row to open the edit form.
- Change any field and save.
- Delete button removes the record (with confirmation on mobile).
- Recurring instances show a recurring badge; editing them updates that specific instance only.

### Search and Filters

- **Search bar**: full-text search across vendor/source, category name, and notes. Results update in real time.
- **Filter button** (funnel icon): opens filter controls:
  - **Type**: All, Expense, Income.
  - **Category**: filter to a single category.
  - **Amount range**: min and max amount.
  - **Date range**: start and end date.
- Multiple filters combine with AND logic.
- Active filters shown as dismissible pills.

### Sort

Toggle sort order by clicking column headers or the sort button:
- Sort by **date** (newest first by default, toggle to oldest first).
- Sort by **amount** (highest to lowest, toggle to lowest to highest).

### Recurring Transactions

- Transactions with recurring rules show a **Repeat** badge on the row.
- Upcoming recurring transactions appear in the Dashboard smart alerts (within 30 days).
- Manage recurring rules via the recurring rules panel.

### Duplicate Detection

Click the **duplicate detection** icon to open the Duplicate Detection panel:
- Scans all transactions for likely duplicates based on date, amount, and vendor similarity.
- Shows candidate pairs with a confidence indicator.
- Options: mark as duplicate (keep one, delete the other), dismiss (keep both).

### OCR / Document Import

Click the **scan** icon (receipt with camera) to open document OCR:
- Upload a receipt, invoice, or statement image.
- AI extracts transaction details (vendor, amount, date, category suggestion).
- Review and confirm before committing.
- Requires an AI provider configured in Settings → AI.

### Sheet Refresh

If a Google Sheets import mapping is configured (via Settings → Data), a **refresh** icon appears in the toolbar. Click to pull the latest rows from the mapped sheet without opening Settings.

### Multi-Currency Display

Each transaction row shows:
- Original amount in the transaction's currency.
- Converted amount in your base currency (using the exchange rate for that currency).

---

## Stats

Category-level analysis for the current date range (controlled independently in Stats view).

### Overview Tab

- **Expense pie chart**: each expense category as a proportion of total spend. Hover for exact values.
- **Income vs. Expenses bar chart**: side-by-side comparison per category or period.
- **Category table**: each expense category with total spend and percentage of total.
  - Toggle **All** vs. **Core** expense mode. Core excludes fixed/recurring expenses to show discretionary spend.

### Comparison Tab

Compare two time periods side by side.

**Preset comparisons**:
- This month vs. last month
- This month vs. same month last year
- Past 3 months (incl. this month) vs. last year
- Past 6 months (incl. this month) vs. last year
- Past 12 months vs. last year
- Year to date vs. last year
- Custom (choose both periods manually)

Each comparison shows:
- Income, spend, and balance for both periods.
- Category-level breakdown for both periods.
- Delta indicators (amount and percentage change).

### Deep Dive Tab

- Select a single category.
- View that category's spending across the time range (bar chart by month or week).
- Identify trends, spikes, and quiet periods.

---

## Monthly Analysis

Month-by-month view of a single calendar month.

### Month Navigation

- Use the **month picker** (input or arrows) to navigate to any month.
- Defaults to the current month.

### Monthly KPIs

- **Income**: total for the selected month.
- **Expenses**: total for the selected month.
- **Balance**: income minus expenses.
- **Savings Rate**: (1 - spend/income) × 100%, shown as a percentage.

### Expense Pie Chart

Proportional breakdown of expenses by category for the month. Hover for values.

### Category Table

All expense categories with:
- Spend in the month.
- Monthly target amount.
- Over/under indicator.

### Prior Month Comparison

Quick summary comparing the selected month to the immediately prior month: income delta, expense delta, balance delta.

---

## AI Chat

Floating chat panel accessible from the sparkle button (bottom-right corner of any view).

### Opening and Closing

- Click the sparkle button to open. Click again or press X to close.
- The panel floats over the current view; the rest of the app remains accessible.

### Asking Questions

Type any question about your finances and press Send or Enter. The AI has read access to your current transaction and category data.

**Built-in starter prompts** (shown when chat is empty):
- "How am I tracking against my budget targets?"
- "What's my biggest spending category this month?"
- "Show me all transactions above $100"
- "How does this month compare to last month?"
- "Am I saving money?"

Click any starter prompt to send it immediately.

### AI Context

The AI receives your transaction records, income records, expense categories, and category targets. It does not have access to your credentials, linked accounts, or external integrations.

### Session Persistence

Chat history persists for the duration of your browser session (via `sessionStorage`). Closing and reopening the panel restores your conversation. History is cleared when you sign out.

### Provider Setup

- **Hosted**: a server-side Gemini key is pre-configured. Chat works without any user configuration.
- **Self-Hosted / BYOK**: configure your own key in **Settings → AI** (Gemini or DeepSeek). Your key is stored client-side and sent directly to the AI API.

---

## Data Hub (Quick Import)

Access via the **upload icon** in the header toolbar (visible from any view).

A fast-access panel for the most common import operations without entering Settings.

### CSV / Excel Import

1. Click **Import CSV/Excel**.
2. Drag and drop or pick a file.
3. Select the data type (Expenses, Income, Expense Categories, Income Categories).
4. Preview results: new records, duplicates, warnings, invalid rows.
5. Commit to import.

Supported formats: `.csv`, `.xlsx`.

### Google Sheets Import

1. Click **Import from Google Sheets**.
2. If not connected, connect your Google account first.
3. Select or paste the spreadsheet URL.
4. Configure column mapping.
5. Pull data.

### Sheet Refresh (Delta Pull)

If a Google Sheets mapping is saved:
- **Check for new data**: queries the sheet for rows added since the last import.
- Shows count of new expenses and income rows.
- **Pull new data**: imports only the new rows (incremental, not a full re-import).

---

## Settings

Accessible from the **Settings** nav item (gear icon).

---

### Settings → Data

Full import/export hub organized by data domain.

**Domains:**

| Domain | What it contains |
|--------|-----------------|
| Expense Categories | Category names and monthly targets |
| Income Categories | Income category names and targets |
| Expense History | All expense transactions |
| Income Records | All income transactions |

**Import from CSV**:
1. Select a domain.
2. Upload a CSV file.
3. Enable **Upsert** to update existing records matched by ID (default: on for transactions, off for categories).
4. Preview: counts of New, Duplicate, Warning, and Invalid records are shown before committing.
5. Commit to finalize the import.

**Import from Google Sheets** (full mapping):
- Opens the Google Sheet Importer flow.
- Connect a sheet, configure tab names and column mappings, pull data.

**Export**:
- **Export CSV**: downloads the selected domain as a `.csv` file.
- **Export JSON**: downloads the full budget as a `.json` file (all domains combined).

**Import History**:
- Timestamped log of every import action.
- Shows source (CSV or Google Sheet), domain, and counts (imported, skipped, invalid).
- Persisted in `localStorage` across sessions.

**Live Sync mode**: configure a Google Sheet URL for ongoing sync rather than one-time pull. Switch between **One-time** and **Live Sync** modes with the toggle at the top of the Data tab.

---

### Settings → Categories

Manage all expense and income categories.

**Expense Categories**:
- **Add**: enter a category name and click Add.
- **Rename**: click the edit icon on any category row.
- **Monthly Target**: set or change the budget target amount for the category.
- **Delete**: remove a category. Existing transactions referencing the category retain their category name as a string; they are not deleted.

**Income Categories**:
- Same operations: add, rename, set target, delete.
- Income targets appear in the Income Targets section of the Dashboard.

**Tips**:
- Categories are case-insensitive for matching purposes; "groceries" and "Groceries" merge in the Dashboard.
- Changing a target takes effect immediately in Dashboard and Stats.

---

### Settings → Currency

Multi-currency support configuration.

**Base Currency**:
- The currency all amounts display in across the Dashboard, Stats, and export.
- Choose from a full list of supported currencies (ISO 4217).
- Changing the base currency prompts confirmation. Existing transaction amounts are unchanged; only the display conversion changes.

**Exchange Rates**:
Currencies detected in your transaction data appear here automatically.

For each secondary currency, configure the exchange rate mode:

| Mode | Description |
|------|-------------|
| **Live** | Auto-fetched from Yahoo Finance. Refreshes on demand or when stale (>24 hours). |
| **Fixed** | You enter the rate manually. Stays fixed until you change it. |
| **Per Transaction** | The rate is captured at the time each transaction was added. No conversion needed. |

- **Refresh** button (Live mode): fetches the latest rate for that currency immediately.
- **Missing coverage alert**: shown if transactions use a currency with no exchange rate configured.
- **Stale rate alert**: shown if a Live rate has not been refreshed in over 24 hours.

---

### Settings → Google Workspace

Connect Google Drive and Google Sheets.

#### Google Drive

**Connect**:
- Click **Connect Google Drive Folder**.
- Authorize VibeBudget with your Google account.
- Pick a folder. The folder path is shown once connected.

**Backup**:
- Click **Backup to Drive**.
- Saves `budget.json` (all domains) to the connected folder.
- The last backup timestamp is shown.

**Restore**:
- Click **Load from Drive**.
- Loads `budget.json` from the connected folder.
- Shows a preview of what will be imported before committing.

**Disconnect**:
- Unlinks the folder. Existing backup files remain in Drive.

#### Google Sheets

**Connect**:
- Click **Connect Google Sheets** or use the Drive picker to select a spreadsheet.
- Alternatively, paste a Google Sheets URL directly.
- Authorize if prompted.

**Sheet Configuration**:
- **Sheet tab names**: set the tab name for each domain (Expenses, Income, Expense Categories, Income Categories). Defaults: "Expenses", "Income", "Expense Categories", "Income Categories".
- **Column mappings**: for each domain, map the spreadsheet columns to VibeBudget fields. Preview the first few rows of each tab to confirm alignment.

**Pull (Import)**:
- **Incremental**: imports only rows not seen in previous pulls. Uses a cursor to track progress.
- **Full**: re-imports all rows from the sheet (may produce duplicates unless upsert is enabled).

**Push (Export)**:
- Writes VibeBudget records to the configured sheet tabs.
- Upserts existing rows by ID if the ID column is present.

**Sync Direction**: configure each domain as Push, Pull, or Both.

**Auto-sync**:
- Toggle to enable periodic background sync.
- Set sync interval in seconds.

**Low-Quota Mode**:
- Reduces API call frequency for accounts near Google API request limits.
- Enable if you see quota errors in the sync log.

**Status indicators**: last sync timestamp, last validation timestamp, and error messages for each domain.

---

### Settings → Finance Feeds

Connect bank accounts via Plaid or Teller for automatic transaction import.

#### Plaid

**Setup**:
1. Enter your **Plaid Client ID** and **Secret**.
2. Choose your Plaid environment (**Sandbox** for testing, **Development** or **Production** for real accounts).
3. Click **Connect** to launch the Plaid Link flow.
4. Authenticate with your bank inside the Plaid modal.

**Sync**:
- Click **Sync Transactions** to pull the latest transactions from Plaid.
- New transactions are added as expenses with a `plaid` import source tag.

**Category Mapping**:
- Map Plaid's category labels to your VibeBudget expense categories.
- Add a mapping row for each Plaid category you want to categorize automatically.

**Accounts**:
- Click **Fetch Accounts** to see connected accounts and their balances.

**Disconnect**:
- Removes Plaid credentials and connection. Imported transactions are not deleted.

#### Teller

**Setup**:
1. Enter your **Teller App ID**, **certificate**, **private key**, and choose your Teller environment.
2. Click **Connect** to launch the Teller Connect flow.
3. Authenticate with your bank.

**Sync**:
- Click **Sync Transactions** to pull the latest transactions.
- New transactions are added as expenses with a `teller` import source tag.

**Category Mapping**:
- Same as Plaid: map Teller category labels to VibeBudget categories.

**Accounts**:
- Click **Fetch Accounts** to see connected accounts.

**Disconnect**:
- Removes Teller credentials. Imported transactions are not deleted.

---

### Settings → AI

Configure the AI provider for the AI Chat panel and document OCR.

**Provider options**:
- **Gemini** (Google): supports `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`, and others.
- **DeepSeek**: supports DeepSeek Chat and DeepSeek Reasoner models.

**Setup**:
1. Choose a provider from the dropdown.
2. Select a model.
3. Enter your API key.
4. Click **Save**.

**Key storage**: your API key is stored client-side (in `localStorage`) and sent directly from your browser to the AI API. It is not stored on VibeBudget servers.

**Hosted behavior**: the official hosted deployment ships with a server-side Gemini key. The AI Chat works without any user configuration. If you add your own key here, it overrides the server key for your account.

---

### Settings → Maintenance

Controlled data cleanup. All operations in this tab are destructive and irreversible.

**Per-Domain Wipe**:

| Domain | What is deleted |
|--------|----------------|
| Expense Categories | All expense categories and their targets |
| Income Categories | All income categories and their targets |
| Expense History | All expense transactions |
| Income Records | All income transactions |

For each domain:
1. Click **Wipe [Domain]**.
2. A confirmation dialog appears showing what will be deleted.
3. Prompted to export first (recommended).
4. Type the required confirmation phrase exactly.
5. Click Confirm. A 15-second countdown allows cancellation.

**Export Before Wipe**: always export a backup before wiping, especially for transactions. Use the **Export** button in the confirmation dialog, or go to Settings → Data first.

**Delete Account**:
- Permanently deletes your account and all associated data from the server.
- Requires typing your email address as confirmation.
- Irreversible. Your data cannot be recovered after this action.

---

### Settings → Setup (Self-Hosted Only)

Diagnostic panel for self-hosted deployments. Visible only when `VITE_SELF_HOSTED=true`.

Each check is read-only and public-safe — no credentials or secrets are displayed.

| Check | What it verifies |
|-------|-----------------|
| Firebase Config | Six `VITE_FIREBASE_*` env vars are present |
| Firebase Admin | `FIREBASE_ADMIN_CREDENTIALS_JSON` or equivalent is set server-side |
| AI Server Key | `GEMINI_API_KEY` or equivalent is configured server-side |
| Owner Claim | The current signed-in user has owner claims on this Firebase project |
| Data Namespace | The active namespace (`VITE_FIREBASE_DATA_NAMESPACE`) |
| Feature Summary | Which server features are available given current configuration |

Use this panel after initial deployment to confirm everything is wired up correctly, or when troubleshooting missing features.

---

## Theme

Toggle dark / light mode using the **Moon / Sun** button in the header toolbar.

- **Dark mode** (default): dark charcoal panels, green accent color.
- **Light mode**: white panels, same green accent.

Theme preference is saved to `localStorage` and persists across sessions.

---

## Onboarding Wizard

Shown to new users after their first sign-in (until completed).

Steps:
1. **Welcome**: introduction to VibeBudget.
2. **Currency**: choose base currency.
3. **Budgets**: configure expense categories and monthly targets.
4. **First Transaction**: add an initial expense or income record.
5. **Done**: wizard complete.

Progress is saved at each step, so you can close the wizard and return where you left off. Once completed, the wizard does not appear again.

---

## Docs

Click **Docs** in the sidebar (desktop) or from the navigation to open the built-in documentation viewer.

- Opens as a full-screen overlay.
- Includes product guides, settings references, and developer documentation.
- Navigates via browser history (back button returns to the previous view).

---

## Keyboard Shortcuts and Accessibility

- All interactive elements are keyboard-accessible.
- Modal dialogs trap focus and close on Escape.
- The Data Hub panel closes when clicking outside.
- Animations use `motion/react` and respect `prefers-reduced-motion`.

---

## Data Privacy

- All data is tied to your Google account and stored in your Firestore database (self-hosted) or the managed database (hosted).
- No data is shared with third parties beyond the configured optional integrations.
- AI chat queries your local transaction data on each request; no data is cached on VibeBudget AI servers.
- Exchange rates are fetched from Yahoo Finance with no user data attached.
- See [Security & Privacy](security-privacy.md) for full details.
