# Hosted vs Self-Hosted

VibeBudget is open-source and user-owned first. Hosted mode is for convenience. Self-hosting is for control. Both modes preserve the same product idea: your budget data stays understandable, portable, and not locked behind a paid aggregator.

## What Hosted Gives

Hosted VibeBudget gives you the quickest path to a working budget.

You get:

- A managed VibeBudget deployment at [vibebudget-chi.vercel.app](https://vibebudget-chi.vercel.app)
- Managed updates
- Pre-configured Firebase environment
- No infrastructure to maintain

Hosted is best when you want to start tracking now and add provider keys only when you need them.

## What Self-Hosting Gives

Self-hosting gives you direct control of the deployment and credentials.

You get:

- Your own Firebase project with your own Auth and Firestore
- Your own server environment variables
- Your own deployment on Vercel, Railway, Fly.io, or any Node.js host
- Control over backups, retention, logs, and provider keys
- The option to run the app without relying on any third-party managed service

Self-hosting is best when you want maximum control and are comfortable owning deployment work.

## Privacy and Data Ownership Tradeoffs

**Hosted mode** reduces setup burden, but the hosted operator manages the infrastructure. Your data and credentials pass through the managed Firebase project and Vercel deployment.

**Self-hosted mode** gives you full control over where data lives, which providers receive requests, and how logs and backups are handled. You also become responsible for securing the deployment, rotating secrets, and keeping dependencies updated.

### Important Security Model Points

- Server-only secrets must stay on the server (env vars with no `VITE_` prefix).
- Browser-visible `VITE_*` values are public by design — they identify your Firebase project but do not authorize write access.
- Firebase web config is safe in `localStorage` — it is the same data bundled into the frontend in env-var mode.
- AI, bank feed, and Google API integrations send data to those providers when used.

## What Users Still Need to Bring

Even in hosted mode, optional features require your own provider accounts. VibeBudget does not hide third-party costs behind a subscription.

### Needed for Hosted Users

- Provider accounts for optional integrations (AI, Plaid, Teller)
- AI API key if you want AI features
- Google APIs for Drive backup and Sheets sync

### Needed for Self-Hosters

- Firebase project and Firebase Admin credentials
- Deployment platform (Vercel, etc.)
- Provider API keys for optional integrations

## Recommended Choice

**Choose hosted** if:

- You want the fastest start
- You do not want to manage deployment infrastructure
- You are comfortable using managed auth and app infrastructure
- You mainly need budgeting, imports, exports, and optional BYO keys

**Choose self-hosted** if:

- You want full control over where data and logs live
- You want to manage your own Firebase project
- You want to run your own deployment with custom env vars
- You are comfortable maintaining env vars, secrets, and updates

**Choose local development** if:

- You are contributing to VibeBudget
- You want to test features before deploying
- You want a private instance on your machine

For a concrete setup checklist, start with [Getting Started](getting-started.md), then use [Setup Modes](setup-modes.md) for env requirements.
