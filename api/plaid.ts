import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  exchangePublicToken,
  syncTransactions,
  getAccounts,
  encryptAccessToken,
  decryptAccessToken,
} from "../src/server/plaid";
import type { PlaidEnv } from "../src/types";

/**
 * Vercel serverless handler for Plaid API routes.
 *
 * POST /api/plaid
 * Body: { action, ...params }
 *
 * Actions:
 *   - "exchange": Exchange public_token for encrypted access_token
 *   - "transactions": Fetch transactions via Plaid Transactions Sync
 *   - "accounts": Fetch linked accounts and balances
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { action } = req.body || {};

  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "`action` is required (exchange, transactions, accounts)." });
  }

  try {
    switch (action) {
      case "exchange": {
        const { publicToken, clientId, secret, environment, uid } = req.body;

        if (!publicToken || typeof publicToken !== "string") {
          return res.status(400).json({ error: "publicToken is required." });
        }
        if (!clientId || typeof clientId !== "string") {
          return res.status(400).json({ error: "clientId is required." });
        }
        if (!secret || typeof secret !== "string") {
          return res.status(400).json({ error: "secret is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!uid || typeof uid !== "string") {
          return res.status(400).json({ error: "uid is required." });
        }

        const result = await exchangePublicToken({
          publicToken,
          clientId,
          secret,
          environment: environment as PlaidEnv,
        });

        const encryptedAccessToken = encryptAccessToken(result.accessToken, uid);

        return res.json({
          encryptedAccessToken,
          itemId: result.itemId,
          institutionName: result.institutionName,
          institutionId: result.institutionId,
        });
      }

      case "transactions": {
        const { encryptedAccessToken, clientId, secret, environment, uid, cursor } = req.body;

        if (!encryptedAccessToken || typeof encryptedAccessToken !== "string") {
          return res.status(400).json({ error: "encryptedAccessToken is required." });
        }
        if (!clientId || typeof clientId !== "string") {
          return res.status(400).json({ error: "clientId is required." });
        }
        if (!secret || typeof secret !== "string") {
          return res.status(400).json({ error: "secret is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!uid || typeof uid !== "string") {
          return res.status(400).json({ error: "uid is required." });
        }

        const accessToken = decryptAccessToken(encryptedAccessToken, uid);

        const txResult = await syncTransactions({
          accessToken,
          clientId,
          secret,
          environment: environment as PlaidEnv,
          cursor: cursor || undefined,
        });

        return res.json(txResult);
      }

      case "accounts": {
        const { encryptedAccessToken, clientId, secret, environment, uid } = req.body;

        if (!encryptedAccessToken || typeof encryptedAccessToken !== "string") {
          return res.status(400).json({ error: "encryptedAccessToken is required." });
        }
        if (!clientId || typeof clientId !== "string") {
          return res.status(400).json({ error: "clientId is required." });
        }
        if (!secret || typeof secret !== "string") {
          return res.status(400).json({ error: "secret is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!uid || typeof uid !== "string") {
          return res.status(400).json({ error: "uid is required." });
        }

        const accessToken = decryptAccessToken(encryptedAccessToken, uid);

        const acctResult = await getAccounts({
          accessToken,
          clientId,
          secret,
          environment: environment as PlaidEnv,
        });

        return res.json(acctResult);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Use exchange, transactions, or accounts.` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plaid request failed.";
    console.error("Plaid API error:", message);
    return res.status(500).json({ error: message });
  }
}
