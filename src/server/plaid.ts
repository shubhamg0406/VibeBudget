import crypto from "crypto";
import type express from "express";
import type { PlaidAccount, PlaidTransaction, PlaidEnv } from "../types";

// ─── Types ───────────────────────────────────────────────────────────

interface PlaidExchangeResponse {
  access_token: string;
  item_id: string;
  request_id: string;
}

interface PlaidTransactionsSyncResponse {
  added: Array<{
    transaction_id: string;
    account_id: string;
    account_name?: string;
    date: string;
    name: string;
    merchant_name?: string | null;
    amount: number;
    iso_currency_code?: string;
    category?: string[];
    pending: boolean;
  }>;
  modified: Array<unknown>;
  removed: Array<unknown>;
  next_cursor: string;
  has_more: boolean;
  request_id: string;
}

interface PlaidAccountsGetResponse {
  accounts: Array<{
    account_id: string;
    name: string;
    mask?: string;
    type: string;
    subtype?: string;
    balances: {
      current?: number;
      available?: number;
      limit?: number;
      iso_currency_code?: string;
    };
  }>;
  item: { item_id: string; institution_id?: string };
  request_id: string;
}

interface PlaidInstitutionResponse {
  institution: {
    institution_id: string;
    name: string;
  };
}

interface PlaidErrorResponse {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

// ─── Encryption ──────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive an encryption key from the user's UID and a server-side pepper.
 * This ensures each user has a unique encryption key, and the pepper
 * never leaves the server environment.
 */
const deriveKey = (uid: string): Buffer => {
  const pepper = process.env.PLAID_ENCRYPTION_PEPPER || "";
  if (!pepper) {
    throw new Error("PLAID_ENCRYPTION_PEPPER is not configured on the server.");
  }
  // Use PBKDF2 to derive a 256-bit key
  return crypto.pbkdf2Sync(pepper, uid, 100_000, 32, "sha256");
};

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a hex-encoded string: iv + authTag + ciphertext.
 */
export const encryptAccessToken = (plaintext: string, uid: string): string => {
  const key = deriveKey(uid);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Store as iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypt a string that was encrypted with encryptAccessToken.
 */
export const decryptAccessToken = (encrypted: string, uid: string): string => {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format.");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];
  const key = deriveKey(uid);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// ─── Plaid API Client ────────────────────────────────────────────────

const PLAID_BASE_URLS: Record<PlaidEnv, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const plaidFetch = async <T>(
  env: PlaidEnv,
  path: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const baseUrl = PLAID_BASE_URLS[env];
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as PlaidErrorResponse;
    const message = errorBody.error_message || `Plaid request failed (${response.status})`;
    const code = errorBody.error_code || "";
    throw new Error(`${message}${code ? ` [${code}]` : ""}`);
  }

  return response.json() as Promise<T>;
};

// ─── Public API Functions ────────────────────────────────────────────

export interface ExchangeTokenParams {
  publicToken: string;
  clientId: string;
  secret: string;
  environment: PlaidEnv;
}

export interface ExchangeTokenResult {
  accessToken: string;
  itemId: string;
  institutionName?: string;
  institutionId?: string;
}

/**
 * Exchange a Plaid Link public_token for an access_token.
 */
export const exchangePublicToken = async (
  params: ExchangeTokenParams,
): Promise<ExchangeTokenResult> => {
  const { publicToken, clientId, secret, environment } = params;

  const result = await plaidFetch<PlaidExchangeResponse>(
    environment,
    "/item/public_token/exchange",
    {
      client_id: clientId,
      secret,
      public_token: publicToken,
    },
  );

  // Try to get institution info
  let institutionName: string | undefined;
  let institutionId: string | undefined;

  try {
    const itemResult = await plaidFetch<PlaidAccountsGetResponse>(
      environment,
      "/accounts/get",
      {
        client_id: clientId,
        secret,
        access_token: result.access_token,
      },
    );
    institutionId = itemResult.item.institution_id;

    if (institutionId) {
      const instResult = await plaidFetch<PlaidInstitutionResponse>(
        environment,
        "/institutions/get_by_id",
        {
          client_id: clientId,
          secret,
          institution_id: institutionId,
          country_codes: ["US"],
        },
      );
      institutionName = instResult.institution.name;
    }
  } catch {
    // Institution info is non-critical; proceed without it
  }

  return {
    accessToken: result.access_token,
    itemId: result.item_id,
    institutionName,
    institutionId,
  };
};

export interface SyncTransactionsParams {
  accessToken: string;
  clientId: string;
  secret: string;
  environment: PlaidEnv;
  cursor?: string;
}

export interface SyncTransactionsResult {
  added: PlaidTransaction[];
  nextCursor: string;
  hasMore: boolean;
}

/**
 * Fetch new/modified/removed transactions via Plaid Transactions Sync.
 * Only returns transactions from today forward (no historical backfill).
 */
export const syncTransactions = async (
  params: SyncTransactionsParams,
): Promise<SyncTransactionsResult> => {
  const { accessToken, clientId, secret, environment, cursor } = params;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const result = await plaidFetch<PlaidTransactionsSyncResponse>(
    environment,
    "/transactions/sync",
    {
      client_id: clientId,
      secret,
      access_token: accessToken,
      cursor: cursor || undefined,
      options: {
        include_original_description: false,
        include_personal_finance_category: true,
      },
    },
  );

  // Filter to only future transactions (today onwards)
  const added: PlaidTransaction[] = result.added
    .filter((t) => t.date >= todayStr)
    .map((t) => ({
      transactionId: t.transaction_id,
      accountId: t.account_id,
      accountName: t.account_name || "Unknown",
      date: t.date,
      name: t.name,
      merchantName: t.merchant_name || undefined,
      amount: Math.abs(t.amount),
      currency: t.iso_currency_code || "USD",
      category: t.category || undefined,
      pending: t.pending,
    }));

  return {
    added,
    nextCursor: result.next_cursor,
    hasMore: result.has_more,
  };
};

export interface GetAccountsParams {
  accessToken: string;
  clientId: string;
  secret: string;
  environment: PlaidEnv;
}

export interface GetAccountsResult {
  accounts: PlaidAccount[];
  itemId: string;
  institutionId?: string;
}

/**
 * Fetch linked accounts and their balances.
 */
export const getAccounts = async (
  params: GetAccountsParams,
): Promise<GetAccountsResult> => {
  const { accessToken, clientId, secret, environment } = params;

  const result = await plaidFetch<PlaidAccountsGetResponse>(
    environment,
    "/accounts/get",
    {
      client_id: clientId,
      secret,
      access_token: accessToken,
    },
  );

  const accounts: PlaidAccount[] = result.accounts.map((a) => ({
    id: a.account_id,
    name: a.name,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    balances: {
      current: a.balances.current,
      available: a.balances.available,
      limit: a.balances.limit,
      currency: a.balances.iso_currency_code || "USD",
    },
  }));

  return {
    accounts,
    itemId: result.item.item_id,
    institutionId: result.item.institution_id,
  };
};

// ─── Express Route Registration ──────────────────────────────────────

export const registerPlaidRoutes = (app: express.Express) => {
  /**
   * POST /api/plaid/exchange
   * Exchange a public_token for an access_token.
   * Body: { publicToken, clientId, secret, environment }
   * The access_token is encrypted and returned; the server does NOT store it.
   * The client is responsible for storing the encrypted token in Firestore.
   */
  app.post("/api/plaid/exchange", async (req, res) => {
    try {
      const { publicToken, clientId, secret, environment, uid } = req.body || {};

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

      // Encrypt the access_token before returning it
      const encryptedAccessToken = encryptAccessToken(result.accessToken, uid);

      return res.json({
        encryptedAccessToken,
        itemId: result.itemId,
        institutionName: result.institutionName,
        institutionId: result.institutionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to exchange public token.";
      console.error("Plaid exchange error:", message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/plaid/transactions
   * Fetch transactions via Plaid Transactions Sync.
   * Body: { encryptedAccessToken, clientId, secret, environment, uid, cursor }
   */
  app.post("/api/plaid/transactions", async (req, res) => {
    try {
      const { encryptedAccessToken, clientId, secret, environment, uid, cursor } = req.body || {};

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

      // Decrypt the access_token
      const accessToken = decryptAccessToken(encryptedAccessToken, uid);

      const result = await syncTransactions({
        accessToken,
        clientId,
        secret,
        environment: environment as PlaidEnv,
        cursor: cursor || undefined,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync transactions.";
      console.error("Plaid transactions sync error:", message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/plaid/accounts
   * Fetch linked accounts and balances.
   * Body: { encryptedAccessToken, clientId, secret, environment, uid }
   */
  app.post("/api/plaid/accounts", async (req, res) => {
    try {
      const { encryptedAccessToken, clientId, secret, environment, uid } = req.body || {};

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

      const result = await getAccounts({
        accessToken,
        clientId,
        secret,
        environment: environment as PlaidEnv,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch accounts.";
      console.error("Plaid accounts error:", message);
      return res.status(500).json({ error: message });
    }
  });
};
