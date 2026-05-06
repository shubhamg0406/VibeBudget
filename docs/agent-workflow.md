# Agent PR Workflow

Agents implement changes, push branches, and open PRs. Agents **do not merge their own PRs** and **stop after PR delivery**. Codex validates; the maintainer merges.

## Branch and commit conventions

- Branch format: `agent/<agent>/<task-slug>`
- Commit format: `[<agent>] <message>`
- PR title format: `[<agent>] <task summary>`

## Workflow

1. Agent creates branch from `main` and implements changes.
2. Agent runs the smallest relevant validation (tests, lint).
3. Agent commits and pushes.
4. Agent opens a PR (no self-merge; stop after PR delivery).
5. Agent fills the PR template completely (see handoff checklist below).
6. Agent stops. Wait for Codex review.
7. Codex validates and returns a merge decision.
8. Maintainer merges.

## Required PR handoff checklist

Every agent PR must document all of the following in the PR description:

| Item | Required for |
|---|---|
| **Branch name** | Always |
| **PR link** | Always |
| **Files changed** | Always |
| **Change type** | Always — pick one: `docs`, `frontend`, `backend/API`, `integration`, `data model`, `deployment`, `mixed` |
| **Tests run + results** | Always — include exact command output or summary |
| **Tests not run and why** | Always — if something was skipped, say why |
| **Local browser test steps** | UI, auth, data, integration, or behavior changes |
| **Staging/sandbox data confirmation** | Always — confirm `prod` namespace was not used |
| **Screenshots or visual notes** | UI changes only |
| **Known risks** | Always — be honest about what could go wrong |
| **Rollback suggestion** | Always — how to undo if this PR causes issues |
| **Confirmation: no production data or credentials used** | Always |

If the PR is **docs-only**, the agent should mark "Docs only" in the change type and may skip local browser testing and screenshots. All other items still apply.

## What agents must NOT do

- Do not merge your own PR.
- Do not deploy to production.
- Do not use production credentials or data for testing.
- Do not commit secrets, API keys, or personal data.
- Do not bypass the handoff checklist.

## After PR delivery

Stop. The PR is now in the review queue. Codex or the maintainer will pick it up. Do not take further action unless asked.

## Commands

```bash
# Start work
npm run agent:start -- <agent> <task-slug>

# Check current identity/branch
npm run agent:whoami

# Create PR (only deliver, never merge)
npm run agent:pr -- <agent> "<pr title>" main --approved
```
