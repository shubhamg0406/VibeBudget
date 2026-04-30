# Tech Context

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | ^19.0.0 | UI framework |
| TypeScript | ~5.8.2 | Type safety |
| Vite | ^6.2.0 | Build tool / dev server |
| Tailwind CSS | ^4.1.14 | Utility-first CSS |
| @tailwindcss/vite | ^4.1.14 | Tailwind Vite plugin |
| lucide-react | ^0.546.0 | Icon library |
| recharts | ^3.8.0 | Charting library |
| motion | ^12.23.24 | Animations (Framer Motion successor) |
| clsx | ^2.1.1 | Conditional CSS classes |
| tailwind-merge | ^3.5.0 | Tailwind class merging |
| vite-plugin-pwa | ^1.2.0 | PWA / Service Worker |
| workbox-window | ^7.4.0 | Workbox integration for SW |

### Backend / API
| Technology | Version | Purpose |
|-----------|---------|---------|
| Express.js | ^4.21.2 | HTTP server |
| better-sqlite3 | ^12.4.1 | Local SQLite database |
| esbuild | ^0.28.0 | Server bundling |
| concurrently | ^9.2.1 | Run API + Vite together |
| dotenv | ^17.2.3 | Environment variables |

### Firebase
| Library | Version | Purpose |
|---------|---------|---------|
| firebase | ^12.10.0 | Client SDK (Auth, Firestore) |
| firebase-admin | ^13.8.0 | Server-side Admin SDK |
| @google/genai | ^1.29.0 | Gemini AI client |

### Google Integrations
- **Google Auth** — Sign-In + Drive/Sheets scopes (OAuth)
- **Firestore** — Primary data store with real-time listeners
- **Google Drive API** — Backup/restore `budget.json`
- **Google Sheets API** — Two-way sync for external editing
- **Gemini API** — AI Chat (gemini-2.5-flash model)

### Mobile
- **Capacitor** ^8.3.0 — Native mobile shell (Android)
- @capacitor/browser, @capacitor/splash-screen

### Testing
| Tool | Purpose |
|------|---------|
| Vitest | Unit + component test runner |
| @testing-library/react | Component testing |
| jsdom | DOM environment for tests |
| Playwright | Browser smoke tests |
| Supertest | API endpoint testing |

## Development Setup (macOS-specific)

### Prerequisites
- Node.js 20+
- npm (latest)

### Running Locally
```bash
npm install
cp .env.example .env.local   # Fill Firebase + Gemini values
npm run dev                    # Starts API on :3000 + Vite on :7777
```

### Environment Variables
**Client (`VITE_` prefix):**
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (optional)
- `VITE_FIREBASE_DATA_NAMESPACE` (`local-dev` for dev, `prod` for production)
- `VITE_TEST_MODE` (`mock` for testing without Firebase)
- `VITE_TEST_USER_EMAIL` (test user email)

**Server (no prefix):**
- `GEMINI_API_KEY` — Required for AI chat
- `GEMINI_MODEL` — Defaults to `gemini-2.5-flash`
- `FIREBASE_ADMIN_CREDENTIALS_JSON` — Service account JSON
- `FIREBASE_ADMIN_CREDENTIALS_PATH` — Alternative path to service account file
- `ALLOW_FIREBASE_REST_FALLBACK` — Enable REST fallback for AI chat
- `AI_CHAT_CACHE_TTL_MS` — Cache TTL (default: 300000)

### Important Notes
- **HMR is disabled in AI Studio** via `DISABLE_HMR` env var
- **Data namespace isolation**: `local-dev` vs `prod` prevents data pollution
- **Firestore rules**: Per-user access enforced via `isOwner(userId)` function
- **PWA**: Service worker auto-registers in production; update prompt on new SW

## Project Structure
```
vibebudget/
├── api/chat.ts               # Vercel serverless AI chat route
├── memory-bank/              # Project documentation
├── public/                   # Static assets
├── scripts/verify.mjs        # CI verification script
├── src/
│   ├── App.tsx               # Root component + view routing
│   ├── main.tsx              # Entry point + PWA bootstrap
│   ├── firebase.ts           # Firebase initialization
│   ├── types.ts              # All TypeScript types/interfaces
│   ├── index.css             # Tailwind + CSS variables (dark/light)
│   ├── components/           # React components
│   │   ├── Layout.tsx        # App shell (sidebar + header + bottom nav)
│   │   ├── Dashboard.tsx     # Main dashboard view
│   │   ├── TransactionsView.tsx
│   │   ├── TransactionEntry.tsx
│   │   ├── Analysis.tsx      # Stats / analysis view
│   │   ├── Settings.tsx      # Settings view
│   │   ├── DataHub.tsx       # Import center
│   │   ├── ExcelImporter.tsx
│   │   ├── GoogleSheetImporter.tsx
│   │   ├── ImportCenter.tsx
│   │   ├── AiChat.tsx        # AI chat widget
│   │   ├── DateRangeSelector.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── LoggedOutHome.tsx
│   │   ├── TransactionIcon.tsx
│   │   ├── common/           # Shared components
│   │   │   ├── BottomSheet.tsx
│   │   │   └── FAB.tsx
│   │   └── nav/              # Navigation
│   │       └── BottomNav.tsx
│   ├── contexts/
│   │   └── FirebaseContext.tsx  # Central data context (~2000 lines)
│   ├── hooks/
│   │   └── useBreakpoint.ts
│   ├── lib/
│   │   └── auth.ts           # Google Auth helper
│   ├── server/
│   │   └── aiChat.ts         # AI chat route handler
│   ├── testing/
│   │   └── mockFirebase.tsx  # Mock Firebase for tests
│   └── utils/
│       ├── androidNotificationImport.ts
│       ├── categoryOptions.ts
│       ├── currencyUtils.ts
│       ├── dateUtils.ts
│       ├── excelImport.ts
│       ├── googleDrive.ts
│       ├── googleSheetsSync.ts
│       ├── importDedupe.ts
│       ├── importPipeline.ts
│       ├── insights.ts
│       ├── publicSheetImport.ts
│       ├── recurring.ts
│       └── vendorUtils.ts
├── server.ts                 # Express dev server (with SQLite + Vite middleware)
├── tests/                    # Test suites
├── capacitor.config.ts       # Capacitor mobile config
├── firebase-blueprint.json   # Firestore data model blueprint
├── firestore.rules           # Firestore security rules
├── vite.config.mjs           # Vite configuration
├── tsconfig.json             # TypeScript config
├── tailwind.config.js        # Tailwind config
├── postcss.config.js
└── playwright.config.ts      # Playwright smoke tests
```
