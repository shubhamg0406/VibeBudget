# Backlog

Use this file to capture bugs, UX polish, product ideas, and follow-up
improvements discovered during local testing or PR validation. Keep entries
lightweight until the owner asks to turn one into a prompt or implementation.

## Open

### 2026-05-09 - Bootstrap backlog from Nexus workflow alignment

- Status: Open
- Source/context: Owner request to bring richer Nexus rules into VibeBudget.
- Observed/requested: Port enriched rule system, including PR and backlog
  mechanisms, so both repos follow a consistent operating model.
- Why it matters: Shared operating rules reduce drift, improve handoff quality,
  and make cross-repo agent work predictable.
- Acceptance notes: `AGENTS.md`, `docs/development-workflow.md`, and
  `docs/backlog.md` are present and become the default mechanism for future work.

### 2026-05-09 - OAuth app verification for Google sensitive scopes

- Status: Open
- Source/context: Owner request from production Google auth warning flow.
- Observed/requested: Production-grade fix for Google “app not verified” warning by submitting OAuth app verification for sensitive scopes (`drive.file`, `spreadsheets.readonly`) and publishing.
- Why it matters: Removes trust-friction warnings for end users and stabilizes Google Sheet connect flow for production rollout.
- Acceptance notes: Keep current testing-mode path as short-term workaround (#2), then complete formal OAuth verification/publish path (#3) when ready.
