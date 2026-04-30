import https from "https";
import type express from "express";
import type { TellerAccount, TellerTransaction, TellerEnv } from "../types";

// ─── Types ───────────────────────────────────────────────────────────

interface TellerAccountResponse {
  id: string;
  name: string;
  last_four: string;
  type: string;
  subtype: string;
  institution: {
    id: string;
    name: string;
  };
  currency: string;
  balances?: {
    available?: string;
    ledger?: string;
  };
}

interface TellerTransactionResponse {
  id: string;
  account_id: string;
  date: string;
  description: string;
  amount: string;
  type: "deposit" | "withdrawal";
  status: "posted" | "pending";
  details?: {
    category?: string;
    merchant?: string;
    counterparty_name?: string;
  };
}

// ─── mTLS Agent ──────────────────────────────────────────────────────

const agentCache = new Map<string, https.Agent>();

const getAgent = (certificate: string, privateKey: string): https.Agent => {
  const cacheKey = `${certificate.length}:${privateKey.length}`;
  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey)!;
  }

  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
    rejectUnauthorized: true,
  });

  agentCache.set(cacheKey, agent);
  return agent;
};

// ─── Teller API Client ───────────────────────────────────────────────

const TELLER_BASE_URLS: Record<TellerEnv, string> = {
  sandbox: "https://api.teller.io",
  development: "https://api.teller.io",
  production: "https://api.teller.io",
};

const tellerFetch = async <T>(
  env: TellerEnv,
  path: string,
  accessToken: string,
  certificate: string,
  privateKey: string,
): Promise<T> => {
  const baseUrl = TELLER_BASE_URLS[env];
  const agent = getAgent(certificate, privateKey);

  // Teller uses Basic auth with the access token as the username and empty password
  const basicAuth = Buffer.from(`${accessToken}:`).toString("base64");

  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "GET",
      agent,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Failed to parse Teller response: ${data.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`Teller API error (${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Teller request failed: ${error.message}`));
    });

    req.end();
  });
};

// ─── Public API Functions ────────────────────────────────────────────

export interface GetAccountsParams {
  accessToken: string;
  certificate: string;
  privateKey: string;
  environment: TellerEnv;
}

export interface GetAccountsResult {
  accounts: TellerAccount[];
}

/**
 * Fetch all accounts for an enrollment.
 */
export const getAccounts = async (
  params: GetAccountsParams,
): Promise<GetAccountsResult> => {
  const { accessToken, certificate, privateKey, environment } = params;

  const accounts = await tellerFetch<TellerAccountResponse[]>(
    environment,
    "/accounts",
    accessToken,
    certificate,
    privateKey,
  );

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      lastFour: a.last_four,
      type: a.type,
      subtype: a.subtype,
      institution: {
        id: a.institution.id,
        name: a.institution.name,
      },
      currency: a.currency,
      balances: a.balances
        ? {
            available: a.balances.available ? Number(a.balances.available) : undefined,
            ledger: a.balances.ledger ? Number(a.balances.ledger) : undefined,
            currency: a.currency,
          }
        : undefined,
    })),
  };
};

export interface GetTransactionsParams {
  accessToken: string;
  certificate: string;
  privateKey: string;
  environment: TellerEnv;
  accountId: string;
  count?: number;
}

export interface GetTransactionsResult {
  transactions: TellerTransaction[];
}

/**
 * Fetch transactions for a specific account.
 * Only returns transactions from today forward (no historical backfill).
 */
export const getTransactions = async (
  params: GetTransactionsParams,
): Promise<GetTransactionsResult> => {
  const { accessToken, certificate, privateKey, environment, accountId, count } = params;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  let path = `/accounts/${accountId}/transactions`;
  if (count) {
    path += `?count=${count}`;
  }

  const transactions = await tellerFetch<TellerTransactionResponse[]>(
    environment,
    path,
    accessToken,
    certificate,
    privateKey,
  );

  // Filter to only future transactions (today onwards)
  const filtered: TellerTransaction[] = transactions
    .filter((t) => t.date >= todayStr)
    .map((t) => ({
      transactionId: t.id,
      accountId: t.account_id,
      accountName: "", // Will be filled in by the caller
      date: t.date,
      description: t.description,
      amount: Math.abs(Number(t.amount)),
      currency: "USD", // Teller doesn't return currency per transaction
      type: t.type,
      status: t.status,
      details: t.details
        ? {
            category: t.details.category,
            merchant: t.details.merchant,
            counterparty_name: t.details.counterparty_name,
          }
        : undefined,
    }));

  return { transactions: filtered };
};

export interface GetAccountDetailsParams {
  accessToken: string;
  certificate: string;
  privateKey: string;
  environment: TellerEnv;
  accountId: string;
}

export interface GetAccountDetailsResult {
  accountNumber: string;
  routingNumbers: {
    ach?: string;
  };
}

/**
 * Fetch account details (account number, routing number).
 */
export const getAccountDetails = async (
  params: GetAccountDetailsParams,
): Promise<GetAccountDetailsResult> => {
  const { accessToken, certificate, privateKey, environment, accountId } = params;

  const result = await tellerFetch<{
    account_number: string;
    routing_numbers: {
      ach?: string;
    };
  }>(
    environment,
    `/accounts/${accountId}/details`,
    accessToken,
    certificate,
    privateKey,
  );

  return {
    accountNumber: result.account_number,
    routingNumbers: {
      ach: result.routing_numbers.ach,
    },
  };
};

export interface GetAccountBalancesParams {
  accessToken: string;
  certificate: string;
  privateKey: string;
  environment: TellerEnv;
  accountId: string;
}

export interface GetAccountBalancesResult {
  available?: number;
  ledger?: number;
  currency: string;
}

/**
 * Fetch account balances.
 */
export const getAccountBalances = async (
  params: GetAccountBalancesParams,
): Promise<GetAccountBalancesResult> => {
  const { accessToken, certificate, privateKey, environment, accountId } = params;

  const result = await tellerFetch<{
    available?: string;
    ledger?: string;
  }>(
    environment,
    `/accounts/${accountId}/balances`,
    accessToken,
    certificate,
    privateKey,
  );

  return {
    available: result.available ? Number(result.available) : undefined,
    ledger: result.ledger ? Number(result.ledger) : undefined,
    currency: "USD",
  };
};

// ─── Express Route Registration ──────────────────────────────────────

export const registerTellerRoutes = (app: express.Express) => {
  /**
   * POST /api/teller/accounts
   * Fetch all accounts for an enrollment.
   * Body: { accessToken, certificate, privateKey, environment }
   */
  app.post("/api/teller/accounts", async (req, res) => {
    try {
      const { accessToken, certificate, privateKey, environment } = req.body || {};

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch Teller accounts.";
      console.error("Teller accounts error:", message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/teller/transactions
   * Fetch transactions for a specific account.
   * Body: { accessToken, certificate, privateKey, environment, accountId, accountName, count }
   */
  app.post("/api/teller/transactions", async (req, res) => {
    try {
      const { accessToken, certificate, privateKey, environment, accountId, accountName, count } = req.body || {};

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

      const result = await getTransactions({
        accessToken,
        certificate,
        privateKey,
        environment: environment as TellerEnv,
        accountId,
        count: count || undefined,
      });

      // Fill in account names
      const transactions = result.transactions.map((tx) => ({
        ...tx,
        accountName: accountName || tx.accountName,
      }));

      return res.json({ transactions });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch Teller transactions.";
      console.error("Teller transactions error:", message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/teller/sync-all
   * Fetch transactions from all accounts.
   * Body: { accessToken, certificate, privateKey, environment, accounts }
   */
  app.post("/api/teller/sync-all", async (req, res) => {
    try {
      const { accessToken, certificate, privateKey, environment, accounts } = req.body || {};

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

      // Fetch transactions for each account
      const allTransactions: TellerTransaction[] = [];

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

          const transactions = result.transactions.map((tx) => ({
            ...tx,
            accountName: account.name || tx.accountName,
          }));

          allTransactions.push(...transactions);
        } catch (error) {
          console.error(`Failed to fetch transactions for account ${account.id}:`, error);
          // Continue with other accounts
        }
      }

      return res.json({ transactions: allTransactions });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync Teller transactions.";
      console.error("Teller sync-all error:", message);
      return res.status(500).json({ error: message });
    }
  });
};
