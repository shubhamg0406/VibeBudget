/**
 * One-time migration: Firestore → Supabase
 *
 * Run AFTER:
 *   1. App is deployed with Supabase
 *   2. You have signed in at least once via Supabase (so your Supabase UUID exists)
 *
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/migrate-firestore-to-supabase.ts
 *   npx ts-node scripts/migrate-firestore-to-supabase.ts
 *
 * Required env vars:
 *   FIREBASE_ADMIN_CREDENTIALS_JSON  — Firebase service account JSON
 *   VITE_SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY        — Supabase service role key
 *   FIREBASE_DATA_NAMESPACE          — Firestore namespace (default: "prod")
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.env.DRY_RUN === "true";
const NAMESPACE = process.env.FIREBASE_DATA_NAMESPACE || "prod";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function initFirebase() {
  const credJson = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!credJson) {
    console.error("Missing FIREBASE_ADMIN_CREDENTIALS_JSON");
    process.exit(1);
  }
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (getApps().length === 0) {
    // Strip surrounding single/double quotes added by some dotenv parsers
    const cleaned = credJson.trim().replace(/^['"]|['"]$/g, "");
    initializeApp({ credential: cert(JSON.parse(cleaned)) });
  }
  return getFirestore();
}

async function getSupabaseUidByEmail(email: string): Promise<string | null> {
  // List users and find by email — works for small user counts
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("Failed to list Supabase users:", error.message);
    return null;
  }
  const match = data.users.find((u) => u.email === email);
  return match?.id ?? null;
}

async function migrateUser(
  db: FirebaseFirestore.Firestore,
  firebaseUid: string
) {
  const userDocRef = db
    .collection("environments")
    .doc(NAMESPACE)
    .collection("users")
    .doc(firebaseUid);

  const userDoc = await userDocRef.get();
  if (!userDoc.exists) {
    console.log(`[${firebaseUid}] No Firestore profile — skipping`);
    return;
  }

  const profile = userDoc.data()!;
  const email: string = profile.email || "";

  // Resolve Supabase UUID by email (user must have signed in first)
  const supabaseUid = await getSupabaseUidByEmail(email);
  if (!supabaseUid) {
    console.warn(
      `[${firebaseUid}] No Supabase user found for email "${email}". ` +
        `Sign in to the app first, then re-run migration.`
    );
    return;
  }

  console.log(`[${firebaseUid}] → Supabase UID: ${supabaseUid} (${email})`);

  // ── Users row ──────────────────────────────────────────────────────────
  const userRow = {
    id: supabaseUid,
    budget_id: supabaseUid,
    email,
    display_name: profile.displayName ?? null,
    photo_url: profile.photoURL ?? null,
    preferences: profile.preferences ?? {},
    google_sheets_config: profile.googleSheetsConfig ?? null,
    drive_connection: profile.driveConnection ?? null,
    plaid_connection: profile.plaidConnection ?? null,
    plaid_category_mappings: profile.plaidCategoryMappings ?? null,
    teller_connection: profile.tellerConnection ?? null,
    teller_category_mappings: profile.tellerCategoryMappings ?? null,
    ai_config: profile.aiConfig ?? null,
    last_synced_at: profile.lastSyncedAt ?? null,
  };

  if (!DRY_RUN) {
    const { error } = await supabase.from("users").upsert(userRow);
    if (error) {
      console.error(`[${firebaseUid}] users upsert failed:`, error.message);
      return;
    }
  }

  // ── Helper: migrate a subcollection ───────────────────────────────────
  async function migrateCollection(
    collectionName: string,
    table: string,
    transform: (doc: FirebaseFirestore.DocumentData, id: string) => Record<string, unknown>
  ) {
    const snapshot = await userDocRef.collection(collectionName).get();
    const rows = snapshot.docs.map((d) => transform(d.data(), d.id));

    console.log(`  ${collectionName}: ${rows.length} records`);

    if (!DRY_RUN && rows.length > 0) {
      // Insert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) {
          console.error(`  ${table} upsert failed:`, error.message);
        }
      }
    }
  }

  const toIso = (v: unknown): string =>
    typeof v === "number"
      ? new Date(v).toISOString()
      : typeof v === "string" && v
      ? v
      : new Date().toISOString();

  // ── Expense categories ─────────────────────────────────────────────────
  await migrateCollection("categories", "categories", (d, id) => ({
    id: d.id ?? id,
    user_id: supabaseUid,
    name: d.name ?? "",
    target_amount: d.target_amount ?? 0,
    deleted: d.deleted ?? false,
    updated_at: toIso(d.updatedAt),
  }));

  // ── Income categories ──────────────────────────────────────────────────
  await migrateCollection("incomeCategories", "income_categories", (d, id) => ({
    id: d.id ?? id,
    user_id: supabaseUid,
    name: d.name ?? "",
    target_amount: d.target_amount ?? 0,
    deleted: d.deleted ?? false,
    updated_at: toIso(d.updatedAt),
  }));

  // ── Transactions ───────────────────────────────────────────────────────
  await migrateCollection("transactions", "transactions", (d, id) => ({
    id: d.id ?? id,
    user_id: supabaseUid,
    date: d.date ?? "",
    vendor: d.vendor ?? "",
    amount: d.amount ?? 0,
    amount_formula: d.amount_formula ?? null,
    currency: d.currency ?? null,
    category_id: d.category_id ?? "",
    category_name: d.category_name ?? "",
    notes: d.notes ?? "",
    import_source: d.import_source ?? null,
    source_id: d.source_id ?? null,
    import_batch_id: d.import_batch_id ?? null,
    raw_description: d.raw_description ?? null,
    status: d.status ?? null,
    recurring_rule_id: d.recurring_rule_id ?? null,
    is_recurring_instance: d.is_recurring_instance ?? false,
    deleted: d.deleted ?? false,
    updated_at: toIso(d.updatedAt),
  }));

  // ── Income ─────────────────────────────────────────────────────────────
  await migrateCollection("income", "income", (d, id) => ({
    id: d.id ?? id,
    user_id: supabaseUid,
    date: d.date ?? "",
    source: d.source ?? "",
    amount: d.amount ?? 0,
    currency: d.currency ?? null,
    category_id: d.category_id ?? null,
    category: d.category ?? "",
    notes: d.notes ?? null,
    import_source: d.import_source ?? null,
    source_id: d.source_id ?? null,
    import_batch_id: d.import_batch_id ?? null,
    raw_description: d.raw_description ?? null,
    status: d.status ?? null,
    recurring_rule_id: d.recurring_rule_id ?? null,
    is_recurring_instance: d.is_recurring_instance ?? false,
    deleted: d.deleted ?? false,
    updated_at: toIso(d.updated_at ?? d.updatedAt),
  }));

  // ── Recurring rules ────────────────────────────────────────────────────
  await migrateCollection("recurring_rules", "recurring_rules", (d, id) => ({
    id: d.id ?? id,
    user_id: supabaseUid,
    type: d.type ?? "expense",
    amount: d.amount ?? 0,
    vendor: d.vendor ?? null,
    source: d.source ?? null,
    category_id: d.category_id ?? null,
    category_name: d.category_name ?? null,
    category: d.category ?? null,
    notes: d.notes ?? null,
    original_currency: d.original_currency ?? null,
    original_amount: d.original_amount ?? null,
    day_of_month: d.day_of_month ?? 1,
    frequency: d.frequency ?? "monthly",
    start_date: d.start_date ?? "",
    end_date: d.end_date ?? null,
    last_generated_month: d.last_generated_month ?? "",
    is_active: d.is_active ?? true,
    deleted: d.deleted ?? false,
    created_at: toIso(d.created_at),
    updated_at: toIso(d.updated_at),
  }));
}

async function main() {
  console.log(`\nFirestore → Supabase migration`);
  console.log(`Namespace: ${NAMESPACE}`);
  console.log(`Dry run: ${DRY_RUN}\n`);

  const db = await initFirebase();

  const usersSnap = await db
    .collection("environments")
    .doc(NAMESPACE)
    .collection("users")
    .listDocuments();

  console.log(`Found ${usersSnap.length} user(s) in Firestore\n`);

  for (const userRef of usersSnap) {
    await migrateUser(db, userRef.id);
  }

  console.log("\nMigration complete.");
  if (DRY_RUN) console.log("DRY RUN — nothing was written to Supabase.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
