# VibeBudget — Claude Code Session Rules

This file is auto-read by Claude Code at session start. It mirrors the key
operating rules from AGENTS.md so they apply without the user needing to
manually load anything.

## Codebase Map (graphify)

This project has a knowledge graph at `graphify-out/` built from the AST.

**ALWAYS** read `graphify-out/GRAPH_REPORT.md` before reading source files,
running grep/glob searches, or answering codebase questions. The graph is the
primary map — use it to orient before drilling into files.

- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- After modifying code, run `graphify update .` to keep the graph current.

## Product Context

VibeBudget is a privacy-aware budgeting and personal finance workspace with
hosted and self-hosted options, provider integrations, and local-first workflows.

Key docs:
- `AGENTS.md` — full agent rulebook (branch/PR conventions, backlog capture, guardrails)
- `docs/north-star-strategy.md` — product direction
- `docs/roadmap.md` — prioritized scope
- `docs/backlog.md` — open bugs, UX polish, ideas

## Hosted vs Self-Hosted

Features gated behind `VITE_SELF_HOSTED=true` are only shown when users run
their own Supabase instance. The Settings "Setup" tab is one example. Do not
expose these for the hosted app.

## Working Agreement

- Treat the repo as source of truth, not chat memory.
- Keep changes scoped to the requested task.
- Prefer existing patterns and components.
- Do not use production data for local or preview testing.
- Do not merge PRs or deploy to production without explicit owner approval.
