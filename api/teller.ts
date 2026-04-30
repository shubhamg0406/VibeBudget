import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getAccounts,
  getTransactions,
  getAccountDetails,
  getAccountBalances,
} from "../src/server/teller";
import type { TellerEnv } from "../src/types";

/**
 * Vercel serverless handler for Teller API routes.
 *
 * POST /api/teller
 * Body: { action, ...params }
 *
 * Actions:
 *   - "accounts": Fetch all accounts for an enrollment
 *   - "transactions": Fetch transactions for a specific account
 *   - "sync-all": Fetch transactions from all accounts
 *   - "details": Fetch account details
 *   - "balances": Fetch account balances
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { action } = req.body || {};

  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "`action` is required (accounts, transactions, sync-all, details, balances)." });
  }

  try {
    switch (action) {
      case "accounts": {
        const { accessToken, certificate, privateKey, environment } = req.body;

        if (!accessToken || typeof accessToken !== "string") {
          return res.status(400).json({ error: "accessToken is required." });
        }
        if (!certificate || typeof certificate !== "string") {
          return res.status(400).json({ error: "certificate is required." });
        }
        if (!privateKey || typeof privateKey !== "string") {
          return res.status(400).json({ error: "privateKey is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }

        const result = await getAccounts({
          accessToken,
          certificate,
          privateKey,
          environment: environment as TellerEnv,
        });

        return res.json(result);
      }

      case "transactions": {
        const { accessToken, certificate, privateKey, environment, accountId, accountName, count } = req.body;

        if (!accessToken || typeof accessToken !== "string") {
          return res.status(400).json({ error: "accessToken is required." });
        }
        if (!certificate || typeof certificate !== "string") {
          return res.status(400).json({ error: "certificate is required." });
        }
        if (!privateKey || typeof privateKey !== "string") {
          return res.status(400).json({ error: "privateKey is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!accountId || typeof accountId !== "string") {
          return res.status(400).json({ error: "accountId is required." });
        }

        const txResult = await getTransactions({
          accessToken,
          certificate,
          privateKey,
          environment: environment as TellerEnv,
          accountId,
          count: count || undefined,
        });

        const transactions = txResult.transactions.map((tx) => ({
          ...tx,
          accountName: accountName || tx.accountName,
        }));

        return res.json({ transactions });
      }

      case "sync-all": {
        const { accessToken, certificate, privateKey, environment, accounts } = req.body;

        if (!accessToken || typeof accessToken !== "string") {
          return res.status(400).json({ error: "accessToken is required." });
        }
        if (!certificate || typeof certificate !== "string") {
          return res.status(400).json({ error: "certificate is required." });
        }
        if (!privateKey || typeof privateKey !== "string") {
          return res.status(400).json({ error: "privateKey is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!Array.isArray(accounts)) {
          return res.status(400).json({ error: "accounts array is required." });
        }

        const allTransactions: any[] = [];

        for (const account of accounts) {
          try {
            const result = await getTransactions({
              accessToken,
              certificate,
              privateKey,
              environment: environment as TellerEnv,
              accountId: account.id,
              count: 100,
            });

            const transactions = result.transactions.map((tx: any) => ({
              ...tx,
              accountName: account.name || tx.accountName,
            }));

            allTransactions.push(...transactions);
          } catch (error) {
            console.error(`Failed to fetch transactions for account ${account.id}:`, error);
          }
        }

        return res.json({ transactions: allTransactions });
      }

      case "details": {
        const { accessToken, certificate, privateKey, environment, accountId } = req.body;

        if (!accessToken || typeof accessToken !== "string") {
          return res.status(400).json({ error: "accessToken is required." });
        }
        if (!certificate || typeof certificate !== "string") {
          return res.status(400).json({ error: "certificate is required." });
        }
        if (!privateKey || typeof privateKey !== "string") {
          return res.status(400).json({ error: "privateKey is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!accountId || typeof accountId !== "string") {
          return res.status(400).json({ error: "accountId is required." });
        }

        const detailsResult = await getAccountDetails({
          accessToken,
          certificate,
          privateKey,
          environment: environment as TellerEnv,
          accountId,
        });

        return res.json(detailsResult);
      }

      case "balances": {
        const { accessToken, certificate, privateKey, environment, accountId } = req.body;

        if (!accessToken || typeof accessToken !== "string") {
          return res.status(400).json({ error: "accessToken is required." });
        }
        if (!certificate || typeof certificate !== "string") {
          return res.status(400).json({ error: "certificate is required." });
        }
        if (!privateKey || typeof privateKey !== "string") {
          return res.status(400).json({ error: "privateKey is required." });
        }
        if (!environment || !["sandbox", "development", "production"].includes(environment)) {
          return res.status(400).json({ error: "environment must be sandbox, development, or production." });
        }
        if (!accountId || typeof accountId !== "string") {
          return res.status(400).json({ error: "accountId is required." });
        }

        const balancesResult = await getAccountBalances({
          accessToken,
          certificate,
          privateKey,
          environment: environment as TellerEnv,
          accountId,
        });

        return res.json(balancesResult);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Use accounts, transactions, sync-all, details, or balances.` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Teller request failed.";
    console.error("Teller API error:", message);
    return res.status(500).json({ error: message });
  }
}
