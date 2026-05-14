import React, { useState, useRef } from "react";
import { Plus, Trash2, Check, X, Tag, TrendingUp } from "lucide-react";
import { useFirebase } from "../contexts/FirebaseContext";
import { ExpenseCategory, IncomeCategory } from "../types";
import { getCurrencySymbol } from "../utils/currencyUtils";

type CategoryType = "expense" | "income";

interface EditState {
  id: string;
  type: CategoryType;
  field: "name" | "target";
  value: string;
}

interface DeleteConfirm {
  id: string;
  type: CategoryType;
  name: string;
}

interface AddState {
  type: CategoryType;
  name: string;
  target: string;
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

  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [addState, setAddState] = useState<AddState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  const currencySymbol = getCurrencySymbol(preferences.baseCurrency);

  const sortedExpense = [...expenseCategories].sort((a, b) => a.name.localeCompare(b.name));
  const sortedIncome = [...incomeCategories].sort((a, b) => a.name.localeCompare(b.name));

  const startEdit = (id: string, type: CategoryType, field: "name" | "target", current: string | number) => {
    setEditState({ id, type, field, value: String(current) });
    setError(null);
  };

  const cancelEdit = () => setEditState(null);

  const commitEdit = async () => {
    if (!editState) return;
    const { id, type, field, value } = editState;
    const trimmed = value.trim();
    if (!trimmed) { setError("Cannot be empty."); return; }

    setSaving(true);
    setError(null);
    try {
      if (field === "name") {
        if (type === "expense") await updateExpenseCategoryName(id, trimmed);
        else await updateIncomeCategoryName(id, trimmed);
      } else {
        const num = parseFloat(trimmed);
        if (isNaN(num) || num < 0) { setError("Enter a valid non-negative number."); setSaving(false); return; }
        if (type === "expense") await updateExpenseCategoryTarget(id, num);
        else await updateIncomeCategoryTarget(id, num);
      }
      setEditState(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, type: CategoryType) => {
    setSaving(true);
    setError(null);
    try {
      if (type === "expense") await deleteExpenseCategory(id);
      else await deleteIncomeCategory(id);
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addState) return;
    const trimmedName = addState.name.trim();
    if (!trimmedName) { setError("Category name required."); return; }
    const targetNum = addState.target.trim() ? parseFloat(addState.target) : 0;
    if (isNaN(targetNum) || targetNum < 0) { setError("Enter a valid non-negative target."); return; }

    setSaving(true);
    setError(null);
    try {
      if (addState.type === "expense") await addExpenseCategory(trimmedName, targetNum);
      else await addIncomeCategory(trimmedName, targetNum);
      setAddState(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setSaving(false);
    }
  };

  const startAdding = (type: CategoryType) => {
    setAddState({ type, name: "", target: "" });
    setError(null);
    setTimeout(() => newNameRef.current?.focus(), 50);
  };

  const renderPanel = (
    type: CategoryType,
    categories: (ExpenseCategory | IncomeCategory)[],
  ) => {
    const isExpense = type === "expense";
    const icon = isExpense ? <Tag size={14} /> : <TrendingUp size={14} />;
    const label = isExpense ? "Expense Categories" : "Income Categories";
    const isAddingThis = addState?.type === type;

    return (
      <div className="flex flex-col gap-3 min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--app-text)]">
            <span className="text-fintech-accent">{icon}</span>
            {label}
            <span className="ml-1 rounded-full bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold text-fintech-accent">
              {categories.length}
            </span>
          </div>
          {!isAddingThis && (
            <button
              onClick={() => startAdding(type)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-fintech-accent border border-dashed border-fintech-accent/40 hover:border-fintech-accent hover:bg-fintech-accent/5 transition-colors"
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-[var(--app-panel)] overflow-hidden" style={{ borderColor: "var(--app-border)" }}>
          {/* Col headers */}
          <div className="grid grid-cols-[1fr_110px_36px] gap-2 border-b px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-fintech-muted" style={{ borderColor: "var(--app-border)" }}>
            <div>Name</div>
            <div>Target/mo ({currencySymbol})</div>
            <div />
          </div>

          {categories.length === 0 && !isAddingThis && (
            <div className="px-3 py-6 text-center text-xs text-fintech-muted">
              No {type} categories yet.
            </div>
          )}

          {categories.map((cat) => {
            const isEditingName = editState?.id === cat.id && editState.type === type && editState.field === "name";
            const isEditingTarget = editState?.id === cat.id && editState.type === type && editState.field === "target";
            const isConfirmingDelete = deleteConfirm?.id === cat.id && deleteConfirm.type === type;

            return (
              <div
                key={cat.id}
                className="group grid grid-cols-[1fr_110px_36px] items-center gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-[var(--app-ghost)] transition-colors"
                style={{ borderColor: "var(--app-border)" }}
              >
                {/* Name */}
                <div>
                  {isEditingName ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editState.value}
                        onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") void commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        className="w-full rounded border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-0.5 text-xs font-medium focus:outline-none focus:border-fintech-accent"
                        disabled={saving}
                      />
                      <button onClick={() => void commitEdit()} disabled={saving} className="shrink-0 text-fintech-accent hover:text-white transition-colors"><Check size={12} /></button>
                      <button onClick={cancelEdit} disabled={saving} className="shrink-0 text-fintech-muted hover:text-white transition-colors"><X size={12} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(cat.id, type, "name", cat.name)}
                      className="text-left text-xs font-medium hover:text-fintech-accent transition-colors w-full truncate"
                      title="Click to rename"
                    >
                      {cat.name}
                    </button>
                  )}
                </div>

                {/* Target */}
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
                        className="w-full rounded border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-fintech-accent"
                        disabled={saving}
                      />
                      <button onClick={() => void commitEdit()} disabled={saving} className="shrink-0 text-fintech-accent hover:text-white transition-colors"><Check size={12} /></button>
                      <button onClick={cancelEdit} disabled={saving} className="shrink-0 text-fintech-muted hover:text-white transition-colors"><X size={12} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(cat.id, type, "target", cat.target_amount)}
                      className="text-left text-xs font-mono tabular-nums text-fintech-muted hover:text-fintech-accent transition-colors w-full"
                      title="Click to set target"
                    >
                      {cat.target_amount > 0
                        ? `${currencySymbol}${cat.target_amount.toLocaleString()}`
                        : <span className="italic opacity-40">No target</span>}
                    </button>
                  )}
                </div>

                {/* Delete */}
                <div className="flex justify-end">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void handleDelete(cat.id, type)}
                        disabled={saving}
                        className="rounded px-1 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/40 hover:bg-red-500/10 transition-colors"
                      >
                        Yes
                      </button>
                      <button onClick={() => setDeleteConfirm(null)} disabled={saving} className="text-fintech-muted hover:text-white transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm({ id: cat.id, type, name: cat.name })}
                      className="text-fintech-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add row */}
          {isAddingThis && (
            <div className="grid grid-cols-[1fr_110px_36px] items-center gap-2 border-t px-3 py-2 bg-fintech-accent/5" style={{ borderColor: "var(--app-border)" }}>
              <input
                ref={newNameRef}
                value={addState.name}
                onChange={(e) => setAddState({ ...addState, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") setAddState(null); }}
                placeholder="Category name"
                className="w-full rounded border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-0.5 text-xs focus:outline-none focus:border-fintech-accent"
                disabled={saving}
              />
              <input
                type="number"
                min="0"
                step="any"
                value={addState.target}
                onChange={(e) => setAddState({ ...addState, target: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") setAddState(null); }}
                placeholder={`Target (${currencySymbol})`}
                className="w-full rounded border border-fintech-accent/50 bg-[var(--app-ghost)] px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-fintech-accent"
                disabled={saving}
              />
              <div className="flex justify-end gap-1">
                <button onClick={() => void handleAdd()} disabled={saving} className="text-fintech-accent hover:text-white transition-colors"><Check size={13} /></button>
                <button onClick={() => setAddState(null)} disabled={saving} className="text-fintech-muted hover:text-white transition-colors"><X size={13} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderPanel("expense", sortedExpense)}
        {renderPanel("income", sortedIncome)}
      </div>

      <p className="text-xs text-fintech-muted">
        Click any name or target to edit inline. Enter to save, Escape to cancel. Expense targets appear in your Dashboard budget view.
      </p>
    </div>
  );
}
