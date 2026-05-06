import React, { useMemo } from "react";
import { ExpenseCategory, Income, IncomeCategory, Transaction } from "../types";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useFirebase } from "../contexts/FirebaseContext";
import { EmptyState } from "./common/EmptyState";
import { convertToBaseCurrency, getCurrencySymbol } from "../utils/currencyUtils";
import { formatDate, getLastDayOfMonth, isDateInRange } from "../utils/dateUtils";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface MonthlyAnalysisProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  allTransactions: Transaction[];
  allIncome: Income[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export const MonthlyAnalysis: React.FC<MonthlyAnalysisProps> = ({
  expenseCategories,
  incomeCategories,
  allTransactions,
  allIncome,
}) => {
  const { preferences } = useFirebase();
  const baseSymbol = getCurrencySymbol(preferences?.baseCurrency);

  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();

  const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = getLastDayOfMonth(now);
  const prevMonthStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonthEnd = getLastDayOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const monthTransactions = useMemo(
    () => allTransactions.filter((t) => isDateInRange(t.date, monthStart, monthEnd)),
    [allTransactions, monthStart, monthEnd]
  );
  const monthIncome = useMemo(
    () => allIncome.filter((i) => isDateInRange(i.date, monthStart, monthEnd)),
    [allIncome, monthStart, monthEnd]
  );
  const prevTransactions = useMemo(
    () => allTransactions.filter((t) => isDateInRange(t.date, prevMonthStart, prevMonthEnd)),
    [allTransactions, prevMonthStart, prevMonthEnd]
  );

  const totalSpend = useMemo(
    () => monthTransactions.reduce((sum, t) => sum + convertToBaseCurrency(t.amount, t.currency, preferences), 0),
    [monthTransactions, preferences]
  );
  const totalIncome = useMemo(
    () => monthIncome.reduce((sum, i) => sum + convertToBaseCurrency(i.amount, i.currency, preferences), 0),
    [monthIncome, preferences]
  );
  const prevTotalSpend = useMemo(
    () => prevTransactions.reduce((sum, t) => sum + convertToBaseCurrency(t.amount, t.currency, preferences), 0),
    [prevTransactions, preferences]
  );

  const balance = totalIncome - totalSpend;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const dailyBurn = currentDay > 0 ? totalSpend / currentDay : 0;
  const projectedSpend = dailyBurn * daysInMonth;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpend) / totalIncome) * 100 : 0;

  const normalizeKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

  const categoryGroups = useMemo(() => {
    const map = new Map<string, { id: string; ids: string[]; name: string; target: number }>();
    expenseCategories.forEach((cat) => {
      const key = normalizeKey(cat.name);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { id: cat.id, ids: [cat.id], name: cat.name, target: cat.target_amount || 0 });
      } else {
        if (!existing.ids.includes(cat.id)) existing.ids.push(cat.id);
        if ((existing.target || 0) === 0 && (cat.target_amount || 0) !== 0) existing.target = cat.target_amount;
      }
    });
    return Array.from(map.values());
  }, [expenseCategories]);

  const categorySpending = useMemo(() => {
    return categoryGroups
      .map((cat) => {
        const spend = monthTransactions
          .filter((t) => cat.ids.includes(t.category_id) || normalizeKey(t.category_name || "") === normalizeKey(cat.name))
          .reduce((sum, t) => sum + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
        const prevSpend = prevTransactions
          .filter((t) => cat.ids.includes(t.category_id) || normalizeKey(t.category_name || "") === normalizeKey(cat.name))
          .reduce((sum, t) => sum + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
        const progress = cat.target > 0 ? (spend / cat.target) * 100 : 0;
        const pctOfTotal = totalSpend > 0 ? (spend / totalSpend) * 100 : 0;
        const change = prevSpend > 0 ? ((spend - prevSpend) / prevSpend) * 100 : (spend > 0 ? 100 : 0);
        return { ...cat, spend, prevSpend, progress, pctOfTotal, change };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [categoryGroups, monthTransactions, prevTransactions, totalSpend, preferences]);

  const activeTargets = categorySpending.filter((cat) => cat.target > 0);
  const onTrackCount = activeTargets.filter((cat) => cat.progress <= 100).length;
  const overCount = activeTargets.filter((cat) => cat.progress > 100).length;
  const totalBudget = activeTargets.reduce((sum, cat) => sum + cat.target, 0);
  const totalSpendBudgeted = activeTargets.reduce((sum, cat) => sum + cat.spend, 0);
  const overallUtilization = totalBudget > 0 ? (totalSpendBudgeted / totalBudget) * 100 : 0;

  const spendChange = prevTotalSpend > 0 ? ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100 : (totalSpend > 0 ? 100 : 0);

  const pieData = useMemo(() => {
    const raw = categorySpending.filter((cat) => cat.spend > 0);
    if (raw.length > 6) {
      const top = raw.slice(0, 5);
      const other = raw.slice(5).reduce((sum, cat) => sum + cat.spend, 0);
      return [...top.map((cat) => ({ name: cat.name, value: cat.spend })), { name: "Other", value: other }];
    }
    return raw.map((cat) => ({ name: cat.name, value: cat.spend }));
  }, [categorySpending]);

  const incomeSources = useMemo(() => {
    const bySource = new Map<string, number>();
    monthIncome.forEach((inc) => {
      const source = inc.source || inc.category || "Other";
      const amount = convertToBaseCurrency(inc.amount, inc.currency, preferences);
      bySource.set(source, (bySource.get(source) || 0) + amount);
    });
    return Array.from(bySource.entries())
      .map(([source, amount]) => ({ source, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthIncome, preferences]);

  const alerts = useMemo(() => {
    const result: { label: string; tone: "good" | "warn" | "bad" | "info" }[] = [];
    const overBudget = categorySpending.filter((cat) => cat.target > 0 && cat.progress > 100);
    overBudget.forEach((cat) => {
      result.push({ label: `${cat.name}: ${Math.round(cat.progress - 100)}% over budget`, tone: "bad" });
    });
    const nearingLimit = categorySpending.filter((cat) => cat.target > 0 && cat.progress > 80 && cat.progress <= 100);
    nearingLimit.forEach((cat) => {
      result.push({ label: `${cat.name}: ${Math.round(cat.progress)}% of budget used`, tone: "warn" });
    });
    if (projectedSpend > totalBudget && totalBudget > 0) {
      result.push({ label: `Projected to exceed total budget by ${baseSymbol}${(projectedSpend - totalBudget).toFixed(0)}`, tone: "warn" });
    }
    if (result.length === 0) {
      result.push({ label: "All categories within budget", tone: "good" });
    }
    return result;
  }, [categorySpending, projectedSpend, totalBudget, baseSymbol]);

  const formatCurrency = (value: number) =>
    `${baseSymbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

  const statCards = [
    {
      label: "Total Spent",
      value: totalSpend,
      tone: "text-fintech-danger",
      delta: spendChange,
      icon: ArrowUpRight,
      iconBg: "bg-[var(--app-danger-soft)]",
    },
    {
      label: "Total Income",
      value: totalIncome,
      tone: "text-fintech-accent",
      delta: null as number | null,
      icon: ArrowDownRight,
      iconBg: "bg-[var(--app-success-soft)]",
    },
    {
      label: "Balance",
      value: balance,
      tone: balance >= 0 ? "text-[#78d8ff]" : "text-fintech-danger",
      delta: null as number | null,
      icon: Wallet,
      iconBg: "bg-[var(--app-info-soft)]",
    },
    {
      label: "Daily Burn",
      value: dailyBurn,
      tone: "text-[var(--app-text)]",
      delta: null as number | null,
      icon: TrendingUp,
      iconBg: "bg-[var(--app-violet-soft)]",
    },
  ];

  const tooltipStyle = {
    backgroundColor: "var(--app-tooltip-bg)",
    border: "1px solid var(--app-tooltip-border)",
    borderRadius: "12px",
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
  };

  const isEmptyState = categorySpending.length === 0 && monthIncome.length === 0;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly Analysis</h1>
          <p className="mt-1 text-xs text-fintech-muted">
            {monthName} {year} &mdash; Quick Check
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border bg-[var(--app-panel)] px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
          <CalendarCheck size={16} className="text-fintech-accent" />
          <span className="text-xs font-semibold text-fintech-muted">{monthName.slice(0, 3)} {currentDay}/{daysInMonth}</span>
        </div>
      </div>

      {isEmptyState ? (
        <EmptyState
          icon={CalendarCheck}
          title="No activity this month"
          description={`Add transactions for ${monthName} to see your monthly breakdown, category analysis, and budget health.`}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((item) => {
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
                      <div className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${item.delta >= 0 ? "bg-[var(--app-pill-danger)] text-fintech-danger" : "bg-[var(--app-pill-success)] text-fintech-accent"}`}>
                        {item.delta >= 0 ? "+" : ""}{item.delta.toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="mt-2.5 text-xs font-bold uppercase tracking-[0.16em] text-fintech-muted">{item.label}</div>
                  <div className={`mt-1 text-[1.35rem] font-bold tracking-tight ${item.tone}`}>
                    {item.label === "Daily Burn"
                      ? formatCurrency(Math.round(item.value))
                      : formatCurrency(item.value)}
                    {item.label === "Daily Burn" && (
                      <span className="ml-2 text-[10px] font-normal text-fintech-muted">
                        /day
                      </span>
                    )}
                  </div>
                  {item.label === "Daily Burn" && (
                    <div className="mt-1 text-[10px] text-fintech-muted">
                      Proj. {formatCurrency(projectedSpend)} by EOM
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[1.1rem] font-bold">Category Spending</h3>
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">
                    {categorySpending.length} categories
                  </span>
                </div>
                {categorySpending.length === 0 ? (
                  <EmptyState
                    icon={CalendarCheck}
                    title="No expenses recorded this month"
                    description="Add expenses to see your category spending breakdown."
                    compact
                  />
                ) : (
                  <div className="space-y-2">
                    {categorySpending.map((cat, index) => (
                      <div
                        key={cat.id}
                        className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2.5"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="truncate text-sm font-semibold">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-bold">{formatCurrency(cat.spend)}</span>
                            <span className="text-[10px] text-fintech-muted w-8 text-right">
                              {cat.pctOfTotal.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--app-chart-bg)]">
                            <div
                              className={`h-full rounded-full ${
                                cat.progress > 100
                                  ? "bg-fintech-danger"
                                  : cat.progress > 80
                                  ? "bg-amber-400"
                                  : "bg-fintech-accent"
                              }`}
                              style={{ width: `${Math.max(2, Math.min(100, cat.progress || cat.pctOfTotal))}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {cat.target > 0 && (
                              <span className={`text-[10px] font-bold ${
                                cat.progress > 100 ? "text-fintech-danger" : "text-fintech-accent"
                              }`}>
                                {Math.round(cat.progress)}%
                              </span>
                            )}
                            {cat.prevSpend > 0 && (
                              <span className={`flex items-center gap-0.5 text-[10px] ${
                                cat.change > 0 ? "text-fintech-danger" : "text-fintech-accent"
                              }`}>
                                {cat.change > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                {Math.abs(Math.round(cat.change))}%
                              </span>
                            )}
                          </div>
                        </div>
                        {cat.target > 0 && (
                          <div className="mt-1 text-[10px] text-fintech-muted">
                            Budget: {formatCurrency(cat.target)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                <h3 className="text-[1.1rem] font-bold mb-3">Budget Health</h3>
                {activeTargets.length === 0 ? (
                  <EmptyState
                    icon={PiggyBank}
                    title="No budget targets set"
                    description="Set category targets in Settings to track your budget health."
                    compact
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">On Track</div>
                        <div className="mt-1 text-base font-semibold text-fintech-accent">{onTrackCount}</div>
                      </div>
                      <div className="rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">Over Budget</div>
                        <div className={`mt-1 text-base font-semibold ${overCount > 0 ? "text-fintech-danger" : "text-fintech-muted"}`}>
                          {overCount}
                        </div>
                      </div>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-fintech-muted">
                      <span>Overall Budget Used</span>
                      <span>{Math.round(overallUtilization)}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-[var(--app-progress-bg)] p-0.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, Math.min(100, overallUtilization))}%` }}
                        className={`h-full rounded-full ${
                          overallUtilization > 100
                            ? "bg-fintech-danger"
                            : overallUtilization > 80
                            ? "bg-amber-400"
                            : "bg-[linear-gradient(90deg,_#63f0bf,_#2cc98c)]"
                        }`}
                      />
                    </div>
                    <p className="mt-2 text-xs text-fintech-muted">
                      {overallUtilization > 100
                        ? `You have exceeded your total budget by ${Math.round(overallUtilization - 100)}%.`
                        : `You have used ${Math.round(overallUtilization)}% of your ${activeTargets.length} budgeted categories.`
                      }
                    </p>
                    <div className="mt-3 flex gap-4 text-xs">
                      <div>
                        <span className="text-fintech-muted">Spent: </span>
                        <span className="font-semibold">{formatCurrency(totalSpendBudgeted)}</span>
                      </div>
                      <div>
                        <span className="text-fintech-muted">Budget: </span>
                        <span className="font-semibold">{formatCurrency(totalBudget)}</span>
                      </div>
                    </div>
                    <div className="mt-2 rounded-lg border bg-[var(--app-panel-muted)] px-3 py-2" style={{ borderColor: "var(--app-border)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PiggyBank size={14} className="text-[#78d8ff]" />
                          <span className="text-xs font-semibold">Projected EOM Spend</span>
                        </div>
                        <span className="text-sm font-bold">{formatCurrency(projectedSpend)}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-fintech-muted">
                        Based on {formatCurrency(dailyBurn)}/day average
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                <h3 className="text-[1.1rem] font-bold mb-3">Spending Distribution</h3>
                {pieData.length === 0 ? (
                  <EmptyState
                    icon={TrendingUp}
                    title="No spending data yet"
                    description="Add expenses to see your spending distribution chart."
                    compact
                  />
                ) : (
                  <>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span className="truncate text-xs text-fintech-muted">{entry.name}</span>
                          </div>
                          <span className="text-xs font-semibold ml-2">
                            {totalSpend > 0 ? Math.round((entry.value / totalSpend) * 100) : 0}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                <h3 className="text-[1.1rem] font-bold mb-3">Income Sources</h3>
                {incomeSources.length === 0 ? (
                  <EmptyState
                    icon={ArrowDownRight}
                    title="No income recorded this month"
                    description="Add income records to see your income sources breakdown."
                    compact
                  />
                ) : (
                  <div className="space-y-2">
                    {incomeSources.map((src) => (
                      <div key={src.source} className="flex items-center justify-between rounded-lg bg-[var(--app-panel-muted)] px-3 py-2">
                        <span className="truncate text-sm">{src.source}</span>
                        <span className="ml-3 shrink-0 text-sm font-semibold text-fintech-accent">
                          {formatCurrency(src.amount)}
                        </span>
                      </div>
                    ))}
                    {incomeSources.length > 1 && (
                      <div className="flex items-center justify-between border-t pt-2 mt-2" style={{ borderColor: "var(--app-border)" }}>
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-fintech-muted">Total</span>
                        <span className="text-sm font-bold text-fintech-accent">{formatCurrency(totalIncome)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1 rounded-lg bg-[var(--app-panel-muted)] px-3 py-2 text-xs">
                      <TrendingUp size={12} className="text-fintech-accent" />
                      <span className="text-fintech-muted">Savings rate: </span>
                      <span className={`font-bold ${savingsRate >= 20 ? "text-fintech-accent" : savingsRate >= 10 ? "text-amber-400" : "text-fintech-danger"}`}>
                        {savingsRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {alerts.length > 0 && (
                <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <h3 className="text-[1.1rem] font-bold">Alerts</h3>
                  </div>
                  <div className="space-y-1.5">
                    {alerts.map((alert, index) => (
                      <div
                        key={index}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                          alert.tone === "bad"
                            ? "bg-[var(--app-danger-soft)] text-fintech-danger"
                            : alert.tone === "warn"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-[var(--app-success-soft)] text-fintech-accent"
                        }`}
                      >
                        {alert.label}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
