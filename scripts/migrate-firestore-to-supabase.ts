import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MigrationCounts {
  transactions: number;
  income: number;
  categories: number;
  incomeCategories: number;
  recurring_rules: number;
}

function warn(msg: string) {
  console.warn(`[migrate] WARN: ${msg}`);
}

function info(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function error(msg: string) {
  console.error(`[migrate] ERROR: ${msg}`);
}

function getEnvOrThrow(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`${key} is required but not set.`);
  }
  return val;
}

function epochMsToISO(epochMs: number | undefined | null): string | null {
  if (epochMs == null) return null;
  if (typeof epochMs !== "number") return null;
  return new Date(epochMs).toISOString();
}

async function loadFirebaseAdmin() {
  const adminAppModule = await import("firebase-admin/app");
  const adminFirestoreModule = await import("firebase-admin/firestore");
  return { adminAppModule, adminFirestoreModule };
}

async function main() {
  const dryRun = process.env.DRY_RUN === "true";
  const namespace = process.env.FIREBASE_DATA_NAMESPACE || "prod";

  if (dryRun) {
    info("DRY RUN mode enabled. No data will be inserted.");
  }

  const supabaseUrl = getEnvOrThrow("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const { adminAppModule, adminFirestoreModule } = await loadFirebaseAdmin();
  const { getApps, initializeApp, cert } = adminAppModule;

  const serviceAccountJson = getEnvOrThrow("FIREBASE_ADMIN_CREDENTIALS_JSON");
  const parsed = JSON.parse(serviceAccountJson);

  if (getApps().length === 0) {
    initializeApp({ credential: cert(parsed) });
  }

  const db = adminFirestoreModule.getFirestore();
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const usersSnap = await db.collection(`environments/${namespace}/users`).get();
  const totalUsers = usersSnap.size;
  info(`Found ${totalUsers} users in namespace "${namespace}"`);

  if (totalUsers === 0) {
    info("No users to migrate. Exiting.");
    process.exit(0);
  }

  let globalSuccess = true;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();

    try {
      const counts: MigrationCounts = {
        transactions: 0,
        income: 0,
        categories: 0,
        incomeCategories: 0,
        recurring_rules: 0,
      };

      // Insert user row
      const userRow = {
        id: uid,
        budget_id: userData.budgetId || "",
        email: userData.email || null,
        display_name: userData.displayName || null,
        photo_url: userData.photoURL || null,
        preferences: userData.preferences ?? null,
        google_sheets_config: userData.googleSheetsConfig ?? null,
        drive_connection: userData.driveConnection ?? null,
        plaid_connection: userData.plaidConnection ?? null,
        plaid_category_mappings: userData.plaidCategoryMappings ?? null,
        teller_connection: userData.tellerConnection ?? null,
        teller_category_mappings: userData.tellerCategoryMappings ?? null,
        ai_config: userData.aiConfig ?? null,
        last_synced_at: userData.lastSyncedAt
          ? typeof userData.lastSyncedAt === "number"
            ? new Date(userData.lastSyncedAt).toISOString()
            : userData.lastSyncedAt
          : null,
        updated_at: epochMsToISO(userData.updatedAt),
      };

      if (!dryRun) {
        const { error: userErr } = await supabase.from("users").upsert(userRow, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
        if (userErr) {
          error(`[${uid}] Failed to upsert user: ${userErr.message}`);
          globalSuccess = false;
          continue;
        }
      }

      // Categories
      const categoriesSnap = await db
        .collection(`environments/${namespace}/users/${uid}/categories`)
        .get();
      if (!categoriesSnap.empty) {
        const rows = categoriesSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            user_id: uid,
            name: d.name || "",
            target_amount: d.target_amount ?? 0,
            deleted: d.deleted ?? false,
            updated_at: epochMsToISO(d.updatedAt),
          };
        });
        counts.categories = rows.length;
        if (!dryRun && rows.length > 0) {
          const { error: err } = await supabase.from("categories").upsert(rows, {
            onConflict: "id,user_id",
            ignoreDuplicates: false,
          });
          if (err) error(`[${uid}] Failed to upsert categories: ${err.message}`);
        }
      }

      // Income categories
      const incomeCategoriesSnap = await db
        .collection(`environments/${namespace}/users/${uid}/incomeCategories`)
        .get();
      if (!incomeCategoriesSnap.empty) {
        const rows = incomeCategoriesSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            user_id: uid,
            name: d.name || "",
            target_amount: d.target_amount ?? 0,
            deleted: d.deleted ?? false,
            updated_at: epochMsToISO(d.updatedAt),
          };
        });
        counts.incomeCategories = rows.length;
        if (!dryRun && rows.length > 0) {
          const { error: err } = await supabase.from("income_categories").upsert(rows, {
            onConflict: "id,user_id",
            ignoreDuplicates: false,
          });
          if (err) error(`[${uid}] Failed to upsert income categories: ${err.message}`);
        }
      }

      // Transactions
      const transactionsSnap = await db
        .collection(`environments/${namespace}/users/${uid}/transactions`)
        .get();
      if (!transactionsSnap.empty) {
        const rows = transactionsSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            user_id: uid,
            date: d.date || "",
            vendor: d.vendor || "",
            amount: d.amount ?? 0,
            amount_formula: d.amount_formula ?? null,
            currency: d.currency ?? null,
            category_id: d.category_id || "",
            category_name: d.category_name || "",
            notes: d.notes || "",
            import_source: d.import_source ?? null,
            source_id: d.source_id ?? null,
            import_batch_id: d.import_batch_id ?? null,
            raw_description: d.raw_description ?? null,
            status: d.status ?? null,
            recurring_rule_id: d.recurring_rule_id ?? null,
            is_recurring_instance: d.is_recurring_instance ?? false,
            deleted: d.deleted ?? false,
            updated_at: epochMsToISO(d.updatedAt),
          };
        });
        counts.transactions = rows.length;
        if (!dryRun && rows.length > 0) {
          const { error: err } = await supabase.from("transactions").upsert(rows, {
            onConflict: "id,user_id",
            ignoreDuplicates: false,
          });
          if (err) error(`[${uid}] Failed to upsert transactions: ${err.message}`);
        }
      }

      // Income
      const incomeSnap = await db
        .collection(`environments/${namespace}/users/${uid}/income`)
        .get();
      if (!incomeSnap.empty) {
        const rows = incomeSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            user_id: uid,
            date: d.date || "",
            source: d.source || "",
            amount: d.amount ?? 0,
            currency: d.currency ?? null,
            category_id: d.category_id ?? null,
            category: d.category || "",
            notes: d.notes ?? null,
            import_source: d.import_source ?? null,
            source_id: d.source_id ?? null,
            import_batch_id: d.import_batch_id ?? null,
            raw_description: d.raw_description ?? null,
            status: d.status ?? null,
            recurring_rule_id: d.recurring_rule_id ?? null,
            is_recurring_instance: d.is_recurring_instance ?? false,
            deleted: d.deleted ?? false,
            updated_at: epochMsToISO(d.updatedAt),
          };
        });
        counts.income = rows.length;
        if (!dryRun && rows.length > 0) {
          const { error: err } = await supabase.from("income").upsert(rows, {
            onConflict: "id,user_id",
            ignoreDuplicates: false,
          });
          if (err) error(`[${uid}] Failed to upsert income: ${err.message}`);
        }
      }

      // Recurring rules
      const recurringSnap = await db
        .collection(`environments/${namespace}/users/${uid}/recurring_rules`)
        .get();
      if (!recurringSnap.empty) {
        const rows = recurringSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            user_id: uid,
            type: d.type || "expense",
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
            frequency: d.frequency || "monthly",
            start_date: d.start_date || "",
            end_date: d.end_date ?? null,
            last_generated_month: d.last_generated_month || "",
            is_active: d.is_active ?? true,
            deleted: d.deleted ?? false,
            updated_at: epochMsToISO(d.updatedAt),
          };
        });
        counts.recurring_rules = rows.length;
        if (!dryRun && rows.length > 0) {
          const { error: err } = await supabase.from("recurring_rules").upsert(rows, {
            onConflict: "id,user_id",
            ignoreDuplicates: false,
          });
          if (err) error(`[${uid}] Failed to upsert recurring rules: ${err.message}`);
        }
      }

      info(
        `[${uid}] transactions: ${counts.transactions}, income: ${counts.income}, categories: ${counts.categories}, incomeCategories: ${counts.incomeCategories}, recurring_rules: ${counts.recurring_rules}`
      );
    } catch (err) {
      error(`[${uid}] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      globalSuccess = false;
    }
  }

  if (dryRun) {
    info("DRY RUN complete. No data was inserted.");
  }

  process.exit(globalSuccess ? 0 : 1);
}

main().catch((err) => {
  error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
