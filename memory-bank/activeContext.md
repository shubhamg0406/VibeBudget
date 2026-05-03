# Active Context

## Current Task

**Staging-safe environment and preview deployment documentation — namespace isolation safety for PR testing**

Created `docs/staging-env-safety.md` and supporting changes to ensure all agent PRs are
tested against isolated staging data, never production.

## Recent Changes

### New files
- **`docs/staging-env-safety.md`** — Complete staging environment safety guide covering:
  - Data namespace env vars (`VITE_FIREBASE_DATA_NAMESPACE`, `FIREBASE_DATA_NAMESPACE`)
  - Local staging setup (with `.env.staging.example`)
  - Vercel preview deployment namespace configuration
  - Production release smoke testing checklist
  - Agent rules for safe testing
- **`.env.staging.example`** — Staging environment template with `staging` namespace overrides

### Updated files
- **`.env.example`** — Added clear section headers and comments around namespace vars
- **`README.md`** — Added Staging Env Safety to docs table, updated environment separation section, added preview deployments section
- **`memory-bank/techContext.md`** — Added `staging` namespace documentation and links to safety guide
- **`.clinerules`** — Added 5 new staging/production safety rules (rules 11-15)

## Next Steps

1. Verify docs render correctly when the PR preview deploys
2. Ensure future agents follow the new staging safety rules

## Active Decisions

- **BYOK**: Users provide their own API credentials (stored in sessionStorage only)
- **Encrypted tokens**: Access tokens are encrypted server-side before storage in Firestore
- **Import pipeline reuse**: Bank transactions flow through the existing `previewImport` → `commitImport` pipeline for deduplication
- **Category auto-mapping**: Plaid `personal_finance_category` / Teller descriptions → VibeBudget category with user overrides
- **Future-only sync**: Only fetches transactions from the last 30 days on first sync, then incremental via cursor
- **24h auto-sync**: Background sync runs once per day when the app is open
- **Web-only**: No Capacitor native plugin needed; Plaid Link and Teller Connect work via web redirect/iframe
- **Data flows**: Firestore real-time listeners → React Context (FirebaseContext) → Components
- **Local state caching**: localStorage for offline resilience
- **Namespace isolation**: `environments/{namespace}/users/{uid}/...` in Firestore
- **Two API implementations**: Express server (`server.ts`) and Vercel serverless (`api/plaid.ts`, `api/teller.ts`)