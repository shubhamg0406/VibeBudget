import React, { useState, useRef } from "react";
import { Plus, Trash2, Check, X, Tag, TrendingUp } from "lucide-react";
import { useFirebase } from "../contexts/FirebaseContext";
import { ExpenseCategory, IncomeCategory } from "../types";
import { getCurrencySymbol } from "../utils/currencyUtils";

type CategoryType = "expense" | "income";

interface EditState {
  id: string;
  field: "name" | "target";
  value: string;
}

interface DeleteConfirm {
  id: string;
  name: string;
}

export function CategoryManager() {
  const {
    expenseCategories,
    incomeCategories,
    preferences,
    addExpenseCategory,
    addIncomeCategory,
    deleteExpenseCategory,
    deleteIncomeCategory,
    updateExpenseCategoryName,
    updateIncomeCategoryName,
    updateExpenseCategoryTarget,
    updateIncomeCategoryTarget,
  } = useFirebase();

  const [activeType, setActiveType] = useState<CategoryType>("expense");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  const currencySymbol = getCurrencySymbol(preferences.baseCurrency);

  const categories: (ExpenseCategory | IncomeCategory)[] =
    activeType === "expense"
      ? [...expenseCategories].sort((a, b) => a.name.localeCompare(b.name))
      : [...incomeCategories].sort((a, b) => a.name.localeCompare(b.name));

  const startEdit = (id: string, field: "name" | "target", current: string | number) => {
    setEditState({ id, field, value: String(current) });
    setError(null);
  };

  const cancelEdit = () => setEditState(null);

  const commitEdit = async () => {
    if (!editState) return;
    const { id, field, value } = editState;
    const trimmed = value.trim();
    if (!trimmed) { setError("Cannot be empty."); return; }

    setSaving(true);
    setError(null);
    try {
      if (field === "name") {
        if (activeType === "expense") await updateExpenseCategoryName(id, trimmed);
        else await updateIncomeCategoryName(id, trimmed);
      } else {
        const num = parseFloat(trimmed);
        if (isNaN(num) || num < 0) { setError("Enter a valid non-negative number."); setSaving(false); return; }
        if (activeType === "expense") await updateExpenseCategoryTarget(id, num);
        else await updateIncomeCategoryTarget(id, num);
      }
      setEditState(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      if (activeType === "expense") await deleteExpenseCategory(id);
      else await deleteIncomeCategory(id);
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) { setError("Category name required."); return; }
    const targetNum = newTarget.trim() ? parseFloat(newTarget) : 0;
    if (isNaN(targetNum) || targetNum < 0) { setError("Enter a valid non-negative target."); return; }

    setSaving(true);
    setError(null);
    try {
      if (activeType === "expense") await addExpenseCategory(trimmedName, targetNum);
      else await addIncomeCategory(trimmedName, targetNum);
      setNewName("");
      setNewTarget("");
      setAddingNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setSaving(false);
    }
  };

  const startAdding = () => {
    setAddingNew(true);
    setError(null);
    setTimeout(() => newNameRef.current?.focus(), 50);
  };

  const cancelAdd = () => {
    setAddingNew(false);
    setNewName("");
    setNewTarget("");
    setError(null);
  };

  return (
    <div className="space-y-5">
      {/* Tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveType("expense"); setEditState(null); setDeleteConfirm(null); setAddingNew(false); setError(null); }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeType === "expense" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted hover:text-white"}`}
        >
          <Tag size={13} /> Expense Categories
        </button>
        <button
          onClick={() => { setActiveType("income"); setEditState(null); setDeleteConfirm(null); setAddingNew(false); setError(null); }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeType === "income" ? "bg-fintech-accent text-[#002919]" : "text-fintech-muted hover:text-white"}`}
        >
          <TrendingUp size={13} /> Income Categories
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Category list */}
      <div className="rounded-xl border bg-[var(--app-panel)] overflow-hidden" style={{ borderColor: "var(--app-border)" }}>
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_44px] gap-2 border-b px-4 py-2 text-xs font-bold uppercase tracking-widest text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
          <div>Name</div>
          <div>Monthly Target ({currencySymbol})</div>
          <div />
        </div>

        {categories.length === 0 && !addingNew && (
          <div className="px-4 py-8 text-center text-xs text-fintech-muted">
            No {activeType} categories yet. Add one below.
          </div>
        )}

        {categories.map((cat) => {
          const isEditingName = editState?.id === cat.id && editState.field === "name";
          const isEditingTarget = editState?.id === cat.id && editState.field === "target";

          return (
            <div
              key={cat.id}
              className="grid grid-cols-[1fr_140px_44px] items-center gap-2 border-b px-4 py-2 last:border-b-0 hover:bg-[var(--app-ghost)] transition-colors"
              style={{ borderColor: "var(--app-border)" }}
            >
              {/* Name cell */}
              <div>
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editState.value}
                      onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      className="w-full rounded-lg border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-1 text-sm font-medium focus:outline-none focus:border-fintech-accent"
                      disabled={saving}
                    />
                    <button onClick={() => void commitEdit()} disabled={saving} className="text-fintech-accent hover:text-white transition-colors"><Check size={14} /></button>
                    <button onClick={cancelEdit} disabled={saving} className="text-fintech-muted hover:text-white transition-colors"><X size={14} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(cat.id, "name", cat.name)}
                    className="text-left text-sm font-medium hover:text-fintech-accent transition-colors w-full truncate"
                    title="Click to rename"
                  >
                    {cat.name}
                  </button>
                )}
              </div>

              {/* Target cell */}
              <div>
                {isEditingTarget ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="any"
                      value={editState.value}
                      onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                      className="w-full rounded-lg border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-1 text-sm font-mono focus:outline-none focus:border-fintech-accent"
                      disabled={saving}
                    />
                    <button onClick={() => void commitEdit()} disabled={saving} className="text-fintech-accent hover:text-white transition-colors"><Check size={14} /></button>
                    <button onClick={cancelEdit} disabled={saving} className="text-fintech-muted hover:text-white transition-colors"><X size={14} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(cat.id, "target", cat.target_amount)}
                    className="text-left text-sm font-mono tabular-nums text-fintech-muted hover:text-fintech-accent transition-colors w-full"
                    title="Click to set target"
                  >
                    {cat.target_amount > 0 ? `${currencySymbol}${cat.target_amount.toLocaleString()}` : <span className="text-fintech-muted/50 italic">No target</span>}
                  </button>
                )}
              </div>

              {/* Delete cell */}
              <div className="flex justify-end">
                {deleteConfirm?.id === cat.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void handleDelete(cat.id)}
                      disabled={saving}
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/40 hover:bg-red-500/10 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      disabled={saving}
                      className="text-fintech-muted hover:text-white transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm({ id: cat.id, name: cat.name })}
                    className="text-fintech-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add new row */}
        {addingNew && (
          <div className="grid grid-cols-[1fr_140px_44px] items-center gap-2 border-t px-4 py-2 bg-fintech-accent/5" style={{ borderColor: "var(--app-border)" }}>
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") cancelAdd(); }}
              placeholder="Category name"
              className="w-full rounded-lg border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-1 text-sm focus:outline-none focus:border-fintech-accent"
              disabled={saving}
            />
            <input
              type="number"
              min="0"
              step="any"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") cancelAdd(); }}
              placeholder={`Target (${currencySymbol})`}
              className="w-full rounded-lg border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-1 text-sm font-mono focus:outline-none focus:border-fintech-accent"
              disabled={saving}
            />
            <div className="flex justify-end gap-1">
              <button onClick={() => void handleAdd()} disabled={saving} className="text-fintech-accent hover:text-white transition-colors"><Check size={14} /></button>
              <button onClick={cancelAdd} disabled={saving} className="text-fintech-muted hover:text-white transition-colors"><X size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Add button */}
      {!addingNew && (
        <button
          onClick={startAdding}
          className="flex items-center gap-2 rounded-lg border border-dashed border-fintech-accent/40 px-4 py-2 text-xs font-bold text-fintech-accent hover:border-fintech-accent hover:bg-fintech-accent/5 transition-colors"
        >
          <Plus size={14} /> Add {activeType === "expense" ? "Expense" : "Income"} Category
        </button>
      )}

      <p className="text-xs text-fintech-muted">
        Click any name or target to edit inline. Press Enter to save, Escape to cancel.
        {activeType === "expense" && " Monthly targets appear in your Dashboard budget view."}
      </p>
    </div>
  );
}
