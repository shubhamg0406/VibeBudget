# BYOK Provider Setup Guide

VibeBudget's philosophy is **bring your own key (BYOK)**. Every paid or quota-sensitive service is optional and configured by the user with their own accounts and credentials. Core budgeting — transactions, income, categories, targets, analysis, imports, exports — works without any paid provider.

This guide covers:

- [AI Providers](#ai-providers) — Gemini, DeepSeek
- [Google Workspace](#google-workspace) — Auth, Drive, Sheets
- [Plaid](#plaid) — Bank feed via Plaid
- [Teller](#teller) — Bank feed via Teller

---

## AI Providers

The AI assistant (chat widget) and document OCR (`/api/import/extract-transactions`) use a configurable AI provider. The app supports **Gemini** and **DeepSeek**.

### What you need

**Gemini (default):**
- A Google Cloud project with the [Generative Language API](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com) enabled
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- Recommended model: `gemini-2.5-flash` (free tier quota available)

**DeepSeek:**
- A DeepSeek account and API key from [platform.deepseek.com](https://platform.deepseek.com)
- DeepSeek models: `deepseek-chat` (V3, general purpose), `deepseek-reasoner` (R1, reasoning)

### Where to configure

**Server-side env var (applies to all users):**
```env
GEMINI_API_KEY="your_api_key_here"
GEMINI_MODEL="gemini-2.5-flash"
```

Used by:
- `/api/chat` (Vercel serverless)
- `/api/ai-chat` (local Express server)
- `/api/import/extract-transactions` (local Express server)

**Per-user runtime config (from Settings → AI Chat):**
- Provider: `gemini` or `deepseek`
- Model: select from supported models
- API key: user's own key

When provided in the request body as `aiConfig`, this overrides the server env var for that request.

### Where per-user AI config is stored

When you save an AI provider config in Settings → AI Chat, the full config object including the API key is persisted to your Firestore user profile document (`/environments/{namespace}/users/{uid}/`). This is done via `saveUserProfilePatch({ aiConfig })` in `FirebaseContext.tsx`. The config is loaded on sign-in and sent with each AI request.

**Security note**: Because the API key is stored in Firestore, anyone with read access to your Firestore user document (enforced by `firestore.rules` — owner only) could see the key. If you prefer not to store keys in Firestore, clear the per-user config and rely on the server-side `GEMINI_API_KEY` env var instead.

### DeepSeek support notes

The app's `AiProvider` type includes `"deepseek"` and the AI client (`src/server/aiClient.ts`) routes DeepSeek requests to `https://api.deepseek.com/chat/completions`. However:

- There is **no** `DEEPSEEK_API_KEY` server env var fallback. DeepSeek keys must be provided by the user via the Settings UI at runtime.
- The OCR endpoint supports DeepSeek for image-based document extraction.
- If you want a server-side DeepSeek default, you would need to add a `DEEPSEEK_API_KEY` env var to the code.

### Common failure states

| Symptom | Cause | Fix |
|---|---|---|
| `AI API key is not configured` | No key in env or request | Set `GEMINI_API_KEY` or provide key in Settings |
| `Gemini/DeepSeek request failed (4xx)` | Invalid key, insufficient quota, or disabled API | Verify key in AI Studio / DeepSeek dashboard |
| `Gemini rate limit reached` | Free tier quota exhausted | Wait or upgrade to paid tier |
| Empty response | Model overloaded or input blocked | Retry; check prompt feedback for block reason |

### Verify it works

1. Open the app and sign in
2. Open the AI chat widget (?) and send a question like "How much did I spend this month?"
3. If using a server env var, it should respond with your budget summary
4. If using per-user config, save your key in Settings → AI Chat first

---

## Google Workspace

VibeBudget integrates with Google services through Firebase Auth (sign-in) and optional Google APIs (Drive backup, Sheets sync).

### Google Auth (required)

Google Sign-In is the only authentication method. Configured in Firebase Console → Authentication → Sign-in method → Google.

No additional setup is needed beyond [self-hosting prerequisites](self-hosting.md#firebase-setup-checklist).

### Google Drive (optional)

Used for backup and restore of `budget.json`.

**Required API scopes** (requested at sign-in):
- `https://www.googleapis.com/auth/drive.file` — Create/read/update files the app creates

**What the app does:**
- Creates a `VibeBudget` folder in your Drive
- Saves/loads a `budget.json` file containing all your budget data
- Does **not** list or access other Drive files

**Configured in:** Settings → Cloud Sync → Drive

**Common failures:**

| Symptom | Cause | Fix |
|---|---|---|
| `Drive API not enabled` | Google Drive API not enabled in GCP | Enable in [GCP Console](https://console.cloud.google.com/apis/library/drive.googleapis.com) |
| OAuth consent screen not configured | GCP project needs OAuth consent screen | Configure in APIs & Services → OAuth consent screen |
| `drive.file` scope missing | OAuth scopes not updated | Re-authenticate with the Drive provider after saving API config |
| `Folder not found` | VibeBudget folder deleted or moved | Use "Reconnect" in Settings to create a new folder |

### Google Sheets (optional)

Used for two-way sync of transactions and income between VibeBudget and a Google Sheet.

**Required API scopes** (requested at sign-in):
- `https://www.googleapis.com/auth/spreadsheets` — Read/write sheets
- `https://www.googleapis.com/auth/drive.file` — Find linked spreadsheet

**What the app does:**
- Pulls data from a sheet into VibeBudget (with deduplication)
- Pushes VibeBudget data to a sheet (full reconcile or incremental)
- Supports custom column mapping for expenses, income, and categories
- Supports auto-sync on a configurable interval

**Configured in:** Settings → Cloud Sync → Google Sheets

**Required GCP APIs:**
- [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) (to find and open the spreadsheet)

**Common failures:**

| Symptom | Cause | Fix |
|---|---|---|
| `Sheets API not enabled` | Google Sheets API not enabled in GCP | Enable in GCP Console |
| Sheet not found | Spreadsheet URL is invalid or deleted | Double-check the spreadsheet ID in the URL |
| Sync pulls 0 rows | No data in the configured sheet tabs, or cursor at end | Check sheet tabs and column mapping; use "Full Reconcile" mode |
| Mapping errors | Column headers don't match configured mapping | Inspect sheet headers and update the mapping in Settings |
| Quota errors | Sheets API read/write quota exceeded | Reduce sync frequency; wait for quota reset |

---

## Plaid

Plaid connects VibeBudget to bank accounts for automated transaction import.

### Environment concept

Plaid has three environments:
- **Sandbox** — Test with fake bank accounts. No real financial data.
- **Development** — Real bank connections with limited institutions. Requires Plaid development access.
- **Production** — Full production access. Requires Plaid production verification.

### What you need

- A [Plaid Dashboard](https://dashboard.plaid.com) account
- **Client ID** — Found in Plaid Dashboard → Team → Keys
- **Secret** — Plaid Dashboard → Team → Keys (sandbox/development/production secrets are different)
- **Environment** — `sandbox`, `development`, or `production`

### How the Plaid flow works

1. **Current implementation gap**: the Settings UI currently expects a `POST /api/plaid/create_link_token` endpoint to create a Plaid Link token, but the backend route is not implemented in this repo yet. Plaid bank connection cannot complete until that route is added.
2. **Expected flow after that route exists**: the user enters credentials, VibeBudget creates a Plaid Link token, and the user connects through the Plaid Link popup.
3. **Plaid returns a public_token** (short-lived, single-use).
4. **VibeBudget exchanges public_token for an access_token** via `/api/plaid/exchange` (Express) or `POST /api/plaid` with `action: "exchange"` (Vercel).
5. **The access_token is encrypted** with AES-256-GCM using a server-side `PLAID_ENCRYPTION_PEPPER` and the user's UID.
6. **The encrypted access_token is stored** in Firestore under the user's connection document.
7. **Periodic sync** decrypts the token server-side and calls Plaid's `/transactions/sync` via `POST /api/plaid/transactions` or `POST /api/plaid` with `action: "transactions"`.

### What VibeBudget stores

| Data | Where Stored | Notes |
|---|---|---|
| Client ID, Secret, Environment | In-memory session (browser) | Not persisted to Firestore by the app |
| Encrypted access_token | Firestore (per-user PlaidConnection) | Encrypted server-side |
| Sync cursor | Firestore (PlaidConnection.syncCursor) | Used for incremental sync |
| Institution name, account info | Firestore (PlaidConnection) | Display purposes |
| Transaction data | Firestore (user's transactions collection) | Imported via sync |
| PLAID_ENCRYPTION_PEPPER | Server env var only | Never exposed to client |

### Configured in

Settings → Finance Feeds → Plaid section. Credentials are entered in the browser UI and sent with each API request. The server does **not** store your Plaid credentials.

The `PLAID_ENCRYPTION_PEPPER` env var must be set on the server (Vercel or local `.env.local`) for token encryption/decryption to work.

### Common failure states

| Symptom | Cause | Fix |
|---|---|---|
| `PLAID_ENCRYPTION_PEPPER is not configured` | Missing server env var | Add `PLAID_ENCRYPTION_PEPPER` to server environment |
| Plaid Link won't open | Missing client ID, secret, or invalid environment | Verify credentials in Plaid Dashboard |
| Plaid Link does nothing / "Failed to create link token" | `POST /api/plaid/create_link_token` backend route is not yet implemented | This is a current repo gap — see [How the Plaid flow works](#how-the-plaid-flow-works) |
| `public_token is required` | Plaid Link flow not completed | Ensure popup is not blocked; try again |
| `Plaid request failed` / `[ITEM_LOGIN_REQUIRED]` | Bank login expired | User needs to re-authenticate via Plaid Link (update mode) |
| No transactions synced | Plaid sync returns today-forward only (no backfill) | VibeBudget only imports transactions from today onward by design |
| `PRODUCT_NOT_READY` | Sandbox/development environment not fully provisioned | Wait and retry; verify Plaid environment status |

### Verify it works

1. Set `PLAID_ENCRYPTION_PEPPER` in your server environment
2. Enter Plaid Client ID and Secret in Settings → Finance Feeds
3. Click "Connect a Bank" — this will attempt to call `POST /api/plaid/create_link_token`. As of the current repo state, that route is **not implemented**, so Plaid Link will not open. This backend route needs to be added in a separate backend/integration PR.
4. After the link token route is implemented, Plaid Link should open. In sandbox, use Plaid's test credentials (user: `user_good`, pass: `pass_good`).
5. After connecting, verify accounts appear in Settings.
6. Click "Sync Now" and check that transactions appear in the transactions view.

---

## Teller

Teller is an alternative bank feed provider (Plaid competitor) that uses mTLS (mutual TLS) for authentication.

### Environment concept

- **Sandbox** — Test with synthetic data via `api.teller.io`
- **Development** — Real connections using the same API as production
- **Production** — Live bank connections

All environments use the same base URL (`https://api.teller.io`). Authentication differs by the certificate/key pair you upload to Teller.

### What you need

- A [Teller Dashboard](https://dashboard.teller.io) account
- **Application ID** — Found in Teller Dashboard → App Settings
- **Client Certificate** — PEM-encoded certificate (`.pem` file) generated from Teller Dashboard
- **Private Key** — PEM-encoded private key (`.pem` file) matching the certificate
- An **enrollment** — Created when a user connects a bank through Teller Connect

### How the Teller flow works

1. **User enters credentials** (application ID, certificate PEM, private key PEM, environment) in Settings → Finance Feeds → Teller
2. **VibeBudget opens Teller Connect** — a popup where the user selects their bank and signs in
3. **Teller returns an enrollment** containing an `accessToken` and user/account info
4. **The accessToken is stored** in Firestore under the user's connection document (TellerConnection)
5. **API calls** use mTLS: the certificate and private key are sent with each request to Teller's API
6. **Periodic sync** fetches transactions from all linked accounts

### Teller credential handling

Unlike Plaid, Teller credentials (certificate, private key) are passed from the browser to the server with each API request. They are **not** stored server-side or in Firestore. The user is responsible for re-entering them if the session expires.

### What VibeBudget stores

| Data | Where Stored | Notes |
|---|---|---|
| Application ID, Certificate, Private Key | In-memory session (browser) | Not persisted to Firestore |
| Access token | Firestore (per-user TellerConnection) | Plain text (Teller access tokens are short-lived) |
| Enrollment ID, institution info | Firestore (TellerConnection) | Display purposes |
| Account info | Firestore (TellerConnection.accounts) | Linked accounts overview |
| Transaction data | Firestore (user's transactions collection) | Imported via sync |

### Common failure states

| Symptom | Cause | Fix |
|---|---|---|
| Teller Connect popup fails | Missing or invalid certificate/private key | Regenerate cert/key pair in Teller Dashboard |
| `certificate is required` | Certificate not provided in Settings | Upload or paste the PEM certificate |
| `privateKey is required` | Private key not provided in Settings | Upload or paste the PEM private key |
| `Teller API error (401)` | Access token expired or invalid | Reconnect the bank through Teller Connect |
| `Teller API error (403)` | Certificate/key pair not authorized for this enrollment | Verify the certificate matches the one registered with Teller |
| No transactions synced | Teller returns today-forward only (no backfill) | VibeBudget only imports transactions from today onward by design |
| `Failed to parse Teller response` | API returned unexpected format | Check Teller Dashboard for API status; retry |

### Verify it works

1. Generate a certificate/key pair in Teller Dashboard → App Settings → Certificates
2. Enter Application ID, paste certificate PEM and private key PEM in Settings → Finance Feeds → Teller
3. Click "Connect a Bank" — Teller Connect should open
4. In sandbox, use Teller's test institution
5. After connecting, verify linked accounts appear in Settings
6. Click "Sync Now" and verify transactions appear in the transactions view

---

## Provider Configuration Summary

| Provider | Config Location | Credentials Stored Server? | Credentials Stored in Firestore? |
|---|---|---|---|
| Gemini (server default) | `.env.local` / Vercel env | Yes (env var) | No |
| Gemini/DeepSeek (per-user) | Settings → AI Chat | No (sent with request) | **Yes — the full config (provider, model, apiKey) is saved to the user's Firestore profile document via `saveUserProfilePatch`. Users can clear it from Settings or the Firebase console.** |
| Google Auth | Firebase Console | No | No |
| Google Drive/Sheets | Settings → Cloud Sync | No (OAuth token in session) | Sheet URLs only |
| Plaid | Settings → Finance Feeds | No (sent with request) | Encrypted access token only |
| Teller | Settings → Finance Feeds | No (sent with request) | Access token only |

---

## Provider Access Model

VibeBudget does not enforce any central provider registration. You can:

- Use your own Firebase project with your own Google APIs
- Use your own Gemini API key with your own billing
- Use your own Plaid or Teller account with your own bank connections
- Mix environments (e.g., sandbox Plaid with production Firebase)

No provider credentials or data are shared with the VibeBudget maintainers.
