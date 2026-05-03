# Staging Environment & Preview Safety

This document explains how to safely test PRs, preview deployments, and local development
without touching production personal data.

## Why This Matters

VibeBudget uses **Firebase/Firestore** with **namespace-isolated data paths**:
`environments/{namespace}/users/{uid}/...`. If the namespace is set to `prod`, any
local or preview deployment could read/write production user data. This document
ensures every environment except production uses a safe, isolated namespace.

## Data Namespace Environment Variables

Two environment variables control the namespace. Both must be set consistently.

| Variable | Scope | Used By | Resolution Order |
|----------|-------|---------|-----------------|
| `VITE_FIREBASE_DATA_NAMESPACE` | Client (browser) | `src/firebase.ts` | Env var → `test` (test mode) → `local-dev` (dev) → `prod` (production build) |
| `FIREBASE_DATA_NAMESPACE` | Server (Node.js) | `src/server/aiChat.ts`, `api/chat.ts` | Env var → `NODE_ENV`-based default |

### How They Work

- **Client side** (`VITE_FIREBASE_DATA_NAMESPACE`): Injected at build time by Vite.
  Used by `FirebaseContext` to scope all Firestore reads/writes under
  `environments/{namespace}/users/{uid}`.
- **Server side** (`FIREBASE_DATA_NAMESPACE`): Used by the AI Chat route when reading
  user data from Firestore with the Admin SDK. Falls back to
  `VITE_FIREBASE_DATA_NAMESPACE` if not set.

### Accepted Values

| Value | Purpose |
|-------|---------|
| `local-dev` | Local development (default when `npm run dev`) |
| `staging` | Staging / PR preview testing |
| `prod` | Production live data |
| `test` | Automated test runs (set automatically by Vitest) |

## Local Development Staging Setup

### Option A: Use the staging example file

```bash
cp .env.staging.example .env.local
# Fill in Firebase project credentials (use your dev/staging project, NOT production)
```

### Option B: Manual override in `.env.local`

Ensure these two lines exist in your `.env.local`:

```env
VITE_FIREBASE_DATA_NAMESPACE="staging"
FIREBASE_DATA_NAMESPACE="staging"
```

The `.env.example` defaults both to `"local-dev"` so that a fresh clone never
accidentally touches production data.

### Verification

After starting the dev server (`npm run dev`), open browser DevTools and check:

```
> import.meta.env.VITE_FIREBASE_DATA_NAMESPACE
"staging"
```

All Firestore operations will be scoped to `/environments/staging/users/{uid}/...`.

## Vercel Preview Deployment Setup

Vercel preview deployments (created for every PR branch) must use the `staging`
namespace so they never read or write production data.

### Step 1: Add preview environment variables in Vercel Dashboard

1. Go to your Vercel project dashboard → **Settings** → **Environment Variables**.
2. Add these two variables with value `staging`:

   | Name | Value | Environments |
   |------|-------|-------------|
   | `VITE_FIREBASE_DATA_NAMESPACE` | `staging` | Preview |
   | `FIREBASE_DATA_NAMESPACE` | `staging` | Preview |

3. Ensure the **Production** environment still has:

   | Name | Value | Environments |
   |------|-------|-------------|
   | `VITE_FIREBASE_DATA_NAMESPACE` | `prod` | Production |
   | `FIREBASE_DATA_NAMESPACE` | `prod` | Production |

### Step 2 (optional): Use Vercel CLI for branch-specific overrides

If you need a branch-specific override, use a `.env.vercer.preview` file
(which is gitignored):

```env
VITE_FIREBASE_DATA_NAMESPACE="staging"
FIREBASE_DATA_NAMESPACE="staging"
```

Then link it with:

```bash
npx vercel env pull .env.vercel.preview
```

### Step 3: Verify preview deployment

After the preview deploys, visit the deployment URL and:

1. Sign in with Google.
2. Open DevTools console and run `import.meta.env.VITE_FIREBASE_DATA_NAMESPACE`.
3. Confirm it returns `"staging"`.
4. Create a test transaction — verify it appears under `/environments/staging/users/{uid}/transactions/`
   in the Firebase Console (not under `prod`).

## Production Release Smoke Testing

Production releases must be tested separately and deliberately.

### Promotion checklist

1. **Verify staging first** — all integration tests pass, manual smoke test passes.
2. **Deploy to production** via `npx vercel --prod --yes`.
3. **Smoke-test production** — sign in, confirm data appears in `/environments/prod/users/{uid}/...`.
4. **Validate integrations** — if Plaid/Teller is configured, ensure sandbox mode is disabled
   and real credentials are used.
5. **Monitor** — check Vercel logs and Firebase Console after deployment.

### Production vs staging: key differences

| Aspect | Staging | Production |
|--------|---------|------------|
| Firebase project | Same or separate (recommended: separate) | Live user data |
| Firestore namespace | `staging` | `prod` |
| Plaid/Teller mode | Sandbox credentials | Live bank credentials |
| AI Chat | Test Gemini key | Production Gemini key |
| Auth users | Test Google accounts only | Real users |

## Rules for Agents

1. **Never test against production personal data.**
   - Set `VITE_FIREBASE_DATA_NAMESPACE` to `staging` (or `local-dev`) in every
     PR branch.
   - Never modify the production namespace configuration.

2. **Use staging namespace for PR validation.**
   - Before marking a PR as ready, confirm the preview deployment uses `staging`.
   - Verify Firestore data is isolated.

3. **Use sandbox credentials for integrations.**
   - Plaid sandbox: use the Plaid Sandbox environment with test credentials.
   - Teller sandbox: use Teller's test credentials / certificate.
   - Never use production Plaid/Teller tokens in preview or local dev.

4. **Local browser testing must use safe/staging env values.**
   - `npm run dev` defaults to `local-dev`, which is safe.
   - If you need a clean staging dataset, set `VITE_FIREBASE_DATA_NAMESPACE="staging"`.
   - Never test with `VITE_FIREBASE_DATA_NAMESPACE="prod"` locally.

5. **When you discover a staging safety gap, document it immediately.**
   - File an issue or add to the PR summary.
   - Do not fix unrelated problems in the same PR unless they block the task.

## Firestore Data Path Reference

```
/environments/
  ├── local-dev/         ← safe for local dev (default)
  │   └── users/{uid}/...
  ├── staging/           ← safe for PR previews
  │   └── users/{uid}/...
  ├── test/              ← safe for automated test runs
  │   └── users/{uid}/...
  └── prod/              ← live production data — DO NOT TOUCH from non-production
      └── users/{uid}/...
```

The legacy path `users/{uid}/...` (without namespace prefix) may exist from
before namespace isolation was introduced. Server-side code has fallback logic
to check both namespaced and legacy paths.

## Related

- [Self-Hosting Guide](self-hosting.md) — full project deployment walkthrough
- [BYOK Provider Setup](byok-provider-setup.md) — Plaid, Teller, AI, Google API keys
- [Testing & Release Workflow](testing-release-workflow.md) — validation gates
- [Agent PR Workflow](agent-workflow.md) — branch, commit, review rules
