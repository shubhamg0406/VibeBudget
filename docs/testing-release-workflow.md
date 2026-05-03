# Testing and Release Workflow

Codex acts as the release-control center. Agents deliver PRs; Codex validates; the maintainer merges and deploys.

## Overview

1. Agent implements, pushes, opens PR, and stops.
2. Maintainer asks Codex: `validate PR <url>`.
3. Codex reviews the diff, runs or confirms validation, checks local browser behavior if needed, and returns a merge decision.
4. Maintainer merges and deploys only after a positive recommendation.

## Agent handoff requirements

Every agent PR must include the following in its description. See [Agent Workflow](agent-workflow.md) for the full checklist.

| Item | Required for |
|---|---|
| Branch name | Always |
| PR link | Always |
| Files changed | Always |
| Change type (one of: docs, frontend, backend/API, integration, data model, deployment, mixed) | Always |
| Tests run + results | Always |
| Tests not run and why | Always |
| Local browser test steps | UI, auth, data, integration, behavior changes |
| Staging/sandbox data confirmation | Always |
| Screenshots or visual notes | UI changes only |
| Known risks | Always |
| Rollback suggestion | Always |
| Confirmation: no production data or credentials used | Always |

**Docs-only PRs** skip local browser testing and screenshots but must still document all other items.

## Codex validation checklist

Codex checks each PR against:

- [ ] Diff scope matches the request
- [ ] No unrelated files or generated artifacts included
- [ ] No secrets, API keys, personal data, or real credentials committed
- [ ] Tests match changed areas and pass
- [ ] Local browser testing completed for UI/auth/data/integration/behavior changes
- [ ] Staging or safe local data namespace used (not `prod`)
- [ ] Runtime behavior does not overreach stated scope
- [ ] Rollback is straightforward and documented
- [ ] Agent did not self-merge (PR is still open)

## Testing by change type

| Change type | Minimal validation |
|---|---|
| Docs only | Inspect diff, validate relative links, check no secrets |
| Utilities / data logic | `npm run test:unit`, `npm run lint` |
| Backend / API | `npm run test:api`, `npm run lint` |
| Frontend / UI | `npm run test:component`, `npm run test:smoke`, local browser test |
| Cross-cutting or risky | `npm run verify` |
| Dependency changes | `npm install`, targeted tests, `npm run build` |

## Local browser validation

Required before merge for UI, auth, data, integration, and behavior changes.

1. Checkout the agent branch.
2. Run `npm install` if dependencies changed.
3. Use safe local or staging env (never `prod` namespace).
4. Start the app: `npm run dev`
5. Open `http://localhost:8888` (API at `http://localhost:3000`).
6. Validate the changed flow, check browser console for errors, check server terminal for errors.
7. Record what was tested and the result.

## Staging validation

Default staging namespace: `staging`

- Google sign-in works on the preview/staging URL.
- Firestore reads/writes go under `/environments/staging/users/{uid}/...`.
- Integrations (Sheets, Drive, Plaid, Teller) use sandbox or non-production credentials.
- Preview deployments do not point at `prod`.

## Merge decision format

```text
Decision: Merge recommended | Needs changes | Merge blocked | Safe for docs-only merge

Scope reviewed:
- ...

Validation performed:
- ...

Local browser testing:
- Required: yes/no | Result: ...

Staging testing:
- Required: yes/no | Result: ...

Risks:
- ...

Rollback:
- ...
```

## Rollback expectations

- Docs-only: revert the commit or PR.
- Frontend bug: revert PR and redeploy previous production build.
- Backend/API bug: revert PR; if deployed, roll back Vercel deployment.
- Data migration: document whether rollback is code-only or data repair required.
- Integration issue: disable provider config or revert route/UI changes.

If rollback is not simple, call it out before merge.
