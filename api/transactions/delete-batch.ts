import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const getBearerToken = (req: VercelRequest) => {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase credentials not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array." });
  }

  const normalizedIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return res.status(400).json({ error: "ids must include at least one valid id." });
  }

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
    if (authError || !user) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }

    const now = new Date().toISOString();
    await Promise.all(normalizedIds.map((id) =>
      supabaseAdmin.from("transactions").update({ deleted: true, updated_at: now }).eq("id", id).eq("user_id", user.id)
    ));
    return res.json({ success: true, deleted: normalizedIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete duplicate transactions.";
    return res.status(500).json({ error: message });
  }
}
