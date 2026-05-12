# VibeBudget Agent Rulebook

This file is the durable operating context for coding agents working in this
repository. Read it before making changes, writing prompts for another agent, or
validating a PR locally.

## Product Context

VibeBudget is a privacy-aware budgeting and personal finance workspace with
hosted and self-hosted options, provider integrations, and local-first
development workflows.

Keep changes aligned with:

- `README.md` for product and developer quickstart.
- `docs/north-star-strategy.md` for product direction.
- `docs/roadmap.md` for prioritized scope.
- `docs/testing-release-workflow.md` for release and validation expectations.
- `docs/agent-workflow.md` for command-level branch/PR handoff requirements.
- `docs/development-workflow.md` for the durable Codex + implementation-agent
  loop.
- `docs/backlog.md` for product, UX, bug, and improvement notes captured during
  testing.

## Working Agreement

- Treat this repository as the source of truth, not chat memory.
- Preserve user work already present in the working tree.
- Keep changes scoped to the requested task.
- Prefer existing patterns, components, routes, and tests.
- Add or update tests when behavior changes.
- Do not use production data for local, preview, or agent validation.
- Document untested areas and residual risk in handoff notes.

## Agent PR Flow

The owner and Codex use this loop for agent-driven development:

1. Codex and the owner identify the work.
2. Codex writes a precise prompt in `docs/prompt-log.md` or directly for the
   target implementation agent.
3. The implementation agent works on an `agent/<agent>/<task-slug>` branch.
4. The implementation agent runs relevant checks, commits, pushes, and opens
   the PR.
5. Codex pulls/checks the PR locally, starts the app, and validates the UI
   directly in a browser.
6. Codex reports whether local UI passes, needs a fix prompt, or needs a Codex
   fix.
7. The owner decides whether to merge or ask for the next prompt.

The owner should not need to manually review PR diffs or perform the first UI
test pass. Local browser validation is the primary quality gate.

## Prompt Authoring Rule

When Codex writes a prompt for an implementation agent, include relevant
operating instructions inline. Do not assume the agent will remember this
workflow from chat or discover every rule on its own.

Every implementation prompt must include:

- Repository path.
- Files and docs to read first, including `AGENTS.md`.
- Branch/start command.
- Scoped task summary.
- Acceptance criteria.
- Out-of-scope items.
- Test, lint, build, and browser validation expectations.
- Automatic PR creation command.
- Required handoff report.
- Instruction not to merge or deploy.

If a prompt is important enough to send to another agent, also preserve it in
`docs/prompt-log.md` unless the owner explicitly says it is throwaway.

## Backlog Capture Rule

When the owner says "add this to backlog", "save this for later", or similar,
do not start implementation. Append the note to `docs/backlog.md` with a
lightweight entry.

Backlog entries should include:

- Date.
- Source/context (local testing, PR validation, product idea, bug, or UX polish).
- Short title.
- What was observed or requested.
- Why it matters.
- Optional acceptance notes if obvious.
- Status, defaulting to `Open`.

Do not over-specify backlog items. The purpose is to preserve the idea so Codex
can later turn it into an implementation prompt or direct fix when asked.

## Branch, Commit, And PR Conventions

- Agent branch format: `agent/<agent>/<task-slug>`
- Agent commit format: `[<agent>] <short message>`
- Agent PR title format: `[<agent>] <task summary>`
- Codex-authored branches should use the `codex/` prefix unless the owner asks
  for another branch name.

## Guardrails

- Do not merge your own PR.
- Do not deploy to production.
- Do not create a PR until the owner explicitly approves it.
- Do not use production credentials or data for testing.
- Do not commit secrets, API keys, or personal data.
- Do not bypass the required handoff checklist.
- Do not revert user or other-agent changes.
- Do not touch Nexus/shared canonical work unless explicitly assigned.

## Useful Commands

```bash
npm run agent:start -- <agent> <task-slug> [base-branch]
npm run agent:whoami
npm run agent:pr -- <agent> "<pr title>" main --approved
npm run lint
npm run test:run
```

## Local Validation Standard

When validating a PR, lead with local product behavior. Check the diff as
needed, but do not stop at diff review when UI behavior is testable.

Verify:

- User-facing behavior and acceptance criteria.
- Relevant flow in a local browser.
- Auth/integration boundaries when applicable.
- Data safety expectations (staging/local data, not production data).
- API route behavior when backend changes.
- Local testability and rollback clarity.

If no issues are found, say so clearly and call out any remaining test gaps. If
the UI fails locally, prepare the next fix prompt or fix directly when asked.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
