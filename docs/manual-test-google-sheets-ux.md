# Manual Test: Google Sheets UX + Flow Improvements

## Prerequisites
- App running locally (`npm run dev`)
- Authenticated Google account with a Google Sheet containing:
  - An "Expenses" tab with columns: Date, Vendor, Amount, Category, Notes
  - An "Income" tab with columns: Date, Source, Amount, Category, Notes

## Test 1: Connect → Map → Save → Pull (happy path)

### Step 1: Connect
1. Open Settings → **3. Google Workspace**
2. Click **Authorize Google** → complete OAuth flow
3. Paste your sheet URL into the input
4. Click **Verify**
5. **Expected:** Verified title + tab count shown below input. No error messages.

### Step 2: Map Columns
1. The **Map Columns** section appears with tab bar (Expenses / Income / Expense Categories / Income Categories)
2. Each tab shows field inputs for Date, Vendor, Amount, Category, Notes
3. Configure cell ranges for each field (defaults should be pre-filled)
4. Click **Save Mapping**
5. **Expected:** "Mapping saved at <time>" message appears. "Update Mapping" button replaces "Save Mapping".

### Step 3: Pull Data
1. The **Pull Data** section should now be visible
2. Verify the mode selector shows **Incremental** (default) and **Re-import All**
3. Click **Pull Now**
4. **Expected:**
   - Button changes to "Pulling Data..." (disabled during sync)
   - Summary card appears with: Fetched, Imported, Duplicates Skipped, Invalid Skipped, Net New
   - Success status message shows counts

## Test 2: Pull button gating

### Gating test 1: No config
1. Disconnect Google → reconnect without verifying a sheet
2. **Expected:** Step 2 (Map Columns) and Step 3 (Pull Data) sections are hidden
3. Only Step 1 (Connect Google Sheets) is visible

### Gating test 2: Mapping not saved
1. Connect and verify a sheet
2. Do NOT click Save Mapping
3. **Expected:** Step 2 shows mapping form but Step 3 (Pull Data) is hidden

### Gating test 3: During sync
1. Complete mapping save
2. Click Pull Now while sync is in progress
3. **Expected:** Pull Now button is disabled, shows "Pulling Data..."

## Test 3: Pull modes

### Incremental (default)
1. Complete connect → map → save flow
2. Click **Pull Now** with Incremental selected
3. **Expected:** Only new rows (after the cursor) are imported
4. Run Pull Now again immediately
5. **Expected:** "fetched" count may be 0 if no new rows. Summary shows 0 imported.

### Re-import All
1. Switch mode to **Re-import All**
2. Click **Pull Now**
3. **Expected:** All mapped rows are processed. Duplicates are still skipped.
4. Summary shows accurate counts.

## Test 4: Error states

### Invalid URL
1. Paste an invalid URL like "not-a-url"
2. Click Verify
3. **Expected:** Error message about invalid URL

### Auth expired
1. Revoke Google access from Google Account settings
2. Try to pull
3. **Expected:** Error message about session expired

## Test 5: Push to Sheet
1. After mapping is saved and pull is complete
2. Click **Push App Data to Sheet**
3. **Expected:** Data from the app is written to the Google Sheet

## Test 6: Regression — CSV/Excel/JSON import still works
1. Go to Settings → **1. ImpEx**
2. Import a CSV file
3. **Expected:** Import still works as before

## Test 7: Stage indicator
- Verify the colored status strip at the top of Google Workspace section
- States should transition: Disconnected → Connected → Mapped → Ready to Pull → Complete
