# System Patterns & Architecture

## Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │Dashboard │  │Transaction│  │ Analysis │  │Settings │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       └──────────────┴─────────────┴──────────────┘      │
│                        │                                 │
│              ┌─────────▼──────────┐                      │
│              │   FirebaseContext   │                      │
│              │  (React Context)    │                      │
│              └─────────┬──────────┘                      │
│                        │                                  │
│          ┌─────────────┼─────────────┐                    │
│          ▼             ▼             ▼                    │
│   ┌──────────┐ ┌────────────┐ ┌──────────┐              │
│   │Firestore │ │ localStorage│ │ IndexedDB │              │
│   │listeners │ │   cache    │ │persistence│              │
│   └────┬─────┘ └────────────┘ └──────────┘              │
└────────┼─────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│                    Server Layer                            │
│  ┌──────────────────────┐  ┌────────────────────────────┐│
│  │Express.js (local dev) │  │Vercel Serverless (prod)    ││
│  │server.ts + SQLite     │  │api/chat.ts                 ││
│  │localhost:3000          │  │/api/* routes              ││
│  └──────────┬───────────┘  └──────────┬─────────────────┘│
│             │                          │                   │
│             └──────────┬───────────────┘                  │
│                        ▼                                   │
│              ┌────────────────────┐                       │
│              │  Firebase Admin SDK │                      │
│              │  (server-side)      │                      │
│              └────────┬───────────┘                       │
│                       │                                    │
│                       ▼                                    │
│              ┌────────────────────┐                       │
│              │  Gemini API         │                      │
│              │  (AI Chat)          │                      │
│              └────────────────────┘                       │
└──────────────────────────────────────────────────────────┘
```

## Client-Side Architecture

### View Routing
- Single-page app with `useState<View>` in `App.tsx`
- Four views: `dashboard`, `transactions`, `analysis`, `settings`
- Layout with sidebar (desktop) + bottom nav (mobile)
- Motion-based view transitions (fade + slide)

### Data Flow Pattern
1. **Firestore real-time listeners** (`onSnapshot`) in `FirebaseContext`
2. Data flows down through React context to all components
3. **Local caching**: transactions cached in localStorage for instant load on auth
4. **IndexedDB persistence**: Firestore enabledIndexedDbPersistence for offline resilience
5. **Auto-save**: Periodic debounced save to localStorage for local-first fallback

### Key Components
| Component | Purpose |
|-----------|---------|
| `FirebaseContext` | Central data store — all CRUD, import/export, sync operations |
| `Dashboard` | KPIs, budget pace, targets, insight tiles, recurring forecast |
| `TransactionsView` | Unified ledger with search, filter, sort |
| `TransactionEntry` | Add/edit form with math evaluation |
| `Analysis` | Category breakdowns, period comparison, trend charts |
| `Settings` | All configuration — currency, import, Drive/Sheets sync |
| `DataHub` | Import center (Excel, Sheets, CSV) |
| `AiChat` | Floating chat widget → `/api/chat` |
| `DateRangeSelector` | Preset + custom range picker |

### State Management
- No external state library — pure React Context + useState
- `FirebaseContext` provides ~30 methods and ~20 state values
- Refs used for current-value snapshots in async callbacks
- Auto-save timer (debounced) for local state persistence

## Server Architecture

### Local Development Server (`server.ts`)
- Express.js + SQLite (better-sqlite3)
- Serves Vite dev middleware in development
- API routes: `/api/categories`, `/api/transactions`, `/api/income`, `/api/recurring/*`, `/api/import/*`, `/api/wipe`, `/api/chat`, `/api/ai-chat`
- Recurring rule auto-generation on request
- Rate limiting (20 requests/minute per user for AI chat)
- Budget data cache (TTL: 5 min) for AI chat to reduce Firestore reads

### Production Server (`api/chat.ts`)
- Vercel serverless function
- Same AI chat logic with Firebase Admin SDK
- REST API fallback for Firestore when Admin SDK unavailable
- Multiple namespace path discovery (`environments/{namespace}/users/{uid}` → `users/{uid}`)

## Data Storage

### Firestore Schema
```
/environments/{namespace}/users/{uid}
  ├── (profile document — preferences, sheets config, drive config)
  ├── categories/{categoryId}         — ExpenseCategory[]
  ├── incomeCategories/{categoryId}   — IncomeCategory[]
  ├── transactions/{transactionId}    — Transaction[]
  ├── income/{incomeId}               — Income[]
  └── recurring_rules/{ruleId}        — RecurringRule[]
```

### SQLite Schema (local server)
```
categories, transactions, income, recurring_rules
(with foreign keys, auto-increment IDs)
```

### Local Storage
- `vibebudgetLocalState` — full state backup for seeding Firestore
- `vibebudgetGoogleAccessToken` — session-stored Drive/Sheets token
- `vb_transactions_cache:{uid}` — transactions cache for instant load
- `vibebudget-ai-chat:{uid}` — AI chat message history

## Import Pipeline
```
Source (CSV/Excel/Sheets/Android)
  → previewImport() — deduplication, validation, classification
    → ImportBatch (records with status: new/duplicate/warning/invalid)
      → commitImport() — batch writes to Firestore with progress callback
```

## Key Design Patterns

1. **Repository Pattern** — FirebaseContext acts as a repository mediating between Firestore and components
2. **Observer Pattern** — Firestore real-time listeners update React state automatically
3. **Migration Pattern** — Data normalization on load (`migrateExpenseCategories`, `migrateTransactions`, etc.) ensures backward compatibility
4. **Batch Processing** — Firestore writes batched in groups of 450 to avoid limits
5. **Circuit Breaker / Fallback** — AI chat falls back to Firestore REST API when Admin SDK fails; falls back to cached data on quota errors
6. **Double-Write** — Transactions cached in localStorage + written to Firestore simultaneously
7. **Namespace Isolation** — Data environment namespaces (`local-dev`, `prod`, `test`) prevent cross-environment data leaks
