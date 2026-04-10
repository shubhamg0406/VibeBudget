import React, { useState } from "react";
import { ExpenseCategory, IncomeCategory } from "../types";
import { Plus, Search, Calendar, DollarSign, Tag, FileText, User } from "lucide-react";
import { getTodayStr, formatDisplayDate } from "../utils/dateUtils";
import { TransactionIcon } from "./TransactionIcon";
import { useFirebase } from "../contexts/FirebaseContext";
import { CURRENCIES, getCurrencySymbol } from "../utils/currencyUtils";

const evaluateMath = (input: string): number | null => {
  try {
    let expr = input.trim();
    if (expr.startsWith('=')) {
      expr = expr.substring(1);
    }
    if (!expr) return null;

    // Replace implicit multiplication like 18(1.12) with 18*(1.12)
    expr = expr.replace(/(\d)\s*\(/g, '$1*(');
    expr = expr.replace(/\)\s*(\d)/g, ')*$1');

    // Only allow math characters
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      return null;
    }

    // Evaluate safely
    const result = new Function(`return ${expr}`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Number(result.toFixed(2));
    }
    return null;
  } catch (e) {
    return null;
  }
};

interface TransactionEntryProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  onRefresh: () => void;
  hideHeader?: boolean;
  initialData?: any;
  onClose?: () => void;
}

export const TransactionEntry: React.FC<TransactionEntryProps> = ({ 
  expenseCategories,
  incomeCategories,
  onRefresh,
  hideHeader = false,
  initialData,
  onClose
}) => {
  const { transactions, income, addTransaction, updateTransaction, deleteTransaction, addIncome, updateIncome, deleteIncome, preferences } = useFirebase();
  const [type, setType] = useState<"expense" | "income">(initialData?.type || "expense");
  const [date, setDate] = useState(initialData?.date || getTodayStr());
  const [vendor, setVendor] = useState(initialData?.vendor || initialData?.source || "");
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [currency, setCurrency] = useState(initialData?.currency || preferences?.baseCurrency || "CAD");
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [categoryId, setCategoryId] = useState(initialData?.category_id?.toString() || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [search, setSearch] = useState(initialData?.category_name || initialData?.category || "");
  const [incomeCategoryId, setIncomeCategoryId] = useState(initialData?.category_id?.toString() || "");
  const [incomeCategory, setIncomeCategory] = useState(initialData?.category || incomeCategories[0]?.name || "Job");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [isFocused, setIsFocused] = useState(false);
  const [isVendorFocused, setIsVendorFocused] = useState(false);

  const filteredCategories = expenseCategories.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const pastVendors = Array.from(new Set(transactions.map(t => t.vendor))).filter(Boolean);
  const pastSources = Array.from(new Set(income.map(i => i.source))).filter(Boolean);
  const currentSuggestions = type === "expense" ? pastVendors : pastSources;
  const filteredVendors = currentSuggestions.filter(v => 
    v.toLowerCase().includes(vendor.toLowerCase()) && v.toLowerCase() !== vendor.toLowerCase()
  );

  const calculatedAmount = evaluateMath(amount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = evaluateMath(amount);
    if (finalAmount === null || (type === "expense" && !categoryId) || (type === "income" && !vendor)) return;

    setSubmitting(true);
    try {
      const body = type === "expense" ? {
        date,
        vendor,
        amount: finalAmount,
        currency,
        category_id: categoryId,
        category_name: search,
        notes
      } : {
        date,
        source: vendor,
        amount: finalAmount,
        currency,
        category_id: incomeCategoryId,
        category: incomeCategory,
        notes
      };

      if (initialData) {
        if (type === "expense") {
          await updateTransaction(initialData.id, body);
        } else {
          await updateIncome(initialData.id, body);
        }
      } else {
        if (type === "expense") {
          await addTransaction(body);
        } else {
          await addIncome(body);
        }
      }
      
      if (!initialData) {
        // Reset form only if adding new
        setVendor("");
        setAmount("");
        setCurrency(preferences?.baseCurrency || "CAD");
        setCategoryId("");
        setSearch("");
        setIncomeCategoryId("");
        setIncomeCategory(incomeCategories[0]?.name || "Job");
        setNotes("");
      }
      
      onRefresh();
      if (onClose) onClose();
    } catch (error) {
      console.error("Error saving transaction:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData || !window.confirm("Are you sure you want to delete this transaction?")) return;
    
    setDeleting(true);
    try {
      if (type === "expense") {
        await deleteTransaction(initialData.id);
      } else {
        await deleteIncome(initialData.id);
      }
      onRefresh();
      if (onClose) onClose();
    } catch (error) {
      console.error("Error deleting transaction:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {!hideHeader && (
        <header className="space-y-1">
          <h2 className="text-2xl font-bold">Log Transaction</h2>
          <p className="text-sm text-fintech-muted">Keep track of your daily vibes.</p>
        </header>
      )}

      {/* Type Toggle */}
      {!initialData && (
        <div className="flex rounded-xl border bg-fintech-card p-1" style={{ borderColor: "var(--app-border)" }}>
          <button
            onClick={() => setType("expense")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
              type === "expense" ? "bg-fintech-accent text-white shadow-lg" : "text-fintech-muted"
            }`}
          >
            Expense
          </button>
          <button
            onClick={() => setType("income")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
              type === "income" ? "bg-fintech-accent text-white shadow-lg" : "text-fintech-muted"
            }`}
          >
            Income
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
                <Calendar size={12} /> Date
              </label>
              <span className="text-[10px] font-bold text-fintech-accent uppercase tracking-widest">
                {formatDisplayDate(date)}
              </span>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
              required
            />
          </div>

          {/* Vendor / Source */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
                {type === "expense" ? <Tag size={12} /> : <User size={12} />} 
                {type === "expense" ? "Vendor / Store" : "Source"}
              </label>
              {vendor && (
                <div className="flex items-center gap-2 scale-75 origin-right">
                  <span className="text-[8px] font-bold text-fintech-muted uppercase tracking-widest">Preview</span>
                  <TransactionIcon 
                    title={vendor} 
                    category={type === "expense" ? search : incomeCategory} 
                    type={type} 
                  />
                </div>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                onFocus={() => setIsVendorFocused(true)}
                onBlur={() => setTimeout(() => setIsVendorFocused(false), 200)}
                placeholder={type === "expense" ? "Amazon, Starbucks, etc." : "Job, Side Project, etc."}
                className="w-full"
                required
              />
              {isVendorFocused && filteredVendors.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border glass-card shadow-2xl" style={{ borderColor: "var(--app-border-strong)" }}>
                  {filteredVendors.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={() => {
                        setVendor(sug);
                        setIsVendorFocused(false);
                      }}
                      className="w-full border-b px-4 py-3 text-left text-sm transition-colors hover:bg-fintech-accent hover:text-white last:border-0"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
              <DollarSign size={12} /> Amount
            </label>
            <div className="flex gap-2 relative">
              <select 
                value={currency} 
                onChange={(e) => setCurrency(e.target.value)}
                className="w-24 rounded-xl border bg-[var(--app-ghost)] px-3 text-sm font-bold"
                style={{ borderColor: "var(--app-border)" }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={isAmountFocused ? amount : (calculatedAmount !== null ? calculatedAmount.toString() : amount)}
                  onChange={(e) => setAmount(e.target.value)}
                  onFocus={() => setIsAmountFocused(true)}
                  onBlur={() => setIsAmountFocused(false)}
                  placeholder="0.00 or =100+20"
                  className="w-full text-lg font-bold pl-8"
                  required
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fintech-muted font-bold">
                  {getCurrencySymbol(currency)}
                </span>
                {isAmountFocused && amount && (
                  <div className="absolute -bottom-5 left-1 text-[10px] font-bold animate-in fade-in slide-in-from-top-1">
                    {calculatedAmount !== null && amount.toString() !== calculatedAmount.toString() ? (
                      <span className="text-fintech-accent">= {calculatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ) : calculatedAmount === null ? (
                      <span className="text-fintech-danger">Invalid calculation</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category (for Expense) */}
          {type === "expense" && (
            <div className="space-y-2 relative">
              <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
                <Search size={12} /> Category
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search and select category..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCategoryId(""); // Reset category ID if user is typing
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => {
                    // Small delay to allow clicking the button
                    setTimeout(() => setIsFocused(false), 200);
                  }}
                  className="w-full pl-10"
                  required
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fintech-muted" size={18} />
                
                {/* Dropdown Results */}
                {isFocused && !categoryId && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border glass-card shadow-2xl" style={{ borderColor: "var(--app-border-strong)" }}>
                    {filteredCategories.length > 0 ? (
                      filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onMouseDown={() => {
                            // Use onMouseDown to trigger before onBlur
                            setCategoryId(cat.id.toString());
                            setSearch(cat.name);
                            setIsFocused(false);
                          }}
                          className="w-full border-b px-4 py-3 text-left text-sm transition-colors hover:bg-fintech-accent hover:text-white last:border-0"
                          style={{ borderColor: "var(--app-border)" }}
                        >
                          {cat.name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-fintech-muted italic">
                        No categories found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input type="hidden" value={categoryId} required />
            </div>
          )}

          {/* Category (for Income) */}
          {type === "income" && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
                <Tag size={12} /> Income Category
              </label>
              <select
                value={incomeCategoryId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const nextCategory = incomeCategories.find((item) => item.id === nextId);
                  setIncomeCategoryId(nextId);
                  setIncomeCategory(nextCategory?.name || "");
                }}
                className="w-full"
                required
              >
                <option value="" disabled>Select income category</option>
                {incomeCategories.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-fintech-muted uppercase tracking-widest flex items-center gap-2">
              <FileText size={12} /> Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add some context..."
              className="w-full h-24 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          {initialData && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className="flex-1 py-4 bg-fintech-danger/10 text-fintech-danger font-bold rounded-2xl border border-fintech-danger/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {deleting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-fintech-danger"></div>
              ) : (
                <span>Delete</span>
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || deleting}
            className="flex-[2] py-4 bg-fintech-accent text-white font-bold rounded-2xl shadow-xl shadow-fintech-accent/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
            ) : (
              <>
                <Plus size={20} />
                <span>{initialData ? "Save Changes" : `Add ${type === "expense" ? "Expense" : "Income"}`}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
