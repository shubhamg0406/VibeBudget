import { createClient } from "@supabase/supabase-js";

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

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new HttpError(500, "Supabase credentials not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

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

const readBody = (body: unknown): { messages: unknown; uid?: unknown; idToken?: unknown; aiConfig?: unknown } => {
  if (!body) return { messages: [] };
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return { messages: [] };
    }
  }
  if (typeof body === "object") {
    return body as { messages: unknown; uid?: unknown; idToken?: unknown; aiConfig?: unknown };
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

const BASE_SYSTEM_PROMPT = [
  "You are a helpful financial assistant for a personal budget app.",
  "Answer questions about spending, budgets, and financial goals.",
  "If you do not have enough user-specific data, say that clearly instead of guessing.",
].join(" ");

const budgetDataCache = new Map<string, { data: BudgetData; updatedAtMs: number }>();
const AI_CHAT_CACHE_TTL_MS = Number(process.env.AI_CHAT_CACHE_TTL_MS || 300_000);

const loadUserBudgetData = async (uid: string): Promise<BudgetData> => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: transactions, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("date, vendor, amount, category_id, category_name, notes")
    .eq("user_id", uid)
    .eq("deleted", false);

  if (txError) throw new HttpError(500, `Failed to fetch transactions: ${txError.message}`);

  const { data: income, error: incError } = await supabaseAdmin
    .from("income")
    .select("date, source, amount, category, notes")
    .eq("user_id", uid)
    .eq("deleted", false);

  if (incError) throw new HttpError(500, `Failed to fetch income: ${incError.message}`);

  const { data: categories, error: catError } = await supabaseAdmin
    .from("categories")
    .select("name, target_amount")
    .eq("user_id", uid)
    .eq("deleted", false);

  if (catError) throw new HttpError(500, `Failed to fetch categories: ${catError.message}`);

  return {
    transactions: (transactions || []) as AiTransaction[],
    income: (income || []) as AiIncome[],
    categories: (categories || []) as AiCategory[],
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
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
      const supabaseAdmin = getSupabaseAdmin();
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(idToken);
      if (authError || !user) {
        throw new HttpError(401, "Invalid or expired authentication token.");
      }
      if (user.id !== uid) {
        throw new HttpError(403, "Token UID does not match request UID.");
      }

      const cached = budgetDataCache.get(uid);
      let budgetData: BudgetData;

      if (cached && now.getTime() - cached.updatedAtMs <= AI_CHAT_CACHE_TTL_MS) {
        budgetData = cached.data;
      } else {
        budgetData = await loadUserBudgetData(uid);
        budgetDataCache.set(uid, { data: budgetData, updatedAtMs: now.getTime() });
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

  const rawAiConfig = parsedBody.aiConfig as Record<string, string> | undefined;
  const hasUserConfig = rawAiConfig && typeof rawAiConfig.provider === "string" && typeof rawAiConfig.apiKey === "string";
  const config: { provider: "gemini" | "deepseek"; model: string; apiKey: string } = hasUserConfig
    ? { provider: rawAiConfig.provider as "gemini" | "deepseek", model: rawAiConfig.model || "deepseek-chat", apiKey: rawAiConfig.apiKey }
    : { provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", apiKey: process.env.GEMINI_API_KEY || "" };

  if (!config.apiKey) {
    return res.status(500).json({ error: "AI API key is not configured. Set it in Settings or add GEMINI_API_KEY to your environment." });
  }

  const { callAiChat } = await import("../src/server/aiClient.js");

  try {
    const reply = await callAiChat(config, [
      { role: "system", content: systemPrompt },
      ...messages,
    ]);
    return res.status(200).json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    return res.status(502).json({ error: message });
  }
}
