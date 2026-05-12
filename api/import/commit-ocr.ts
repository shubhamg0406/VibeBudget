import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type CommitMode = "individual" | "category";

interface CommitRow {
  date?: string;
  merchant?: string;
  category?: string;
  notes?: string;
  amount?: number;
  amount_formula?: string;
}

const getBearerToken = (req: VercelRequest) => {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase URL and service role key are required.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const normalizeRows = (rows: unknown[]): CommitRow[] => rows
  .map((row) => (row && typeof row === "object" ? row as CommitRow : null))
  .filter(Boolean)
  .map((row) => ({
    date: String(row?.date || "").trim(),
    merchant: String(row?.merchant || "").trim(),
    category: String(row?.category || "Misc.").trim() || "Misc.",
    notes: String(row?.notes || "").trim(),
    amount: Number(row?.amount || 0),
  }))
  .filter((row) => row.date && row.merchant && Number.isFinite(row.amount) && row.amount > 0);

const toCategoryRows = (rows: CommitRow[]): CommitRow[] => {
  const grouped = new Map<string, CommitRow[]>();
  rows.forEach((row) => {
    const key = [row.date, row.merchant, row.category].join("|").toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });

  const consolidated: CommitRow[] = [];
  grouped.forEach((items) => {
    const first = items[0];
    const amounts = items.map((item) => Number(item.amount || 0));
    const amount = amounts.reduce((sum, a) => sum + a, 0);
    const amountFormula = "=" + amounts.map((a) => a.toFixed(2)).join("+");
    const notes = items.map((item) => item.notes).filter(Boolean).join("; ");
    consolidated.push({
      date: first.date,
      merchant: first.merchant,
      category: first.category,
      notes,
      amount: Number(amount.toFixed(2)),
      amount_formula: amountFormula,
    });
  });
  return consolidated;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const mode = (req.body?.mode || "individual") as CommitMode;
  if (mode !== "individual" && mode !== "category") {
    return res.status(400).json({ error: "mode must be `individual` or `category`." });
  }
  const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rawRows.length === 0) return res.status(400).json({ error: "rows must be a non-empty array." });

  const bearerToken = getBearerToken(req);
  if (!bearerToken) return res.status(401).json({ error: "Missing authorization token." });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !user) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }

    const uid = user.id;
    const normalized = normalizeRows(rawRows);
    if (normalized.length === 0) return res.status(400).json({ error: "No valid rows to commit." });
    const commitRows = mode === "category" ? toCategoryRows(normalized) : normalized;
    const now = new Date().toISOString();

    for (const row of commitRows) {
      const categoryName = row.category || "Misc.";
      const categoryId = `ocr-cat-${hashString(categoryName.toLowerCase())}`;
      const { error: catError } = await supabaseAdmin.from("categories").upsert({
        id: categoryId,
        user_id: uid,
        name: categoryName,
        target_amount: 0,
        deleted: false,
        updated_at: now,
      });
      if (catError) throw catError;

      const identity = `${row.date}|${row.merchant}|${row.category}|${row.amount}|${row.notes}|${now}`;
      const txnId = `document_ocr-expense-${hashString(identity)}`;
      const { error: txError } = await supabaseAdmin.from("transactions").upsert({
        id: txnId,
        user_id: uid,
        date: row.date || now.slice(0, 10),
        vendor: row.merchant || "Imported expense",
        amount: Number(row.amount || 0),
        ...(row.amount_formula ? { amount_formula: row.amount_formula } : {}),
        category_id: categoryId,
        category_name: categoryName,
        notes: row.notes || "",
        import_source: "document_ocr",
        source_id: `ocr-${hashString(identity)}`,
        import_batch_id: `ocr-commit-${hashString(now)}`,
        raw_description: row.notes || "",
        status: "posted",
        updated_at: now,
      });
      if (txError) throw txError;
    }

    return res.json({
      success: true,
      mode,
      imported: commitRows.length,
      uid,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to commit OCR rows.";
    return res.status(500).json({ error: message });
  }
}
