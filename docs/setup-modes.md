# Setup Modes

VibeBudget supports three deployment modes. The mode determines which backend, database, and infrastructure you use.

---

## Hosted (Official)

The official managed VibeBudget deployment at [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app).

### What you get

- Sign in with Google and start immediately — no configuration required.
- Managed authentication, database, and server infrastructure.
- AI Chat works out of the box (server-side Gemini key pre-configured).
- Automatic updates when new versions ship.
- The **Setup** tab in Settings is hidden (it is only relevant for self-hosted deployments).

### What you still control

- All optional provider keys (Plaid, Teller, Google API, your own AI key).
- Your budget data — export at any time from Settings → Data.
- Theme, currency, categories, and all app settings.

### When to use hosted

Use hosted if you want the fastest start and do not need to own the infrastructure.

---

## Self-Hosted (BYO Firebase + Vercel)

Deploy your own VibeBudget instance. You own the Firebase project, the Vercel deployment, and the data.

### What you need

| Resource | Purpose |
|----------|---------|
| Firebase project | Google Auth + Firestore database |
| Vercel account (or any Node.js host) | Hosting the app and API |
| Firebase service account | Server-side Admin SDK (for AI chat, OCR) |
| API keys | Gemini, Plaid, Teller — all optional |

### Setup steps

1. Create a Firebase project. Enable Google Authentication. Create a Firestore database.
2. Create a Firebase web app. Copy the six `VITE_FIREBASE_*` config values.
3. Create a service account (Firebase Console → Project Settings → Service Accounts). Download the JSON.
4. Deploy to Vercel: set env vars, run `npm run build && npx vercel --prod`.

See the [Self-Hosting Guide](self-hosting.md) for the full walkthrough.

### Required environment variables

**Frontend (browser-visible):**

| Variable | Source |
|----------|--------|
| `VITE_FIREBASE_API_KEY` | Firebase Web App Config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `{project_id}.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `{project_id}.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App Config |
| `VITE_FIREBASE_APP_ID` | Firebase Web App Config |
| `VITE_FIREBASE_DATA_NAMESPACE` | `prod` in production |
| `VITE_SELF_HOSTED` | `true` — enables the Setup tab and self-hosted features |

**Server-only:**

| Variable | Purpose |
|----------|---------|
| `FIREBASE_DATA_NAMESPACE` | `prod` — must match `VITE_FIREBASE_DATA_NAMESPACE` |
| `FIREBASE_ADMIN_CREDENTIALS_JSON` | Full service account JSON (enables AI chat, OCR) |
| `FIREBASE_ADMIN_CREDENTIALS_PATH` | Alternative: path to service account JSON file |
| `GEMINI_API_KEY` | Server-side AI key (optional; users can supply their own) |
| `GEMINI_MODEL` | Optional; defaults to `gemini-2.5-flash` |
| `ALLOW_FIREBASE_REST_FALLBACK` | `false` recommended; emergency-only fallback |
| `AI_CHAT_CACHE_TTL_MS` | Optional; defaults to `300000` (5 min) |

### Data namespace

The namespace isolates data within a single Firebase project across environments:

| Environment | Recommended namespace |
|-------------|----------------------|
| Local dev | `local-dev` |
| PR preview / staging | `staging` |
| Production | `prod` |

Set both `VITE_FIREBASE_DATA_NAMESPACE` (client) and `FIREBASE_DATA_NAMESPACE` (server) to the same value. A mismatch causes the server to read from a different Firestore path than the client writes to.

See [Staging Env Safety](staging-env-safety.md) for PR preview isolation details.

### Deployment

```bash
npm run build
npx vercel --prod --yes
```

### Verification

After deploying, go to **Settings → Setup** to confirm:
- Firebase config is detected.
- Firebase Admin credentials are present.
- AI server key is configured.
- Data namespace matches what you expect.

---

## Local Development

Run VibeBudget locally for development or personal testing.

### Quick start

```bash
git clone <repo>
cd vibebudget
npm install
cp .env.example .env.local   # Fill in Firebase values
npm run dev                   # API on :3000, frontend on :8888
```

### Required variables for `.env.local`

Same six `VITE_FIREBASE_*` variables as self-hosted, plus:

```
VITE_FIREBASE_DATA_NAMESPACE=local-dev
```

Optional: add `GEMINI_API_KEY`, `VITE_SELF_HOSTED=true`, and any provider keys you want to test.

### No env vars? Use browser setup

If `VITE_FIREBASE_*` env vars are not set, the app displays a browser-based setup form on first load. Enter your Firebase web app config once; it is saved to `localStorage`. No env vars needed.

This is useful for contributors who want to quickly test with their own Firebase project without modifying `.env.local`.

### What works locally without paid providers

- Full budgeting: transactions, income, categories, targets, analysis.
- CSV/Excel import and export.
- Theme, currency, and all settings.

What requires additional keys:
- AI chat: needs `GEMINI_API_KEY` (or set in Settings → AI).
- Google Sheets sync: needs Google OAuth configured in Firebase.
- Bank feeds: needs Plaid or Teller credentials.
- Document OCR: needs AI provider configured.

### Test mode

```bash
npm run dev:test   # Deterministic mock-mode at http://127.0.0.1:4173
```

Runs the frontend with mock data. No Firebase connection required. Used by Playwright smoke tests.

---

## Bring Your Own Firebase (Browser Config)

When you use the browser-based setup flow (no env vars), VibeBudget stores your Firebase config in `localStorage` and initializes Firebase dynamically on load.

### What browser setup activates

- Google sign-in authenticates against **your** Firebase project.
- All budget data reads/writes go to **your** Firestore database.
- Your Firebase config is stored in `localStorage` under the key `vibebudgetSelfHostConfig`.
- Reset at any time by clearing `localStorage` or using the setup UI.

### Server-side considerations

Browser-set Firebase config is client-side only. Server features (AI chat, OCR) need `FIREBASE_ADMIN_CREDENTIALS_JSON` set in the environment, or configured via the self-hosted owner claim flow:

1. Sign in with your self-hosted Firebase.
2. Claim owner status via the Setup tab in Settings.
3. Enter server secrets (Firebase Admin credentials, Gemini key) through the browser.
4. Secrets are stored server-side in SQLite.

**Vercel limitation**: Vercel serverless functions cannot read the Express SQLite database. For Vercel deployments, set server secrets as Vercel env vars instead of using the owner flow.

---

## Mode Comparison

| Aspect | Local Dev | Self-Hosted | Hosted |
|--------|-----------|-------------|--------|
| Firebase project | Your test project | Your project | Managed |
| Hosting | Localhost | Your Vercel | Managed |
| Database | Your Firestore | Your Firestore | Managed |
| Namespace | `local-dev` | `prod` | Managed |
| Service account | Optional | Required for server features | Managed |
| Gemini key | Your key or Settings → AI | Your key or Settings → AI | Pre-configured; can override |
| Bank feeds | Your Plaid/Teller creds | Your Plaid/Teller creds | Your Plaid/Teller creds |
| Google Workspace | Your Google OAuth | Your Google OAuth | Your Google OAuth |
| Setup tab | Optional (`VITE_SELF_HOSTED=true`) | Required | Hidden |
| Cost | Free | Free (your infra) | Free |
| Control | Full | Full | Less |

---

## Environment Variable Reference

See `.env.example` in the project root for all available variables with inline documentation.
