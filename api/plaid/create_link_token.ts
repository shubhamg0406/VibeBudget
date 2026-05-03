import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLinkToken } from "../../src/server/plaid";
import type { PlaidEnv } from "../../src/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { clientId, secret, environment, userId } = req.body || {};

  if (!clientId || typeof clientId !== "string") {
    return res.status(400).json({ error: "clientId is required." });
  }
  if (!secret || typeof secret !== "string") {
    return res.status(400).json({ error: "secret is required." });
  }
  if (!environment || !["sandbox", "development", "production"].includes(environment)) {
    return res.status(400).json({ error: "environment must be sandbox, development, or production." });
  }
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required." });
  }

  try {
    const result = await createLinkToken({
      clientId,
      secret,
      environment: environment as PlaidEnv,
      userId,
    });

    return res.json({ link_token: result.linkToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create link token.";
    console.error("Plaid create_link_token error:", message);
    return res.status(500).json({ error: message });
  }
}
