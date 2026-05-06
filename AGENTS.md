# VibeBudget Agent Rules

All coding agents working in this repo must read and follow:

- [Agent PR Workflow](docs/agent-workflow.md)

Short version:

- Start work with `npm run agent:start -- <agent> <task-slug> [base-branch]`.
- Use branch format `agent/<agent>/<task-slug>`.
- Keep changes scoped to the assigned task.
- Do not merge.
- Do not deploy.
- Do not create a PR until the owner explicitly approves it.
- PR titles must use `[<agent>] <task summary>`, for example `[deepseek] Add staging safety`.
- Every handoff must include branch, commits, files changed, tests, build/lint result, risks, rollback notes, and local browser test instructions.
- Every UI PR must include a local test URL and port. Prefer a separate worktree and a unique port per PR.
- If work depends on an unmerged PR, say it is stacked and name the base branch.
- If work is independent, branch from latest `main`.
- Do not revert user or other-agent changes.
- Do not touch Nexus/shared canonical work unless explicitly assigned.
