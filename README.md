# VibeBudget

VibeBudget is a Vite + React budgeting app backed by Firebase Authentication and Firestore.

## Run locally

Prerequisites:
- Node.js 20+

Setup:
1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in your Firebase web app values in `.env.local`.
4. Start the frontend with `npm run dev`.

Data isolation in the same Firebase project:
- Set `VITE_FIREBASE_DATA_NAMESPACE="local-dev"` in `.env.local` for local testing data.
- Set `VITE_FIREBASE_DATA_NAMESPACE="prod"` in Vercel production env vars for live user data.
- Both environments can use the same Firebase project, but data stays separated under different Firestore paths.
- If `VITE_FIREBASE_DATA_NAMESPACE` is omitted, the app defaults to `local-dev` in local development and `prod` in production builds.

Local testing identity:
- `VITE_TEST_USER_EMAIL` controls the default signed-in user email in `VITE_TEST_MODE=mock`.
- Default is `shubhamg266@gmail.com` for local testing.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run dev:test` starts the app in deterministic mock mode for browser smoke tests.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run lint` runs the TypeScript typecheck.
- `npm run test:unit` runs utility-focused Vitest coverage.
- `npm run test:component` runs React component tests with Testing Library.
- `npm run test:api` runs the legacy Express/SQLite API tests.
- `npm run test:smoke` runs the Playwright browser smoke test suite.
- `npm run test` runs the full test stack in CI-style order.
- `npm run verify` runs tests, build, and typecheck in one command.

## Testing Framework

The repository now includes a layered testing setup:

- `Vitest` for unit and component tests
- `Testing Library` for UI behavior tests
- `Supertest` for `server.ts` API coverage
- `Playwright` for browser smoke verification against a local mock-data app boot

### First-time setup

1. Install dependencies with `npm install`.
2. Install the Playwright browser once with `npx playwright install chromium`.

### Test behavior

- Component tests use a mock Firebase context so they do not require real Firebase credentials or a live backend.
- Browser smoke tests run the app with `VITE_TEST_MODE=mock`, which boots a deterministic in-memory provider instead of the production Firebase provider.
- In mock mode, user identity defaults to `VITE_TEST_USER_EMAIL` so local test data stays associated with your intended test account.
- API tests use an isolated SQLite database created for each run.

### Recommended commands

- Run `npm run test` before merging app changes.
- Run `npm run verify` when you want the full gate: tests, production build, and typecheck.
- Use `npm run test:component` or `npm run test:smoke` during UI work when you want faster iteration on specific layers.

## Deploying To Vercel

Set these project environment variables in Vercel before deploying:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (optional)
- `VITE_FIREBASE_DATA_NAMESPACE` (`prod` in production)
