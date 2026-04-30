# Product Context

## Why This Exists

VibeBudget exists to solve the problem of "spreadsheet sprawl" — people tracking their finances across multiple spreadsheets, CSV exports from banks, and manual notes. The app consolidates everything into one unified, opinionated budgeting tool that prioritizes clarity and daily logging habits.

## How It Should Feel

- **Fast & Responsive** — local-first with Firestore as the source of truth; data loads from IndexedDB/localStorage cache while Firestore listeners provide real-time updates
- **Dark by default** — a modern, fintech-inspired dark UI (with light mode available)
- **Keyboard-friendly** — math expression evaluation in amount fields (e.g., `=18*1.12`)
- **Mobile-ready** — PWA + Capacitor native shell + bottom navigation for mobile
- **Privacy-conscious** — every user's data is isolated by namespace; no shared budgets; Google Drive/Sheets integrations are optional and user-authorized

## Key User Workflows

1. **Daily logging** — Open app → tap `+` → enter amount (with math), vendor, category → done
2. **Monthly review** — Dashboard shows income vs expenses, budget pace, targets status
3. **Period comparison** — Use date range selector to compare current vs previous period
4. **Import** — Upload CSV/Excel or connect Google Sheets for bulk data ingestion
5. **AI Chat** — Ask questions like "How am I tracking against my budget targets?" or "What's my biggest spending category this month?"
6. **Backup** — Connect Google Drive folder for one-click backup/restore of `budget.json`
7. **Multi-currency** — Set base currency, maintain exchange rates, transactions auto-convert

## User Experience Principles

- **Zero configuration to start** — sign in with Google, add first transaction, done
- **Gradual complexity** — basic usage is simple; power features (Sheets sync, Drive backup, recurring rules, AI chat) are discoverable in Settings
- **Safe defaults** — 25 canonical expense categories pre-seeded; namespace isolation prevents data leaks; Firestore rules enforce per-user access
- **Data portability** — import from anywhere (CSV, Excel, Sheets, Android notifications), export to Drive, sync bidirectionally with Sheets
