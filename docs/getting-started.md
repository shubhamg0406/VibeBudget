# Getting Started with VibeBudget

VibeBudget is a personal budgeting tool that helps you understand spending, track income, set targets, and stay in control of monthly cash flow.

---

## 1. Choose Your Mode

**Hosted (recommended for most users)**
- Open [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app) and sign in with Google.
- No setup required. Data is managed for you.
- You can still bring your own API keys for AI, bank feeds, and Google integrations.

**Self-Hosted (for full control)**
- Your own Firebase project and Vercel deployment.
- Your own environment variables, backups, and provider keys.
- See [Setup Modes](setup-modes.md) and the [Self-Hosting Guide](self-hosting.md).

**Local Development (for contributors)**
- Clone the repo, copy `.env.example` to `.env.local`, and run `npm run dev`.
- See [Setup Modes](setup-modes.md) for required environment variables.

---

## 2. Sign In

Open VibeBudget and click **Sign In with Google**.

- **Hosted**: just sign in — auth is pre-configured.
- **Self-Hosted / Local**: Firebase must be configured first. See [BYOK Provider Setup](byok-provider-setup.md#firebase) for Firebase setup.
- **Browser Setup** (no env vars): if `VITE_FIREBASE_*` env vars are missing, the app shows a browser-based setup form. Enter your Firebase web app config once; it is saved to `localStorage`.

If sign-in does not work, check:
- Google provider is enabled in Firebase Authentication.
- `localhost` and your domain are in Firebase Auth authorized domains.
- Firestore database is created.

See [Troubleshooting](troubleshooting.md#google-sign-in-failures) for common fixes.

---

## 3. Onboarding Wizard

After your first sign-in, the onboarding wizard walks you through five steps:

1. **Welcome** — overview of VibeBudget, click Next to begin.
2. **Currency** — choose your base currency (the currency all amounts display in). This can be changed later in Settings → Currency.
3. **Budgets (Categories)** — set up expense categories and monthly targets. Default categories are provided. You can customize them here or later in Settings → Categories.
4. **First Transaction** — add your first expense or income entry. Fill in date, vendor, amount, and category.
5. **Done** — wizard complete. The Dashboard is now populated with your first data.

You can skip any step and come back later. The wizard closes once you complete it or navigate away.

---

## 4. Add Transactions

After sign-in (and completing or skipping onboarding), you can add transactions any time:

- **On mobile**: tap the `+` FAB button (bottom-right) in the Transactions view.
- **On desktop**: click the `+` button in the Transactions view.
- **Bulk add**: use the Bulk Add option to add multiple rows at once.
- **Import**: use the Data Hub (upload icon in the header) to import from CSV or Google Sheets.
- **Bank feeds**: connect Plaid or Teller in Settings → Finance Feeds to auto-import from your bank.

Each transaction has:
- **Date** — when it occurred.
- **Vendor / Source** — where money was spent or where income came from.
- **Amount** — the value. Multi-currency supported; choose a non-base currency if needed.
- **Category** — expense or income category.
- **Notes** — optional free-text note.
- **Type** — expense or income (set when adding; determines which ledger it appears in).

---

## 5. Set Up Categories and Targets

VibeBudget comes with default expense categories. To customize them:

1. Go to **Settings → Categories**.
2. Add, rename, or delete expense categories.
3. Set a monthly **target amount** for each category.
4. Do the same for income categories and income targets.

Targets power the progress bars on the Dashboard and the category comparison in Stats. You can also edit an expense category target inline on the Dashboard by clicking the **Edit** button next to a category row.

---

## 6. Configure Currency

If you transact in multiple currencies:

1. Go to **Settings → Currency**.
2. Your base currency is the primary display currency. All Dashboard and Stats amounts convert to this.
3. Add exchange rates for other currencies in your data.
   - **Live**: auto-fetches from Yahoo Finance (refreshes when stale after 24 hours).
   - **Fixed**: you set the rate manually.
   - **Per Transaction**: rate is captured when each transaction is added.

---

## 7. Explore the Dashboard

The Dashboard is your financial command center. At the top, select your date range:

- **This Month** — default view.
- **Last Month** — prior calendar month.
- **3 / 6 / 12 Months** — rolling windows.
- **YTD** — year-to-date from January 1.
- **Custom** — pick any start and end date.

The Dashboard shows:

- **KPI strip**: Total Income, Total Spent, Current Balance, Tracked Targets — each with a prior-period delta badge.
- **Insights panel**: data-driven signals about budget health, income, savings rate, and spend trends. Toggle between **This Month** and **YTD** views. Click "See more" for additional tiles.
- **Smart alerts**: actionable warnings about over-budget categories or upcoming recurring items.
- **Available Balance card**: spending ratio progress bar, net flow, spend pace, forecast, and saving velocity.
- **Expense Targets**: all categories with spend vs. prorated target. Edit targets inline.
- **Income Targets**: income categories with received vs. target.

---

## 8. Analyze Spending

**Stats** (bar chart icon in nav):
- **Overview**: pie chart of expenses by category, bar chart of income vs. expenses.
- **Comparison**: side-by-side comparison of any two periods. Great for month-over-month or year-over-year analysis.
- **Deep Dive**: drill into a single category over time.

**Monthly** (calendar icon in nav):
- Pick any calendar month.
- See income, expenses, balance, and savings rate for that month.
- Pie chart of expenses by category.
- Category table with targets.

---

## 9. Use AI Chat

Click the **sparkle button** (bottom-right corner) to open AI Chat.

Ask anything about your finances:
- "How am I tracking against my budget targets?"
- "What's my biggest spending category this month?"
- "Show me all transactions above $100"
- "How does this month compare to last month?"
- "Am I saving money?"

The AI has access to your transaction and category data. Responses reference your actual numbers.

**Setup for BYOK/self-hosted**: go to **Settings → AI**, choose a provider (Gemini or DeepSeek), enter your API key and model. For hosted: a server-side key is provided; you can override it with your own.

---

## 10. Connect Optional Integrations

All integrations are optional. Core budgeting works without any of them.

### Google Drive (Backup & Restore)

Go to **Settings → Google Workspace**:
1. Connect a Google Drive folder.
2. **Backup**: saves `budget.json` to Drive.
3. **Restore**: loads from the saved file.

Good practice: run a Drive backup before any bulk import or wipe.

### Google Sheets (Two-Way Sync)

Go to **Settings → Google Workspace**:
1. Connect a Google Sheet via Drive picker or URL.
2. Configure tab names and column mappings for expenses, income, and categories.
3. **Pull**: import rows from the sheet.
4. **Push**: write VibeBudget records back to the sheet.
5. Optional: enable auto-sync for ongoing background updates.

### Bank Feeds (Plaid / Teller)

Go to **Settings → Finance Feeds**:
1. Enter your Plaid or Teller credentials.
2. Connect your bank accounts via the provider's secure link flow.
3. Sync transactions automatically.
4. Map provider categories to your VibeBudget categories.

### AI Provider

Go to **Settings → AI**:
- Choose Gemini or DeepSeek.
- Enter your API key.
- Select the model.

---

## 11. Import and Export Data

**Data Hub** (upload icon in the header toolbar):
- Quick access to import from CSV/Excel or Google Sheets.
- Check for new sheet data and pull updates.

**Settings → Data** (full import/export hub):
- Import any domain: Expense Categories, Income Categories, Expense History, Income Records.
- Preview imports before committing — see new, duplicate, warning, and invalid records.
- Export any domain as CSV or full budget as JSON.
- View import history with timestamps and record counts.

---

## 12. Verify Your Setup (Self-Hosted Only)

After configuring environment variables and optional providers, check **Settings → Setup** for a diagnostic overview:

- Firebase configuration status.
- Firebase Admin credentials presence.
- AI server key configuration.
- Owner claim status.
- Data namespace in use.
- Feature availability summary.

Each check is public-safe — no secrets are exposed.

This tab only appears when `VITE_SELF_HOSTED=true`.

---

## Next Steps

- Read the [Feature Guide](feature-guide.md) for a complete reference of every view and setting.
- Read the [Self-Hosting Guide](self-hosting.md) for deployment details.
- Read the [BYOK Provider Setup](byok-provider-setup.md) for provider configuration.
- Read the [Troubleshooting Guide](troubleshooting.md) for common issues.
