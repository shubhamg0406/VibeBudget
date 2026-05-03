# Testing And Release Workflow

This workflow makes Codex the release-control center for agent work. Agents can still implement changes and raise branches or PRs, but no non-trivial change should be merged or promoted to production until Codex reviews the diff, local browser testing is complete where applicable, and staging is safe.

## Goals

- Stop merging agent work without review.
- Keep production personal data out of agent testing.
- Make local browser testing a normal pre-merge step.
- Separate local, staging, and production validation.
- Produce a clear merge recommendation before every release.

## Default Release Gate

The default gate is **Codex validates first**.

Flow:

1. Agent implements on `agent/<agent>/<task-slug>`.
2. Agent pushes the branch and, after owner approval, opens a PR.
3. Owner asks Codex: `validate PR <url>`.
4. Codex reviews the diff, changed files, tests, and risk.
5. Codex prepares the local browser test script.
6. Owner and Codex test locally in the browser when the change is user-facing or behavior-affecting.
7. Codex validates staging behavior when needed.
8. Codex returns a merge decision.
9. Owner merges and deploys only after a positive recommendation.

Codex is the reviewer and release manager. The owner remains the final merge decision-maker.

## Agent Handoff Requirements

Every agent must stop after branch or PR delivery and report:

- Branch name.
- PR URL, if opened.
- Commit list.
- Files changed.
- Change type: docs, frontend, backend/API, integration, data model, deployment, or mixed.
- Tests run and exact results.
- Manual test notes.
- Local browser test instructions.
- Known risks and edge cases.
- Rollback suggestion.
- Confirmation that production data was not used for testing.
- Confirmation that preview/staging uses `staging`, `preview`, or safe local data instead of `prod` namespace.

If an agent cannot test something, it must say so clearly and explain what remains for Codex/owner validation.

## Codex Validation Checklist

Codex validates each PR by checking:

- Diff scope matches the request.
- No unrelated files or generated artifacts are included.
- No secrets, API keys, personal data, or real credentials are committed.
- Tests match the changed areas.
- Local browser testing is completed for UI, auth, data, integration, and behavior changes.
- Staging uses a non-production namespace.
- Runtime behavior does not overreach the stated scope.
- Rollback is straightforward and documented.

Codex returns one of these decisions:

- `Safe for docs-only merge`: documentation-only, low-risk, links and content checked.
- `Merge recommended`: automated and manual validation passed.
- `Needs changes`: mostly correct, but specific fixes are required before merge.
- `Merge blocked`: unsafe, broken, missing critical validation, or production data risk.

## Local Automated Validation

Run the smallest useful test set first. Use `npm run verify` for broad or risky changes.

| Change type | Required local checks |
| --- | --- |
| Docs only | Inspect diff, validate relative links, check no secrets |
| Utilities/data logic | `npm run test:unit`, `npm run lint` |
| Backend/API | `npm run test:api`, `npm run lint` |
| Frontend/UI | `npm run test:component`, `npm run test:smoke` |
| Cross-cutting or risky | `npm run verify` |
| Dependency changes | `npm install`, targeted tests, `npm run build` |

If a command fails, Codex decides whether it is a known baseline issue or a blocker. Unknown failures are blockers by default.

## Local Browser Validation

Local browser validation is required before merge for UI, auth, data, integration, and behavior changes.

Steps:

1. Checkout the agent branch locally.
2. Run `npm install` if `package.json` or `package-lock.json` changed.
3. Use safe local or staging env values. Do not point local testing at the `prod` namespace unless the owner explicitly requests a production smoke test.
4. Start the app:

```bash
npm run dev
```

5. Open the local Vite URL in the browser. The app usually runs on `http://localhost:8888`, with API proxying to `http://localhost:3000`.
6. Validate the changed flow manually.
7. Check browser console for errors.
8. Check API/server terminal output for errors if the change touches server behavior.
9. Record what was tested and the result.

Recommended local browser checks:

- Sign-in and sign-out still work when auth is touched.
- Dashboard loads after sign-in.
- The exact changed screen or flow works.
- Empty/error states are understandable.
- Mobile viewport is checked for layout changes.
- Integration work uses sandbox credentials only.
- No destructive operation is run against real personal data.

## Staging Validation

Use staging for realistic testing without risking production personal data.

Default staging namespace:

```env
VITE_FIREBASE_DATA_NAMESPACE="staging"
FIREBASE_DATA_NAMESPACE="staging"
```

Staging can use the same Firebase project with a separate namespace, or a separate Firebase project later if needed.

Staging checks:

- Google sign-in works on the preview/staging URL.
- Firestore reads/writes go under `/environments/staging/users/{uid}/...`.
- AI chat works only if staging has safe provider keys.
- Google Sheets/Drive use test files or safe staging files.
- Plaid/Teller use sandbox or non-production credentials.
- Vercel preview logs do not show new runtime errors.

Preview deployments should not point at `prod` namespace by default.

## Production Release Validation

Production validation happens only after merge and staging confidence.

Production checks:

- Deploy or promote the reviewed build.
- Open production URL and sign in.
- Confirm dashboard loads.
- Verify expected namespace is `prod`.
- Avoid destructive tests against personal data.
- Check Vercel logs for runtime errors.
- If a test record is needed, use a clearly labeled safe test record and remove it afterward.

Production release is not where agent changes are first discovered. It is the final smoke check.

## Merge Decision Format

Codex should summarize PR validation with this format:

```text
Decision: Merge recommended | Needs changes | Merge blocked | Safe for docs-only merge

Scope reviewed:
- ...

Validation performed:
- ...

Local browser testing:
- Required: yes/no
- Result: ...

Staging testing:
- Required: yes/no
- Result: ...

Risks:
- ...

Rollback:
- ...
```

## Rollback Expectations

Every PR should have a rollback note.

Examples:

- Docs-only: revert the commit or PR.
- Frontend bug: revert PR and redeploy previous production build.
- Backend/API bug: revert PR; if deployed, roll back Vercel deployment.
- Data migration: document whether rollback is code-only or data repair is required.
- Integration issue: disable provider config or revert route/UI changes.

If rollback is not simple, that must be called out before merge.

## Later CI Upgrade

CI is not the first gate, but the workflow should be CI-ready. Future GitHub Actions can run:

- `npm run lint`
- `npm run test:unit`
- `npm run test:component`
- `npm run test:api`
- `npm run build`
- `npm run test:smoke` where browser setup is available

Branch protection can be added later after the local/Codex workflow is stable.
