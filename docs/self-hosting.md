# Self-Hosting VibeBudget

Self-hosting means you run your own copy of VibeBudget on infrastructure you control. You own the Firebase project, the Vercel deployment, the API keys, and the data. No subscription is required — core budgeting, imports, exports, and analysis are free.

This guide covers local development and production self-hosting. It does **not** cover the official hosted VibeBudget edition.

---

## What You Need

- **Node.js 20+** and npm
- A **Google Cloud Platform (GCP) project** with Firebase enabled
- A **Vercel account** (or compatible Node.js hosting)
- **Google Cloud APIs** enabled: Identity Platform (Firebase Auth), Firestore
- Optional: Google Drive API, Google Sheets API, Gemini API, Plaid account, Teller account

---

## Local Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/vibebudget.git
cd vibebudget

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env.local
```

### 3a. Fill Firebase values in `.env.local`

Create a Firebase project at [Firebase Console](https://console.firebase.google.com). Enable:

- **Authentication** → Sign-in method → Google provider
- **Firestore Database** → Create database (start in test mode, update rules later)

From Project Settings → General → Your apps → Web app, copy the config values:

| Variable | Source |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web App Config → `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `{project_id}.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `{project_id}.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App Config → `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | Firebase Web App Config → `appId` |

### 3b. Set the data namespace

```
VITE_FIREBASE_DATA_NAMESPACE="local-dev"
FIREBASE_DATA_NAMESPACE="local-dev"
```

This isolates local data from production — see [Firestore Namespace](#firestore-namespace).

### 3c. Add a service account for server-side operations

Go to Project Settings → Service accounts → Generate new private key. Save the JSON. Then either:

**Option A — inline JSON** (for Vercel env vars):
```
FIREBASE_ADMIN_CREDENTIALS_JSON='{"type":"service_account",...}'
```

**Option B — file path** (for local dev):
```
FIREBASE_ADMIN_CREDENTIALS_PATH="./service-account.json"
```

The service account is used by the AI chat endpoint (`/api/chat`) to verify ID tokens and read Firestore data server-side. It is **not** required for local development unless you use AI chat.

### 3d. (Optional) Add an AI key

```
GEMINI_API_KEY="your_gemini_api_key"
```

### 4. Start the app

```bash
npm run dev
```

This starts:
- API server on `http://localhost:3000`
- Vite dev server on `http://localhost:8888` (with API proxy to `:3000`)

Open `http://localhost:8888` in your browser.

---

## Firebase Setup Checklist

- [ ] **Authentication**: Google provider enabled. No other providers required.
- [ ] **Authorized domains**: In Authentication → Settings → Authorized domains, add `localhost`, `127.0.0.1`, and your production domain (e.g. `your-app.vercel.app`).
- [ ] **Firestore**: Database created in your preferred region.
- [ ] **Firestore indexes**: None are required for the current data model. If you add queries with composite filters, create indexes via the Firebase console or `firestore.indexes.json`.
- [ ] **Firestore rules**: Deploy the included `firestore.rules` to enforce per-user access:

```bash
# Install Firebase CLI if needed
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

The rules protect documents at:
```
/users/{userId}/...
/environments/{namespace}/users/{userId}/...
```

Only the authenticated owner can read/write their own documents. See `firestore.rules` in the repo.

### Service Account / Admin Credentials

The server-side AI chat uses Firebase Admin SDK to verify tokens and read Firestore data. Configure via:

| Method | Env Var | Notes |
|---|---|---|
| Inline JSON | `FIREBASE_ADMIN_CREDENTIALS_JSON` | Best for Vercel env vars |
| File path | `FIREBASE_ADMIN_CREDENTIALS_PATH` | Best for local dev |
| Individual fields | `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | Alternative |
| Application default | (none) | Falls back to `applicationDefault()` — works on GCP/GCE |

### Firestore Namespace

VibeBudget uses a namespace concept to isolate data environments. The client resolves it as follows (from `src/firebase.ts`):

1. `VITE_FIREBASE_DATA_NAMESPACE` env var (if set and non-empty)
2. `"test"` in test mode
3. `"local-dev"` in development
4. `"prod"` in production

Data is stored at:
```
/environments/{namespace}/users/{uid}/{collections}
```

The server-side code (`api/chat.ts`, `src/server/aiChat.ts`) also checks `FIREBASE_DATA_NAMESPACE` and `VITE_FIREBASE_DATA_NAMESPACE` with similar fallback logic.

**Important**: Two deployments using the same Firebase project but different namespaces will see separate data sets. This is how you keep local-dev data separate from production data.

---

## Vercel Deployment

### Required Environment Variables

Set these in your Vercel project dashboard (Settings → Environment Variables):

**Client-side (`VITE_` prefix):**

| Variable | Example |
|---|---|
| `VITE_FIREBASE_API_KEY` | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` |
| `VITE_FIREBASE_APP_ID` | `1:123456789:web:abc123` |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | (optional) custom database ID |
| `VITE_FIREBASE_DATA_NAMESPACE` | `prod` |

**Server-side:**

| Variable | Description |
|---|---|
| `FIREBASE_DATA_NAMESPACE` | `prod` — must match client namespace |
| `FIREBASE_ADMIN_CREDENTIALS_JSON` | Full service account JSON (escaped) |
| `GEMINI_API_KEY` | Required for AI chat |
| `GEMINI_MODEL` | Optional, defaults to `gemini-2.5-flash` |
| `AI_CHAT_CACHE_TTL_MS` | Optional, defaults to `300000` (5 min) |
| `ALLOW_FIREBASE_REST_FALLBACK` | `false` recommended for production |
| `PLAID_ENCRYPTION_PEPPER` | Required if using Plaid feed |

**Preview vs Production:**

- Use separate environment groups in Vercel for preview and production deployments
- Preview deployments can use `VITE_FIREBASE_DATA_NAMESPACE=preview` or share a staging namespace
- Production should always use `VITE_FIREBASE_DATA_NAMESPACE=prod` and `FIREBASE_DATA_NAMESPACE=prod`

### Deploy Command

```bash
npx vercel --prod --yes
```

### Verification Checklist

After deploying:

- [ ] Open the production URL and sign in with Google
- [ ] Verify Google auth redirects to the app (not a blank page or error)
- [ ] Add a test transaction and confirm it persists on reload
- [ ] Verify the data namespace by checking Firestore documents are under `/environments/prod/users/{uid}/...`
- [ ] Test AI chat if `GEMINI_API_KEY` is configured
- [ ] Test Drive/Sheets connections if APIs are enabled
- [ ] Test Plaid/Teller connections if credentials are configured
- [ ] Confirm `firestore.rules` are deployed and enforcing access
- [ ] Check Vercel Function logs for any errors after first sign-in

---

## Data Ownership & Backups

- **Your data stays in your Firebase project.** VibeBudget has no separate database.
- **Backups**: Export your data from Settings → Data Hub → Export. Or use the Google Drive backup feature to save a `budget.json` to your Drive.
- **Firestore backups**: Enable [Firestore managed backups](https://firebase.google.com/docs/firestore/manage-data/export-import) in your GCP project for automated snapshots.
- **No telemetry**: VibeBudget does not send usage data anywhere outside your Firebase project and the AI provider you explicitly configure.

---

## Security Notes

- **Never commit real credentials to the repo.** The `.env*` pattern is gitignored.
- **Client-visible vars** (prefixed `VITE_`) are bundled into the frontend. Anyone can read them from the browser — use a Firebase API key restriction to limit usage to your domains.
- **Server-only secrets** (no `VITE_` prefix) stay on the server. These include `GEMINI_API_KEY`, `FIREBASE_ADMIN_CREDENTIALS_JSON`, and `PLAID_ENCRYPTION_PEPPER`.
- **Firestore rules** enforce per-user access. Never deploy without restricting read/write to document owners.
- **API key restrictions**: In GCP Credentials, restrict your Firebase API key to your app's domains and enable only the APIs you need (Identity Toolkit, Firestore).

---

## Hosting Mode Comparison

| Aspect | Local Dev | Self-Hosted Production | Official Hosted (future) |
|---|---|---|---|
| Firebase project | Your test project | Your project | Managed by VibeBudget (planned) |
| Hosting | Localhost:8888 | Your Vercel project | Managed (planned) |
| Namespace | `local-dev` | `prod` | Managed (planned) |
| Service account | Optional (file path) | Required (env var) | Managed (planned) |
| AI key | Your key | Your key | Your key or default (planned) |
| Bank feeds | Your credentials | Your credentials | Your credentials |
| Support | Community/docs | Community/docs | Priority support (planned) |
| Cost | Free (your infra) | Free (your infra) | Subscription (future) |

---

## Troubleshooting

See [docs/troubleshooting.md](troubleshooting.md) for common issues with auth, Firestore, deployment, and provider setup.
