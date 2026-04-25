import type express from "express";
import fs from "fs";

export type ChatRole = "user" | "assistant";
type ApiChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiTransaction {
  date: string;
  vendor: string;
  amount: number;
  category_id: string;
  category_name: string;
  notes?: string;
  uid?: string;
}

export interface AiIncome {
  date: string;
  source: string;
  amount: number;
  category: string;
  notes?: string;
  uid?: string;
}

export interface AiCategory {
  name: string;
  target_amount: number;
  uid?: string;
}

export interface BudgetData {
  transactions: AiTransaction[];
  income: AiIncome[];
  categories: AiCategory[];
}

interface DecodedToken {
  uid: string;
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const extractProviderErrorMessage = (rawPayload: unknown, fallback: string) => {
  if (!rawPayload) return fallback;

  const payload = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
  if (!payload || typeof payload !== "object") return fallback;

  const maybeError = (payload as { error?: unknown }).error;
  if (!maybeError || typeof maybeError !== "object") return fallback;

  const message = (maybeError as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return fallback;
};

export interface AiChatDependencies {
  verifyIdToken: (idToken: string) => Promise<DecodedToken>;
  loadUserBudgetData: (uid: string, now: Date, idToken?: string) => Promise<BudgetData>;
  callGroq: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => Promise<string>;
  now?: () => Date;
}

interface FirebaseAccountsLookupResponse {
  users?: Array<{
    localId?: string;
  }>;
  error?: {
    message?: string;
  };
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class RateLimitTracker {
  private hits = new Map<string, number[]>();

  isLimited(uid: string, nowMs: number, maxRequests = 20, windowMs = 60_000) {
    const current = this.hits.get(uid) || [];
    const recent = current.filter((timestamp) => nowMs - timestamp < windowMs);
    if (recent.length >= maxRequests) {
      this.hits.set(uid, recent);
      return true;
    }

    recent.push(nowMs);
    this.hits.set(uid, recent);
    return false;
  }
}

const rateLimitTracker = new RateLimitTracker();
const budgetDataCache = new Map<string, { data: BudgetData; updatedAtMs: number }>();

const AI_CHAT_CACHE_TTL_MS = Number(process.env.AI_CHAT_CACHE_TTL_MS || 300_000);

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const formatCurrency = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
};

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

const getMonthlyKeysInRange = (startMonth: string, endMonth: string) => {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const cursor = new Date(startYear, startMonthNumber - 1, 1);
  const end = new Date(endYear, endMonthNumber - 1, 1);
  const months: string[] = [];

  while (cursor <= end) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

const sanitizeTransactions = (transactions: AiTransaction[]) => {
  return transactions
    .map((item) => ({
      date: asString(item.date),
      vendor: asString(item.vendor),
      amount: toNumber(item.amount),
      category_id: asString(item.category_id),
      category_name: asString(item.category_name),
      notes: asString(item.notes),
    }))
    .filter((item) => item.date && item.vendor && item.category_name)
    .sort((a, b) => b.date.localeCompare(a.date));
};

const sanitizeIncome = (income: AiIncome[]) => {
  return income
    .map((item) => ({
      date: asString(item.date),
      source: asString(item.source),
      amount: toNumber(item.amount),
      category: asString(item.category),
      notes: asString(item.notes),
    }))
    .filter((item) => item.date && item.source)
    .sort((a, b) => b.date.localeCompare(a.date));
};

const sanitizeCategories = (categories: AiCategory[]) => {
  return categories
    .map((item) => ({
      name: asString(item.name),
      target_amount: toNumber(item.target_amount),
    }))
    .filter((item) => item.name);
};

export interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  categoryPerformance: Array<{ name: string; spent: number; target: number; pct: number }>;
  topVendors: Array<{ vendor: string; total: number }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
  transactions: ReturnType<typeof sanitizeTransactions>;
  income: ReturnType<typeof sanitizeIncome>;
  dateRange: { start: string; end: string };
}

export const buildBudgetSummary = (rawData: BudgetData, now: Date): BudgetSummary => {
  const transactions = sanitizeTransactions(rawData.transactions);
  const income = sanitizeIncome(rawData.income);
  const categories = sanitizeCategories(rawData.categories);

  const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = transactions.reduce((sum, item) => sum + item.amount, 0);
  const netBalance = totalIncome - totalExpenses;

  const spendingByCategory = new Map<string, number>();
  transactions.forEach((item) => {
    spendingByCategory.set(item.category_name, (spendingByCategory.get(item.category_name) || 0) + item.amount);
  });

  const categoryNames = new Set<string>([
    ...categories.map((item) => item.name),
    ...spendingByCategory.keys(),
  ]);

  const targetByCategory = new Map(categories.map((category) => [category.name, category.target_amount]));
  const categoryPerformance = Array.from(categoryNames)
    .map((name) => {
      const spent = spendingByCategory.get(name) || 0;
      const target = targetByCategory.get(name) || 0;
      const pct = target > 0 ? Number(((spent / target) * 100).toFixed(1)) : 0;
      return { name, spent, target, pct };
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  const vendorTotals = new Map<string, number>();
  transactions.forEach((item) => {
    vendorTotals.set(item.vendor, (vendorTotals.get(item.vendor) || 0) + item.amount);
  });

  const topVendors = Array.from(vendorTotals.entries())
    .map(([vendor, total]) => ({ vendor, total }))
    .sort((a, b) => b.total - a.total || a.vendor.localeCompare(b.vendor))
    .slice(0, 5);

  const allMonths = [
    ...transactions.map((item) => item.date.slice(0, 7)),
    ...income.map((item) => item.date.slice(0, 7)),
  ]
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort();

  const startMonth = allMonths[0] || monthKey(now);
  const endMonth = allMonths[allMonths.length - 1] || monthKey(now);
  const months = getMonthlyKeysInRange(startMonth, endMonth);
  const monthIncomeMap = new Map(months.map((month) => [month, 0]));
  const monthExpenseMap = new Map(months.map((month) => [month, 0]));

  income.forEach((item) => {
    const month = item.date.slice(0, 7);
    if (monthIncomeMap.has(month)) {
      monthIncomeMap.set(month, (monthIncomeMap.get(month) || 0) + item.amount);
    }
  });

  transactions.forEach((item) => {
    const month = item.date.slice(0, 7);
    if (monthExpenseMap.has(month)) {
      monthExpenseMap.set(month, (monthExpenseMap.get(month) || 0) + item.amount);
    }
  });

  const monthlyTrend = months.map((month) => ({
    month,
    income: monthIncomeMap.get(month) || 0,
    expenses: monthExpenseMap.get(month) || 0,
  }));

  const transactionDates = transactions.map((item) => item.date);
  const incomeDates = income.map((item) => item.date);
  const allDates = [...transactionDates, ...incomeDates]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const windowStart = allDates[0] || now.toISOString().slice(0, 10);
  const windowEnd = allDates[allDates.length - 1] || now.toISOString().slice(0, 10);

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    categoryPerformance,
    topVendors,
    monthlyTrend,
    transactions,
    income,
    dateRange: { start: windowStart, end: windowEnd },
  };
};

export const buildSystemPrompt = (summary: BudgetSummary, now: Date) => {
  const categories = summary.categoryPerformance.length > 0
    ? summary.categoryPerformance
      .map((category) => `- ${category.name}: spent ${formatCurrency(category.spent)} of ${formatCurrency(category.target)} target (${category.pct}%)`)
      .join("\n")
    : "- No category data available";

  const vendors = summary.topVendors.length > 0
    ? summary.topVendors
      .map((vendor) => `- ${vendor.vendor}: ${formatCurrency(vendor.total)}`)
      .join("\n")
    : "- No vendor data available";

  const monthlyTrend = summary.monthlyTrend.length > 0
    ? summary.monthlyTrend
      .map((month) => `- ${month.month}: Income ${formatCurrency(month.income)} | Expenses ${formatCurrency(month.expenses)}`)
      .join("\n")
    : "- No monthly data available";

  const transactions = summary.transactions.length > 0
    ? summary.transactions
      .map((item) => `${item.date} | ${item.vendor} | ${formatCurrency(item.amount)} | ${item.category_name}${item.notes ? ` | ${item.notes}` : ""}`)
      .join("\n")
    : "No transactions found in available data.";

  const income = summary.income.length > 0
    ? summary.income
      .map((item) => `${item.date} | ${item.source} | ${formatCurrency(item.amount)} | ${item.category}`)
      .join("\n")
    : "No income records found in available data.";

  const today = now.toISOString().slice(0, 10);

  return [
    "You are a friendly, sharp personal finance assistant for VibeBudget.",
    "You have access to the signed-in user's real budget data provided below.",
    "Answer questions accurately and concisely based only on this data.",
    "Do not make up transactions or amounts. If the data doesn't cover a question, say so.",
    "Format numbers as currency (e.g. $1,234.56). Use bullet points for lists.",
    "Keep answers short unless the user asks for detail.",
    `Today's date is ${today}.`,
    `User's Budget Summary (${summary.dateRange.start} to ${summary.dateRange.end})`,
    "Overview",
    `Total Income: ${formatCurrency(summary.totalIncome)}`,
    `Total Expenses: ${formatCurrency(summary.totalExpenses)}`,
    `Net Balance: ${formatCurrency(summary.netBalance)}`,
    "",
    "Category Performance",
    categories,
    "",
    "Top Vendors by Spend",
    vendors,
    "",
    "Monthly Trend (all available months)",
    monthlyTrend,
    "",
    "All Transactions (all available data)",
    transactions,
    "",
    "All Income Records (all available data)",
    income,
  ].join("\n");
};

const sanitizeHistory = (history: unknown): ChatMessage[] => {
  if (!Array.isArray(history)) return [];

  return history
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: string }).role;
      const content = (item as { content?: string }).content;
      if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
        return { role, content: content.trim() } as ChatMessage;
      }
      return null;
    })
    .filter((item): item is ChatMessage => Boolean(item));
};

const sanitizeApiChatMessages = (messages: unknown): Array<{ role: ApiChatRole; content: string }> => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: string }).role;
      const content = (item as { content?: string }).content;
      if (
        (role === "user" || role === "assistant")
        && typeof content === "string"
        && content.trim()
      ) {
        return { role, content: content.trim() } as { role: ApiChatRole; content: string };
      }
      return null;
    })
    .filter((item): item is { role: ApiChatRole; content: string } => Boolean(item));
};

const BASE_SYSTEM_PROMPT = [
  "You are a helpful financial assistant for a personal budget app.",
  "Answer questions about spending, budgets, and financial goals.",
  "If you do not have enough user-specific data, say that clearly instead of guessing.",
].join(" ");

const callGroqApiChat = async (
  messages: Array<{ role: ApiChatRole; content: string }>,
  systemPrompt: string,
): Promise<string> => {
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: geminiModel,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const rawPayload = await response.json().catch(() => null);
    const message = extractProviderErrorMessage(rawPayload, `Gemini request failed (${response.status})`);
    throw new HttpError(response.status, message);
  }

  const payload = await response.json() as GroqResponse;
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new HttpError(502, "Gemini returned an empty response.");
  }
  return reply;
};

const isRestFallbackEnabled = () => {
  const configured = process.env.ALLOW_FIREBASE_REST_FALLBACK;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured === "true";
  }
  // Vercel production commonly has no Firebase Admin credentials.
  return process.env.NODE_ENV === "production";
};

const resolveDataNamespace = () => {
  const configured = (process.env.FIREBASE_DATA_NAMESPACE || process.env.VITE_FIREBASE_DATA_NAMESPACE || "").trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "prod" : "local-dev";
};

const normalizePrivateKey = (key: string) => key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

const normalizeServiceAccount = (serviceAccount: Record<string, unknown>) => {
  const normalized = { ...serviceAccount } as Record<string, unknown>;
  if (typeof normalized.private_key === "string") {
    normalized.private_key = normalizePrivateKey(normalized.private_key);
  }
  return normalized;
};

const decodeFirestoreValue = (value: any): any => {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((item: any) => decodeFirestoreValue(item));
  }
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, nestedValue]) => [key, decodeFirestoreValue(nestedValue)]),
    );
  }
  return null;
};

const decodeFirestoreDocument = (doc: any) => {
  const fields = doc?.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
};

const loadFirebaseAdmin = async () => {
  const adminAppModule = await import("firebase-admin/app");
  const adminAuthModule = await import("firebase-admin/auth");
  const adminFirestoreModule = await import("firebase-admin/firestore");

  const { getApps, initializeApp, cert, applicationDefault } = adminAppModule;

  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
    const serviceAccountPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (serviceAccountPath) {
      const fileContents = fs.readFileSync(serviceAccountPath, "utf8");
      const parsed = normalizeServiceAccount(JSON.parse(fileContents));
      initializeApp({ credential: cert(parsed as any) });
    } else if (serviceAccountJson) {
      const parsed = normalizeServiceAccount(JSON.parse(serviceAccountJson));
      initializeApp({ credential: cert(parsed as any) });
    } else if (projectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizePrivateKey(privateKey),
        }),
      });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  return {
    auth: adminAuthModule.getAuth(),
    firestore: adminFirestoreModule.getFirestore(
      undefined,
      process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || undefined,
    ),
  };
};

const fetchCollection = async (
  collectionRef: FirebaseFirestore.CollectionReference,
) => {
  const snapshot = await collectionRef.get();
  return snapshot.docs.map((doc) => doc.data());
};

const fetchCollectionViaRest = async (
  projectId: string,
  databaseId: string,
  collectionPath: string,
  idToken: string,
): Promise<any[]> => {
  const encodedPath = collectionPath.split("/").map(encodeURIComponent).join("/");
  const allDocuments: any[] = [];
  let pageToken = "";

  while (true) {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodedPath}?pageSize=500${tokenParam}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(`Firestore REST request failed (${response.status}): ${payload || response.statusText}`);
    }

    const payload = await response.json() as { documents?: any[]; nextPageToken?: string };
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    allDocuments.push(...documents.map((doc) => decodeFirestoreDocument(doc)));
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";

    if (!pageToken) {
      break;
    }
  }

  return allDocuments;
};

const loadUserBudgetDataFromFirestoreRest = async (uid: string, now: Date, idToken: string): Promise<BudgetData> => {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new HttpError(500, "Missing FIREBASE_PROJECT_ID/VITE_FIREBASE_PROJECT_ID for Firestore REST fallback.");
  }
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)";
  const namespace = resolveDataNamespace();
  const rootPaths = [
    ...(namespace ? [`environments/${namespace}/users/${uid}`] : []),
    `users/${uid}`,
  ];

  for (const rootPath of rootPaths) {
    try {
      const [transactions, income, categories] = await Promise.all([
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/transactions`, idToken),
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/income`, idToken),
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/categories`, idToken),
      ]);

      const sortedTransactions = (transactions as AiTransaction[])
        .filter((item) => typeof item.date === "string")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const sortedIncome = (income as AiIncome[])
        .filter((item) => typeof item.date === "string")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const parsedCategories = categories as AiCategory[];

      if (
        sortedTransactions.length > 0 ||
        sortedIncome.length > 0 ||
        parsedCategories.length > 0 ||
        rootPath === rootPaths[rootPaths.length - 1]
      ) {
        return {
          transactions: sortedTransactions,
          income: sortedIncome,
          categories: parsedCategories,
        };
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      console.error(`AI chat Firestore REST load failed for ${rootPath}:`, details);
      if (rootPath === rootPaths[rootPaths.length - 1]) {
        throw new HttpError(500, `Failed to fetch budget data from Firestore REST: ${details}`);
      }
    }
  }

  return { transactions: [], income: [], categories: [] };
};

const loadUserBudgetDataFromFirestore = async (uid: string, now: Date, idToken?: string): Promise<BudgetData> => {
  let firestore: FirebaseFirestore.Firestore | null = null;
  try {
    const admin = await loadFirebaseAdmin();
    firestore = admin.firestore;
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown error";
    if (!isRestFallbackEnabled() || !idToken) {
      throw new HttpError(500, `Firebase Admin init failed and no ID token for fallback: ${details}`);
    }
    console.warn("AI chat Firebase Admin init failed, trying REST fallback:", details);
    return loadUserBudgetDataFromFirestoreRest(uid, now, idToken);
  }
  const namespace = resolveDataNamespace();

  const rootPaths = [
    ...(namespace ? [{ base: ["environments", namespace, "users", uid] }] : []),
    { base: ["users", uid] },
  ];

  for (const rootPath of rootPaths) {
    const [first, second, ...rest] = rootPath.base;
    let rootRef = firestore.collection(first).doc(second);

    for (let index = 0; index < rest.length; index += 2) {
      const collectionName = rest[index];
      const docId = rest[index + 1];
      rootRef = rootRef.collection(collectionName).doc(docId);
    }

    const transactionsRef = rootRef.collection("transactions");
    const incomeRef = rootRef.collection("income");
    const categoriesRef = rootRef.collection("categories");

    try {
      const [transactions, income, categoriesSnapshot] = await Promise.all([
        fetchCollection(transactionsRef),
        fetchCollection(incomeRef),
        categoriesRef.get(),
      ]);

      const categories = categoriesSnapshot.docs.map((doc) => doc.data());
      if (transactions.length > 0 || income.length > 0 || categories.length > 0 || rootPath === rootPaths[rootPaths.length - 1]) {
        return {
          transactions: transactions as AiTransaction[],
          income: income as AiIncome[],
          categories: categories as AiCategory[],
        };
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      console.error(`AI chat Firestore load failed for root ${rootPath.base.join("/")}:`, details);
      if (rootPath === rootPaths[rootPaths.length - 1]) {
        if (isRestFallbackEnabled() && idToken) {
          return loadUserBudgetDataFromFirestoreRest(uid, now, idToken);
        }
        throw new HttpError(500, `Failed to fetch budget data from Firestore: ${details}`);
      }
    }
  }

  return { transactions: [], income: [], categories: [] };
};

const isQuotaExceededError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("RESOURCE_EXHAUSTED")
    || message.toLowerCase().includes("quota exceeded")
    || message.includes("Firestore REST request failed (429)")
  );
};

const callGroqChatCompletion = async (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new HttpError(500, "Missing GEMINI_API_KEY server configuration.");
  }
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: geminiModel,
      temperature: 0.2,
      messages,
    }),
  });

  if (response.status === 429) {
    throw new HttpError(429, "Gemini rate limit reached. Please retry in a moment.");
  }

  if (!response.ok) {
    const rawPayload = await response.json().catch(() => null);
    throw new HttpError(502, extractProviderErrorMessage(rawPayload, "Gemini request failed."));
  }

  const payload = await response.json() as GroqResponse;
  const reply = payload.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new HttpError(502, "Gemini returned an empty response.");
  }

  return reply;
};

const defaultAiDeps: AiChatDependencies = {
  verifyIdToken: async (idToken: string) => {
    try {
      const { auth } = await loadFirebaseAdmin();
      return auth.verifyIdToken(idToken);
    } catch (adminError) {
      if (!isRestFallbackEnabled()) {
        throw adminError;
      }
      const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
      if (!apiKey) {
        throw adminError;
      }

      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as FirebaseAccountsLookupResponse | null;
        const message = payload?.error?.message || `accounts:lookup failed (${response.status})`;
        throw new Error(message);
      }

      const payload = await response.json() as FirebaseAccountsLookupResponse;
      const localId = payload.users?.[0]?.localId;
      if (!localId) {
        throw new Error("accounts:lookup did not return localId");
      }

      return { uid: localId };
    }
  },
  loadUserBudgetData: loadUserBudgetDataFromFirestore,
  callGroq: callGroqChatCompletion,
  now: () => new Date(),
};

export const registerAiChatRoute = (
  app: express.Express,
  deps: Partial<AiChatDependencies> = {},
) => {
  const aiDeps = { ...defaultAiDeps, ...deps } as AiChatDependencies;

  app.post("/api/chat", async (req, res) => {
    console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);

    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY server configuration. Add GEMINI_API_KEY to .env.local (local) and your hosting environment settings (production)." });
      }

      const rawMessages = req.body?.messages;
      if (!Array.isArray(rawMessages)) {
        return res.status(400).json({ error: "`messages` must be an array of { role, content } objects." });
      }

      const messages = sanitizeApiChatMessages(rawMessages);
      if (messages.length === 0) {
        return res.status(400).json({ error: "`messages` must include at least one valid message with role and content." });
      }

      const uid = typeof req.body?.uid === "string" ? req.body.uid.trim() : "";
      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
      const now = aiDeps.now ? aiDeps.now() : new Date();
      let systemPrompt = BASE_SYSTEM_PROMPT;

      if (uid && idToken) {
        let decoded: DecodedToken;
        try {
          decoded = await aiDeps.verifyIdToken(idToken);
        } catch {
          throw new HttpError(401, "Invalid or expired authentication token.");
        }

        if (decoded.uid !== uid) {
          throw new HttpError(403, "Token UID does not match request UID.");
        }

        if (rateLimitTracker.isLimited(uid, now.getTime(), 20, 60_000)) {
          throw new HttpError(429, "Rate limit exceeded. Try again in a minute.");
        }

        const cached = budgetDataCache.get(uid);
        let budgetData: BudgetData;

        if (cached && now.getTime() - cached.updatedAtMs <= AI_CHAT_CACHE_TTL_MS) {
          budgetData = cached.data;
        } else {
          try {
            budgetData = await aiDeps.loadUserBudgetData(uid, now, idToken);
            budgetDataCache.set(uid, { data: budgetData, updatedAtMs: now.getTime() });
          } catch (error) {
            if (isQuotaExceededError(error) && cached) {
              budgetData = cached.data;
            } else if (isQuotaExceededError(error)) {
              throw new HttpError(
                503,
                "Firestore quota exceeded. Please retry shortly or reduce read volume for this project.",
              );
            } else {
              throw error;
            }
          }
        }

        const summary = buildBudgetSummary(budgetData, now);
        systemPrompt = buildSystemPrompt(summary, now);
      }

      const reply = await callGroqApiChat(messages, systemPrompt);
      return res.json({ reply });
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error("Chat endpoint failed", error);
      const details = error instanceof Error ? error.message : "unknown error";
      return res.status(500).json({ error: `Failed to generate chat response: ${details}` });
    }
  });

  app.post("/api/ai-chat", async (req, res) => {
    const { message, uid, idToken, history } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "`message` is required." });
    }

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({ error: "`uid` is required." });
    }

    if (!idToken || typeof idToken !== "string") {
      return res.status(401).json({ error: "Authentication token is required." });
    }

    try {
      let decoded: DecodedToken;
      try {
        decoded = await aiDeps.verifyIdToken(idToken);
      } catch {
        throw new HttpError(401, "Invalid or expired authentication token.");
      }
      if (decoded.uid !== uid) {
        throw new HttpError(403, "Token UID does not match request UID.");
      }

      const now = aiDeps.now ? aiDeps.now() : new Date();
      if (rateLimitTracker.isLimited(uid, now.getTime(), 20, 60_000)) {
        throw new HttpError(429, "Rate limit exceeded. Try again in a minute.");
      }

      const cached = budgetDataCache.get(uid);
      let budgetData: BudgetData;

      if (cached && now.getTime() - cached.updatedAtMs <= AI_CHAT_CACHE_TTL_MS) {
        budgetData = cached.data;
      } else {
        try {
          budgetData = await aiDeps.loadUserBudgetData(uid, now, idToken);
          budgetDataCache.set(uid, { data: budgetData, updatedAtMs: now.getTime() });
        } catch (error) {
          if (isQuotaExceededError(error) && cached) {
            budgetData = cached.data;
          } else if (isQuotaExceededError(error)) {
            throw new HttpError(
              503,
              "Firestore quota exceeded. Please retry shortly or reduce read volume for this project.",
            );
          } else {
            throw error;
          }
        }
      }

      const summary = buildBudgetSummary(budgetData, now);
      const systemPrompt = buildSystemPrompt(summary, now);
      const recentHistory = sanitizeHistory(history).slice(-20);

      const reply = await aiDeps.callGroq([
        { role: "system", content: systemPrompt },
        ...recentHistory,
        { role: "user", content: message.trim() },
      ]);

      return res.json({ reply });
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }

      console.error("AI chat endpoint failed", error);
      const details = error instanceof Error ? error.message : "unknown error";
      return res.status(500).json({ error: `Failed to generate AI response: ${details}` });
    }
  });
};
