import React, { useState, useMemo } from "react";
import { ExpenseCategory, Transaction, Income, DateRange, IncomeCategory } from "../types";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine, Line
} from "recharts";
import { 
  Flame, TrendingUp, PieChart as PieIcon, 
  ArrowUpRight, ArrowDownRight, History,
  LayoutGrid, Table as TableIcon, BarChart3, Calendar
} from "lucide-react";
import { DateRangeSelector } from "./DateRangeSelector";
import { formatDate, getTodayStr, getFirstDayOfMonth, getLastDayOfMonth, formatMonth, formatDisplayDate } from "../utils/dateUtils";
import { useFirebase } from "../contexts/FirebaseContext";
import { convertToBaseCurrency, getCurrencySymbol } from "../utils/currencyUtils";

interface AnalysisProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  transactions: Transaction[];
  income: Income[];
  allTransactions: Transaction[];
  allIncome: Income[];
  currentRange: DateRange;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

type ComparisonPeriodOption = 
  | "latest-month-vs-prev-month"
  | "latest-month-vs-last-year"
  | "past-3-months-vs-last-year"
  | "past-6-months-vs-last-year"
  | "past-12-months-vs-last-year"
  | "ytd-vs-last-year"
  | "custom";

const COMPARISON_OPTIONS: { label: string; value: ComparisonPeriodOption }[] = [
  { label: "This month vs. last month", value: "latest-month-vs-prev-month" },
  { label: "This month vs. same month last year", value: "latest-month-vs-last-year" },
  { label: "Past 3 months (incl. this month) vs. last year", value: "past-3-months-vs-last-year" },
  { label: "Past 6 months (incl. this month) vs. last year", value: "past-6-months-vs-last-year" },
  { label: "Past 12 months vs. last year", value: "past-12-months-vs-last-year" },
  { label: "Year to date vs. last year", value: "ytd-vs-last-year" },
  { label: "Custom", value: "custom" },
];

export const Analysis: React.FC<AnalysisProps> = ({ 
  expenseCategories,
  incomeCategories,
  transactions, 
  income, 
  allTransactions,
  allIncome,
  currentRange 
}) => {
  const [expenseMode, setExpenseMode] = useState<"all" | "core">("all");
  const [activeTab, setActiveTab] = useState<"overview" | "deep-dive">("overview");
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriodOption>("latest-month-vs-prev-month");
  const [comparisonMode, setComparisonMode] = useState<"previous" | "last-year">("last-year");
  const categories = expenseCategories;
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(expenseCategories[0]?.id || null);
  const { preferences, updatePreferences } = useFirebase();
  const baseSymbol = getCurrencySymbol(preferences?.baseCurrency);
  const [showCoreFilter, setShowCoreFilter] = useState(false);
  const coreExcluded = useMemo(() => preferences?.coreExcludedCategories || [], [preferences?.coreExcludedCategories]);
  
  // Independent date ranges for Overview, Comparison, and Category Trends
  const [overviewRange, setOverviewRange] = useState<DateRange>(currentRange);
  const [comparisonRange, setComparisonRange] = useState<DateRange>(currentRange);
  const today = getTodayStr();

  // Filter transactions based on mode and local range
  const filteredTransactions = useMemo(() => {
    const range = activeTab === "overview" ? overviewRange : (activeTab === "deep-dive" ? comparisonRange : currentRange);
    const base = allTransactions.filter(t => t.date >= range.start && t.date <= range.end);
    const mode = activeTab === "overview" ? expenseMode : "all";
    return mode === "all" 
      ? base 
      : base.filter(t => !coreExcluded.includes(t.category_name));
  }, [allTransactions, expenseMode, activeTab, overviewRange, comparisonRange, currentRange, coreExcluded]);

  const filteredIncome = useMemo(() => {
    const range = activeTab === "overview" ? overviewRange : (activeTab === "deep-dive" ? comparisonRange : currentRange);
    return allIncome.filter(i => i.date >= range.start && i.date <= range.end);
  }, [allIncome, activeTab, overviewRange, comparisonRange, currentRange]);

  const incomeCategoryTotals = useMemo(() => {
    return incomeCategories
      .map((category) => {
        const total = filteredIncome
          .filter((record) => record.category_id === category.id || record.category === category.name)
          .reduce((acc, record) => acc + convertToBaseCurrency(record.amount, record.currency, preferences), 0);
        return {
          ...category,
          total,
        };
      })
      .filter((category) => category.total > 0 || category.target_amount > 0)
      .sort((a, b) => b.total - a.total);
  }, [filteredIncome, incomeCategories, preferences]);

  const expenseCategoryTotals = useMemo(() => {
    return expenseCategories
      .map((category) => {
        const total = filteredTransactions
          .filter((record) => record.category_id === category.id)
          .reduce((acc, record) => acc + convertToBaseCurrency(record.amount, record.currency, preferences), 0);
        return {
          ...category,
          total,
        };
      })
      .filter((category) => category.total > 0 || category.target_amount > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenseCategories, filteredTransactions, preferences]);

  const filteredAllTransactions = useMemo(() => 
    expenseMode === "all" 
      ? allTransactions 
      : allTransactions.filter(t => !coreExcluded.includes(t.category_name))
  , [allTransactions, expenseMode, coreExcluded]);

  // Historical Comparison Logic
  const comparisonResult = useMemo(() => {
    let currentStart: string, currentEnd: string, prevStart: string, prevEnd: string;
    const now = new Date();

    switch (comparisonPeriod) {
      case "latest-month-vs-prev-month": {
        currentStart = getFirstDayOfMonth(now);
        currentEnd = today;
        
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevStart = getFirstDayOfMonth(prevMonth);
        // Use full last month as requested: "Last Month = previous month i.e. Feb"
        prevEnd = getLastDayOfMonth(prevMonth);
        break;
      }
      case "latest-month-vs-last-year": {
        currentStart = getFirstDayOfMonth(now);
        currentEnd = today;
        
        const prevYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        prevStart = getFirstDayOfMonth(prevYear);
        // Use full month from last year
        prevEnd = getLastDayOfMonth(prevYear);
        break;
      }
      case "past-3-months-vs-last-year": {
        // Current month + last 2 months
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        currentStart = formatDate(start);
        currentEnd = today;
        
        const pStart = new Date(now.getFullYear() - 1, now.getMonth() - 2, 1);
        const pEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
        prevStart = formatDate(pStart);
        prevEnd = formatDate(pEnd);
        break;
      }
      case "past-6-months-vs-last-year": {
        // Current month + last 5 months
        const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        currentStart = formatDate(start);
        currentEnd = today;
        
        const pStart = new Date(now.getFullYear() - 1, now.getMonth() - 5, 1);
        const pEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
        prevStart = formatDate(pStart);
        prevEnd = formatDate(pEnd);
        break;
      }
      case "past-12-months-vs-last-year": {
        const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        currentStart = formatDate(start);
        currentEnd = today;
        
        const pStart = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        const pEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        prevStart = formatDate(pStart);
        prevEnd = formatDate(pEnd);
        break;
      }
      case "ytd-vs-last-year": {
        currentStart = `${now.getFullYear()}-01-01`;
        currentEnd = today;
        prevStart = `${now.getFullYear() - 1}-01-01`;
        const prevDay = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        prevEnd = formatDate(prevDay);
        break;
      }
      case "custom":
      default: {
        currentStart = comparisonRange.start;
        currentEnd = comparisonRange.end;
        const start = new Date(comparisonRange.start);
        const end = new Date(comparisonRange.end);
        
        if (comparisonMode === "last-year") {
          const prevStartD = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
          const prevEndD = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
          prevStart = formatDate(prevStartD);
          prevEnd = formatDate(prevEndD);
        } else {
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const prevEndD = new Date(start.getTime() - (1000 * 60 * 60 * 24));
          const prevStartD = new Date(prevEndD.getTime() - diffTime);
          prevStart = formatDate(prevStartD);
          prevEnd = formatDate(prevEndD);
        }
        break;
      }
    }
    
    const currentTransactions = filteredAllTransactions.filter(t => t.date >= currentStart && t.date <= currentEnd);
    const prevTransactions = filteredAllTransactions.filter(t => t.date >= prevStart && t.date <= prevEnd);
    
    const data = categories.map(cat => {
      const current = currentTransactions
        .filter(t => t.category_id === cat.id)
        .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
      const previous = prevTransactions
        .filter(t => t.category_id === cat.id)
        .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
      
      // Prorate current if it's exactly the current month and we are comparing against a full month
      let proratedCurrent = current;
      const isCurrentMonthOnly = currentStart.startsWith(today.slice(0, 7));
      
      if (isCurrentMonthOnly && (comparisonPeriod === "latest-month-vs-prev-month" || comparisonPeriod === "latest-month-vs-last-year")) {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        if (currentDay > 0) {
          proratedCurrent = (current / currentDay) * daysInMonth;
        }
      }

      const diff = proratedCurrent - previous;
      const percentChange = previous > 0 ? (diff / previous) * 100 : 0;
      
      return {
        name: cat.name,
        current: proratedCurrent,
        previous,
        diff,
        percentChange
      };
    }).filter(d => d.current > 0 || d.previous > 0).sort((a, b) => b.current - a.current);

    return {
      data,
      ranges: {
        current: { start: currentStart, end: currentEnd },
        previous: { start: prevStart, end: prevEnd }
      }
    };
  }, [categories, filteredAllTransactions, comparisonRange, comparisonPeriod, comparisonMode]);

  const comparisonData = comparisonResult.data;
  const comparisonRanges = comparisonResult.ranges;

  const avgComparisonCurrent = useMemo(() => {
    const top8 = comparisonData.slice(0, 8);
    if (top8.length === 0) return 0;
    return top8.reduce((acc, d) => acc + d.current, 0) / top8.length;
  }, [comparisonData]);

  const avgComparisonPrev = useMemo(() => {
    const top8 = comparisonData.slice(0, 8);
    if (top8.length === 0) return 0;
    return top8.reduce((acc, d) => acc + d.previous, 0) / top8.length;
  }, [comparisonData]);

  // Burn Rate Calculation
  const totalSpend = filteredTransactions.reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
  const totalIncome = filteredIncome.reduce((acc, i) => acc + convertToBaseCurrency(i.amount, i.currency, preferences), 0);

  const activeRange = activeTab === "overview" ? overviewRange : comparisonRange;
  const isThisMonth = activeRange.option === "this-month";
  const nowForProjection = new Date();
  const daysInMonth = new Date(nowForProjection.getFullYear(), nowForProjection.getMonth() + 1, 0).getDate();
  const currentDay = nowForProjection.getDate();
  const projectionFactor = daysInMonth / currentDay;

  const projectedSpend = isThisMonth ? totalSpend * projectionFactor : totalSpend;
  const projectedIncome = isThisMonth ? totalIncome * projectionFactor : totalIncome;
  
  const start = new Date(activeRange.start);
  const end = new Date(activeRange.end);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  const burnRate = totalSpend / diffDays;

  // Monthly Trends Data
  const trendData = useMemo(() => {
    const start = new Date(overviewRange.start);
    const end = new Date(overviewRange.end);
    
    const months: string[] = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), 1);
    while (curr <= end) {
      months.push(formatMonth(curr));
      curr.setMonth(curr.getMonth() + 1);
    }

    // If range is too small, show at least 6 months ending at overviewRange.end
    if (months.length < 2) {
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      const fallbackMonths: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - i, 1);
        fallbackMonths.push(formatMonth(d));
      }
      return fallbackMonths.map(month => {
        let spend = filteredAllTransactions
          .filter(t => t.date.startsWith(month))
          .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
        let inc = allIncome
          .filter(i => i.date.startsWith(month))
          .reduce((acc, i) => acc + convertToBaseCurrency(i.amount, i.currency, preferences), 0);
        
        const isCurrentMonth = month === today.slice(0, 7);
        if (isCurrentMonth) {
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const currentDay = now.getDate();
          if (currentDay > 0) {
            spend = (spend / currentDay) * daysInMonth;
            inc = (inc / currentDay) * daysInMonth;
          }
        }
        return { month, spend, income: inc, isProjected: isCurrentMonth };
      });
    }

    return months.map(month => {
      let spend = filteredAllTransactions
        .filter(t => t.date.startsWith(month))
        .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
      let inc = allIncome
        .filter(i => i.date.startsWith(month))
        .reduce((acc, i) => acc + convertToBaseCurrency(i.amount, i.currency, preferences), 0);
      
      // Prorate if it's the current month
      const isCurrentMonth = month === today.slice(0, 7);
      if (isCurrentMonth) {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        if (currentDay > 0) {
          spend = (spend / currentDay) * daysInMonth;
          inc = (inc / currentDay) * daysInMonth;
        }
      }
      return { month, spend, income: inc, isProjected: isCurrentMonth };
    });
  }, [filteredAllTransactions, allIncome, overviewRange]);

  const avgIncome = useMemo(() => {
    if (trendData.length === 0) return 0;
    return trendData.reduce((acc, d) => acc + d.income, 0) / trendData.length;
  }, [trendData]);

  const avgSpend = useMemo(() => {
    if (trendData.length === 0) return 0;
    return trendData.reduce((acc, d) => acc + d.spend, 0) / trendData.length;
  }, [trendData]);

  // Pie Chart Data
  const pieData = useMemo(() => {
    const raw = categories.map(cat => {
      const value = filteredTransactions
        .filter(t => t.category_id === cat.id)
        .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
      return { name: cat.name, value };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    if (raw.length > 6) {
      const top = raw.slice(0, 5);
      const other = raw.slice(5).reduce((acc, d) => acc + d.value, 0);
      return [...top, { name: "Other", value: other }];
    }
    return raw;
  }, [categories, filteredTransactions]);

  const incomePieData = useMemo(() => {
    const bySource = filteredIncome.reduce((acc: any, curr) => {
      acc[curr.source] = (acc[curr.source] || 0) + convertToBaseCurrency(curr.amount, curr.currency, preferences);
      return acc;
    }, {});

    const raw = Object.entries(bySource).map(([name, value]) => ({
      name,
      value: value as number
    })).sort((a, b) => b.value - a.value);

    if (raw.length > 6) {
      const top = raw.slice(0, 5);
      const other = raw.slice(5).reduce((acc, d) => acc + d.value, 0);
      return [...top, { name: "Other", value: other }];
    }
    return raw;
  }, [filteredIncome]);

  // Category Trend Data
  const categoryTrendData = useMemo(() => {
    if (!selectedCategoryId) return [];
    
    const start = new Date(categoryRange.start);
    const end = new Date(categoryRange.end);
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const isDaily = diffDays <= 31;

    const timePoints: string[] = [];
    let curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    
    if (isDaily) {
      while (curr <= end) {
        timePoints.push(formatDate(curr));
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      let monthCurr = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      while (monthCurr <= endMonth) {
        const year = monthCurr.getFullYear();
        const month = String(monthCurr.getMonth() + 1).padStart(2, '0');
        timePoints.push(`${year}-${month}`);
        monthCurr.setMonth(monthCurr.getMonth() + 1);
      }
    }

    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    const target = selectedCategory?.target_amount || 0;

    const data = timePoints.map(point => {
      const actual = allTransactions
        .filter(t => 
          t.category_id === selectedCategoryId && 
          t.date.startsWith(point) &&
          t.date >= categoryRange.start &&
          t.date <= categoryRange.end
        )
        .reduce((acc, t) => acc + convertToBaseCurrency(t.amount, t.currency, preferences), 0);
      return { label: point, actual, target, isDaily };
    });

    const avgActual = data.reduce((acc, d) => acc + d.actual, 0) / (data.length || 1);
    return data.map(d => ({ ...d, average: avgActual }));
  }, [selectedCategoryId, allTransactions, categories, categoryRange]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const currentTarget = selectedCategory?.target_amount || 0;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex w-fit flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "overview" ? "bg-fintech-accent text-white shadow-lg" : "text-fintech-muted hover:text-white"}`}
          >
            <LayoutGrid size={14} />
            Overview
          </button>
          <button 
            onClick={() => setActiveTab("deep-dive")}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all ${activeTab === "deep-dive" ? "bg-fintech-accent text-white shadow-lg" : "text-fintech-muted hover:text-white"}`}
          >
            <History size={14} />
            Deep Dive
          </button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-1.5 relative">
                <span className={`text-[10px] font-bold uppercase tracking-widest pl-2 transition-colors ${expenseMode === 'all' ? 'text-white' : 'text-fintech-muted'}`}>All</span>
                <button 
                  onClick={() => setExpenseMode(expenseMode === 'all' ? 'core' : 'all')}
                  className="relative w-10 h-5 bg-white/10 rounded-full transition-colors hover:bg-white/20"
                >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-fintech-accent rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(16,185,129,0.5)] ${expenseMode === 'core' ? 'translate-x-5' : ''}`} />
                </button>
                <span className={`text-[10px] font-bold uppercase tracking-widest pr-2 transition-colors ${expenseMode === 'core' ? 'text-white' : 'text-fintech-muted'}`}>Core</span>
                
                {/* Core Settings Tool */}
                <button 
                  onClick={() => setShowCoreFilter(!showCoreFilter)}
                  className={`p-1.5 ml-1 rounded-lg transition-colors ${showCoreFilter ? 'bg-fintech-accent/20 text-fintech-accent' : 'hover:bg-white/10 text-fintech-muted'}`}
                  title="Configure Core Exceptions"
                >
                  <LayoutGrid size={12} />
                </button>

                {showCoreFilter && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-[#0f1930] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-white/5">
                      <div className="text-xs font-bold text-white">Excluded from Core</div>
                      <div className="text-[10px] text-fintech-muted">Checked categories are dropped when CORE is active.</div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {categories.map(c => {
                        const isExcluded = coreExcluded.includes(c.name);
                        return (
                          <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              onChange={(e) => {
                                if (updatePreferences && preferences) {
                                  const newExcluded = e.target.checked 
                                    ? [...coreExcluded, c.name]
                                    : coreExcluded.filter(n => n !== c.name);
                                  updatePreferences({ ...preferences, coreExcludedCategories: newExcluded });
                                }
                              }}
                              className="w-4 h-4 rounded border-white/20 text-fintech-accent focus:ring-fintech-accent/20 bg-[#121a2d]"
                            />
                            <span className="text-xs text-white">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DateRangeSelector range={overviewRange} onChange={setOverviewRange} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-[#151f38] p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Income Categories</div>
              <div className="text-lg font-bold text-white">
                {incomeCategoryTotals.length} active category{incomeCategoryTotals.length === 1 ? "" : "ies"}
              </div>
              <div className="mt-3 space-y-2">
                {incomeCategoryTotals.slice(0, 4).map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                    <span className="truncate text-white">{category.name}</span>
                    <span className="ml-4 shrink-0 text-fintech-accent">
                      {baseSymbol}{category.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                {incomeCategoryTotals.length === 0 && (
                  <div className="rounded-lg bg-white/5 px-3 py-3 text-sm text-fintech-muted">
                    No income categories have activity in this range yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#151f38] p-4">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Income vs Expense Categories</div>
              <div className="text-lg font-bold text-white">Group-level comparison</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">Top Income Group</div>
                  <div className="mt-1 text-sm font-semibold text-white">{incomeCategoryTotals[0]?.name || "None"}</div>
                  <div className="mt-1 text-xs text-fintech-accent">
                    {incomeCategoryTotals[0] ? `${baseSymbol}${incomeCategoryTotals[0].total.toFixed(2)}` : "No data"}
                  </div>
                </div>
                <div className="rounded-lg bg-white/5 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fintech-muted">Top Expense Group</div>
                  <div className="mt-1 text-sm font-semibold text-white">{expenseCategoryTotals[0]?.name || "None"}</div>
                  <div className="mt-1 text-xs text-fintech-danger">
                    {expenseCategoryTotals[0] ? `${baseSymbol}${expenseCategoryTotals[0].total.toFixed(2)}` : "No data"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flame size={14} className="text-orange-500" />
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Daily Burn</span>
              </div>
              <div className="text-base font-bold text-white">{baseSymbol}{burnRate.toFixed(0)}</div>
              <div className="text-[10px] text-fintech-muted mt-1">Average per day</div>
            </div>
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-fintech-accent" />
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Savings</span>
              </div>
              <div className="text-base font-bold text-fintech-accent">
                {totalIncome > 0 ? Math.round(((totalIncome - totalSpend) / totalIncome) * 100) : 0}%
              </div>
              <div className="text-[10px] text-fintech-muted mt-1">Of total income</div>
            </div>
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight size={14} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Inflow</span>
              </div>
              <div className="text-base font-bold text-emerald-500">
                {baseSymbol}{(totalIncome/1000).toFixed(1)}k
                {isThisMonth && (
                  <span className="text-[10px] text-emerald-500/60 ml-2">
                    Proj: {baseSymbol}{(projectedIncome/1000).toFixed(1)}k
                  </span>
                )}
              </div>
              <div className="text-[10px] text-fintech-muted mt-1">Total income</div>
            </div>
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight size={14} className="text-fintech-danger" />
                <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Outflow</span>
              </div>
              <div className="text-base font-bold text-fintech-danger">
                {baseSymbol}{(totalSpend/1000).toFixed(1)}k
                {isThisMonth && (
                  <span className="text-[10px] text-fintech-danger/60 ml-2">
                    Proj: {baseSymbol}{(projectedSpend/1000).toFixed(1)}k
                  </span>
                )}
              </div>
              <div className="text-[10px] text-fintech-muted mt-1">Total expenses</div>
            </div>
          </div>

          {/* Main Trend Chart */}
          <section className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Monthly Cashflow</h3>
              <div className="flex items-center gap-6">
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Income</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-fintech-danger" /> Expense</div>
                </div>
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest xl:border-l xl:border-white/10 xl:pl-4">
                  <div className="text-emerald-400">Avg Inc: <span className="text-white">{baseSymbol}{Math.round(avgIncome).toLocaleString()}</span></div>
                  <div className="text-fintech-danger">Avg Exp: <span className="text-white">{baseSymbol}{Math.round(avgSpend).toLocaleString()}</span></div>
                </div>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#475569" 
                    fontSize={10} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      const parts = val.split("-");
                      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return months[parseInt(parts[1]) - 1];
                    }}
                  />
                  <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}
                    itemStyle={{ fontSize: "12px" }}
                    formatter={(value: number) => [`${baseSymbol}${value.toLocaleString()}`, ""]}
                  />
                  <ReferenceLine 
                    y={avgIncome} 
                    stroke="#10b981" 
                    strokeDasharray="3 3" 
                    label={{ position: 'right', value: `${baseSymbol}${Math.round(avgIncome).toLocaleString()}`, fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <ReferenceLine 
                    y={avgSpend} 
                    stroke="#ef4444" 
                    strokeDasharray="3 3" 
                    label={{ position: 'left', value: `${baseSymbol}${Math.round(avgSpend).toLocaleString()}`, fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20}>
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-inc-${index}`} fill={entry.isProjected ? "#10b98180" : "#10b981"} />
                    ))}
                  </Bar>
                  <Bar dataKey="spend" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20}>
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-exp-${index}`} fill={entry.isProjected ? "#ef444480" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Distribution Grid */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            <section className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Expense Distribution</h3>
              <div className="flex flex-col items-center">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                        formatter={(value: number) => `${baseSymbol}${value.toLocaleString()}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 w-full mt-4">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-[10px] font-medium text-fintech-muted truncate group-hover:text-white transition-colors">{entry.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-white ml-2">
                        {totalSpend > 0 ? Math.round((entry.value / totalSpend) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Income Sources</h3>
              <div className="flex flex-col items-center">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={incomePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {incomePieData.map((entry, index) => (
                          <Cell key={`cell-income-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                        formatter={(value: number) => `${baseSymbol}${value.toLocaleString()}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 w-full mt-4">
                  {incomePieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[(index + 3) % COLORS.length] }} />
                        <span className="text-[10px] font-medium text-fintech-muted truncate group-hover:text-white transition-colors">{entry.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-white ml-2">
                        {totalIncome > 0 ? Math.round((entry.value / totalIncome) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </>
      ) : activeTab === "comparison" ? (
        <div className="space-y-8">
          {/* Comparison Period Selector */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative group">
                <select 
                  value={comparisonPeriod}
                  onChange={(e) => setComparisonPeriod(e.target.value as ComparisonPeriodOption)}
                  className="appearance-none rounded-lg border border-white/10 bg-white/5 px-5 py-3 pr-12 text-sm font-bold text-white focus:outline-none focus:border-fintech-accent transition-all cursor-pointer hover:bg-white/10"
                >
                  {COMPARISON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-fintech-bg text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-fintech-muted">
                  <History size={16} />
                </div>
              </div>

              {comparisonPeriod === "custom" && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
                  <button
                    onClick={() => setComparisonMode("previous")}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${comparisonMode === "previous" ? "bg-fintech-accent text-fintech-bg" : "text-fintech-muted hover:text-white"}`}
                  >
                    Prev Period
                  </button>
                  <button
                    onClick={() => setComparisonMode("last-year")}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${comparisonMode === "last-year" ? "bg-fintech-accent text-fintech-bg" : "text-fintech-muted hover:text-white"}`}
                  >
                    Last Year
                  </button>
                </div>
              )}
            </div>

            {comparisonPeriod === "custom" && (
              <DateRangeSelector range={comparisonRange} onChange={setComparisonRange} />
            )}
          </div>

          {/* Comparison Period Info */}
          <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-full border border-blue-500/20">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Current: {formatDisplayDate(comparisonRanges.current.start)} to {formatDisplayDate(comparisonRanges.current.end)}
            </div>
            <div className="flex items-center gap-2 bg-white/5 text-fintech-muted px-3 py-1.5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-white/40" />
              Previous: {formatDisplayDate(comparisonRanges.previous.start)} to {formatDisplayDate(comparisonRanges.previous.end)}
            </div>
          </div>

          {/* Comparison Chart */}
          <section className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Historical Comparison</h3>
              <div className="flex items-center gap-6">
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white/20" /> Previous</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-fintech-accent" /> Current</div>
                </div>
                <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest xl:border-l xl:border-white/10 xl:pl-4">
                  <div className="text-fintech-accent">Avg Cur: <span className="text-white">{baseSymbol}{Math.round(avgComparisonCurrent).toLocaleString()}</span></div>
                  <div className="text-white/40">Avg Prev: <span className="text-white">{baseSymbol}{Math.round(avgComparisonPrev).toLocaleString()}</span></div>
                </div>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={comparisonData.slice(0, 8)} 
                  layout="vertical" 
                  margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    axisLine={false} 
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip 
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                    formatter={(value: number) => `${baseSymbol}${value.toLocaleString()}`}
                  />
                  <ReferenceLine 
                    x={avgComparisonCurrent} 
                    stroke="#3b82f6" 
                    strokeDasharray="3 3" 
                    label={{ position: 'top', value: `${baseSymbol}${Math.round(avgComparisonCurrent).toLocaleString()}`, fill: '#3b82f6', fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <ReferenceLine 
                    x={avgComparisonPrev} 
                    stroke="#ffffff40" 
                    strokeDasharray="3 3" 
                    label={{ position: 'bottom', value: `${baseSymbol}${Math.round(avgComparisonPrev).toLocaleString()}`, fill: '#ffffff40', fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <Bar dataKey="previous" fill="#ffffff20" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="current" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Comparison Table */}
          <section className="glass-card overflow-hidden rounded-2xl border border-white/5">
            <div className="p-6 border-b border-white/5 flex items-center gap-2">
              <TableIcon size={18} className="text-fintech-accent" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">Category Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4 text-right">Previous</th>
                    <th className="px-6 py-4 text-right">Current</th>
                    <th className="px-6 py-4 text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {comparisonData.map((row) => (
                    <tr key={row.name} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium">{row.name}</td>
                      <td className="px-6 py-4 text-sm text-right text-fintech-muted">{baseSymbol}{row.previous.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-right font-bold">{baseSymbol}{row.current.toLocaleString()}</td>
                      <td className={`px-6 py-4 text-sm text-right font-bold ${row.diff > 0 ? "text-fintech-danger" : "text-emerald-500"}`}>
                        <div className="flex items-center justify-end gap-1">
                          {row.diff > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(row.percentChange).toFixed(0)}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Category Selector & Date Range */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <select 
                  value={selectedCategoryId || ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="appearance-none rounded-lg border border-white/10 bg-white/5 px-5 py-3 pr-12 text-sm font-bold text-white focus:outline-none focus:border-fintech-accent transition-all cursor-pointer hover:bg-white/10"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id} className="bg-fintech-bg text-white">
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-fintech-muted">
                  <BarChart3 size={16} />
                </div>
              </div>
            </div>

            <DateRangeSelector range={categoryRange} onChange={setCategoryRange} />
          </div>

          {/* Category Trend Chart */}
          <section className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-fintech-muted">
                {categories.find(c => c.id === selectedCategoryId)?.name} - Trend Analysis
              </h3>
              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-fintech-accent" /> Actual</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-fintech-danger" /> Target</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Average</div>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    stroke="#475569" 
                    fontSize={10} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      const parts = val.split("-");
                      if (parts.length === 3) {
                        return `${parts[2]}/${parts[1]}`;
                      }
                      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return months[parseInt(parts[1]) - 1];
                    }}
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={10} 
                    axisLine={false} 
                    tickLine={false}
                    domain={[0, (dataMax: number) => Math.max(dataMax, currentTarget * 1.1)]}
                  />
                  <Tooltip 
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                    formatter={(value: number) => [`${baseSymbol}${value.toLocaleString()}`, ""]}
                  />
                  <ReferenceLine 
                    y={currentTarget} 
                    stroke="#ef4444" 
                    strokeDasharray="3 3" 
                    label={{ 
                      position: 'insideTopRight', 
                      value: `Target: ${baseSymbol}${currentTarget.toLocaleString()}`, 
                      fill: '#ef4444', 
                      fontSize: 10,
                      fontWeight: 'bold'
                    }} 
                  />
                  <ReferenceLine 
                    y={categoryTrendData[0]?.average || 0} 
                    stroke="#10b981" 
                    strokeDasharray="5 5" 
                    label={{ 
                      position: 'insideTopLeft', 
                      value: `Avg: ${baseSymbol}${(categoryTrendData[0]?.average || 0).toLocaleString()}`, 
                      fill: '#10b981', 
                      fontSize: 10,
                      fontWeight: 'bold'
                    }} 
                  />
                  <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Category Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Avg. Monthly Spend</span>
              <div className="mt-1 text-base font-bold text-white">
                {baseSymbol}{(categoryTrendData.reduce((acc, d) => acc + d.actual, 0) / 12).toFixed(0)}
              </div>
            </div>
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Monthly Target</span>
              <div className="mt-1 text-base font-bold text-fintech-accent">
                {baseSymbol}{categories.find(c => c.id === selectedCategoryId)?.target_amount || 0}
              </div>
            </div>
            <div className="glass-card rounded-xl border border-white/5 p-4">
              <span className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Target Variance</span>
              <div className={`mt-1 text-base font-bold ${
                (categoryTrendData[categoryTrendData.length - 1]?.actual || 0) > (categories.find(c => c.id === selectedCategoryId)?.target_amount || 0)
                ? "text-fintech-danger" : "text-emerald-500"
              }`}>
                {(((categoryTrendData[categoryTrendData.length - 1]?.actual || 0) / (categories.find(c => c.id === selectedCategoryId)?.target_amount || 1)) * 100).toFixed(0)}%
              </div>
              <div className="text-[10px] text-fintech-muted mt-1">Current month vs target</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
