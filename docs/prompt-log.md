# Prompt Log

Use this file to store durable implementation prompts, queued task prompts, and
important fix prompts that should survive beyond a single chat session.

## Entries

### 2026-05-09 - Workflow alignment bootstrap

- Source: Codex
- Context: Port enriched Nexus-style agent rules into VibeBudget.
- Notes: Added expanded `AGENTS.md`, `docs/development-workflow.md`, and
  `docs/backlog.md` to align cross-repo implementation and handoff mechanics.

## 2026-05-11 — Firebase → Supabase Migration (Complete)

**Summary:** Three-phase migration from Firebase Auth + Firestore to Supabase Auth + Supabase DB.

**Phase 1 (`agent/deepseek/supabase-foundation`):**
- Created `src/lib/supabase.ts`, `src/lib/supabaseTypes.ts`
- Created Supabase `supabase/migrations/` and migration script
- Added Supabase env vars to `.env.example`

**Phase 2 (`agent/deepseek/supabase-core-migration`):**
- Created `src/contexts/SupabaseContext.tsx` — full replacement of Firebase context
- Updated `src/lib/auth.ts` — Supabase Google OAuth sign-in
- Updated `src/main.tsx` — import SupabaseProvider
- Updated `api/chat.ts`, `api/setup/status.ts`, `api/import/commit-ocr.ts` — Supabase backend
- Created `src/testing/mockSupabase.tsx` — test mock
- Updated `tests/utils/renderWithProviders.tsx`
- All 544 unit tests passing

**Phase 3 (`agent/deepseek/supabase-cleanup`):**
- Removed `firebase` and `firebase-admin` from `package.json` dependencies
- Deleted `src/firebase.ts`, `src/testing/mockFirebase.tsx`, `firestore.indexes.json`
- Kept `src/contexts/FirebaseContext.tsx` as thin re-export from SupabaseContext (no firebase imports)
- Updated `.env.example` — deprecated Firebase section header: "no longer used. Kept for reference only."
- `api/setup/status.ts` — no changes needed (Firebase check already removed in Phase 2)
- Updated knowledge graph
- Lint: clean (0 errors). Tests: baseline preserved.
