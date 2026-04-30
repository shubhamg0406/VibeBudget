# Progress

## ✅ Completed

### Core Application
- [x] Project scaffolding (Vite + React 19 + TypeScript + Tailwind 4)
- [x] Firebase Auth (Google Sign-In with popup/redirect/native fallback)
- [x] Firestore data layer with real-time listeners
- [x] Namespace-isolated data (`environments/{namespace}/users/{uid}`)
- [x] Local-first caching (localStorage + IndexedDB persistence)
- [x] Dark/light theme with CSS custom properties
- [x] Responsive layout (desktop sidebar + mobile bottom nav)

### Features
- [x] Dashboard with KPIs, budget pace, target status
- [x] Transactions CRUD with math evaluation in amount field
- [x] Unified expense + income ledger with search/filter/sort
- [x] Category management (25 canonical expense categories)
- [x] Income category auto-discovery from records
- [x] Date range filtering with preset options
- [x] Prior-period comparison for all views
- [x] Analysis/stats with category breakdowns and trend charts
- [x] Multi-currency support with exchange rates
- [x] Recurring transaction rules (monthly, auto-generation)
- [x] Recurring transaction forecasting (upcoming instances)
- [x] CSV import pipeline with deduplication
- [x] Excel import (xlsx library)
- [x] Google Sheets integration (two-way sync, column mapping)
- [x] Google Drive backup/restore (budget.json)
- [x] Android notification history import
- [x] Public Google Sheet import (published sheets)
- [x] Data wipe/reset by domain
- [x] AI Chat with Gemini (budget-aware Q&A)
- [x] PWA with service worker (offline caching, update prompt)
- [x] Capacitor mobile shell
- [x] Error boundary for crash recovery
- [x] Data migration layer for backward compatibility
- [x] **Plaid Integration (BYOK)** — Bank feed import with user-owned credentials, Plaid Link connection, encrypted token storage, transaction sync via import pipeline, category auto-mapping, 24h auto-sync
- [x] **Teller Integration (BYOK)** — Bank feed import with user-owned credentials (application ID, certificate, private key), Teller Connect connection, encrypted token storage, transaction sync via import pipeline, category auto-mapping, 24h auto-sync

### Infrastructure
- [x] Express.js dev server with SQLite
- [x] Vercel serverless AI chat route (`api/chat.ts`)
- [x] Vercel serverless Plaid route (`api/plaid.ts`)
- [x] Vercel serverless Teller route (`api/teller.ts`)
- [x] Firestore security rules
- [x] Vite proxy config for API routes
- [x] Environment variable management (.env)
- [x] Data namespace isolation (local-dev / prod / test)
- [x] esbuild server bundling

### Testing
- [x] Unit tests (Vitest) for utilities
- [x] Component tests (Vitest + Testing Library)
- [x] API tests (Vitest + Supertest)
- [x] Smoke tests (Playwright)
- [x] Mock Firebase context for testing

## 🚧 In Progress / Current

- [ ] Active development focus: TBD (awaiting next task)

## ✅ Recently Completed

- [x] **Memory Bank initialization** — established documentation-first development workflow
- [x] **DataHub wired into Layout header** — Upload button in header opens full DataHub modal (Excel import, Google Sheet auto-sync, new data detection, data stats) from any page
- [x] **Plaid Integration (BYOK)** — Full bank feed integration with:
  - Plaid types (`PlaidCredentials`, `PlaidConnection`, `PlaidTransaction`, `PlaidCategoryMapping`, etc.)
  - Category mapping utility (`plaidCategoryMap.ts`)
  - Express server endpoints (`/api/plaid/*`)
  - Vercel serverless function (`api/plaid.ts`)
  - FirebaseContext integration (state, credential persistence, connection lifecycle, sync via import pipeline)
  - Settings UI (credential setup, Plaid Link, category mapping, sync controls, connection status)
  - Mock Firebase updates for test compatibility
  - TypeScript compiles cleanly
- [x] **Teller Integration (BYOK)** — Full bank feed integration with:
  - Teller types (`TellerCredentials`, `TellerConnection`, `TellerTransaction`, `TellerCategoryMapping`, `TellerEnrollment`, etc.)
  - Category mapping utility (`tellerCategoryMap.ts`)
  - Express server endpoints (`/api/teller/*`)
  - Vercel serverless function (`api/teller.ts`)
  - FirebaseContext integration (state, credential persistence, connection lifecycle, sync via import pipeline)
  - Settings UI (credential setup, Teller Connect, category mapping, sync controls, connection status)
  - Mock Firebase updates for test compatibility
  - TypeScript compiles cleanly

## 📋 Planned / Known Gaps

- [ ] Shared/multi-user budgets (intentionally disabled)
- [ ] Push notifications for budget alerts
- [ ] iOS Capacitor support (Android config exists)
- [ ] End-to-end encryption for sensitive financial data
- [ ] Dark mode fine-tuning (some CSS variable polish needed)
- [ ] Comprehensive i18n / localization
- [ ] Export to CSV/PDF (manual backup exists via Drive)
- [ ] More comprehensive onboarding flow
