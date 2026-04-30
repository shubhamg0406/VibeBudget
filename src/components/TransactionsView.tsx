import React, { useEffect, useMemo, useState } from "react";
import { Transaction, Income, ExpenseCategory, IncomeCategory } from "../types";
import { 
  Search, 
  Filter, 
  Plus, 
  X, 
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Receipt,
  Repeat,
  RotateCcw,
  SearchX,
  RefreshCw,
  Upload
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TransactionEntry } from "./TransactionEntry";
import { TransactionIcon } from "./TransactionIcon";
import { compareDateStrings, formatDisplayDate, getMonthYearLabel, isDateInRange } from "../utils/dateUtils";
import { useFirebase } from "../contexts/FirebaseContext";
import { convertToBaseCurrency, getCurrencySymbol } from "../utils/currencyUtils";
import { getCategoryDropdownNames } from "../utils/categoryOptions";
import {
  hasSavedTransactionSheetImportConfig,
  refreshSavedTransactionSheetImports,
} from "../utils/publicSheetImport";
import { BottomSheet } from "./common/BottomSheet";
import { FAB } from "./common/FAB";
import { BulkAddModal } from "./BulkAddModal";
import { useBreakpoint } from "../hooks/useBreakpoint";

interface TransactionsViewProps {
  transactions: Transaction[];
  income: Income[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  onRefresh: () => void;
}

interface UnifiedTransaction {
  id: number | string;
  date: string;
  title: string;
  amount: number;
  category: string;
  notes?: string;
  type: "expense" | "income";
  currency?: string;
  original?: any;
  recurring_rule_id?: string;
  is_recurring_instance?: boolean;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ 
  transactions, 
  income, 
  expenseCategories,
  incomeCategories,
  onRefresh 
}) => {
  const { isDesktop } = useBreakpoint();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<UnifiedTransaction | null>(null);
  const [filterType, setFilterType] = useState<"all" | "expense" | "income">("all");
  const [showFilters, setShowFilters] = useState(false);
  const {
    preferences,
    getUpcomingRecurring,
    recurringRules,
    updateRecurringRule,
    deleteRecurringRule,
    googleSheetsConfig,
    googleSheetsConnected,
    googleSheetsSyncing,
    googleSheetsError,
    googleSheetsAccessToken,
    connectGoogleSheets,
    upsertGoogleSheetRows,
    syncGoogleSheets,
  } = useFirebase();
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [viewRuleId, setViewRuleId] = useState<string | null>(null);
  const [sheetRefreshStatus, setSheetRefreshStatus] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);
  const [sheetRefreshLoading, setSheetRefreshLoading] = useState(false);
  const [hasSavedSheetImport, setHasSavedSheetImport] = useState(false);
  
  // Advanced filters
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const unifiedData: UnifiedTransaction[] = useMemo(() => {
    const expenses: UnifiedTransaction[] = transactions.map(t => ({
      id: t.id,
      date: t.date,
      title: t.vendor,
      amount: t.amount,
      category: t.category_name,
      notes: t.notes,
      type: "expense",
      currency: t.currency,
      recurring_rule_id: t.recurring_rule_id,
      is_recurring_instance: t.is_recurring_instance,
      original: t
    }));

    const incomes: UnifiedTransaction[] = income.map(i => ({
      id: i.id,
      date: i.date,
      title: i.source,
      amount: i.amount,
      category: i.category,
      notes: i.notes,
      type: "income",
      currency: i.currency,
      recurring_rule_id: i.recurring_rule_id,
      is_recurring_instance: i.is_recurring_instance,
      original: i
    }));

    return [...expenses, ...incomes].sort((a, b) => compareDateStrings(b.date, a.date));
  }, [transactions, income]);

  const filtered = unifiedData.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                         (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory ? t.category === selectedCategory : true;
    const matchesType = filterType === "all" ? true : t.type === filterType;
    
    const matchesMinAmount = minAmount ? t.amount >= parseFloat(minAmount) : true;
    const matchesMaxAmount = maxAmount ? t.amount <= parseFloat(maxAmount) : true;
    const matchesStartDate = startDate ? isDateInRange(t.date, startDate, "9999-12-31") : true;
    const matchesEndDate = endDate ? isDateInRange(t.date, "0001-01-01", endDate) : true;

    return matchesSearch && matchesCategory && matchesType && 
           matchesMinAmount && matchesMaxAmount && 
           matchesStartDate && matchesEndDate;
  });

  const sortedAndFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        return sortOrder === "desc" 
          ? compareDateStrings(b.date, a.date) 
          : compareDateStrings(a.date, b.date);
      } else {
        return sortOrder === "desc" 
          ? b.amount - a.amount 
          : a.amount - b.amount;
      }
    });
  }, [filtered, sortBy, sortOrder]);

  const groupedByMonth = useMemo(() => {
    const groups: { [key: string]: UnifiedTransaction[] } = {};
    sortedAndFiltered.forEach(t => {
      const label = getMonthYearLabel(t.date);
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    });
    return groups;
  }, [sortedAndFiltered]);

  const categoryOptions = useMemo(
    () => getCategoryDropdownNames(filterType, expenseCategories, incomeCategories),
    [expenseCategories, filterType, incomeCategories]
  );

  useEffect(() => {
    if (!selectedCategory) return;
    if (!categoryOptions.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [categoryOptions, selectedCategory]);

  useEffect(() => {
    setHasSavedSheetImport(hasSavedTransactionSheetImportConfig());
  }, []);

  const totalIncoming = sortedAndFiltered
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + convertToBaseCurrency(item.amount, item.currency, preferences), 0);
  const totalOutgoing = sortedAndFiltered
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + convertToBaseCurrency(item.amount, item.currency, preferences), 0);
  const netFlow = totalIncoming - totalOutgoing;
  const upcoming = useMemo(() => (showUpcoming ? getUpcomingRecurring(30) : []), [getUpcomingRecurring, showUpcoming, recurringRules]);
  const upcomingExpense = upcoming.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const upcomingIncome = upcoming.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const lastSheetRefresh = googleSheetsConfig?.lastPullAt || googleSheetsConfig?.lastSyncedAt || null;
  const canRefreshFromSheets = Boolean(googleSheetsConfig || hasSavedSheetImport);
  const isSheetRefreshing = googleSheetsSyncing || sheetRefreshLoading;

  const handleSheetRefresh = async () => {
    if (isSheetRefreshing) return;

    setSheetRefreshStatus(null);
    setSheetRefreshLoading(true);

    try {
      if (googleSheetsConfig && !googleSheetsConnected) {
        await connectGoogleSheets();
      }

      if (googleSheetsConfig) {
        await syncGoogleSheets("pull");
      } else {
        const result = await refreshSavedTransactionSheetImports(googleSheetsAccessToken, upsertGoogleSheetRows);
        const totalImported = result.expenses + result.income;
        if (totalImported === 0) {
          setSheetRefreshStatus({
            type: "info",
            message: "Saved Google Sheet import refreshed. No new transaction rows were added.",
          });
          return;
        }
      }

      setSheetRefreshStatus({
        type: "success",
        message: "Google Sheet changes fetched and added to transactions.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh from Google Sheets.";
      setSheetRefreshStatus({
        type: message.includes("Redirecting to Google") ? "info" : "error",
        message,
      });
    } finally {
      setSheetRefreshLoading(false);
    }
  };

  return (
    <div className="relative min-h-[80vh] space-y-6 pb-24">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-fintech-muted">
            {unifiedData.length} total records
          </p>
          {lastSheetRefresh && (
            <p className="mt-1 text-[11px] text-fintech-muted">
              Last sheet pull: {new Date(lastSheetRefresh).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBulkAdd(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-[var(--app-panel)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-fintech-accent transition-colors hover:bg-fintech-accent/10"
            style={{ borderColor: "var(--app-border)" }}
            aria-label="Bulk add transactions from files"
          >
            <Upload size={15} />
            <span>Bulk Add</span>
          </button>

          {canRefreshFromSheets && (
            <button
              type="button"
              onClick={() => void handleSheetRefresh()}
              disabled={isSheetRefreshing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-[var(--app-panel)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-fintech-accent transition-colors hover:bg-fintech-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: "var(--app-border)" }}
              aria-label="Refresh transactions from Google Sheets"
            >
              <RefreshCw size={15} className={isSheetRefreshing ? "animate-spin" : ""} />
              <span>{isSheetRefreshing ? "Refreshing..." : "Refresh Sheet"}</span>
            </button>
          )}
        </div>
      </header>

      {canRefreshFromSheets && (sheetRefreshStatus || googleSheetsError) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            sheetRefreshStatus?.type === "success"
              ? "border-fintech-success/30 bg-fintech-success/10 text-fintech-success"
              : sheetRefreshStatus?.type === "info"
                ? "border-fintech-import/30 bg-fintech-import/10 text-fintech-import"
                : "border-fintech-danger/30 bg-fintech-danger/10 text-fintech-danger"
          }`}
        >
          {sheetRefreshStatus?.message || googleSheetsError}
        </div>
      )}

      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        <button
          type="button"
          onClick={() => setShowUpcoming((prev) => !prev)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Upcoming (30 days)</div>
            <div className="text-sm font-semibold">Projected recurring entries</div>
          </div>
          {showUpcoming ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showUpcoming && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                <div className="text-[10px] uppercase tracking-widest text-fintech-muted">Projected expenses</div>
                <div className="text-lg font-bold text-fintech-danger">
                  {getCurrencySymbol(preferences?.baseCurrency)}{upcomingExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="rounded-lg bg-[var(--app-ghost)] p-3">
                <div className="text-[10px] uppercase tracking-widest text-fintech-muted">Projected income</div>
                <div className="text-lg font-bold text-fintech-success">
                  {getCurrencySymbol(preferences?.baseCurrency)}{upcomingIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {upcoming.length === 0 ? (
              <div className="text-xs text-fintech-muted">No recurring entries in the next 30 days.</div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {upcoming.map((item) => (
                  <div key={`${item.rule_id}-${item.projected_date}`} className="flex items-center justify-between rounded-lg bg-[var(--app-ghost)] p-3 text-sm">
                    <div>
                      <div className="font-semibold">{item.vendor || item.source || "Recurring"}</div>
                      <div className="text-[11px] text-fintech-muted">{formatDisplayDate(item.projected_date)} • {item.category_name || "Uncategorized"}</div>
                      <button
                        type="button"
                        className="mt-1 text-[10px] uppercase tracking-widest text-fintech-accent"
                        onClick={() => setViewRuleId(item.rule_id)}
                      >
                        View rule
                      </button>
                    </div>
                    <div className={item.type === "income" ? "text-fintech-success font-bold" : "text-fintech-danger font-bold"}>
                      {item.type === "income" ? "+" : "-"}{getCurrencySymbol(preferences?.baseCurrency)}{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-end">
          <div className="space-y-2 lg:col-span-6">
            <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Universal Search</label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fintech-muted transition-colors group-focus-within:text-fintech-accent" size={18} />
              <input 
                type="text"
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border bg-[var(--app-input)] py-4 pl-12 pr-4 text-sm text-[var(--app-text)] placeholder:text-fintech-muted"
                style={{ borderColor: "var(--app-border)" }}
              />
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Transaction Type</label>
            <div className="flex gap-1 rounded-xl bg-[var(--app-panel)] p-1">
              <button
                onClick={() => setFilterType("all")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  filterType === "all"
                    ? "bg-fintech-accent text-[#002919]"
                    : "text-fintech-muted hover:text-[var(--app-text)]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("expense")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                  filterType === "expense"
                    ? "bg-[#ff716a] text-white"
                    : "text-fintech-muted hover:text-[var(--app-text)]"
                }`}
              >
                Expenses
              </button>
              <button
                onClick={() => setFilterType("income")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                  filterType === "income"
                    ? "bg-fintech-accent text-[#002919]"
                    : "text-fintech-muted hover:text-[var(--app-text)]"
                }`}
              >
                Income
              </button>
            </div>
          </div>

          <div className="hidden space-y-2 lg:col-span-3 lg:block">
            <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Category</label>
            <select
              value={selectedCategory || ""}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="w-full appearance-none rounded-xl border bg-[var(--app-input-muted)] px-4 py-4 text-sm font-medium text-[var(--app-text)] outline-none"
              style={{ borderColor: "var(--app-border)" }}
            >
              <option value="">All Categories</option>
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              showFilters || minAmount || maxAmount || startDate || endDate
                ? "border-fintech-accent bg-fintech-accent/10 text-fintech-accent" 
                : "border bg-[var(--app-panel)] text-fintech-muted"
            }`}
            style={!showFilters && !minAmount && !maxAmount && !startDate && !endDate ? { borderColor: "var(--app-border)" } : undefined}
          >
            <Filter size={14} />
            Advanced Filters
          </button>

          {(search || selectedCategory || filterType !== "all" || minAmount || maxAmount || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch("");
                setMinAmount("");
                setMaxAmount("");
                setStartDate("");
                setEndDate("");
                setSortBy("date");
                setSortOrder("desc");
                setSelectedCategory(null);
                setFilterType("all");
              }}
              className="text-[11px] font-bold uppercase tracking-widest text-fintech-accent hover:underline"
            >
              Clear Active Filters
            </button>
          )}
        </div>

        {isDesktop ? (
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-4 rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Min Amount</label>
                      <input 
                        type="number" 
                        inputMode="decimal"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                        style={{ borderColor: "var(--app-border)" }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Max Amount</label>
                      <input 
                        type="number" 
                        inputMode="decimal"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                        placeholder="9999"
                        className="w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                        style={{ borderColor: "var(--app-border)" }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Start Date</label>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                        style={{ borderColor: "var(--app-border)" }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">End Date</label>
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                        style={{ borderColor: "var(--app-border)" }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => {
                          setSortBy(sortBy === "date" ? "amount" : "date");
                        }}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[var(--app-ghost-strong)]"
                      >
                        <ArrowUpDown size={12} /> Sort: {sortBy}
                      </button>
                      <button 
                        onClick={() => {
                          setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                        }}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[var(--app-ghost-strong)]"
                      >
                        {sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {sortOrder}
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setMinAmount("");
                        setMaxAmount("");
                        setStartDate("");
                        setEndDate("");
                        setSortBy("date");
                        setSortOrder("desc");
                        setSelectedCategory(null);
                        setFilterType("all");
                      }}
                      className="text-[10px] font-bold text-fintech-accent uppercase tracking-widest hover:underline"
                    >
                      Reset All
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <BottomSheet isOpen={showFilters} onClose={() => setShowFilters(false)} title="Filters">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Category</label>
                <select
                  value={selectedCategory || ""}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="min-h-11 w-full rounded-xl border bg-[var(--app-input-muted)] px-4 py-2.5 text-sm font-medium text-[var(--app-text)] outline-none"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <option value="">All Categories</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Min Amount</label>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0.00"
                    className="min-h-11 w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                    style={{ borderColor: "var(--app-border)" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Max Amount</label>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="9999"
                    className="min-h-11 w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                    style={{ borderColor: "var(--app-border)" }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Start Date</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="min-h-11 w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                      style={{ borderColor: "var(--app-border)" }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">End Date</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-h-11 w-full rounded-xl border bg-[var(--app-input)] px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                      style={{ borderColor: "var(--app-border)" }}
                    />
                  </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => {
                        setSortBy(sortBy === "date" ? "amount" : "date");
                      }}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[var(--app-ghost-strong)]"
                    >
                      <ArrowUpDown size={12} /> Sort: {sortBy}
                    </button>
                    <button 
                      onClick={() => {
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      }}
                      className="flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--app-ghost)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-[var(--app-ghost-strong)]"
                    >
                      {sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {sortOrder}
                    </button>
                </div>
              </div>
              <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t bg-fintech-bg pt-3" style={{ borderColor: "var(--app-border)" }}>
                <button
                  onClick={() => {
                    setMinAmount("");
                    setMaxAmount("");
                    setStartDate("");
                    setEndDate("");
                    setSortBy("date");
                    setSortOrder("desc");
                    setSelectedCategory(null);
                    setFilterType("all");
                  }}
                  className="min-h-11 rounded-lg border bg-[var(--app-panel)] px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="min-h-11 rounded-lg bg-fintech-accent px-3 py-2 text-xs font-semibold text-[#002919]"
                >
                  Apply
                </button>
              </div>
            </div>
          </BottomSheet>
        )}
      </div>

      <div className="space-y-8">
        {Object.entries(groupedByMonth).map(([month, txs]) => (
          <div key={month} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-[var(--app-divider)]" />
              <h3 className="text-[10px] font-bold text-fintech-muted uppercase tracking-[0.2em] whitespace-nowrap">
                {month}
              </h3>
              <div className="h-px flex-1 bg-[var(--app-divider)]" />
            </div>
            
            <div className="grid gap-3 xl:grid-cols-2">
              {(txs as UnifiedTransaction[]).map((t, index) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.5) }}
                  key={`${t.type}-${t.id}`} 
                  onClick={() => setEditingTransaction(t.original ? { ...t.original, type: t.type } : { ...t, type: t.type })}
                  className="glass-card group flex min-w-0 items-center justify-between rounded-xl p-4 transition-all hover:border-[var(--app-border-strong)] active:scale-[0.98] cursor-pointer"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <TransactionIcon 
                      title={t.title} 
                      category={t.category} 
                      type={t.type as any} 
                    />
                    <div className="min-w-0">
                      <div className="font-bold group-hover:text-fintech-accent transition-colors truncate flex items-center gap-2">
                        <span className="truncate">{t.title}</span>
                        {t.is_recurring_instance && <Repeat size={12} className="text-fintech-accent shrink-0" aria-label="Recurring instance" />}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-fintech-muted uppercase tracking-wider font-medium">
                        <span className={t.type === "income" ? "text-fintech-success" : "text-fintech-danger"}>
                          {t.category}
                        </span>
                        <span>•</span>
                        <span>{formatDisplayDate(t.date)}</span>
                      </div>
                      {t.notes && (
                        <div className="text-[10px] text-fintech-muted mt-1 italic line-clamp-1">
                          {t.notes}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`text-base font-bold shrink-0 ${
                    t.type === "income" ? "text-fintech-success" : "text-fintech-danger"
                  }`}>
                    {t.type === "income" ? "+" : "-"}{getCurrencySymbol(t.currency)}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {t.currency && t.currency !== preferences?.baseCurrency && (
                      <div className="text-[10px] text-fintech-muted text-right font-normal mt-0.5">
                        {getCurrencySymbol(preferences?.baseCurrency)}{convertToBaseCurrency(t.amount, t.currency, preferences).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
        
        {sortedAndFiltered.length === 0 && (
          <div className="flex min-h-[500px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed bg-[var(--app-ghost)] px-8 py-16 text-center" style={{ borderColor: "var(--app-border)" }}>
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full bg-fintech-accent/10 blur-3xl" />
              <div className="relative flex h-44 w-44 items-center justify-center rounded-full border bg-[var(--app-panel)] text-[color:var(--app-text)]/30" style={{ borderColor: "var(--app-border)" }}>
                <Receipt size={72} />
                <div className="absolute -bottom-2 -right-2 flex h-14 w-14 items-center justify-center rounded-2xl border bg-[var(--app-panel-strong)] text-fintech-accent shadow-xl" style={{ borderColor: "var(--app-border)" }}>
                  <SearchX size={28} />
                </div>
              </div>
            </div>
            <div className="text-xl font-semibold text-[var(--app-text)]">No transactions found</div>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-fintech-muted">
              We couldn't find any transactions matching your current filters. Try adjusting your search or category selection.
            </p>
            <button
              onClick={() => {
                setSearch("");
                setMinAmount("");
                setMaxAmount("");
                setStartDate("");
                setEndDate("");
                setSelectedCategory(null);
                setFilterType("all");
              }}
              className="mt-8 inline-flex items-center gap-2 rounded-xl border bg-[var(--app-panel-strong)] px-6 py-3 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              <RotateCcw size={18} />
              <span>Clear All Filters</span>
            </button>
          </div>
        )}
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-2xl border bg-[var(--app-panel)] p-6 md:col-span-1" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Period In ({preferences?.baseCurrency || "CAD"})</div>
          <div className="text-2xl font-bold text-fintech-accent">
            {getCurrencySymbol(preferences?.baseCurrency)}{totalIncoming.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-2xl border bg-[var(--app-panel)] p-6 md:col-span-1" style={{ borderColor: "var(--app-border)" }}>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Period Out ({preferences?.baseCurrency || "CAD"})</div>
          <div className="text-2xl font-bold text-fintech-danger">
            {getCurrencySymbol(preferences?.baseCurrency)}{totalOutgoing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-2xl border bg-[var(--app-panel)] p-6 md:col-span-2" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Net Flow ({preferences?.baseCurrency || "CAD"})</div>
              <div className={`text-2xl font-bold ${netFlow >= 0 ? "text-[#77e6ff]" : "text-fintech-danger"}`}>
                {getCurrencySymbol(preferences?.baseCurrency)}{netFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="flex h-10 w-32 items-end gap-1 overflow-hidden rounded bg-[var(--app-panel-strong)] px-2 pb-1 opacity-35">
              <div className="h-1/2 w-full rounded-t-sm bg-[var(--app-text-muted)]/45" />
              <div className="h-3/4 w-full rounded-t-sm bg-[var(--app-text-muted)]/45" />
              <div className="h-1/4 w-full rounded-t-sm bg-[var(--app-text-muted)]/45" />
              <div className="h-1/2 w-full rounded-t-sm bg-[var(--app-text-muted)]/45" />
              <div className="h-2/3 w-full rounded-t-sm bg-[var(--app-text-muted)]/45" />
            </div>
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <div className="pointer-events-none fixed bottom-24 right-24 z-40 lg:bottom-8 lg:right-28">
        <FAB onClick={() => setShowAddModal(true)} className="pointer-events-auto" />
      </div>

      {/* Bulk Add from Files Modal */}
      {showBulkAdd && (
        <BulkAddModal
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          onClose={() => setShowBulkAdd(false)}
          onRefresh={() => {
            onRefresh();
            setShowBulkAdd(false);
          }}
        />
      )}

      {/* Add/Edit Transaction Modal */}
      <BottomSheet
        isOpen={showAddModal || Boolean(editingTransaction)}
        onClose={() => {
          setShowAddModal(false);
          setEditingTransaction(null);
        }}
        title={editingTransaction ? "Edit Transaction" : "Add Transaction"}
        fullScreen={!isDesktop}
      >
        <TransactionEntry 
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          hideHeader={true}
          initialData={editingTransaction}
          onRefresh={() => {
            onRefresh();
            setShowAddModal(false);
            setEditingTransaction(null);
          }} 
          onClose={() => {
            setShowAddModal(false);
            setEditingTransaction(null);
          }}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={Boolean(viewRuleId)}
        onClose={() => setViewRuleId(null)}
        title="Recurring Rule"
        fullScreen={!isDesktop}
      >
        {(() => {
          const rule = recurringRules.find((item) => item.id === viewRuleId);
          if (!rule) {
            return <div className="text-sm text-fintech-muted">Rule not found.</div>;
          }
          return (
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)" }}>
                <div className="text-sm font-semibold">{rule.vendor || rule.source || "Recurring rule"}</div>
                <div className="text-xs text-fintech-muted mt-1">Repeats monthly on day {rule.day_of_month}</div>
                <div className="text-xs text-fintech-muted">Status: {rule.is_active ? "Active" : "Paused"}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-[var(--app-ghost)] px-3 py-2 text-sm font-semibold"
                  onClick={async () => {
                    await updateRecurringRule(rule.id, { is_active: !rule.is_active });
                    setViewRuleId(null);
                  }}
                >
                  {rule.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-fintech-danger/10 px-3 py-2 text-sm font-semibold text-fintech-danger"
                  onClick={async () => {
                    if (!window.confirm("Cancel this recurring rule?")) return;
                    await deleteRecurringRule(rule.id);
                    setViewRuleId(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
};
