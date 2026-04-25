import { ExpenseCategory, Income, Transaction, UpcomingRecurringInstance } from "../types";
import { convertToBaseCurrency } from "./currencyUtils";

export type InsightPillar =
  | "spending-analysis"
  | "income-tracking"
  | "budget-health"
  | "trends-forecasting"
  | "goals-milestones"
  | "smart-alerts";

export interface DashboardInsight {
  pillar: InsightPillar;
  title: string;
  message?: string;
  tone: InsightTone;
  tiles: DashboardInsightTile[];
  alerts?: DashboardInsightAlert[];
}

export type InsightTone = "good" | "warn" | "bad" | "info";

export interface DashboardInsightTile {
  value: string;
  label: string;
  context?: string;
  tone: InsightTone;
}

export interface DashboardInsightAlert {
  label: string;
  tone: InsightTone;
}

interface InsightInput {
  transactions: Transaction[];
  allTransactions: Transaction[];
  income: Income[];
  previousTransactions: Transaction[];
  previousIncome: Income[];
  expenseCategories: ExpenseCategory[];
  upcomingRecurring: UpcomingRecurringInstance[];
  monthMultiplier: number;
  baseCurrency: string;
  exchangeRates: Array<{ currency: string; rateToBase: number }>;
}

const formatMoney = (value: number, symbol: string) => {
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatMoneyCompact = (value: number, symbol: string) => {
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (amount >= 1_000_000) return `${sign}${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sign}${symbol}${(amount / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const formatPct = (value: number, digits = 0) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

const getBudgetTone = (value: number): InsightTone => {
  if (value > 100) return "bad";
  if (value > 85) return "warn";
  return "good";
};

const getSavingsTone = (value: number): InsightTone => {
  if (value >= 20) return "good";
  if (value >= 10) return "warn";
  return "bad";
};

const getDayDiff = (left: string, right: string) => {
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  const diffMs = Math.abs(leftDate.getTime() - rightDate.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const isFixedLike = (transaction: Transaction) => {
  if (transaction.is_recurring_instance) return true;
  const text = `${transaction.category_name} ${transaction.vendor} ${transaction.notes || ""}`.toLowerCase();
  return /(rent|insurance|telecom|utility|internet|phone|mortgage|loan|subscription|gym|netflix|spotify)/.test(text);
};

const isSideIncome = (record: Income) => {
  const text = `${record.source} ${record.category || ""} ${record.notes || ""}`.toLowerCase();
  return !/(salary|payroll|employer|job|w2|full[- ]?time)/.test(text);
};

const getAmountStats = (values: number[]) => {
  if (values.length === 0) return { avg: 0, std: 0 };
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return { avg, std: Math.sqrt(variance) };
};

export const generateDashboardInsights = ({
  transactions,
  allTransactions,
  income,
  previousTransactions,
  previousIncome,
  expenseCategories,
  upcomingRecurring,
  monthMultiplier,
  baseCurrency,
  exchangeRates,
}: InsightInput): DashboardInsight[] => {
  const currencyPrefs = { baseCurrency, exchangeRates };
  const symbol = baseCurrency === "EUR" ? "€" : baseCurrency === "GBP" ? "£" : baseCurrency === "INR" ? "₹" : "$";
  const toBase = (amount: number, currency?: string) => convertToBaseCurrency(amount, currency, currencyPrefs);

  const totalSpend = transactions.reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const totalIncome = income.reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const previousSpend = previousTransactions.reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const previousTotalIncome = previousIncome.reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const net = totalIncome - totalSpend;

  const spendByCategory = new Map<string, number>();
  transactions.forEach((item) => {
    const key = item.category_name || "Uncategorized";
    spendByCategory.set(key, (spendByCategory.get(key) || 0) + toBase(item.amount, item.currency));
  });

  const spendByMerchant = new Map<string, number>();
  transactions.forEach((item) => {
    const key = (item.vendor || "Unknown").trim();
    if (!key) return;
    spendByMerchant.set(key, (spendByMerchant.get(key) || 0) + toBase(item.amount, item.currency));
  });

  const sourceTotals = new Map<string, number>();
  income.forEach((item) => {
    const key = (item.source || "Unknown").trim();
    if (!key) return;
    sourceTotals.set(key, (sourceTotals.get(key) || 0) + toBase(item.amount, item.currency));
  });

  const topCategory = Array.from(spendByCategory.entries()).sort((a, b) => b[1] - a[1])[0];
  const topMerchant = Array.from(spendByMerchant.entries()).sort((a, b) => b[1] - a[1])[0];

  const fixedSpend = transactions
    .filter((item) => isFixedLike(item))
    .reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const variableSpend = Math.max(0, totalSpend - fixedSpend);

  const spendingInsight: DashboardInsight = topCategory
    ? {
      pillar: "spending-analysis",
      title: "Spending Analysis",
      tone: "info",
      tiles: [
        {
          value: formatMoneyCompact(totalSpend, symbol),
          label: "Total spend",
          context: previousSpend > 0 ? `${formatPct(((totalSpend - previousSpend) / previousSpend) * 100, 0)} vs prior` : "Baseline period",
          tone: previousSpend > 0 && totalSpend > previousSpend ? "bad" : "good",
        },
        {
          value: formatMoneyCompact(topCategory[1], symbol),
          label: "Top category",
          context: topCategory[0],
          tone: "info",
        },
        {
          value: `${Math.round(totalSpend > 0 ? (fixedSpend / totalSpend) * 100 : 0)}%`,
          label: "Fixed spend",
          context: `${Math.round(totalSpend > 0 ? (variableSpend / totalSpend) * 100 : 0)}% variable`,
          tone: fixedSpend / Math.max(totalSpend, 1) > 0.65 ? "warn" : "info",
        },
      ],
      message: `${topCategory[0]} is your largest category at ${formatMoney(topCategory[1], symbol)} (${totalSpend > 0 ? Math.round((topCategory[1] / totalSpend) * 100) : 0}% of spend). Top merchant: ${topMerchant?.[0] || "n/a"} (${formatMoney(topMerchant?.[1] || 0, symbol)}). Fixed vs variable split: ${Math.round(totalSpend > 0 ? (fixedSpend / totalSpend) * 100 : 0)}% / ${Math.round(totalSpend > 0 ? (variableSpend / totalSpend) * 100 : 0)}%.`,
    }
    : {
      pillar: "spending-analysis",
      title: "Spending Analysis",
      tone: "info",
      tiles: [
        { value: `${symbol}0`, label: "Total spend", context: "No transactions", tone: "info" },
        { value: "0", label: "Categories", context: "Add expenses", tone: "info" },
      ],
      message: "Add more transactions to unlock category, merchant, and fixed-vs-variable breakdowns.",
    };

  const topSource = Array.from(sourceTotals.entries()).sort((a, b) => b[1] - a[1])[0];
  const sideIncome = income.filter(isSideIncome).reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const prevSideIncome = previousIncome.filter(isSideIncome).reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);
  const sideGrowth = prevSideIncome > 0 ? ((sideIncome - prevSideIncome) / prevSideIncome) * 100 : (sideIncome > 0 ? 100 : 0);

  const incomeInsight: DashboardInsight = totalIncome > 0
    ? {
      pillar: "income-tracking",
      title: "Income Tracking",
      tone: topSource && totalIncome > 0 && (topSource[1] / totalIncome) > 0.8 ? "warn" : "info",
      tiles: [
        {
          value: formatMoneyCompact(totalIncome, symbol),
          label: "Total income",
          context: previousTotalIncome > 0 ? `${formatPct(((totalIncome - previousTotalIncome) / previousTotalIncome) * 100, 0)} vs prior` : "Baseline period",
          tone: previousTotalIncome > 0 && totalIncome < previousTotalIncome ? "warn" : "good",
        },
        {
          value: `${sourceTotals.size || 1}`,
          label: "Income sources",
          context: topSource?.[0] || "Primary source",
          tone: sourceTotals.size > 1 ? "good" : "warn",
        },
        {
          value: formatMoneyCompact(net, symbol),
          label: "Net take-home",
          context: `${formatMoneyCompact(sideIncome, symbol)} side income`,
          tone: net >= 0 ? "good" : "bad",
        },
      ],
      message: `You had ${sourceTotals.size || 1} income source${sourceTotals.size === 1 ? "" : "s"}. Largest source is ${topSource?.[0] || "n/a"} at ${topSource && totalIncome > 0 ? Math.round((topSource[1] / totalIncome) * 100) : 0}% of income. Net take-home is ${formatMoney(net, symbol)} (${previousTotalIncome > 0 ? `${(((totalIncome - previousTotalIncome) / previousTotalIncome) * 100).toFixed(1)}% vs previous period` : "first tracked period"}). Side income is ${formatMoney(sideIncome, symbol)} (${sideGrowth >= 0 ? "+" : ""}${sideGrowth.toFixed(1)}%).`,
    }
    : {
      pillar: "income-tracking",
      title: "Income Tracking",
      tone: "info",
      tiles: [
        { value: `${symbol}0`, label: "Total income", context: "No income logged", tone: "info" },
        { value: "0", label: "Income sources", context: "Add income", tone: "info" },
      ],
      message: "No income in this range yet. Once you log income, we’ll track source mix, net trends, and side-income growth.",
    };

  const totalTargets = expenseCategories.reduce((sum, item) => sum + ((item.target_amount || 0) * monthMultiplier), 0);
  const spendToPlanPct = totalTargets > 0 ? (totalSpend / totalTargets) * 100 : 0;
  const today = new Date();
  const daysElapsed = Math.max(1, today.getDate());
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projectedSpend = (totalSpend / daysElapsed) * daysInMonth;
  const projectedBalance = totalIncome - projectedSpend;

  const budgetHealthInsight: DashboardInsight = totalTargets > 0
    ? {
      pillar: "budget-health",
      title: "Budget Health",
      tone: getBudgetTone(spendToPlanPct),
      tiles: [
        {
          value: `${spendToPlanPct.toFixed(0)}%`,
          label: "Budget used",
          context: spendToPlanPct > 100 ? `${formatMoneyCompact(totalSpend - totalTargets, symbol)} over` : `${formatMoneyCompact(totalTargets - totalSpend, symbol)} left`,
          tone: getBudgetTone(spendToPlanPct),
        },
        {
          value: formatMoneyCompact(totalTargets, symbol),
          label: "Planned spend",
          context: `${formatMoneyCompact(totalSpend, symbol)} actual`,
          tone: "info",
        },
        {
          value: formatMoneyCompact(projectedBalance, symbol),
          label: "Projected balance",
          context: "Month-end pace",
          tone: projectedBalance >= 0 ? "good" : "bad",
        },
      ],
      message: `Planned vs actual spend: ${formatMoney(totalTargets, symbol)} vs ${formatMoney(totalSpend, symbol)} (${spendToPlanPct.toFixed(1)}%). ${spendToPlanPct > 100 ? `You are over plan by ${formatMoney(totalSpend - totalTargets, symbol)}.` : `You have ${formatMoney(totalTargets - totalSpend, symbol)} headroom.`} At the current pace, projected end-of-month balance is ${formatMoney(projectedBalance, symbol)}.`,
    }
    : {
      pillar: "budget-health",
      title: "Budget Health",
      tone: "info",
      tiles: [
        { value: formatMoneyCompact(totalSpend, symbol), label: "Total spend", context: "No targets", tone: totalSpend > totalIncome ? "bad" : "info" },
        { value: formatMoneyCompact(totalIncome, symbol), label: "Total income", context: "Set targets", tone: totalIncome > 0 ? "good" : "info" },
      ],
      message: `You spent ${formatMoney(totalSpend, symbol)} and brought in ${formatMoney(totalIncome, symbol)} in this range. Set category targets to unlock planned-vs-actual and early overspend flags.`,
    };

  const recurringUpcomingExpense = upcomingRecurring
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const recurringUpcomingIncome = upcomingRecurring
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const recurringCount = new Set(allTransactions.filter((item) => item.recurring_rule_id).map((item) => item.recurring_rule_id)).size;
  const spendTrendPct = previousSpend > 0 ? ((totalSpend - previousSpend) / previousSpend) * 100 : 0;

  const trendInsight: DashboardInsight = {
    pillar: "trends-forecasting",
    title: "Trends & Forecasting",
    tone: spendTrendPct > 12 ? "bad" : spendTrendPct > 0 ? "warn" : "good",
    tiles: [
      {
        value: previousSpend > 0 ? formatPct(spendTrendPct, 0) : "New",
        label: "Spend trend",
        context: previousSpend > 0 ? "Vs prior period" : "Baseline period",
        tone: spendTrendPct > 12 ? "bad" : spendTrendPct > 0 ? "warn" : "good",
      },
      {
        value: `${recurringCount}`,
        label: "Recurring rules",
        context: `${formatMoneyCompact(recurringUpcomingExpense, symbol)} due`,
        tone: recurringUpcomingExpense > recurringUpcomingIncome ? "warn" : "info",
      },
      {
        value: formatMoneyCompact(recurringUpcomingIncome - recurringUpcomingExpense, symbol),
        label: "30-day net",
        context: "Recurring forecast",
        tone: recurringUpcomingIncome >= recurringUpcomingExpense ? "good" : "bad",
      },
    ],
    message: `Spending trend is ${previousSpend > 0 ? `${spendTrendPct >= 0 ? "+" : ""}${spendTrendPct.toFixed(1)}% vs previous period` : "starting baseline tracking"}. Detected recurring charges: ${recurringCount}. Next 30 days projection from recurring rules: ${formatMoney(recurringUpcomingIncome, symbol)} income and ${formatMoney(recurringUpcomingExpense, symbol)} expenses.`,
  };

  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
  const normalizedMonthMultiplier = monthMultiplier > 0 ? monthMultiplier : 1;
  const monthlySpendRunRate = totalSpend / normalizedMonthMultiplier;
  const bufferMonths = monthlySpendRunRate > 0 ? net / monthlySpendRunRate : 0;
  const debtLikeSpend = transactions
    .filter((item) => /(loan|debt|credit card|interest|emi)/i.test(`${item.category_name} ${item.vendor} ${item.notes || ""}`))
    .reduce((sum, item) => sum + toBase(item.amount, item.currency), 0);

  const goalsInsight: DashboardInsight = {
    pillar: "goals-milestones",
    title: "Goals & Milestones",
    tone: getSavingsTone(savingsRate),
    tiles: [
      {
        value: `${savingsRate.toFixed(0)}%`,
        label: "Savings rate",
        context: "This period",
        tone: getSavingsTone(savingsRate),
      },
      {
        value: `${Math.max(0, bufferMonths).toFixed(1)} mo`,
        label: "Spend buffer",
        context: "Current surplus",
        tone: bufferMonths >= 1 ? "good" : bufferMonths > 0 ? "warn" : "bad",
      },
      {
        value: formatMoneyCompact(debtLikeSpend, symbol),
        label: "Debt outflow",
        context: debtLikeSpend > 0 ? "Tracked payments" : "None detected",
        tone: debtLikeSpend > 0 ? "warn" : "good",
      },
    ],
    message: `Savings rate is ${savingsRate.toFixed(1)}% this period. Current surplus covers about ${Math.max(0, bufferMonths).toFixed(1)} month(s) of spend at this pace. ${debtLikeSpend > 0 ? `Debt-related outflow tracked: ${formatMoney(debtLikeSpend, symbol)}.` : "No debt-paydown category detected in this range."}`,
  };

  const expenseHistory = allTransactions.map((item) => ({
    ...item,
    baseAmount: toBase(item.amount, item.currency),
  }));
  const stats = getAmountStats(expenseHistory.map((item) => item.baseAmount));
  const unusual = expenseHistory
    .filter((item) => item.baseAmount > Math.max(stats.avg * 1.8, stats.avg + (2 * stats.std)))
    .sort((a, b) => b.baseAmount - a.baseAmount)[0];

  const duplicateMap = new Map<string, string[]>();
  expenseHistory.forEach((item) => {
    const key = `${(item.vendor || "").trim().toLowerCase()}|${item.baseAmount.toFixed(2)}`;
    if (!duplicateMap.has(key)) duplicateMap.set(key, []);
    duplicateMap.get(key)!.push(item.date);
  });
  let duplicateHint = "";
  duplicateMap.forEach((dates, key) => {
    if (duplicateHint) return;
    if (dates.length < 2) return;
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    for (let index = 1; index < sorted.length; index += 1) {
      if (getDayDiff(sorted[index], sorted[index - 1]) <= 3) {
        const [vendor, amount] = key.split("|");
        duplicateHint = `${vendor || "Unknown vendor"} around ${formatMoney(Number(amount), symbol)}`;
        return;
      }
    }
  });

  const alertInsight: DashboardInsight = unusual || duplicateHint
    ? {
      pillar: "smart-alerts",
      title: "Smart Alerts",
      tone: "warn",
      tiles: [
        { value: `${unusual ? 1 : 0}`, label: "Spend spikes", context: unusual?.vendor || "Clear", tone: unusual ? "warn" : "good" },
        { value: `${duplicateHint ? 1 : 0}`, label: "Duplicates", context: duplicateHint || "Clear", tone: duplicateHint ? "warn" : "good" },
      ],
      alerts: [
        ...(unusual ? [{ label: `${unusual.vendor}: ${formatMoneyCompact(unusual.baseAmount, symbol)}`, tone: "warn" as const }] : []),
        ...(duplicateHint ? [{ label: duplicateHint, tone: "warn" as const }] : []),
      ],
      message: `${unusual ? `Unusual spend detected: ${unusual.vendor} at ${formatMoney(unusual.baseAmount, symbol)}.` : "No major outlier spend detected."} ${duplicateHint ? `Potential duplicate charge spotted for ${duplicateHint}.` : "No likely duplicate charge detected in this pass."}`,
    }
    : {
      pillar: "smart-alerts",
      title: "Smart Alerts",
      tone: "good",
      tiles: [
        { value: "0", label: "Spend spikes", context: "Clear", tone: "good" },
        { value: "0", label: "Duplicates", context: "Clear", tone: "good" },
      ],
      alerts: [],
      message: "No unusual spend spikes or likely duplicate charges detected in this period.",
    };

  return [
    spendingInsight,
    incomeInsight,
    budgetHealthInsight,
    trendInsight,
    goalsInsight,
    alertInsight,
  ];
};
