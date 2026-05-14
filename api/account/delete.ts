import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const getBearerToken = (req: VercelRequest) => {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim() || null;
};

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase credentials not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed." });
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

    // Delete public.users row — cascades to all child tables (transactions, income, categories, etc.)
    await supabaseAdmin.from("users").delete().eq("id", user.id);

    // Delete the auth user — removes credentials so same email = fresh account on next sign-in
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) {
      return res.status(500).json({ error: "Failed to delete auth account: " + deleteAuthError.message });
    }

    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete account.";
    return res.status(500).json({ error: message });
  }
}
