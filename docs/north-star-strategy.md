# VibeBudget North Star + Strategy

## North Star

VibeBudget is an open-source, user-controlled personal finance hub for people who want calm, practical visibility into their money without spreadsheet sprawl or vendor lock-in.

The product should feel like a trustworthy financial command center: fast enough for daily logging, clear enough for monthly reviews, flexible enough for power users, and transparent enough that users understand where their data, keys, and costs live.

VibeBudget is for users, by users. Core budgeting, imports, exports, analysis, and self-hosting should remain free or very low cost. When a feature depends on a paid service, the default pattern is bring your own key/account (BYOK): the user can set up that provider in their own account and add the required API keys or credentials. The hosted VibeBudget edition exists for convenience, not control.

## Product Positioning

### Who It Is For

- Individuals managing monthly income, expenses, categories, and savings behavior.
- People moving from spreadsheets, bank CSVs, Google Sheets, and manual notes into one structured workflow.
- Privacy-conscious users who want data portability and clear ownership.
- Power users who are comfortable connecting their own Firebase, Google APIs, AI keys, Plaid/Teller accounts, or future providers.
- Less technical users who want the same product experience through an official hosted version with setup and support handled for them.

### What Makes It Different

- **User-owned by default**: data, provider accounts, API keys, imports, and exports should be visible and portable.
- **Free or low-cost core**: essential budgeting should not depend on paid hosted features.
- **BYOK for paid services**: AI, bank feeds, Google APIs, Firebase, and future providers can be configured by users in their own accounts.
- **Hosted for convenience**: the paid hosted version should reduce setup friction, not create artificial lock-in.
- **Docs as product**: setup guides, troubleshooting, migration help, and provider instructions are part of the experience.
- **Mobile-ready path**: the web app remains primary, with PWA and Capacitor as the practical bridge toward native mobile polish.

## Editions

### Open-Source / Self-Hosted

The open-source edition should remain powerful enough to be the real product, not a stripped-down demo.

Users own and configure:

- Firebase Auth and Firestore.
- Google Drive and Google Sheets API access.
- AI provider keys such as Gemini or DeepSeek.
- Bank feed provider credentials such as Plaid and Teller.
- Hosting through Vercel or another compatible platform.
- Data export, import, backups, and migration paths.

This edition should optimize for transparency, low operating cost, reproducible setup, and clear failure modes.

### Hosted Convenience Edition

The hosted edition is the official managed version for users who want VibeBudget without managing infrastructure.

Hosted value can include:

- Managed deployment and environment configuration.
- Guided onboarding and setup checklist.
- Built-in docs/help surfaces.
- Managed backups and restore assistance.
- Priority troubleshooting and migration support.
- Safer defaults around namespaces, auth, and provider setup.
- Optional managed provider configuration where appropriate and legally/financially viable.

Hosted should not paywall essential personal budgeting ownership. It should charge for convenience, support, setup, and operational reliability.

## Product Principles

1. **Clarity over noise**
   Dashboards should help users make decisions quickly: spending pace, target risk, category drift, cash flow, and trends.

2. **Ownership over lock-in**
   Every important data path should have an export, backup, or self-host explanation.

3. **BYOK as a first-class UX**
   Provider setup should be understandable inside the app and in docs, with clear status, requirements, and troubleshooting.

4. **Progressive complexity**
   A user should be able to sign in and add a transaction in minutes, then discover imports, Sheets sync, bank feeds, AI, recurring rules, and backups later.

5. **Source-aware imports**
   Imported or synced data should preserve source metadata, dedupe safely, and show what changed.

6. **Trust through transparency**
   Users should know whether data is manual, imported, synced, pending, source-managed, or editable.

7. **Web first, mobile serious**
   The responsive web app and PWA are the primary near-term mobile experience; native shells mature after onboarding and sync reliability are strong.

## Inspiration From Nexus Portfolio

Nexus Portfolio is the concrete sibling project to borrow from where it improves VibeBudget without changing VibeBudget's personal-budgeting identity.

Patterns to copy or adapt:

- **Connected-account foundation**: normalize provider connections, accounts, sync runs, and imported records rather than building each provider as a one-off UI.
- **Read-only source-managed data**: external snapshots should clearly distinguish provider-owned values from VibeBudget-owned overrides.
- **Provider setup docs**: each provider needs a setup guide with redirect URLs, required keys, local/prod envs, and common failure states.
- **Integration status language**: use consistent states such as not connected, configured, connected, needs attention, syncing, success, and error.
- **Sync run history**: show last sync, imported/skipped/invalid counts, errors, and the next action users can take.
- **Manual override fields**: let users add local metadata without pretending the provider source data changed.

What not to copy directly:

- Shared/family portfolio collaboration unless VibeBudget later chooses multi-user budgets intentionally.
- Wealth-tracking concepts that distract from budgeting, cash flow, and monthly behavior.
- Provider-specific assumptions that make VibeBudget less portable or more expensive by default.

## Roadmap

### Phase 1: Baseline Clarity

Goal: make the product easier to understand before and immediately after sign-in.

Key work:

- Improve the landing page and signed-out state so visitors understand the product, ownership model, hosted option, and BYOK philosophy.
- Make sign-in and sign-out feel intentional, including helpful error states and a clear explanation of what happens after login.
- Add a first-run setup checklist for base currency, categories, first transaction, imports, AI key, Google Sheets/Drive, and bank feeds.
- Make BYOK setup explicit for Firebase, Google APIs, AI providers, Plaid, Teller, and future providers.
- Link the strategy, setup, and support docs from the public or signed-out experience once those pages exist.

Acceptance signals:

- A new user knows what VibeBudget does before signing in.
- A signed-in user knows the next three setup actions.
- BYOK does not feel like a hidden engineering detail.

### Phase 2: Seamless Data Onboarding

Goal: make getting existing financial data into VibeBudget predictable and safe.

Key work:

- Centralize imports, provider setup, backup/restore, and sync into a guided Setup Hub or Getting Started flow.
- Keep the existing preview -> dedupe -> warning -> commit pattern as the standard for all import paths.
- Add Nexus-style provider status summaries for Google Sheets, Google Drive, Plaid, Teller, AI, and future providers.
- Track sync/import history with imported, skipped, invalid, warning, and error counts.
- Clarify which imported fields are source-managed versus editable local overrides.
- Add migration playbooks for spreadsheet users and users coming from exported bank data.

Acceptance signals:

- Users can import data without fearing duplicates or silent overwrites.
- Provider connection screens say exactly what is configured, connected, broken, or waiting on the user.
- Support/debugging starts from visible status and history rather than guesswork.

### Phase 3: Hosted Product Layer

Goal: turn docs, support, and managed setup into a sustainable product service while keeping the open-source app real.

Key work:

- Add public product surfaces for landing, docs/help, hosted edition, self-hosting, pricing/support, and privacy/data ownership.
- Define hosted convenience features around managed deployment, setup, backups, support, and guided migration.
- Keep core budgeting, imports/exports, analysis, BYOK, and self-hosting available in open source.
- Create clear copy around what hosted covers and what users still own.
- Build support workflows from docs first: setup guides, common provider errors, deployment checks, and recovery playbooks.

Acceptance signals:

- The hosted offer is easy to explain in one sentence: pay for convenience and help, not for ownership of your budget.
- Self-hosted users have enough docs to succeed without private support.
- Hosted users have a smoother path without fragmenting the core product.

### Phase 4: Mobile Maturity

Goal: make mobile budgeting feel natural without prematurely splitting product focus.

Key work:

- Treat responsive web and PWA as the near-term mobile default.
- Harden mobile navigation, safe-area spacing, offline behavior, install prompts, and quick transaction entry.
- Stabilize the Capacitor Android shell after web onboarding and sync flows are reliable.
- Plan iOS after hosted/self-hosted setup, import reliability, and bank-feed flows are mature.
- Keep provider auth flows web-compatible wherever possible before introducing native-only dependencies.

Acceptance signals:

- Users can comfortably log daily transactions from a phone.
- PWA install works as the default lightweight mobile route.
- Native app work is additive, not a rescue mission for unfinished web UX.

## Engineering Baselines

### Architecture

- Preserve namespace isolation for local, test, and production data.
- Keep per-user ownership as the default access model.
- Prefer normalized provider abstractions for credentials, connections, accounts, sync status, sync runs, and imported records.
- Keep provider-specific logic behind adapters and mapping utilities where practical.
- Maintain local-first feel with Firestore persistence and local caches, while treating Firestore as the signed-in source of truth.

### BYOK And Provider Setup

- Every paid or quota-sensitive service should have an explicit setup path and docs.
- Secrets must stay server-side unless a provider requires client-safe public configuration.
- User-supplied credentials should be stored only when necessary and with clear language about where they live.
- Connection screens should include required fields, environment mode, save/test/connect actions, and recovery instructions.
- Hosted defaults should never obscure what would be required to self-host.

### Data Movement

- Imports should use preview, validation, dedupe, warnings, and commit summaries.
- Sync flows should record last success, last error, imported/skipped/invalid counts, and source identifiers.
- Exports and backups should remain part of the core product.
- Destructive operations should stay explicit, scoped, and reversible where possible.

### Deployment Modes

VibeBudget should document and support these modes:

- Local development: `.env.local`, mock test mode, Firebase namespace isolation, local API server.
- Self-hosted Vercel/Firebase: user-owned Vercel project, Firebase project, service account, APIs, and provider keys.
- Official hosted VibeBudget: managed production environment with onboarding, support, backups, and docs.
- Mobile/PWA packaging: PWA first, Capacitor Android next, iOS later.

## Docs And Help As Product

Docs should become a product surface, not just repo maintenance.

Recommended doc set:

- `docs/north-star-strategy.md`: this product and engineering baseline.
- `docs/self-hosting.md`: step-by-step deployment with Firebase, Vercel, namespaces, and verification.
- `docs/byok-provider-setup.md`: AI, Google, Plaid, Teller, and future provider setup.
- `docs/hosted-edition.md`: what the hosted version includes and how it differs from self-hosting.
- `docs/mobile-roadmap.md`: PWA, Android, and iOS strategy.
- `docs/troubleshooting.md`: common auth, provider, sync, quota, and deployment failures.

Docs should be written for real users first and maintainers second. If a setup step is confusing in docs, that is a product bug to consider fixing in the app.

## Near-Term Implementation Backlog

1. Landing and signed-out experience
   - Add clearer positioning, open-source/self-hosted messaging, hosted convenience messaging, and docs/help entry points.

2. First-run setup checklist
   - Add a guided checklist after sign-in with currency, first transaction, categories, import, backup, AI, and bank feed steps.

3. Provider status model
   - Normalize status summaries for Google Workspace, finance feeds, and AI provider setup.

4. BYOK documentation
   - Add setup guides for Firebase, Google APIs, Gemini/DeepSeek, Plaid, and Teller.

5. Sync/import history
   - Surface run history, counts, timestamps, and errors for Sheets, Drive, Plaid, Teller, and document imports.

6. Hosted edition page
   - Explain the convenience SaaS offer without weakening open-source trust.

7. Mobile polish pass
   - Audit PWA install, mobile navigation, quick add, offline states, and Capacitor Android readiness.

## Non-Goals For Now

- Do not gate core budgeting features behind hosted pricing.
- Do not introduce shared budgets until the product intentionally commits to a collaboration model.
- Do not make native mobile the main path before web onboarding and sync are reliable.
- Do not add provider integrations without setup docs, status visibility, and import/sync auditability.
- Do not hide costs or credentials behind vague “connect account” language.

## Current-State Notes

The current app already has many pieces of this strategy in place: Google sign-in, Firestore namespace isolation, imports, Google Sheets/Drive flows, AI chat, Plaid/Teller BYOK integrations, PWA support, and Capacitor configuration.

The main gap is not raw capability. The gap is product framing and setup coherence: users need a clearer landing path, first-run guidance, provider setup explanations, integration status, and docs that make both self-hosted and hosted usage feel intentional.
