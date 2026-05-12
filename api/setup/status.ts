import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const supabaseConfigured = !!(
    process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
  );
  const geminiConfigured = !!process.env.GEMINI_API_KEY;

  res.json({
    mode: supabaseConfigured ? "hosted" : "local",
    app: {
      nodeEnv: process.env.NODE_ENV || "development",
    },
    supabase: {
      configured: supabaseConfigured,
      hasUrl: !!process.env.VITE_SUPABASE_URL,
      hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    selfHost: {
      ownerExists: false,
      secretsConfigured: supabaseConfigured || geminiConfigured,
    },
    ai: {
      serverKeyConfigured: geminiConfigured,
      modelConfigured: !!process.env.GEMINI_MODEL,
      model: process.env.GEMINI_MODEL || null,
    },
    features: {
      supabaseAuth: supabaseConfigured,
      aiChat: geminiConfigured,
      selfHostedSetup: false,
      ownerClaim: false,
    },
  });
}
