import React, { useState, useMemo } from "react";
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
  RotateCcw,
  SearchX
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TransactionEntry } from "./TransactionEntry";
import { TransactionIcon } from "./TransactionIcon";
import { formatDisplayDate, getMonthYearLabel } from "../utils/dateUtils";
import { useFirebase } from "../contexts/FirebaseContext";
import { convertToBaseCurrency, getCurrencySymbol } from "../utils/currencyUtils";

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
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ 
  transactions, 
  income, 
  expenseCategories,
  incomeCategories,
  onRefresh 
}) => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<UnifiedTransaction | null>(null);
  const [filterType, setFilterType] = useState<"all" | "expense" | "income">("all");
  const [showFilters, setShowFilters] = useState(false);
  const { preferences } = useFirebase();
  
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
      original: i
    }));

    return [...expenses, ...incomes].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, income]);

  const filtered = unifiedData.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || 
                         (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory ? t.category === selectedCategory : true;
    const matchesType = filterType === "all" ? true : t.type === filterType;
    
    const matchesMinAmount = minAmount ? t.amount >= parseFloat(minAmount) : true;
    const matchesMaxAmount = maxAmount ? t.amount <= parseFloat(maxAmount) : true;
    const matchesStartDate = startDate ? t.date >= startDate : true;
    const matchesEndDate = endDate ? t.date <= endDate : true;

    return matchesSearch && matchesCategory && matchesType && 
           matchesMinAmount && matchesMaxAmount && 
           matchesStartDate && matchesEndDate;
  });

  const sortedAndFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        return sortOrder === "desc" 
          ? b.date.localeCompare(a.date) 
          : a.date.localeCompare(b.date);
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

  const allCategoryNames = useMemo(() => {
    const expenseCats = expenseCategories.map(c => c.name);
    const incomeCats = incomeCategories.map(c => c.name);
    return Array.from(new Set([...expenseCats, ...incomeCats])).sort();
  }, [expenseCategories, incomeCategories]);

  const totalIncoming = sortedAndFiltered
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + convertToBaseCurrency(item.amount, item.currency, preferences), 0);
  const totalOutgoing = sortedAndFiltered
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + convertToBaseCurrency(item.amount, item.currency, preferences), 0);
  const netFlow = totalIncoming - totalOutgoing;

  return (
    <div className="relative min-h-[80vh] space-y-6 pb-24">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-fintech-muted">
          {unifiedData.length} total records
        </p>
      </header>

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
                className="w-full rounded-xl border border-white/5 bg-[#192540] py-4 pl-12 pr-4 text-sm text-white placeholder:text-fintech-muted"
              />
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Transaction Type</label>
            <div className="flex gap-1 rounded-xl bg-[#0f1930] p-1">
              <button
                onClick={() => setFilterType("all")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
                  filterType === "all"
                    ? "bg-fintech-accent text-[#002919]"
                    : "text-fintech-muted hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("expense")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                  filterType === "expense"
                    ? "bg-[#ff716a] text-white"
                    : "text-fintech-muted hover:text-white"
                }`}
              >
                Expenses
              </button>
              <button
                onClick={() => setFilterType("income")}
                className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                  filterType === "income"
                    ? "bg-fintech-accent text-[#002919]"
                    : "text-fintech-muted hover:text-white"
                }`}
              >
                Income
              </button>
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Category</label>
            <select
              value={selectedCategory || ""}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="w-full appearance-none rounded-xl border border-white/5 bg-[#141f38] px-4 py-4 text-sm font-medium text-white outline-none"
            >
              <option value="">All Categories</option>
              {allCategoryNames.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              showFilters || minAmount || maxAmount || startDate || endDate
                ? "border-fintech-accent bg-fintech-accent/10 text-fintech-accent" 
                : "border-white/10 bg-[#0f1930] text-fintech-muted"
            }`}
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

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 rounded-xl border border-white/5 bg-[#0f1930] p-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Min Amount</label>
                    <input 
                      type="number" 
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-fintech-bg border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">Max Amount</label>
                    <input 
                      type="number" 
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="9999"
                      className="w-full bg-fintech-bg border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
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
                      className="w-full bg-fintech-bg border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest">End Date</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-fintech-bg border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-fintech-accent/50"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => {
                        setSortBy(sortBy === "date" ? "amount" : "date");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                    >
                      <ArrowUpDown size={12} /> Sort: {sortBy}
                    </button>
                    <button 
                      onClick={() => {
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
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
      </div>

      <div className="space-y-8">
        {Object.entries(groupedByMonth).map(([month, txs]) => (
          <div key={month} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <h3 className="text-[10px] font-bold text-fintech-muted uppercase tracking-[0.2em] whitespace-nowrap">
                {month}
              </h3>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            
            <div className="grid gap-3 xl:grid-cols-2">
              {(txs as UnifiedTransaction[]).map((t, index) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.5) }}
                  key={`${t.type}-${t.id}`} 
                  onClick={() => setEditingTransaction(t.original ? { ...t.original, type: t.type } : { ...t, type: t.type })}
                  className="glass-card min-w-0 rounded-xl p-4 flex items-center justify-between hover:border-white/20 transition-all group cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <TransactionIcon 
                      title={t.title} 
                      category={t.category} 
                      type={t.type as any} 
                    />
                    <div className="min-w-0">
                      <div className="font-bold group-hover:text-fintech-accent transition-colors truncate">{t.title}</div>
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
          <div className="flex min-h-[500px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-[rgba(15,25,48,0.3)] px-8 py-16 text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full bg-fintech-accent/10 blur-3xl" />
              <div className="relative flex h-44 w-44 items-center justify-center rounded-full border border-white/8 bg-[#0f1930] text-white/30">
                <Receipt size={72} />
                <div className="absolute -bottom-2 -right-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#1f2b49] text-fintech-accent shadow-xl">
                  <SearchX size={28} />
                </div>
              </div>
            </div>
            <div className="text-xl font-semibold text-white">No transactions found</div>
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
              className="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#192540] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1f2b49]"
            >
              <RotateCcw size={18} />
              <span>Clear All Filters</span>
            </button>
          </div>
        )}
      </div>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-white/5 bg-[#0f1930] p-6 md:col-span-1">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Period In ({preferences?.baseCurrency || "CAD"})</div>
          <div className="text-2xl font-bold text-fintech-accent">
            {getCurrencySymbol(preferences?.baseCurrency)}{totalIncoming.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-[#0f1930] p-6 md:col-span-1">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Period Out ({preferences?.baseCurrency || "CAD"})</div>
          <div className="text-2xl font-bold text-fintech-danger">
            {getCurrencySymbol(preferences?.baseCurrency)}{totalOutgoing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-gradient-to-r from-[#0f1930] to-[#141f38] p-6 md:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fintech-muted">Net Flow ({preferences?.baseCurrency || "CAD"})</div>
              <div className={`text-2xl font-bold ${netFlow >= 0 ? "text-[#77e6ff]" : "text-fintech-danger"}`}>
                {getCurrencySymbol(preferences?.baseCurrency)}{netFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="flex h-10 w-32 items-end gap-1 overflow-hidden rounded bg-[#192540] px-2 pb-1 opacity-25">
              <div className="h-1/2 w-full rounded-t-sm bg-white/40" />
              <div className="h-3/4 w-full rounded-t-sm bg-white/40" />
              <div className="h-1/4 w-full rounded-t-sm bg-white/40" />
              <div className="h-1/2 w-full rounded-t-sm bg-white/40" />
              <div className="h-2/3 w-full rounded-t-sm bg-white/40" />
            </div>
          </div>
        </div>
      </section>

      {/* Floating Action Button - Fixed within app container boundaries */}
      <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-40 lg:bottom-8">
        <div className="mx-auto flex w-full max-w-[1240px] justify-end px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setShowAddModal(true)}
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#63f0bf_0%,_#31c987_100%)] text-[#07121f] shadow-[0_18px_40px_rgba(73,240,181,0.26)] transition-all hover:scale-110 active:scale-95"
          >
            <Plus size={30} />
          </button>
        </div>
      </div>

      {/* Add/Edit Transaction Modal - Fixed within app container boundaries */}
      <AnimatePresence>
        {(showAddModal || editingTransaction) && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-24 sm:items-center sm:pb-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowAddModal(false);
                setEditingTransaction(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-fintech-bg p-8 shadow-2xl max-h-[85vh] sm:rounded-[2rem]"
            >
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingTransaction(null);
                }}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors text-fintech-muted z-10"
              >
                <X size={24} />
              </button>
              
              <div className="pt-6">
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
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
