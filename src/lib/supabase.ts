import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabaseTypes";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient<Database> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  client = createClient<Database>(supabaseUrl, supabaseAnonKey);
} else {
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. Supabase client will not be available until Phase 2 setup."
  );
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  return client;
}

export function getSupabaseServerClient(
  serviceRoleKey: string
): SupabaseClient<Database> {
  const url = supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "VITE_SUPABASE_URL is required to create a server-side Supabase client."
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// The @supabase/postgrest-js GenericSchema constraint check (conditional type
// in SupabaseClient) sometimes fails with complex Database types. Using the
// unparameterized SupabaseClient gives any-typed queries which is equivalent
// to runtime behavior (the actual PostgREST API is schema-validated server-side).
export const supabase = client as unknown as SupabaseClient;
