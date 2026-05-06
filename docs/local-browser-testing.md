# Local Browser Testing Playbooks

Concrete, repeatable browser test checklists for validating PRs before merge. Use these with the [Testing & Release Workflow](testing-release-workflow.md).

## Setup (every time)

```bash
# 1. Checkout the PR branch
git checkout <branch-name>
git pull origin <branch-name>

# 2. Install dependencies if package files changed
git diff --name-only main...HEAD | grep -qE 'package\.json|package-lock\.json' && npm install

# 3. Use staging-safe env values
cp .env.example .env.local
# Verify VITE_FIREBASE_DATA_NAMESPACE is NOT "prod"
grep VITE_FIREBASE_DATA_NAMESPACE .env.local

# 4. Start the dev server
npm run dev
# API on http://localhost:3000, Vite on http://localhost:8888

# 5. Open the app
open http://localhost:8888
```

## Smoke Checklist (run for every PR)

Run through these before and after the PR-specific playbook:

- [ ] Sign in with Google (staging account or personal test account)
- [ ] Dashboard loads without render errors
- [ ] Date range controls work (This month, Last month, 3 months, YTD, Custom)
- [ ] Settings page opens and renders all sections
- [ ] Sign out works and redirects to sign-in page
- [ ] Browser console shows 0 errors or warnings originating from app code
- [ ] No network requests to `prod` namespace (check Firestore requests in Network tab)
- [ ] App feels responsive (no infinite spinners, no stuck loading states)

## Docs-Only PR Playbook

Skip the dev server. Validate offline:

- [ ] Inspect the full diff: only `.md` files changed, no code or config
- [ ] Read changed docs: no typos, broken English, or factual errors
- [ ] Validate relative links work by checking file paths:
  ```bash
  # Check all markdown links reference existing files
  grep -oP '\(docs/[^)]+\.md\)' <changed-file> | tr -d '()' | while read f; do
    [ -f "$f" ] || echo "MISSING: $f"
  done
  ```
- [ ] No secrets, API keys, or personal data in the diff
- [ ] No generated artifacts (lockfiles, build output) included
- [ ] If linking to a new doc page, verify the target file exists and the anchor is valid

**Decision:** Use `Safe for docs-only merge`.

## Frontend/UI PR Playbook

- [ ] Smoke checklist passes
- [ ] The specific changed component/screen renders correctly
- [ ] Changed UI matches the described intent (compare with PR description)
- [ ] Form inputs, buttons, and interactive elements work
- [ ] Loading states appear briefly then resolve
- [ ] Empty states render correctly (no data scenarios)
- [ ] Error states display user-friendly messages
- [ ] Responsive layout: test at 1440px, 768px, and 375px widths (use DevTools)
- [ ] Touch targets are adequately sized on mobile viewport
- [ ] No visual regressions — check colors, spacing, typography against surrounding UI
- [ ] Run `npm run test:component` passes
- [ ] Browser console: 0 errors, 0 React warnings
- [ ] `npm run lint` passes

## Backend/API PR Playbook

- [ ] Smoke checklist passes (ensures frontend still talks to backend)
- [ ] Open DevTools Network tab and exercise the changed endpoint
- [ ] Verify request payload and response shape look correct
- [ ] Check for unexpected HTTP status codes (400/500 when 200 expected)
- [ ] Test error conditions: send invalid data, omit required fields
- [ ] Terminal running `npm run dev`: no server-side crashes or unhandled exceptions
- [ ] If a new endpoint was added, verify CORS and auth headers are present
- [ ] Verify the response time is reasonable (no new N+1 queries)
- [ ] Run `npm run test:api` passes
- [ ] Run `npm run lint` passes

## Integration PR Playbook

Covers Plaid, Teller, Google Sheets, Google Drive, AI chat, or any external provider.

- [ ] Smoke checklist passes
- [ ] Verify `.env.local` contains sandbox/test credentials (not production)
  ```
  # Expected for Plaid:
  VITE_PLAID_ENV=sandbox
  PLAID_ENV=sandbox

  # Expected for Teller:
  VITE_TELLER_ENV=sandbox
  TELLER_ENV=sandbox

  # Expected for Google APIs:
  # Use a test Google account, not your real financial Drive/Sheets
  ```
- [ ] Connect the integration through the Settings page
- [ ] Verify data flows correctly: create, read, update through the integration
- [ ] Disconnect/reconnect flow works
- [ ] Test error handling: revoke access in the provider dashboard, then verify the app shows a clear error message
- [ ] If AI chat: test with a safe prompt, verify response renders without error
- [ ] Check that no real personal data was sent to the provider (check request payloads)
- [ ] After testing, disconnect/clean up test connections in Settings
- [ ] Run related unit/integration tests (`npm run test:unit`, `npm run test:api`)
- [ ] `npm run lint` passes

## Auth/Sign-In PR Playbook

- [ ] Smoke checklist passes (note: you cannot sign in until this is tested)
- [ ] Sign out if signed in, then test fresh sign-in flow
- [ ] Google sign-in popup appears and completes successfully
- [ ] After sign-in, redirect lands on Dashboard (not a blank or error page)
- [ ] Full page reload at `/` maintains authenticated session
- [ ] Sign out: user is redirected to sign-in page
- [ ] Attempt to access `/dashboard` or `/settings` while signed out — verify redirect to sign-in
- [ ] Browser console: 0 auth-related errors
- [ ] Firestore reads use the correct namespace after sign-in (check Network tab for `environments/...`)
- [ ] Test with a second Google account to verify isolation
- [ ] Run `npm run test:unit` and `npm run test:component` passes
- [ ] `npm run lint` passes

## Deployment/Env PR Playbook

Covers changes to `vercel.json`, `.env.*`, `vite.config.*`, `server.ts`, Dockerfile, CI configs, etc.

- [ ] Smoke checklist passes
- [ ] `npm run dev` starts without configuration errors
- [ ] `npm run build` completes successfully
- [ ] `npm run preview` serves the built app without errors
- [ ] If env vars changed: verify all required vars are documented in `.env.example`
- [ ] If Vercel config changed: verify `vercel dev` or `npx vercel --preview` works (optional — only if Vercel CLI is available locally)
- [ ] If server config changed: verify API responds at `http://localhost:3000/api/...`
- [ ] Check that no production secrets are exposed in config files committed to the repo
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes

## Merge Decision Format

Report the result in the PR summary or as a comment using this format:

```text
Decision: [Safe for docs-only merge | Merge recommended | Needs changes | Merge blocked]

Scope reviewed:
- PR type: <docs | frontend | backend/API | integration | auth | deployment>
- Files changed: <link or summary>

Validation performed:
- Local browser testing: <playbook used> — <PASS/FAIL>
- Automated tests run: <list of commands and results>

Local browser testing:
- Required: yes/no
- Result: PASS / FAIL with notes

Risks:
- <any risks identified>

Rollback:
- <rollback strategy>
```

See the full [Merge Decision Format](testing-release-workflow.md#merge-decision-format) in the Testing & Release Workflow.

## Environment Separation (Quick Reference)

| Context | `VITE_FIREBASE_DATA_NAMESPACE` | Credentials |
|---|---|---|
| Local development | `local-dev` | Personal test Firebase project |
| Staging / Preview | `staging` | Same Firebase, different namespace |
| Production | `prod` | Production Firebase project |
| PR testing (local) | `local-dev` or `staging` | Staging-safe or test credentials |

Never test a PR with `VITE_FIREBASE_DATA_NAMESPACE=prod` unless the owner explicitly requests a production smoke test after merge.
