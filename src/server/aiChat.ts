import type express from "express";
import fs from "fs";
import { callAiChat } from "./aiClient.js";
import { createClient } from "@supabase/supabase-js";

interface AiTransaction { date: string; vendor: string; amount: number; category_id: string; category_name: string; notes?: string; uid?: string; }
interface AiIncome { date: string; source: string; amount: number; category: string; notes?: string; uid?: string; }
interface AiCategory { name: string; target_amount: number; uid?: string; }
interface BudgetData { transactions: AiTransaction[]; income: AiIncome[]; categories: AiCategory[]; }

interface BudgetSummary {
  totalIncome: number; totalExpenses: number; netBalance: number;
  categoryPerformance: Array<{ name: string; spent: number; target: number; pct: number }>;
  topVendors: Array<{ vendor: string; total: number }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
  transactions: Array<{ date: string; vendor: string; amount: number; category_id: string; category_name: string; notes?: string; }>;
  income: Array<{ date: string; source: string; amount: number; category: string; notes?: string; }>;
  dateRange: { start: string; end: string };
}

interface DecodedToken { uid: string; }

class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

const getSupabaseAdmin = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new HttpError(500, "Supabase credentials not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
};

const toNumber = (value: unknown) => { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const p = Number(value); return Number.isFinite(p) ? p : 0; } return 0; };
const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const formatCurrency = (value: number) => { const s = Number.isFinite(value) ? value : 0; return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(s); };
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const getMonthlyKeysInRange = (startMonth: string, endMonth: string) => {
  const [sy, sm] = startMonth.split("-").map(Number); const [ey, em] = endMonth.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, 1); const end = new Date(ey, em - 1, 1); const months: string[] = [];
  while (cursor <= end) { months.push(monthKey(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
  return months;
};

const sanitizeTransactions = (txs: AiTransaction[]) => txs.map((i) => ({ date: asString(i.date), vendor: asString(i.vendor), amount: toNumber(i.amount), category_id: asString(i.category_id), category_name: asString(i.category_name), notes: asString(i.notes) })).filter((i) => i.date && i.vendor && i.category_name).sort((a, b) => b.date.localeCompare(a.date));
const sanitizeIncome = (inc: AiIncome[]) => inc.map((i) => ({ date: asString(i.date), source: asString(i.source), amount: toNumber(i.amount), category: asString(i.category), notes: asString(i.notes) })).filter((i) => i.date && i.source).sort((a, b) => b.date.localeCompare(a.date));
const sanitizeCategories = (cats: AiCategory[]) => cats.map((i) => ({ name: asString(i.name), target_amount: toNumber(i.target_amount) })).filter((i) => i.name);

export const buildBudgetSummary = (rawData: BudgetData, now: Date): BudgetSummary => {
  const transactions = sanitizeTransactions(rawData.transactions);
  const income = sanitizeIncome(rawData.income);
  const categories = sanitizeCategories(rawData.categories);
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = transactions.reduce((s, i) => s + i.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const spendingByCategory = new Map<string, number>();
  transactions.forEach((i) => spendingByCategory.set(i.category_name, (spendingByCategory.get(i.category_name) || 0) + i.amount));
  const categoryNames = new Set([...categories.map((i) => i.name), ...spendingByCategory.keys()]);
  const targetByCategory = new Map(categories.map((i) => [i.name, i.target_amount]));
  const categoryPerformance = Array.from(categoryNames).map((name) => { const spent = spendingByCategory.get(name) || 0; const target = targetByCategory.get(name) || 0; const pct = target > 0 ? Number(((spent / target) * 100).toFixed(1)) : 0; return { name, spent, target, pct }; }).sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
  const vendorTotals = new Map<string, number>();
  transactions.forEach((i) => vendorTotals.set(i.vendor, (vendorTotals.get(i.vendor) || 0) + i.amount));
  const topVendors = Array.from(vendorTotals.entries()).map(([vendor, total]) => ({ vendor, total })).sort((a, b) => b.total - a.total || a.vendor.localeCompare(b.vendor)).slice(0, 5);
  const allMonths = [...transactions.map((i) => i.date.slice(0, 7)), ...income.map((i) => i.date.slice(0, 7))].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  const startMonth = allMonths[0] || monthKey(now); const endMonth = allMonths[allMonths.length - 1] || monthKey(now);
  const months = getMonthlyKeysInRange(startMonth, endMonth);
  const monthIncomeMap = new Map(months.map((m) => [m, 0])); const monthExpenseMap = new Map(months.map((m) => [m, 0]));
  income.forEach((i) => { const m = i.date.slice(0, 7); if (monthIncomeMap.has(m)) monthIncomeMap.set(m, (monthIncomeMap.get(m) || 0) + i.amount); });
  transactions.forEach((i) => { const m = i.date.slice(0, 7); if (monthExpenseMap.has(m)) monthExpenseMap.set(m, (monthExpenseMap.get(m) || 0) + i.amount); });
  const monthlyTrend = months.map((m) => ({ month: m, income: monthIncomeMap.get(m) || 0, expenses: monthExpenseMap.get(m) || 0 }));
  const allDates = [...transactions.map((i) => i.date), ...income.map((i) => i.date)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return { totalIncome, totalExpenses, netBalance, categoryPerformance, topVendors, monthlyTrend, transactions, income, dateRange: { start: allDates[0] || now.toISOString().slice(0, 10), end: allDates[allDates.length - 1] || now.toISOString().slice(0, 10) } };
};

export const buildSystemPrompt = (summary: BudgetSummary, now: Date) => {
  const categories = summary.categoryPerformance.length > 0 ? summary.categoryPerformance.map((c) => `- ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(c.target)} target (${c.pct}%)`).join("\n") : "- No category data available";
  const vendors = summary.topVendors.length > 0 ? summary.topVendors.map((v) => `- ${v.vendor}: ${formatCurrency(v.total)}`).join("\n") : "- No vendor data available";
  const monthlyTrend = summary.monthlyTrend.length > 0 ? summary.monthlyTrend.map((m) => `- ${m.month}: Income ${formatCurrency(m.income)} | Expenses ${formatCurrency(m.expenses)}`).join("\n") : "- No monthly data available";
  const transactions = summary.transactions.length > 0 ? summary.transactions.map((i) => `${i.date} | ${i.vendor} | ${formatCurrency(i.amount)} | ${i.category_name}${i.notes ? ` | ${i.notes}` : ""}`).join("\n") : "No transactions found.";
  const income = summary.income.length > 0 ? summary.income.map((i) => `${i.date} | ${i.source} | ${formatCurrency(i.amount)} | ${i.category}`).join("\n") : "No income records found.";
  return ["You are a friendly, sharp personal finance assistant for VibeBudget.", `Today's date is ${now.toISOString().slice(0, 10)}.`, `User's Budget Summary (${summary.dateRange.start} to ${summary.dateRange.end})`, `Total Income: ${formatCurrency(summary.totalIncome)}`, `Total Expenses: ${formatCurrency(summary.totalExpenses)}`, `Net Balance: ${formatCurrency(summary.netBalance)}`, "", "Category Performance", categories, "", "Top Vendors by Spend", vendors, "", "Monthly Trend", monthlyTrend, "", "All Transactions", transactions, "", "All Income Records", income].join("\n");
};

const verifyIdToken = async (idToken: string): Promise<DecodedToken> => {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(idToken);
  if (error || !user) throw new Error("Invalid or expired authentication token.");
  return { uid: user.id };
};

const loadUserBudgetData = async (uid: string): Promise<BudgetData> => {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: transactions, error: txError } = await supabaseAdmin.from("transactions").select("date, vendor, amount, category_id, category_name, notes").eq("user_id", uid).eq("deleted", false);
  if (txError) throw new HttpError(500, `Failed to fetch transactions: ${txError.message}`);
  const { data: income, error: incError } = await supabaseAdmin.from("income").select("date, source, amount, category, notes").eq("user_id", uid).eq("deleted", false);
  if (incError) throw new HttpError(500, `Failed to fetch income: ${incError.message}`);
  const { data: categories, error: catError } = await supabaseAdmin.from("categories").select("name, target_amount").eq("user_id", uid).eq("deleted", false);
  if (catError) throw new HttpError(500, `Failed to fetch categories: ${catError.message}`);
  return { transactions: (transactions || []) as AiTransaction[], income: (income || []) as AiIncome[], categories: (categories || []) as AiCategory[] };
};

const BASE_SYSTEM_PROMPT = "You are a helpful financial assistant for a personal budget app. Answer questions about spending, budgets, and financial goals. If you do not have enough user-specific data, say that clearly instead of guessing.";
const budgetDataCache = new Map<string, { data: BudgetData; updatedAtMs: number }>();
const AI_CHAT_CACHE_TTL_MS = Number(process.env.AI_CHAT_CACHE_TTL_MS || 300_000);

export interface AiChatDependencies {
  verifyIdToken: (idToken: string) => Promise<DecodedToken>;
  loadUserBudgetData: (uid: string, now: Date, idToken?: string) => Promise<BudgetData>;
}

export const createDependencies = (): AiChatDependencies => ({ verifyIdToken, loadUserBudgetData });

export function registerAiChatRoute(app: express.Express, deps: AiChatDependencies = createDependencies()) {
  app.post("/api/chat", async (req, res) => {
    const { uid, idToken, messages, aiConfig } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "`messages` must include at least one valid message." });
    const now = new Date();
    let systemPrompt = BASE_SYSTEM_PROMPT;

    if (uid && idToken) {
      try {
        const decoded = await deps.verifyIdToken(idToken);
        if (decoded.uid !== uid) throw new HttpError(403, "Token UID does not match request UID.");
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
        if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
        return res.status(401).json({ error: "Invalid or expired authentication token." });
      }
    }

    const config = aiConfig?.apiKey
      ? { provider: aiConfig.provider || "gemini", model: aiConfig.model || "deepseek-chat", apiKey: aiConfig.apiKey }
      : { provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", apiKey: process.env.GEMINI_API_KEY || "" };
    if (!config.apiKey) return res.status(500).json({ error: "AI API key is not configured." });

    try {
      const reply = await callAiChat(config, [{ role: "system", content: systemPrompt }, ...messages]);
      res.json({ reply });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI request failed";
      res.status(502).json({ error: msg });
    }
  });
}
