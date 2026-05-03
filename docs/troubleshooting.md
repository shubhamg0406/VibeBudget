# Troubleshooting Guide

Common issues when running or deploying VibeBudget.

---

## Google Sign-In Failures

### Popup blocked or closed

**Symptom:** Clicking "Sign in with Google" does nothing or the popup closes immediately.

**Cause:** Browser blocked the popup, or the user closed it before completing.

**Fix:**
- Allow popups for the domain
- In embedded browsers (Codex, Electron, WebView), VibeBudget automatically falls back to redirect auth — this should work without popups
- On mobile, ensure redirect-based sign-in is allowed

**Check:** Browser console for `auth/popup-blocked` or `auth/popup-closed-by-user` errors.

### unauthorized-domain

**Symptom:** `auth/unauthorized-domain` error in console after sign-in attempt.

**Cause:** The domain is not in Firebase Auth's authorized domains list.

**Fix:**
1. Go to Firebase Console → Authentication → Settings → Authorized domains
2. Add your domain (e.g. `localhost`, `127.0.0.1`, `your-app.vercel.app`)
3. Re-deploy

**Check:** `src/lib/auth.ts:83` — this error is thrown explicitly with instructions.

### Sign-in works but immediately redirects to logged-out state

**Symptom:** After Google sign-in, the page refreshes and shows the logged-out view.

**Cause:** Firebase Auth persistence issue or incorrect OAuth client ID configuration.

**Fix:**
- Ensure the web client ID in Firebase matches the one in GCP OAuth credentials
- Clear browser cache and re-authenticate
- Check that `VITE_FIREBASE_AUTH_DOMAIN` matches the Firebase project's auth domain

---

## Firebase Env/Config Failures

### App crashes on load: "Missing Firebase environment variables"

**Symptom:** The app throws an error at startup: `Missing Firebase environment variables: VITE_FIREBASE_API_KEY, ...`

**Cause:** One or more `VITE_FIREBASE_*` env vars are missing or empty.

**Fix:**
1. Copy `.env.example` to `.env.local`
2. Fill in all six required values from Firebase Console → Project Settings → Web App
3. Restart the dev server or re-deploy to Vercel

**Check:** `src/firebase.ts:14-24` validates all required keys on import.

### "Cannot read properties of undefined (reading 'firebaseApp')"

**Symptom:** Firebase SDK methods fail with seemingly unrelated errors.

**Cause:** Firebase config values are wrong (typo, wrong project, API key restricted).

**Fix:**
- Verify all six `VITE_FIREBASE_*` values against the Firebase Console
- Check that the API key is not restricted to a domain that excludes your current host
- Ensure the Firebase project is not deleted or disabled

---

## Firestore Permission / Namespace Issues

### "Missing or insufficient permissions"

**Symptom:** Data doesn't load; Firestore console shows permission errors.

**Cause:** Firestore rules are not deployed, are too restrictive, or data is in a different namespace than expected.

**Fix:**
1. Deploy `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Verify the data exists in the expected namespace path:
   - Client expects: `/environments/{namespace}/users/{uid}/...`
   - Check `VITE_FIREBASE_DATA_NAMESPACE` in your env
3. If data was written outside the namespace structure (under `/users/{uid}/...` directly), the rules do allow that — but the app may not find it if namespace mismatch

**Check:** `src/firebase.ts:36-50` and `api/chat.ts:426-441` for namespace resolution logic.

### Data appears in Firestore but app shows nothing

**Symptom:** Documents exist in Firestore console, but the app shows no transactions, categories, or income.

**Cause:** Namespace mismatch. Client reads from one namespace but data was written to another.

**Fix:**
- Check the `VITE_FIREBASE_DATA_NAMESPACE` env var vs. where documents actually exist in Firestore
- The default for local dev is `local-dev`; for production it's `prod`
- If your data is under `environments/local-dev/...` but the app reads `environments/prod/...`, they won't see each other

---

## Firebase Admin / Service Account Issues

### AI chat returns 500: "Firebase Admin init failed"

**Symptom:** AI chat endpoint returns a 500 error. Server logs show Firebase Admin init failure.

**Cause:** Missing or invalid service account credentials on the server.

**Fix:**
- For Vercel: Set `FIREBASE_ADMIN_CREDENTIALS_JSON` in environment variables
- For local dev: Set `FIREBASE_ADMIN_CREDENTIALS_PATH` pointing to your downloaded service account JSON
- Verify the service account has the "Firebase Admin SDK Admin Service Agent" role (or `roles/firebase.sdkAdminServiceAgent`)
- If neither is set, the server falls back to `applicationDefault()` which may fail outside GCP

**Check:** `api/chat.ts:449-490` or `src/server/aiChat.ts:485-526` for Admin SDK initialization logic.

### AI chat works locally but fails on Vercel

**Symptom:** AI chat works in `npm run dev` but returns errors after Vercel deploy.

**Cause:** Service account credentials not set in Vercel environment variables.

**Fix:**
- Add `FIREBASE_ADMIN_CREDENTIALS_JSON` to Vercel → Settings → Environment Variables
- The JSON must be on a single line or properly escaped
- If using the REST fallback, ensure `ALLOW_FIREBASE_REST_FALLBACK` is `true`

### AI chat returns 401: "Invalid or expired authentication token"

**Symptom:** AI chat endpoint returns 401 even though the user is signed in.

**Cause:** The ID token sent by the client is expired, or the Firebase project used for auth differs from the one the server is configured for.

**Fix:**
- The client sends the Firebase ID token with each chat request
- If the server's `FIREBASE_ADMIN_CREDENTIALS_JSON` is from a different project, token verification will fail
- Ensure both client and server point to the same Firebase project

---

## Google Sheets / Drive API Issues

### "Google Drive API has not been used in project"

**Symptom:** "Enable Drive API" or "Access Not Configured" error when trying to connect Drive in Settings.

**Cause:** The Google Drive API is not enabled in the GCP project.

**Fix:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/library/drive.googleapis.com)
2. Select your Firebase project
3. Click "Enable"

### "Google Sheets API has not been used in project"

**Symptom:** Same as above for Sheets sync.

**Fix:**
1. Enable [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
2. Also ensure [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) is enabled (used to find spreadsheets)

### OAuth consent screen not configured

**Symptom:** After signing in for Drive/Sheets, you see "Access Not Configured" or "Consent screen not configured".

**Cause:** The GCP project needs an OAuth consent screen for external user authentication.

**Fix:**
1. Go to GCP Console → APIs & Services → OAuth consent screen
2. Choose "External" user type
3. Fill in app name, support email, and authorized domains
4. Add the scopes: `../auth/drive.file`, `../auth/spreadsheets`
5. Add your email as a test user
6. Save and publish (if going to production)

### "Insufficient authentication scopes" when syncing

**Symptom:** Drive/Sheets operations fail with scope-related errors.

**Cause:** The OAuth token was obtained without the required scopes.

**Fix:**
- In Settings → Cloud Sync, disconnect and reconnect the service
- The re-authentication will request the full set of scopes
- Check `src/firebase.ts:73-76` for the scopes configured

### Drive backup shows "folder not found"

**Symptom:** Backup or restore fails with folder missing errors.

**Cause:** The VibeBudget folder was deleted or moved in Google Drive, or the Drive connection configuration is stale.

**Fix:**
- In Settings → Cloud Sync → Drive, click "Disconnect" then reconnect
- This creates a new folder and saves a new folder ID

---

## AI Chat Issues

### "AI API key is not configured"

**Symptom:** AI chat returns `500: AI API key is not configured`.

**Cause:** No API key available on the server or in the request's `aiConfig`.

**Fix:**
- Server-side: Set `GEMINI_API_KEY` in your environment
- Per-user: Save an AI provider config in Settings → AI Chat

**Check:** `src/server/aiChat.ts:422-424` or `api/chat.ts:770-772`.

### "Token UID does not match request UID"

**Symptom:** AI chat returns 403.

**Cause:** The auth token is valid but belongs to a different user than the `uid` in the request body.

**Fix:** This is a client-side bug if it happens in normal usage. Check that the client sends the correct `uid` matching the Firebase ID token.

### "Firestore quota exceeded" / 503

**Symptom:** AI chat returns 503 with "Firestore quota exceeded".

**Cause:** The Firebase project's Firestore read quota is exhausted.

**Fix:**
- Wait for quota reset (usually within a minute for the free tier)
- Reduce how often budget data is loaded for AI chat (increase `AI_CHAT_CACHE_TTL_MS`)
- Consider upgrading the Firebase Blaze plan

### Chat responds without user data

**Symptom:** AI assistant answers but doesn't reference the user's budget data.

**Cause:** The chat request didn't include `uid` and `idToken`, so the server sent a generic system prompt without budget context.

**Fix:** Ensure the client sends `uid` and `idToken` with chat requests. This happens automatically in the app — if it's broken, check that Firebase auth state is valid.

---

## Plaid Setup / Connect / Sync Issues

### "PLAID_ENCRYPTION_PEPPER is not configured"

**Symptom:** Exchange or sync fails with this error.

**Cause:** The server env var `PLAID_ENCRYPTION_PEPPER` is not set.

**Fix:**
- Add `PLAID_ENCRYPTION_PEPPER` to `.env.local` (local dev) or Vercel env vars
- This is any random string — it's used as a server-side secret for AES key derivation

**Check:** `src/server/plaid.ts:77-80`.

### Plaid Link says "Something went wrong"

**Symptom:** Plaid Link opens but errors immediately.

**Cause:** Invalid client ID, secret, or environment mismatch.

**Fix:**
- Verify the client ID and secret match the environment (sandbox secret for sandbox, etc.)
- Check the Plaid Dashboard → Keys for the correct pair
- Sandbox, development, and production have separate secrets

### Plaid Link opens but cannot find institution

**Symptom:** The institution search returns no results or says "not supported".

**Cause:** The Plaid environment doesn't support the institution (especially in development mode).

**Fix:**
- In development, Plaid limits available institutions. Use sandbox for testing.
- For production, complete Plaid's production access verification.

### "ITEM_LOGIN_REQUIRED" during sync

**Symptom:** Sync returns `ITEM_LOGIN_REQUIRED` error.

**Cause:** The bank login credentials expired or the connection requires re-authentication.

**Fix:**
- The user needs to re-authenticate via Plaid Link in update mode
- In the app, this means clicking "Connect a Bank" again with the existing connection

### "PRODUCT_NOT_READY"

**Symptom:** Plaid says the product is not ready for this institution.

**Cause:** The item is still being set up in the Plaid environment, especially in sandbox/development.

**Fix:** Wait a few seconds and retry. If persists, recreate the Plaid item.

---

## Teller Setup / Connect / Sync Issues

### Certificate/key errors

**Symptom:** Teller API returns 403 or connection fails.

**Cause:** The certificate PEM or private key PEM is malformed.

**Fix:**
- Ensure the PEM includes `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----` (or key) headers
- No extra whitespace or line breaks in the middle of base64 content
- Regenerate the certificate/key pair in Teller Dashboard if needed

### Teller Connect doesn't open

**Symptom:** Clicking "Connect a Bank" has no effect.

**Cause:** Missing Application ID, or the Teller Connect library is not loaded.

**Fix:**
- Enter the Application ID from Teller Dashboard
- Check browser console for errors loading Teller's Connect script
- Ensure popups are not blocked

### Enrolled but accounts don't appear

**Symptom:** Teller Connect completed successfully, but no accounts are shown.

**Cause:** Fetching accounts failed silently, or the access token was not saved.

**Fix:**
- Check the browser console and network tab for errors
- Reconnect the bank
- Check Firestore for the TellerConnection document

### "Teller API error (401)" during sync

**Symptom:** Sync returns 401.

**Cause:** The access token is expired or invalid.

**Fix:** Disconnect and reconnect the bank through Teller Connect to get a fresh access token.

---

## Import Duplicate / Warning / Invalid Outcomes

### Imports show all records as "duplicate"

**Symptom:** CSV or Sheets import preview shows every record as `duplicate`.

**Cause:** Import deduplication checks by `source_id` (and other fields). If records were previously imported, they match.

**Fix:**
- This is correct behavior — duplicates are skipped by default
- Use "Include duplicates" in commit options to force re-import
- Or delete existing records before re-importing

### Records marked as "warning"

**Symptom:** Import preview shows records with `warning` status.

**Cause:** Missing optional fields, ambiguous values, or low-confidence data.

**Fix:**
- Review the warning details for each record
- Warnings do not block import — they are informational
- Edit records after import to fix warnings

### Records marked as "invalid"

**Symptom:** Certain records show `invalid` status and cannot be imported.

**Cause:** Missing required fields (date, amount), unparseable values, or data format errors.

**Fix:**
- Check the CSV/Excel format against the expected columns
- Ensure dates are in YYYY-MM-DD format
- Ensure amounts are numeric

---

## Local Dev Server / API Proxy Issues

### Vite proxy: "Cannot GET /api/..."

**Symptom:** API calls from the browser return 404 or connection refused.

**Cause:** The Express API server is not running, or the Vite proxy is misconfigured.

**Fix:**
- Ensure `npm run dev` (which starts both API and Vite) is running
- The Vite proxy at `vite.config.mjs:61-65` forwards `/api` requests to `http://localhost:3000`
- Check that the API server started on port 3000 (look for "Server running on http://localhost:3000")

### Port 3000 already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Cause:** Another process is using port 3000.

**Fix:**
```bash
# Find the process
lsof -i :3000
# Kill it
kill -9 <PID>
```

### API works but Vite dev server doesn't

**Symptom:** Can reach `localhost:3000` but not `localhost:8888` or Vite doesn't serve the app.

**Cause:** Vite failed to start or the port is occupied.

**Fix:**
- Check for errors in the Vite output (cyan colored process in `npm run dev`)
- Try a different port via `npm run dev:vite -- --port 8889`

### SQLite database locked

**Symptom:** Local API returns errors about database being locked.

**Cause:** Multiple processes or the WAL file is corrupted.

**Fix:**
- Delete `vibebudget.db-shm` and `vibebudget.db-wal` files
- Ensure only one instance of the API server is running
- The server uses `busy_timeout = 5000` to handle concurrent access

---

## Vercel Deployment / Env Var Issues

### Build fails: "Missing environment variable"

**Symptom:** Vercel build fails or the deployed app shows Firebase config errors.

**Cause:** Required `VITE_FIREBASE_*` env vars are not set in Vercel's environment.

**Fix:**
1. Go to Vercel → Project → Settings → Environment Variables
2. Add all six `VITE_FIREBASE_*` variables
3. Add `FIREBASE_DATA_NAMESPACE` and `VITE_FIREBASE_DATA_NAMESPACE`
4. Re-deploy

**Check:** `src/firebase.ts:14-24` — missing vars throw at import time.

### Deployed app shows white screen

**Symptom:** The production URL shows a blank page or a JavaScript error.

**Cause:** Build error, missing env vars, or incompatible module format.

**Fix:**
- Check Vercel deployment logs for build errors
- Verify all env vars are set (including `VITE_` prefix)
- Run `npm run build` locally to check for build errors

### Serverless function timeout

**Symptom:** AI chat or bank feed sync endpoints return 504 after 10+ seconds.

**Cause:** Serverless function execution exceeds the Vercel free tier timeout (10s for Hobby plan).

**Fix:**
- The AI chat cache (`AI_CHAT_CACHE_TTL_MS`) reduces repeated Firestore reads
- Plaid/Teller sync operations may time out with many transactions
- Upgrade to Vercel Pro for longer function execution limits

---

## PWA / Cache Stale Build Issues

### App doesn't reflect latest deploy

**Symptom:** After deploying a new version, the browser still shows the old UI.

**Cause:** Service worker cache is serving the previous build.

**Fix:**
1. Hard reload (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows/Linux)
2. Or: Open DevTools → Application → Service Workers → Unregister → Reload
3. Or: Clear site data and reload

### "A new version is available" but nothing changes

**Symptom:** The app shows an update prompt but doesn't update after accepting.

**Cause:** Service worker `skipWaiting` + `clientsClaim` should handle this, but browser caching may interfere.

**Fix:**
- Close all tabs of the app and reopen
- The service worker (configured in `vite.config.mjs:14-48`) updates on next navigation after activation

### Offline mode not working

**Symptom:** The app doesn't work offline even though it's a PWA.

**Cause:** Firestore persistence handles some offline cases, but the PWA service worker's network-first strategy means API calls fail without connectivity.

**Fix:**
- This is expected behavior for the current PWA configuration
- Firestore local persistence (`enableIndexedDbPersistence` in `src/firebase.ts:58-68`) caches data but API proxy calls to the Express server require connectivity
- For true offline use, the app would need a local-first data path (future improvement)

---

## Quick Reference: Where to Check

| Issue | Check First | Second |
|---|---|---|
| Google sign-in | Firebase Console → Auth → Authorized domains | Browser console for error codes |
| Firebase env errors | `.env.local` or Vercel env vars | `src/firebase.ts` validation |
| Firestore permissions | Deployed `firestore.rules` | Firestore Console → Rules tab |
| Data not visible | Namespace: check `VITE_FIREBASE_DATA_NAMESPACE` | Firestore Console → data path |
| Service account | GCP IAM → Service Accounts → keys | Vercel env vars |
| AI chat fails | `GEMINI_API_KEY` env var | Settings → AI Chat per-user config |
| Drive/Sheets fails | GCP → APIs & Services → Enabled APIs | OAuth consent screen status |
| Plaid fails | `PLAID_ENCRYPTION_PEPPER` env var | Plaid Dashboard → Keys |
| Teller fails | Certificate PEM format | Teller Dashboard → Certificates |
| Build/deploy fails | Vercel deploy logs | Local `npm run build` |
| Import issues | CSV/Sheet column headers | `ImportBatch` warning messages |
| Stale UI | Hard reload | Unregister service worker |
