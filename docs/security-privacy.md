# Security and Privacy

VibeBudget handles financial data and provider credentials. This document explains how data, secrets, and Firebase configuration are handled.

## Secret Handling

- **Server-only secrets** must stay out of browser-visible env vars. These include `FIREBASE_ADMIN_CREDENTIALS_JSON`, `GEMINI_API_KEY`, `PLAID_ENCRYPTION_PEPPER`.
- **`VITE_*` values** are bundled into the frontend and visible in the browser. They are public by design — they identify your Firebase project but do not authorize write access. Firestore security rules gate reads/writes based on authenticated user identity.
- **Never commit real credentials to the repo.** The `.env*` pattern and `vibebudget.db` are gitignored.

## Firebase Configuration

### Client Config (Browser)

The Firebase web config (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) is:

- **Public by design** — these values identify your Firebase project but do not authorize access
- **Stored in localStorage** when using the browser setup flow (key: `vibebudgetSelfHostConfig`)
- **Not sent to any server** — the config is only used client-side to initialize Firebase SDK

### Admin Credentials (Server)

The Firebase Admin service account JSON (`FIREBASE_ADMIN_CREDENTIALS_JSON`) is:

- **Never exposed to the browser** — only used server-side by the Express API
- **Stored in SQLite** when configured through the self-host owner claim flow (server-only table)
- **Read from env vars** on Vercel (env var takes priority over SQLite)

## Self-Owned Firebase Security Model

When using the browser-based "Bring Your Own Firebase" setup:

- Firebase web config is stored in your browser's `localStorage`. This is the same pattern as Firebase SDK persistence.
- Google sign-in happens against **your** Firebase project. The ID token is issued by your project's Firebase Auth.
- All data reads/writes go to **your** Firestore database. Firestore security rules use the auth token to authorize requests.
- Server-side Admin credentials are configured separately through the owner claim flow or env vars.

### What Self-Owned Mode Does Not Protect Against

- The hosted deployment of VibeBudget still serves the JavaScript that reads/writes your Firestore. If you do not trust the hosted deployment, self-host the full stack.
- The Firebase config stored in `localStorage` is browser-specific. Clearing `localStorage` or using a different device requires re-entering the config.

## Credential Storage for Provider Integrations

| Provider | Config Location | Stored Server? | Stored in Firestore? |
|----------|----------------|----------------|---------------------|
| Firebase client config | Env vars or localStorage | No | No |
| Firebase Admin (server) | Env var or SQLite | Yes | No |
| Gemini (server default) | `.env.local` / Vercel env | Yes | No |
| Gemini/DeepSeek (per-user) | Settings → AI Chat | No | Yes (user profile) |
| Google Auth | Firebase Console | No | No |
| Google Drive/Sheets | Settings → Cloud Sync | No (OAuth token) | Sheet URLs only |
| Plaid | Settings → Finance Feeds | No (sent with request) | Encrypted access token only |
| Teller | Settings → Finance Feeds | No (sent with request) | Access token only |

## Authenticated Server Routes

Server routes that read or mutate user-specific data require Firebase ID token verification through Firebase Admin SDK.

Affected routes:
- `/api/chat` — AI chat
- `/api/self-host/*` — Self-host owner and secrets management
- `/api/import/extract-transactions` — OCR document import
- Plaid and Teller sync routes

## Diagnostics Safety

The `GET /api/setup/status` endpoint is public-safe:

- Returns presence booleans only — no secrets, tokens, or encrypted data
- No API keys, OAuth tokens, or service account JSON
- Mode detection infers from `NODE_ENV`, `VITE_FIREBASE_*` values, and namespace

## Firestore Security Rules

Always deploy `firestore.rules` to enforce per-user access:

- Rules protect documents at `/users/{userId}/...` and `/environments/{namespace}/users/{userId}/...`
- Only the authenticated owner can read/write their own documents
- Deploy with: `firebase deploy --only firestore:rules`

## API Key Restrictions

In GCP Credentials, restrict your Firebase API key to your app's domains and enable only the APIs you need (Identity Toolkit, Firestore). This limits what the key can do even though it is browser-visible.
