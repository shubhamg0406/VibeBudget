import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Vercel serverless handler for /api/setup/status
 *
 * Public-safe diagnostics endpoint.
 * Returns config presence booleans only — never secret values.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const hasEnvFirebase = !!(
    process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_AUTH_DOMAIN
  );
  const adminConfigured = !!process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const namespace =
    process.env.VITE_FIREBASE_DATA_NAMESPACE ||
    process.env.FIREBASE_DATA_NAMESPACE ||
    "unknown";
  const isProd =
    process.env.NODE_ENV === "production" && namespace === "prod";

  res.json({
    mode: isProd ? "hosted" : hasEnvFirebase ? "self-hosted" : "local",
    app: {
      nodeEnv: process.env.NODE_ENV || "development",
      namespace,
    },
    firebase: {
      configured: hasEnvFirebase,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
    },
    firebaseAdmin: {
      configured: adminConfigured,
    },
    ai: {
      serverKeyConfigured: geminiConfigured,
    },
    features: {
      firebaseAuth: hasEnvFirebase,
      firebaseAdmin: adminConfigured,
      aiChat: geminiConfigured,
    },
  });
}
