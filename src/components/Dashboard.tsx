import React, { useMemo, useState } from "react";
import { ExpenseCategory, Income, IncomeCategory, Transaction } from "../types";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Check,
  Edit2,
  PiggyBank,
  Sparkles,
  Wallet,
  X
} from "lucide-react";
import { motion } from "motion/react";
import { useFirebase } from "../contexts/FirebaseContext";
import { convertToBaseCurrency, getCurrencySymbol } from "../utils/currencyUtils";
import { getCategoryDropdownNames } from "../utils/categoryOptions";
import { DashboardInsightTile, generateDashboardInsights, InsightTone } from "../utils/insights";
import { formatDate, isDateInRange } from "../utils/dateUtils";

interface DashboardProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  transactions: Transaction[];
  income: Income[];
  previousTransactions?: Transaction[];
  previousIncome?: Income[];
  allTransactions?: Transaction[];
  allIncome?: Income[];
  onViewHistory?: () => void;
  onUpdateTarget?: (id: string, target: number) => void;
  monthMultiplier?: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  expenseCategories,
  incomeCategories,
  transactions,
  income,
  previousTransactions = [],
  previousIncome = [],
  allTransactions = [],
  allIncome = [],
  onUpdateTarget,
  monthMultiplier = 1
}) => {
  const { preferences, getUpcomingRecurring } = useFirebase();
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [insightPeriod, setInsightPeriod] = useState<"ytd" | "month">("month");
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const normalizeCategoryKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

  const baseSymbol = getCurrencySymbol(preferences?.baseCurrency);

  const expenseCategoryNames = useMemo(
    () => getCategoryDropdownNames("expense", expenseCategories, incomeCategories),
    [expenseCategories, incomeCategories]
  );
  const expenseCategoryGroups = useMemo(() => {
    const groups = new Map<string, { id: string; ids: string[]; name: string; target_amount: number }>();
    expenseCategories.forEach((category) => {
      const key = normalizeCategoryKey(category.name);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          id: category.id,
          ids: [category.id],
          name: category.name,
          target_amount: category.target_amount || 0,
        });
        return;
      }
      if (!existing.ids.includes(category.id)) {
        existing.ids.push(category.id);
      }
      if ((existing.target_amount || 0) === 0 && (category.target_amount || 0) !== 0) {
        existing.target_amount = category.target_amount;
      }
    });
    return groups;
  }, [expenseCategories]);

  const totalSpend = transactions.reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
  const totalIncome = income.reduce((acc, i) => acc + convertToBaseCurrency(i.amount, i.currency, preferences), 0);
  const balance = totalIncome - totalSpend;
  const prevSpend = previousTransactions.reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
  const prevIncome = previousIncome.reduce((acc, i) => acc + convertToBaseCurrency(i.amount, i.currency, preferences), 0);

  const categorySpending = expenseCategoryNames.map((categoryName) => {
    const categoryGroup = expenseCategoryGroups.get(normalizeCategoryKey(categoryName));
    const categoryIds = categoryGroup?.ids || [];
    const targetAmount = categoryGroup?.target_amount || 0;
    const spend = transactions
      .filter((transaction) => (
        categoryIds.includes(transaction.category_id)
        || normalizeCategoryKey(transaction.category_name || "") === normalizeCategoryKey(categoryName)
      ))
      .reduce((acc, transaction) => acc + convertToBaseCurrency(transaction.amount, transaction.currency, preferences), 0);
    const proratedTarget = targetAmount * monthMultiplier;
    const progress = proratedTarget > 0 ? (spend / proratedTarget) * 100 : 0;
    return {
      id: categoryGroup?.id || categoryName,
      name: categoryName,
      target_amount: targetAmount,
      spend,
      progress,
      proratedTarget,
    };
  });

  const incomeCategoryProgress = incomeCategories.map((cat) => {
    const received = income
      .filter((record) => record.category_id === cat.id || record.category === cat.name)
      .reduce((acc, record) => acc + convertToBaseCurrency(record.amount, record.currency, preferences), 0);
    const proratedTarget = cat.target_amount * monthMultiplier;
    const progress = proratedTarget > 0 ? (received / proratedTarget) * 100 : 0;
    return { ...cat, received, progress, proratedTarget };
  });

  const activeTargets = categorySpending.filter((category) => category.target_amount > 0);
  const visibleExpenseTargets = categorySpending;
  const activeIncomeTargets = incomeCategoryProgress.filter((category) => category.target_amount > 0);
  const overTargetCount = activeTargets.filter((category) => category.spend > category.proratedTarget).length;
  const incomeTargetCount = activeIncomeTargets.filter((category) => category.received >= category.proratedTarget).length;
  const spendingRatio = totalIncome > 0 ? Math.min(100, (totalSpend / totalIncome) * 100) : 0;
  const hasRecords = transactions.length > 0 || income.length > 0;
  const isEmptyState = !hasRecords && visibleExpenseTargets.length === 0;

  const calculatePercentageChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const incomeChange = calculatePercentageChange(totalIncome, prevIncome);
  const spendChange = calculatePercentageChange(totalSpend, prevSpend);

  const handleEditSave = (id: string) => {
    const value = Number.parseFloat(editValue);
    if (!Number.isNaN(value) && value >= 0 && onUpdateTarget) {
      onUpdateTarget(id, value);
    }
    setEditingCategory(null);
  };

  const kpis = [
    {
      label: "Total Income",
      value: totalIncome,
      tone: "text-fintech-accent",
      delta: incomeChange,
      icon: ArrowDownRight,
      iconBg: "bg-[var(--app-success-soft)]",
    },
    {
      label: "Total Spent",
      value: totalSpend,
      tone: "text-fintech-danger",
      delta: -spendChange,
      icon: ArrowUpRight,
      iconBg: "bg-[var(--app-danger-soft)]",
    },
    {
      label: "Current Balance",
      value: balance,
      tone: balance >= 0 ? "text-[#78d8ff]" : "text-fintech-danger",
      delta: null,
      icon: Wallet,
      iconBg: "bg-[var(--app-info-soft)]",
    },
    {
      label: "Tracked Targets",
      value: activeTargets.length + activeIncomeTargets.length,
      tone: "text-[var(--app-text)]",
      delta: null,
      icon: Sparkles,
      iconBg: "bg-[var(--app-violet-soft)]",
    },
  ];

  const insightGroups = useMemo(() => {
    const today = new Date();
    const monthStart = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const monthEnd = formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    const previousMonthStart = formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const previousMonthEnd = formatDate(new Date(today.getFullYear(), today.getMonth(), 0));
    const ytdStart = formatDate(new Date(today.getFullYear(), 0, 1));
    const ytdEnd = formatDate(today);
    const previousYtdStart = formatDate(new Date(today.getFullYear() - 1, 0, 1));
    const previousYtdEnd = formatDate(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    const insightTransactions = allTransactions.length > 0 ? allTransactions : transactions;
    const insightIncome = allIncome.length > 0 ? allIncome : income;
    const upcomingRecurring = getUpcomingRecurring(30);
    const common = {
      allTransactions: insightTransactions,
      expenseCategories,
      upcomingRecurring,
      baseCurrency: preferences?.baseCurrency || "CAD",
      exchangeRates: preferences?.exchangeRates || [],
    };
    const filterTransactions = (items: Transaction[], start: string, end: string) => (
      items.filter((item) => isDateInRange(item.date, start, end))
    );
    const filterIncome = (items: Income[], start: string, end: string) => (
      items.filter((item) => isDateInRange(item.date, start, end))
    );

    return [
      {
        id: "ytd" as const,
        title: "YTD",
        subtitle: `${ytdStart} to ${ytdEnd}`,
        insights: generateDashboardInsights({
          ...common,
          transactions: filterTransactions(insightTransactions, ytdStart, ytdEnd),
          income: filterIncome(insightIncome, ytdStart, ytdEnd),
          previousTransactions: filterTransactions(insightTransactions, previousYtdStart, previousYtdEnd),
          previousIncome: filterIncome(insightIncome, previousYtdStart, previousYtdEnd),
          monthMultiplier: today.getMonth() + 1,
        }),
      },
      {
        id: "month" as const,
        title: "This Month",
        subtitle: `${monthStart} to ${monthEnd}`,
        insights: generateDashboardInsights({
          ...common,
          transactions: filterTransactions(insightTransactions, monthStart, monthEnd),
          income: filterIncome(insightIncome, monthStart, monthEnd),
          previousTransactions: filterTransactions(insightTransactions, previousMonthStart, previousMonthEnd),
          previousIncome: filterIncome(insightIncome, previousMonthStart, previousMonthEnd),
          monthMultiplier: 1,
        }),
      },
    ];
  }, [
    transactions,
    allTransactions,
    income,
    allIncome,
    expenseCategories,
    getUpcomingRecurring,
    preferences?.baseCurrency,
    preferences?.exchangeRates,
  ]);

  const insightNumberClass: Record<InsightTone, string> = {
    good: "text-fintech-accent",
    warn: "text-amber-400",
    bad: "text-fintech-danger",
    info: "text-[#78d8ff]",
  };

  const insightPillClass: Record<InsightTone, string> = {
    good: "border-fintech-accent/30 bg-[var(--app-success-soft)] text-fintech-accent",
    warn: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    bad: "border-fintech-danger/30 bg-[var(--app-danger-soft)] text-fintech-danger",
    info: "border-[var(--app-border)] bg-[var(--app-pill-muted)] text-[var(--app-text-soft)]",
  };

  const selectedInsightGroup = insightGroups.find((group) => group.id === insightPeriod) || insightGroups[0];
  const getInsight = (pillar: string) => selectedInsightGroup.insights.find((insight) => insight.pillar === pillar);
  const getTile = (pillar: string, label: string) => getInsight(pillar)?.tiles.find((tile) => tile.label === label);
  const makeFallbackTile = (label: string): DashboardInsightTile => ({ value: "—", label, context: "Not tracked", tone: "info" });
  const heroTiles = [
    getTile("budget-health", "Budget used") || makeFallbackTile("Budget used"),
    getTile("income-tracking", "Net take-home") || makeFallbackTile("Net take-home"),
    getTile("budget-health", "Projected balance") || makeFallbackTile("Projected balance"),
  ];
  const visibleSupportTiles = [
    getTile("spending-analysis", "Top category") || makeFallbackTile("Top category"),
    getTile("goals-milestones", "Savings rate") || makeFallbackTile("Savings rate"),
    getTile("trends-forecasting", "Spend trend") || makeFallbackTile("Spend trend"),
  ];
  const secondarySupportTiles = [
    getTile("spending-analysis", "Fixed spend"),
    getTile("goals-milestones", "Spend buffer"),
  ].filter(Boolean) as DashboardInsightTile[];
  const actionableAlerts = (getInsight("smart-alerts")?.alerts || []).filter((alert) => alert.label !== "No alerts");

  return (
    <div className={isEmptyState ? "space-y-3.5" : "space-y-4"}>
      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl border bg-[var(--app-panel)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.iconBg}`}>
                  <Icon size={16} className={item.tone} />
                </div>
                {item.delta !== null && (
                  <div className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${item.delta >= 0 ? "bg-[var(--app-pill-success)] text-fintech-accent" : "bg-[var(--app-pill-danger)] text-fintech-danger"}`}>
                    {item.delta >= 0 ? "+" : ""}{item.delta.toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="mt-2.5 text-xs font-bold uppercase tracking-[0.16em] text-fintech-muted">{item.label}</div>
              <div className={`mt-1 text-[1.35rem] font-bold tracking-tight ${item.tone}`}>
                {typeof item.value === "number" && item.label !== "Tracked Targets"
                  ? `${baseSymbol}${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : item.value}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[1.1rem] font-bold">Insights</h3>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fintech-muted">{selectedInsightGroup.subtitle}</p>
          </div>
          <div className="inline-grid grid-cols-2 rounded-lg border bg-[var(--app-panel-muted)] p-1" style={{ borderColor: "var(--app-border)" }}>
            {insightGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setInsightPeriod(group.id);
                  setShowMoreInsights(false);
                }}
                className={`min-h-0 rounded-md px-3 py-1.5 text-[11px] font-bold transition ${
                  insightPeriod === group.id
                    ? "bg-[var(--app-panel-strong)] text-[var(--app-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "text-fintech-muted hover:text-[var(--app-text)]"
                }`}
              >
                {group.title}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 md:grid-cols-3">
          {heroTiles.map((tile) => (
            <div
              key={`hero-${tile.label}`}
              className="min-h-[7.75rem] rounded-lg border bg-[var(--app-panel-muted)] p-3.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className={`truncate text-[2rem] font-black leading-none tracking-tight ${insightNumberClass[tile.tone]}`} title={tile.value}>
                {tile.value}
              </div>
              <div className="mt-2 truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-text-soft)]" title={tile.label}>
                {tile.label}
              </div>
              {tile.context && <div className="mt-1 truncate text-[11px] font-semibold text-fintech-muted" title={tile.context}>{tile.context}</div>}
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {visibleSupportTiles.map((tile) => (
            <div
              key={`support-${tile.label}`}
              className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2.5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-fintech-muted" title={tile.label}>{tile.label}</div>
                <div className={`max-w-[48%] truncate text-lg font-black leading-none ${insightNumberClass[tile.tone]}`} title={tile.value}>{tile.value}</div>
              </div>
              {tile.context && <div className="mt-1 truncate text-[11px] font-semibold text-[var(--app-text-soft)]" title={tile.context}>{tile.context}</div>}
            </div>
          ))}
        </div>

        {secondarySupportTiles.length > 0 && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setShowMoreInsights((value) => !value)}
              className="inline-flex min-h-0 items-center gap-1 rounded-md border bg-[var(--app-panel-muted)] px-2.5 py-1.5 text-[11px] font-bold text-fintech-muted hover:text-[var(--app-text)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              See more
              <ChevronDown size={13} className={`transition ${showMoreInsights ? "rotate-180" : ""}`} />
            </button>
            {showMoreInsights && (
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {secondarySupportTiles.map((tile) => (
                  <div
                    key={`secondary-${tile.label}`}
                    className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2.5"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-fintech-muted" title={tile.label}>{tile.label}</div>
                      <div className={`max-w-[48%] truncate text-lg font-black leading-none ${insightNumberClass[tile.tone]}`} title={tile.value}>{tile.value}</div>
                    </div>
                    {tile.context && <div className="mt-1 truncate text-[11px] font-semibold text-[var(--app-text-soft)]" title={tile.context}>{tile.context}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {actionableAlerts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3" style={{ borderColor: "var(--app-divider)" }}>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">
              <AlertTriangle size={12} />
              Alerts
            </span>
            {actionableAlerts.map((alert) => (
              <span
                key={`alert-${alert.label}`}
                className={`max-w-[12rem] truncate rounded-full border px-2 py-1 text-[10px] font-bold ${insightPillClass[alert.tone]}`}
                title={alert.label}
              >
                {alert.label}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={`grid gap-3 ${isEmptyState ? "xl:grid-cols-[1.24fr_0.56fr]" : "xl:grid-cols-[1.18fr_0.58fr]"}`}>
        <div className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-col gap-2.5 xl:flex-row xl:justify-between">
            <div>
              <div className="text-2xl font-semibold tracking-tight text-[var(--app-text-soft)]">Available Balance</div>
              <div className={`mt-1 font-bold tracking-tight text-[var(--app-text)] ${isEmptyState ? "text-[2rem]" : "text-[2.15rem]"}`}>
                {baseSymbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className={`grid grid-cols-2 gap-3 ${isEmptyState ? "xl:pt-1" : "xl:pt-3"}`}>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fintech-muted">Net Flow</div>
                <div className="mt-1 text-[1.25rem] font-bold text-fintech-accent">{baseSymbol}{(balance / 1000).toFixed(1)}k</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fintech-muted">Spend Pace</div>
                <div className="mt-1 text-[1.25rem] font-bold text-[var(--app-text)]">{Math.round(spendingRatio)}%</div>
              </div>
            </div>
          </div>

          <div className={isEmptyState ? "mt-4" : "mt-5"}>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-fintech-muted">
              <span>Spending Ratio</span>
              <span>Optimized</span>
            </div>
            <div className="h-3.5 rounded-full bg-[var(--app-progress-bg)] p-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(3, spendingRatio)}%` }}
                className="h-full rounded-full bg-[linear-gradient(90deg,_#63f0bf,_#2cc98c)] shadow-[0_0_16px_rgba(98,240,191,0.35)]"
              />
            </div>
            <p className="mt-2 text-xs text-fintech-muted">
              You have used <span className="font-semibold text-fintech-accent">{Math.round(spendingRatio)}%</span> of your allocated monthly budget. Keep tracking to see your financial health improve.
            </p>
          </div>

          {isEmptyState ? (
            <div className="mt-4 rounded-xl border border-dashed bg-[var(--app-panel-muted)] p-3" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-panel-strong)] text-fintech-accent">
                  <Sparkles size={15} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--app-text)]">No activity yet</div>
                  <p className="mt-1 text-xs leading-5 text-fintech-muted">
                    Add your first income or expense to unlock forecasts, savings signals, and cashflow insights.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-2.5 xl:grid-cols-2">
              <div className="rounded-xl border bg-[var(--app-panel-muted)] p-3.5" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-panel-strong)] text-fintech-accent">
                    <Sparkles size={16} />
                  </div>
                  <div className="text-sm font-semibold">Smart Forecast</div>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-fintech-muted">
                  Based on your activity, we predict your end-of-month balance will be stable.
                </p>
                <div className="mt-3 h-2 rounded-full bg-[var(--app-chart-bg)]">
                  <div className="h-full w-[34%] rounded-full bg-fintech-accent" />
                </div>
              </div>

              <div className="rounded-xl border bg-[var(--app-panel-muted)] p-3.5" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-danger-soft)] text-fintech-danger">
                    <PiggyBank size={16} />
                  </div>
                  <div className="text-sm font-semibold">Saving Velocity</div>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-fintech-muted">
                  You are currently in an accumulation phase. Keep up the momentum.
                </p>
                <div className="mt-3 inline-flex rounded-lg bg-[var(--app-pill-success)] px-3 py-1.5 text-xs font-semibold text-fintech-accent">
                  Steady Growth
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={isEmptyState ? "space-y-4" : "space-y-4"}>
          <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[1.1rem] font-bold">Expense Targets</h3>
              <Edit2 size={16} className="text-fintech-muted" />
            </div>

            {visibleExpenseTargets.length === 0 ? (
              <div className="mt-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel-strong)] text-[#6fbdf5]">
                  <Sparkles size={22} />
                </div>
                <div className="mt-3 text-base font-bold">No budget targets set.</div>
                <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-fintech-muted">
                  Go to Settings to import your transactions or set custom targets manually.
                </p>
                <button className="mt-4 text-sm font-semibold text-fintech-accent">Navigate to Settings</button>
                <div className="mt-3 rounded-xl border border-[#58d8ff] bg-[var(--app-info-soft)] p-3 text-left">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#74d5ff]">Quick Tip</div>
                  <p className="mt-1.5 text-xs leading-5 text-fintech-muted">
                    Setting targets can help you save up to 15% more annually by visualizing your limits.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">Active</div>
                    <div className="mt-1 text-base font-semibold text-[var(--app-text)]">{visibleExpenseTargets.length} categories</div>
                  </div>
                  <div className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">Over Limit</div>
                    <div className={`mt-1 text-base font-semibold ${overTargetCount > 0 ? "text-fintech-danger" : "text-fintech-accent"}`}>
                      {overTargetCount}
                    </div>
                  </div>
                </div>

                <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1 no-scrollbar">
                  {visibleExpenseTargets.map((cat) => (
                    <div key={cat.id} className="rounded-lg border bg-[var(--app-panel-muted)] px-2.5 py-2" style={{ borderColor: "var(--app-border)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold leading-5">{cat.name}</div>
                          <div className="mt-0.5 text-[11px] text-fintech-muted">
                            {baseSymbol}{cat.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {" "}of{" "}
                            {baseSymbol}{cat.proratedTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-[11px] font-bold ${cat.progress > 100 ? "text-fintech-danger" : "text-fintech-accent"}`}>
                            {Math.round(cat.progress)}%
                          </div>
                          {editingCategory === cat.id ? (
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(event) => setEditValue(event.target.value)}
                                className="w-20 rounded-lg border bg-[var(--app-progress-bg)] px-2 py-1 text-xs text-[var(--app-text)]"
                                style={{ borderColor: "var(--app-border)" }}
                              />
                              <button onClick={() => handleEditSave(cat.id)} className="text-fintech-accent">
                                <Check size={16} />
                              </button>
                              <button onClick={() => setEditingCategory(null)} className="text-fintech-danger">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingCategory(cat.id);
                                setEditValue(cat.target_amount.toString());
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--app-text)]"
                            >
                              <span>Edit</span>
                              <Edit2 size={12} className="text-fintech-muted" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-[var(--app-chart-bg)]">
                        <div
                          className={`h-full rounded-full ${cat.progress > 100 ? "bg-fintech-danger" : "bg-fintech-accent"}`}
                          style={{ width: `${Math.max(4, Math.min(100, cat.progress))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[1.1rem] font-bold">Income Targets</h3>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">
                {incomeTargetCount}/{activeIncomeTargets.length || 0} on track
              </div>
            </div>

            {activeIncomeTargets.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed bg-[var(--app-panel-muted)] p-3 text-sm text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
                Add income category targets in Settings to track where money comes from.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {activeIncomeTargets.slice(0, 6).map((cat) => (
                  <div key={cat.id} className="rounded-lg border bg-[var(--app-panel-muted)] px-2.5 py-2" style={{ borderColor: "var(--app-border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">{cat.name}</div>
                        <div className="mt-0.5 text-[11px] text-fintech-muted">
                          {baseSymbol}{cat.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {" "}of{" "}
                          {baseSymbol}{cat.proratedTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className={`shrink-0 text-[11px] font-bold ${cat.progress >= 100 ? "text-fintech-accent" : "text-[var(--app-text)]"}`}>
                        {Math.round(cat.progress)}%
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-[var(--app-chart-bg)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,_#77e6ff,_#63f0bf)]"
                        style={{ width: `${Math.max(4, Math.min(100, cat.progress))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </section>
    </div>
  );
};
