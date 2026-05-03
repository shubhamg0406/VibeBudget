# Agent PR Workflow (Codex/Cline/Claude/Deepseek)

This repository uses a single GitHub account for opening PRs, but each agent has its own git commit identity.

## Agent identities

| Agent key | Commit name | Commit email |
| --- | --- | --- |
| `codex` | `Shubham-Codex` | `63102408+shubhamg0406+codex@users.noreply.github.com` |
| `cline` | `Shubham-Cline` | `63102408+shubhamg0406+cline@users.noreply.github.com` |
| `claude` | `Shubham-Claude` | `63102408+shubhamg0406+claude@users.noreply.github.com` |
| `deepseek` | `Shubham-Deepseek` | `63102408+shubhamg0406+deepseek@users.noreply.github.com` |

If GitHub rejects the plus-alias noreply emails, switch to the fallback email:
`63102408+shubhamg0406@users.noreply.github.com`

## Branch and commit conventions

- Branch format: `agent/<agent>/<task-slug>`
- Commit format: `[<agent>] <message>`
- PR title format: `[<agent>] <task summary>`

## Approval gate

Do not create a PR until explicit owner approval.

1. Agent implements and pushes branch.
2. Agent stops and reports branch, commits, changed files, tests, manual test notes, local browser test instructions, risks, rollback notes, and confirmation that production data was not used.
3. Owner replies with approval.
4. Agent creates PR.

After a PR exists, the owner asks Codex to validate it before merge. Codex acts as the release-control center: it reviews the diff, prepares or runs local validation, supports local browser testing, checks staging where needed, and returns a merge recommendation. See [Testing And Release Workflow](testing-release-workflow.md).

## Required handoff report

Every agent must stop after implementation and provide:

- Branch name.
- PR URL, if already opened after approval.
- Commit list.
- Files changed.
- Change type: docs, frontend, backend/API, integration, data model, deployment, or mixed.
- Tests run and exact results.
- Manual test notes.
- Local browser test instructions for the owner/Codex.
- Known risks and edge cases.
- Rollback suggestion.
- Confirmation that production data was not used for testing.
- Confirmation that preview/staging uses `staging`, `preview`, or safe local data instead of the `prod` namespace.

If something could not be tested, say so directly and explain what remains for Codex/owner validation.

## Commands

Start work for an agent:

```bash
npm run agent:start -- <agent> <task-slug>
```

Check active identity/branch:

```bash
npm run agent:whoami
```

Create PR after approval:

```bash
npm run agent:pr -- <agent> "<pr title>" main --approved
```

## Agent prompt template

Use this starter prompt for Codex/Cline/Claude/Deepseek:

```text
You are working in /Users/shubham/Downloads/Downloads/vibebudget.

Follow this exact workflow:
1) Run: npm run agent:start -- <agent> <task-slug>
2) Implement only the requested feature/fix.
3) Run relevant tests/lint for changed areas.
4) Commit using: [<agent>] <short message>
5) Push branch to origin.
6) STOP and report:
   - branch name
   - commits made
   - files changed
   - change type: docs, frontend, backend/API, integration, data model, deployment, or mixed
   - tests run + results
   - manual test notes
   - local browser test instructions
   - known risks and edge cases
   - rollback suggestion
   - confirmation that production data was not used for testing
   - confirmation that preview/staging uses staging, preview, or safe local data instead of prod namespace
Do NOT create a PR yet.

Only after I reply with "approved", run:
npm run agent:pr -- <agent> "<pr title>" main --approved
Then share the PR URL.

After the PR is open, wait for the owner to ask Codex to validate it. Do not merge or deploy.
```

## Operational prerequisite

Authenticate GitHub CLI once before using PR creation:

```bash
gh auth login -h github.com
```
