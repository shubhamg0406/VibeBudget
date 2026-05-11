# Getting Started with VibeBudget

VibeBudget is a personal budgeting tool that helps you understand spending, track income, set targets, and stay in control of monthly cash flow.

## 1. Choose Your Mode

Choose **hosted** if you want the fastest start:

- Open [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app) and sign in with Google
- No deployment or Firebase project setup required
- Optional bring-your-own keys for AI, bank feeds, and Google integrations

Choose **self-hosted** if you want more control:

- Your own Firebase project and Vercel deployment
- Your own server environment variables
- Direct control over provider keys, backups, and data

For a full comparison, see [Hosted vs Self-Hosted](hosted-vs-self-hosted.md). For technical setup, see [Setup Modes](setup-modes.md) and the [Self-Hosting Guide](self-hosting.md).

## 2. Sign In

Open VibeBudget and sign in with Google. The hosted version has auth managed for you. Self-hosted and local versions need Firebase configured first.

**If using hosted**: just sign in.

**If using browser setup**: enter your Firebase web app config (from Firebase Console → Project Settings → Web App) in the setup form. The first time you sign in, you may claim owner status to configure server secrets.

**If using env vars**: set `VITE_FIREBASE_*` values in `.env.local` (or Vercel env vars) and the app initializes Firebase automatically.

If sign-in does not work, check:

- Authorized domains in Firebase Authentication (add `localhost`, your domain)
- Firebase Auth Google provider is enabled
- Firestore database is created

See [Troubleshooting](troubleshooting.md#google-sign-in-failures) for common fixes.

## 3. Add Your First Transaction

After sign-in, add your first transaction:

1. Click the `+` button
2. Enter the date, vendor, amount, and category
3. Choose expense or income
4. Save

Budgeting, categories, targets, and analysis work without any paid provider.

## 4. Set Up Categories and Targets

VibeBudget comes with default expense categories. Customize them in Settings:

- Rename or add expense categories
- Add income categories
- Set monthly target amounts for each category

Targets power the budget pace indicators on the Dashboard.

## 5. Optional: Connect Providers

Provider connections are optional. Add them only when you want more automation.

Common next steps:

- **Google Sheets** for two-way sync with a spreadsheet
- **Google Drive** for cloud backup of your budget data
- **AI Provider** (Gemini or DeepSeek) for AI chat and document OCR
- **Bank Feeds** (Plaid or Teller) for automatic transaction import

Each provider has its own setup guide. See [BYOK Provider Setup](byok-provider-setup.md).

## 6. Explore the Dashboard and Stats

The Dashboard shows:

- Total income, total spending, and balance
- Budget pace against category targets
- Date range controls (this month, last month, 3/6/12 months, YTD, custom)
- Prior-period comparison

The Stats view provides category-level breakdowns and trend analysis.

## 7. Import and Export

Use **Data Hub** in Settings to:

- Import transactions from CSV
- Export your full budget as JSON or CSV
- Import/export category targets
- Pull data from Google Sheets

## 8. Verify Your Setup (Self-Hosted)

After configuring environment variables and optional providers, check the **Setup Status** tab in **Settings** for a diagnostic overview. It shows:

- Firebase configuration status
- Firebase Admin credentials presence
- AI server key configuration
- Owner claim status
- Data namespace
- Feature availability summary

Each check is public-safe — no secrets are exposed.

## Next Steps

- Read the [Self-Hosting Guide](self-hosting.md) for deployment details
- Read the [BYOK Provider Setup](byok-provider-setup.md) for provider configuration
- Read the [Troubleshooting Guide](troubleshooting.md) for common issues
- Read the [North Star Strategy](north-star-strategy.md) for product direction
