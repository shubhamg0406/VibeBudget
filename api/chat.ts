import fs from "fs";

interface AiTransaction {
  date: string;
  vendor: string;
  amount: number;
  category_id: string;
  category_name: string;
  notes?: string;
  uid?: string;
}

interface AiIncome {
  date: string;
  source: string;
  amount: number;
  category: string;
  notes?: string;
  uid?: string;
}

interface AiCategory {
  name: string;
  target_amount: number;
  uid?: string;
}

interface BudgetData {
  transactions: AiTransaction[];
  income: AiIncome[];
  categories: AiCategory[];
}

interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  categoryPerformance: Array<{ name: string; spent: number; target: number; pct: number }>;
  topVendors: Array<{ vendor: string; total: number }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
  transactions: Array<{
    date: string;
    vendor: string;
    amount: number;
    category_id: string;
    category_name: string;
    notes?: string;
  }>;
  income: Array<{
    date: string;
    source: string;
    amount: number;
    category: string;
    notes?: string;
  }>;
  dateRange: { start: string; end: string };
}

type ApiMessageRole = "user" | "assistant";

interface ApiMessage {
  role: ApiMessageRole;
  content: string;
}

interface GeminiCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface DecodedToken {
  uid: string;
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

const sanitizeMessages = (messages: unknown): ApiMessage[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
        return { role, content: content.trim() } as ApiMessage;
      }
      return null;
    })
    .filter((item): item is ApiMessage => Boolean(item));
};

const readBody = (body: unknown): { messages: unknown; uid?: unknown; idToken?: unknown } => {
  if (!body) return { messages: [] };
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return { messages: [] };
    }
  }
  if (typeof body === "object") {
    return body as { messages: unknown; uid?: unknown; idToken?: unknown };
  }
  return { messages: [] };
};

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

const getProviderErrorMessage = async (response: Response) => {
  const payload = await response.json().catch(() => null);
  return extractProviderErrorMessage(payload, `Gemini request failed (${response.status})`);
};

const startOfSixMonthWindow = (now: Date) => new Date(now.getFullYear(), now.getMonth() - 5, 1);

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

const getLastSixMonths = (now: Date) => {
  const months: string[] = [];
  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push(monthKey(date));
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

const buildBudgetSummary = (rawData: BudgetData, now: Date): BudgetSummary => {
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

  const months = getLastSixMonths(now);
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

  const windowStart = startOfSixMonthWindow(now).toISOString().slice(0, 10);
  const windowEnd = now.toISOString().slice(0, 10);

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

const buildSystemPrompt = (summary: BudgetSummary, now: Date) => {
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
    : "No transactions found in this period.";

  const income = summary.income.length > 0
    ? summary.income
      .map((item) => `${item.date} | ${item.source} | ${formatCurrency(item.amount)} | ${item.category}`)
      .join("\n")
    : "No income records found in this period.";

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
    "Monthly Trend (last 6 months)",
    monthlyTrend,
    "",
    "All Transactions (last 6 months)",
    transactions,
    "",
    "All Income Records (last 6 months)",
    income,
  ].join("\n");
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

const isRestFallbackEnabled = () => {
  const configured = process.env.ALLOW_FIREBASE_REST_FALLBACK;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured === "true";
  }
  return process.env.NODE_ENV === "production";
};

const resolveDataNamespaceCandidates = () => {
  const candidates = [
    (process.env.FIREBASE_DATA_NAMESPACE || "").trim(),
    (process.env.VITE_FIREBASE_DATA_NAMESPACE || "").trim(),
    process.env.NODE_ENV === "production" ? "prod" : "local-dev",
    "prod",
    "local-dev",
    "",
  ];

  const deduped: string[] = [];
  for (const candidate of candidates) {
    if (!deduped.includes(candidate)) deduped.push(candidate);
  }
  return deduped;
};

const buildRootPaths = (uid: string) => {
  const namespaces = resolveDataNamespaceCandidates().filter(Boolean);
  const withNamespace = namespaces.map((namespace) => `environments/${namespace}/users/${uid}`);
  return [...withNamespace, `users/${uid}`];
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
  windowStartDate: string,
  limitTo = 500,
) => {
  const snapshot = await collectionRef
    .where("date", ">=", windowStartDate)
    .orderBy("date", "desc")
    .limit(limitTo)
    .get();
  return snapshot.docs.map((doc) => doc.data());
};

const fetchCollectionViaRest = async (
  projectId: string,
  databaseId: string,
  collectionPath: string,
  idToken: string,
): Promise<any[]> => {
  const encodedPath = collectionPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodedPath}?pageSize=500`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Firestore REST request failed (${response.status}): ${payload || response.statusText}`);
  }

  const payload = await response.json() as { documents?: any[] };
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return documents.map((doc) => decodeFirestoreDocument(doc));
};

const loadUserBudgetDataFromFirestoreRest = async (uid: string, now: Date, idToken: string): Promise<BudgetData> => {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new HttpError(500, "Missing FIREBASE_PROJECT_ID/VITE_FIREBASE_PROJECT_ID for Firestore REST fallback.");
  }

  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "(default)";
  const rootPaths = buildRootPaths(uid);
  const windowStartDate = startOfSixMonthWindow(now).toISOString().slice(0, 10);

  for (const rootPath of rootPaths) {
    try {
      const [transactions, income, categories] = await Promise.all([
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/transactions`, idToken),
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/income`, idToken),
        fetchCollectionViaRest(projectId, databaseId, `${rootPath}/categories`, idToken),
      ]);

      const filteredTransactions = (transactions as AiTransaction[])
        .filter((item) => typeof item.date === "string" && item.date >= windowStartDate)
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 500);
      const filteredIncome = (income as AiIncome[])
        .filter((item) => typeof item.date === "string" && item.date >= windowStartDate)
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 500);
      const parsedCategories = categories as AiCategory[];

      if (
        filteredTransactions.length > 0
        || filteredIncome.length > 0
        || parsedCategories.length > 0
        || rootPath === rootPaths[rootPaths.length - 1]
      ) {
        return {
          transactions: filteredTransactions,
          income: filteredIncome,
          categories: parsedCategories,
        };
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      console.error(`Vercel AI chat Firestore REST load failed for ${rootPath}:`, details);
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
    console.warn("Vercel AI chat Firebase Admin init failed, trying REST fallback:", details);
    return loadUserBudgetDataFromFirestoreRest(uid, now, idToken);
  }

  const rootPaths = buildRootPaths(uid);
  const windowStartDate = startOfSixMonthWindow(now).toISOString().slice(0, 10);

  for (const rootPath of rootPaths) {
    const parts = rootPath.split("/");
    const [first, second, ...rest] = parts;
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
        fetchCollection(transactionsRef, windowStartDate, 500),
        fetchCollection(incomeRef, windowStartDate, 500),
        categoriesRef.get(),
      ]);

      const categories = categoriesSnapshot.docs.map((doc) => doc.data());
      if (
        transactions.length > 0
        || income.length > 0
        || categories.length > 0
        || rootPath === rootPaths[rootPaths.length - 1]
      ) {
        return {
          transactions: transactions as AiTransaction[],
          income: income as AiIncome[],
          categories: categories as AiCategory[],
        };
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      console.error(`Vercel AI chat Firestore load failed for root ${rootPath}:`, details);
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

const verifyIdToken = async (idToken: string): Promise<DecodedToken> => {
  try {
    const { auth } = await loadFirebaseAdmin();
    return await auth.verifyIdToken(idToken);
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
};

const isQuotaExceededError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("RESOURCE_EXHAUSTED")
    || message.toLowerCase().includes("quota exceeded")
    || message.includes("Firestore REST request failed (429)")
  );
};

const BASE_SYSTEM_PROMPT = [
  "You are a helpful financial assistant for a personal budget app.",
  "Answer questions about spending, budgets, and financial goals.",
  "If you do not have enough user-specific data, say that clearly instead of guessing.",
].join(" ");

const budgetDataCache = new Map<string, { data: BudgetData; updatedAtMs: number }>();
const AI_CHAT_CACHE_TTL_MS = Number(process.env.AI_CHAT_CACHE_TTL_MS || 300_000);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY server configuration." });
  }

  const parsedBody = readBody(req.body);
  const messages = sanitizeMessages(parsedBody.messages);
  if (messages.length === 0) {
    return res.status(400).json({ error: "`messages` must include at least one valid message." });
  }

  const uid = typeof parsedBody.uid === "string" ? parsedBody.uid.trim() : "";
  const idToken = typeof parsedBody.idToken === "string" ? parsedBody.idToken.trim() : "";
  const now = new Date();
  let systemPrompt = BASE_SYSTEM_PROMPT;

  if (uid && idToken) {
    try {
      const decoded = await verifyIdToken(idToken);
      if (decoded.uid !== uid) {
        throw new HttpError(403, "Token UID does not match request UID.");
      }

      const cached = budgetDataCache.get(uid);
      let budgetData: BudgetData;

      if (cached && now.getTime() - cached.updatedAtMs <= AI_CHAT_CACHE_TTL_MS) {
        budgetData = cached.data;
      } else {
        try {
          budgetData = await loadUserBudgetDataFromFirestore(uid, now, idToken);
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
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }
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
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const details = await getProviderErrorMessage(response);
    return res.status(response.status).json({ error: details });
  }

  const payload = await response.json() as GeminiCompletionResponse;
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return res.status(502).json({ error: "Gemini returned an empty response." });
  }

  return res.status(200).json({ reply });
}
