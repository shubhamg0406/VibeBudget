# Development Workflow

This is the persistent development loop for VibeBudget. It exists so the owner
does not need to re-explain how Codex, implementation agents, PR delivery, and
local UI validation fit together.

## Operating Loop

1. Identify the work with the owner.
2. Codex converts the work into a scoped implementation prompt.
3. Save durable prompts or task notes in `docs/prompt-log.md`.
4. Implementation agent works from the prompt on an agent branch.
5. Implementation agent runs relevant checks, commits, pushes, opens the PR, and
   reports the required handoff.
6. Codex pulls/checks the PR locally, starts the app, and validates the relevant
   UI flow in a browser.
7. Codex reports pass/fail with concrete observations (and screenshots when
   useful).
8. If it fails, Codex prepares the next fix prompt or fixes directly when asked.
9. The owner merges or asks for the next prompt.

The goal is to make each turn recoverable from repository files, not from memory
in a specific chat session.

## Roles

- Owner: decides priority, merges, and gives product judgment after Codex local
  UI validation.
- Codex: maintains context, writes implementation prompts, validates PRs locally
  in the browser, fixes issues when asked, and updates this workflow when the
  process changes.
- Implementation agent: implements scoped prompts, runs relevant checks, commits,
  pushes, opens PRs, and reports the handoff.

## Durable Context To Read First

- `AGENTS.md`
- `README.md`
- `docs/north-star-strategy.md`
- `docs/roadmap.md`
- `docs/agent-workflow.md`
- `docs/testing-release-workflow.md`
- `docs/prompt-log.md`
- `docs/backlog.md`
- Relevant feature docs under `docs/`

## Required Handoff From Implementation Agents

Every implementation agent must report:

- Branch name.
- PR URL.
- Commit list.
- Files changed.
- Change type: docs, frontend, backend/API, integration, data model,
  deployment, or mixed.
- Tests run and exact results.
- Tests not run and why.
- Manual test notes.
- Local browser test instructions (URL + port for UI work).
- Known risks and edge cases.
- Rollback suggestion.
- Confirmation that production data was not used for testing.
- Confirmation that preview/staging/local used safe non-production data.

If something could not be tested, say it directly.

## PR And Validation Gates

Implementation agents should open PRs automatically only when the owner has
explicitly approved PR creation for that task. Do not merge or deploy from an
agent handoff. Codex should locally validate the UI before recommending merge or
the next fix.

## Local Validation

Use focused checks first, then broaden when a change touches shared behavior.

Common commands:

```bash
npm run lint
npm run test:run
npm run build
npm run dev
```

When a local server is started for UI changes, verify the relevant user flow in
a browser before calling the work done.

## Backlog Capture

When the owner finds something during local testing that should be improved
later, capture it in `docs/backlog.md` instead of forcing it into the active PR.
The owner should be able to say "read AGENTS.md and put this in backlog" and get
a lightweight durable note without re-explaining the workflow.

## Updating This Workflow

If the development loop changes, update `AGENTS.md` and this file in the same
PR. If the update affects queued prompts, add a note to `docs/prompt-log.md`.
