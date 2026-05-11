# Setup Modes

VibeBudget supports three setup modes. Each mode determines which Firebase project and infrastructure you use.

## Local Development

Run VibeBudget on your machine for development or personal testing.

```bash
cp .env.example .env.local
npm install
npm run dev
```

The app runs at `http://localhost:8888` with the API at `http://localhost:3000`.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (`project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_DATA_NAMESPACE` | Data partition — use `local-dev` for local dev |

### No Env Vars? Use the Browser Setup

If the `VITE_FIREBASE_*` env vars are not set, the app shows a browser-based setup form on first load. Enter your Firebase web app config once, and it is saved to `localStorage` for subsequent visits.

### What Works Without Paid Providers

- Full budgeting: transactions, income, categories, targets, analysis
- CSV import/export
- Google Sheets pull/push (requires your own Google API setup)
- AI chat (requires your own Gemini/DeepSeek key)
- Bank feeds (requires your own Plaid/Teller accounts)

## Self-Hosted (BYO Firebase)

Deploy your own VibeBudget instance on Vercel or another Node.js host. You own the Firebase project, the hosting, and the data.

### What You Need

| Resource | Purpose |
|----------|---------|
| Firebase project | Auth (Google) + Firestore database |
| Vercel account | Or any Node.js hosting |
| Service account | Firebase Admin SDK (for AI chat, OCR) |
| API keys | Gemini, Plaid, Teller — optional |

### Required Env Vars

Same six `VITE_FIREBASE_*` variables as local development, plus:

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_DATA_NAMESPACE` | `prod` for production |
| `FIREBASE_DATA_NAMESPACE` | `prod` — must match client |
| `FIREBASE_ADMIN_CREDENTIALS_JSON` | Service account JSON (server-only) |

### Deployment

```bash
npm run build
npx vercel --prod
```

See the [Self-Hosting Guide](self-hosting.md) for the full walkthrough.

## Bring Your Own Firebase (Browser Config)

When you use the browser-based setup flow (no env vars), VibeBudget stores your Firebase config in `localStorage` and initializes Firebase dynamically.

### What Browser Setup Activates

- Google sign-in authenticates against **your** Firebase Auth project
- All budget data reads/writes to **your** Firestore database
- Your Firebase config is stored in `localStorage` (keyed by `vibebudgetSelfHostConfig`)
- No env vars required to render the app

### Server-Side Considerations

- The browser-set Firebase config is client-side only
- Server features (AI chat, OCR) need `FIREBASE_ADMIN_CREDENTIALS_JSON` set as env vars or via the self-host owner claim flow
- The self-host owner flow stores secrets in a local SQLite database on the Express server
- **Vercel limitation**: Serverless functions cannot read the Express SQLite database. For Vercel, use env vars.

## Hosted (Official)

The official managed VibeBudget deployment at [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app).

### What Hosted Provides

- Managed Firebase project with auth and Firestore
- Pre-configured environment
- Automatic updates

### What Users Still Provide

- Provider API keys for optional integrations (AI, Plaid, Teller, Google APIs)
- Their own Firebase project is optional — hosted uses shared infrastructure

## Mode Comparison

| Aspect | Local Dev | Self-Hosted | Hosted |
|--------|-----------|-------------|--------|
| Firebase project | Your test project | Your project | Managed |
| Hosting | Localhost | Your Vercel | Managed |
| Namespace | `local-dev` | `prod` | Managed |
| Service account | Optional | Required | Managed |
| AI key | Your key | Your key | Your key |
| Bank feeds | Your credentials | Your credentials | Your credentials |
| Cost | Free | Free (your infra) | Free or subscription |
| Control | Full | Full | Less |
