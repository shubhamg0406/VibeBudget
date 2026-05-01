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
2. Agent stops and reports branch, commits, tests, and risks.
3. Owner replies with approval.
4. Agent creates PR.

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
   - tests run + results
   - risk/rollback notes
Do NOT create a PR yet.

Only after I reply with "approved", run:
npm run agent:pr -- <agent> "<pr title>" main --approved
Then share the PR URL.
```

## Operational prerequisite

Authenticate GitHub CLI once before using PR creation:

```bash
gh auth login -h github.com
```
