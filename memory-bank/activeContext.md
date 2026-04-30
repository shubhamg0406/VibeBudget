# Active Context

## Current Task

**Plaid & Teller Integration Fixes — Teller Connect SDK loading + Save Credentials buttons**

Fixed two issues:
1. Teller Connect SDK was not loaded (missing script tag in `index.html`)
2. Both Plaid and Teller sections lacked explicit "Save Credentials" buttons with visual feedback

## Recent Changes

### Teller Connect SDK
- **`index.html`**: Added `<script src="https://cdn.teller.io/connect/connect.js" async>` to load the Teller Connect SDK on page load, fixing the "Teller Connect SDK not loaded" error

### Save Credentials Buttons
- **`src/components/Settings.tsx` (Plaid section)**: Added "Save Credentials" button with Save icon and success status message next to the existing "Clear Credentials" button
- **`src/components/Settings.tsx` (Teller section)**: Added "Save Credentials" button with Save icon and success status message next to the existing "Clear" button

## Next Steps

1. Test the Plaid Link flow end-to-end with sandbox credentials
2. Test the Teller Connect flow end-to-end with sandbox credentials
3. Consider adding a Dashboard card showing Plaid/Teller connection status and last sync time
4. Add Plaid/Teller sync to the DataHub import center for visibility
5. Continue memory-first development workflow

## Active Decisions

- **BYOK**: Users provide their own API credentials (stored in sessionStorage only)
- **Encrypted tokens**: Access tokens are encrypted server-side before storage in Firestore
- **Import pipeline reuse**: Bank transactions flow through the existing `previewImport` → `commitImport` pipeline for deduplication
- **Category auto-mapping**: Plaid `personal_finance_category` / Teller descriptions → VibeBudget category with user overrides
- **Future-only sync**: Only fetches transactions from the last 30 days on first sync, then incremental via cursor
- **24h auto-sync**: Background sync runs once per day when the app is open
- **Web-only**: No Capacitor native plugin needed; Plaid Link and Teller Connect work via web redirect/iframe
- **Data flows**: Firestore real-time listeners → React Context (FirebaseContext) → Components
- **Local state caching**: localStorage for offline resilience
- **Namespace isolation**: `environments/{namespace}/users/{uid}/...` in Firestore
- **Two API implementations**: Express server (`server.ts`) and Vercel serverless (`api/plaid.ts`, `api/teller.ts`)
