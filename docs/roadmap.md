# VibeBudget Roadmap

This roadmap turns the north-star strategy into execution lanes and ordered phases. It separates what already exists from what needs product polish, user guidance, engineering hardening, and hosted/mobile packaging.

## Current Standing

VibeBudget already has the core engine of the product:

- Personal budgeting with expenses, income, categories, targets, date ranges, trends, and recurring rules.
- Data movement through CSV, Excel, Google Sheets, Google Drive backup/restore, Android notification import, public sheet import, and document extraction.
- BYOK-oriented integrations for AI, Plaid, and Teller.
- Firebase Auth, Firestore namespace isolation, local caching, PWA support, and Capacitor mobile shell.
- Vercel deployment path, serverless API routes, test coverage, and smoke-test infrastructure.

The main north-star gap is not raw feature count. The gap is product coherence: users need clearer setup, stronger signed-out positioning, guided onboarding, visible provider status, docs as a product surface, and a clean distinction between open-source self-hosting and hosted convenience.

## Work Categories

### 1. Product Identity And Public Surface

Purpose: make VibeBudget understandable before sign-in.

Items:

- Landing page with open-source, self-hosted, BYOK, and hosted-convenience positioning.
- Clear sign-in and sign-out states.
- Public docs/help entry points.
- Pricing/support page for hosted convenience when the offer is ready.
- Privacy and data ownership messaging.

Why first: if users cannot understand what VibeBudget is and why it is trustworthy, the advanced features feel scattered.

### 2. Onboarding And Setup Guidance

Purpose: help new users reach a useful first budget quickly.

Items:

- First-run setup checklist.
- Default setup flow for currency, first category targets, first transaction, import choice, backup choice, and optional AI/bank feeds.
- Getting Started or Setup Hub inside the signed-in app.
- Empty states that guide users toward the next action.
- “What happens after sign-in” explanation.

Why second: the app already has features, but needs a path through them.

### 3. Data Import, Sync, And Provider Trust

Purpose: make external data movement feel safe and inspectable.

Items:

- Unified integration status model: not connected, configured, connected, syncing, success, needs attention, error.
- Sync/import history with timestamps, imported/skipped/invalid counts, and last error.
- Provider setup screens for Google Workspace, Plaid, Teller, and AI.
- Source-managed versus user-editable field behavior.
- Dedupe/audit UX improvements around preview and commit flows.

Why third: VibeBudget’s power comes from connected data, but connected data needs visible trust rails.

### 4. BYOK And Self-Hosting Documentation

Purpose: make the open-source edition genuinely usable without private hand-holding.

Items:

- Self-hosting guide for Firebase, Vercel, namespaces, service accounts, and deploy checks.
- BYOK provider setup guide for Gemini/DeepSeek, Google APIs, Plaid, and Teller.
- Troubleshooting guide for auth, API scopes, provider credentials, quotas, and deployment errors.
- Migration/import playbooks for spreadsheet users and bank-export users.
- README restructuring around user quick start, developer quick start, and deployment.

Why fourth: docs become a product moat and support reducer, especially for open source.

### 5. Hosted Convenience Product Layer

Purpose: create a sustainable offer without weakening open-source trust.

Items:

- Hosted edition page explaining what is managed.
- Support/help model: setup assistance, guided migrations, backups, troubleshooting, and priority help.
- Hosted onboarding path with safe defaults.
- Operational checklist for production deploys, backups, monitoring, and recovery.
- Clear boundaries between hosted convenience and open-source capability.

Why fifth: hosted should be packaged after the core story and docs are clear.

### 6. Core Budgeting Polish

Purpose: improve everyday budget usefulness and retention.

Items:

- Dashboard clarity pass for budget pace, target risk, category drift, and cash-flow health.
- Monthly review workflow.
- Better category target setup and recommendations.
- CSV/PDF export improvements.
- Push or in-app budget alerts later.
- Dark/light theme polish and accessibility pass.

Why ongoing: this is the daily value loop, but it should be guided by onboarding and real usage feedback.

### 7. Mobile Maturity

Purpose: make daily logging natural from a phone.

Items:

- PWA install and offline polish.
- Mobile quick-add improvements.
- Safe-area and bottom-nav polish.
- Capacitor Android hardening.
- iOS plan only after web onboarding, sync trust, and hosted/self-hosted paths are stable.

Why later: mobile should amplify a coherent product, not compensate for incomplete onboarding.

## Ordered Roadmap

### Phase 0: Baseline And Cleanup

Goal: make the current product understandable to contributors and future workstreams.

Status: mostly complete, with docs still maturing.

Deliverables:

- North-star strategy document.
- Roadmap document.
- README pointer to strategy and roadmap.
- Current-state inventory of shipped versus planned capabilities.
- Confirm active worktree changes and avoid mixing unrelated feature work.

Exit criteria:

- We can explain what VibeBudget is, where it is going, and what the next workstream is.

### Phase 1: Clarity Before And After Sign-In

Goal: make the product story and first user path obvious.

Priority items:

- Upgrade signed-out landing page around open source, hosted convenience, BYOK, privacy, and docs.
- Improve sign-in/sign-out states and auth error copy.
- Add first-run setup checklist.
- Add empty-state guidance for dashboard, transactions, settings, and data hub.
- Add docs/help links in the app shell or settings.

Exit criteria:

- A new user understands VibeBudget before sign-in.
- A signed-in user knows the next action to make the app useful.
- BYOK is visible as a feature, not a surprise setup burden.

### Phase 2: Setup Hub And Integration Trust

Goal: make all setup, import, backup, sync, and provider flows feel unified.

Priority items:

- Create a Setup Hub or Getting Started section.
- Normalize provider status summaries across Google Workspace, Drive, AI, Plaid, and Teller.
- Add sync/import history surfaces.
- Add provider-specific setup panels with save, test, connect, disconnect, and troubleshooting actions.
- Clarify source-managed imported data and local overrides.

Exit criteria:

- Users can see what is connected, what is broken, and what to do next.
- Imports and syncs show visible audit history.
- Support questions can start from status and history instead of guesswork.

### Phase 3: Self-Hosting And BYOK Docs

Goal: make the open-source edition complete and trustworthy.

Priority items:

- Write self-hosting guide.
- Write BYOK provider setup guide.
- Write troubleshooting guide.
- Add migration/import playbooks.
- Restructure README for user, developer, and deployment audiences.

Exit criteria:

- A motivated user can self-host VibeBudget from docs alone.
- Provider setup failures have documented recovery paths.
- Docs reduce repeated support work.

### Phase 4: Hosted Convenience Package

Goal: make the hosted edition easy to understand and operate.

Priority items:

- Add hosted-edition page.
- Define support and onboarding promise.
- Define backup, recovery, and migration workflows.
- Add production readiness checklist.
- Add lightweight monitoring/operational guidance.

Exit criteria:

- Hosted can be described as paid convenience, not paid ownership.
- Hosted users get a smoother path than self-hosted without fragmenting the product.
- Open-source trust remains intact.

### Phase 5: Core Budgeting Depth

Goal: make VibeBudget more useful month after month.

Priority items:

- Improve dashboard decision hierarchy.
- Add monthly review workflow.
- Strengthen category target setup.
- Add CSV/PDF export polish.
- Add alerting after the signal model is stable.

Exit criteria:

- Users can review a month, understand what changed, and adjust next month’s budget.
- Daily logging and monthly review become the core retention loop.

### Phase 6: Mobile Maturity

Goal: make phone usage feel first-class.

Priority items:

- PWA install prompts and offline states.
- Mobile quick-add flow.
- Android Capacitor hardening.
- iOS feasibility and packaging plan.
- Push notifications only after budget alert semantics are clear.

Exit criteria:

- Daily transaction entry is comfortable on mobile.
- PWA is reliable enough to recommend.
- Native mobile work has a clear purpose and scope.

## Recommended Execution Order

1. Finish docs baseline: strategy, roadmap, README links.
2. Improve landing and signed-out experience.
3. Add first-run setup checklist.
4. Build Setup Hub and provider status summaries.
5. Add sync/import history surfaces.
6. Write self-hosting and BYOK provider docs.
7. Package hosted convenience page and support promise.
8. Polish monthly budgeting workflows.
9. Harden PWA and Android mobile experience.
10. Revisit iOS, alerts, shared budgets, and advanced privacy once the core path is stable.

## Parking Lot

These are valid ideas, but should not interrupt the first execution path:

- Shared/multi-user budgets.
- End-to-end encryption for all sensitive financial data.
- Push notifications.
- Full i18n/localization.
- Native iOS app.
- Advanced hosted billing tiers.
- More bank/feed providers.
