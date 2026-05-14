import React, { useState } from "react";
import { List, Loader2 } from "lucide-react";
import { useFirebase } from "../../../contexts/FirebaseContext";
import { ExpenseCategory } from "../../../types";

interface CategoriesStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export const CategoriesStep: React.FC<CategoriesStepProps> = ({ onNext, onSkip }) => {
  const { expenseCategories, updateExpenseCategoryTarget } = useFirebase();
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    expenseCategories.forEach((c) => {
      map[c.id] = c.target_amount > 0 ? String(c.target_amount) : "";
    });
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTargetChange = (id: string, value: string) => {
    setTargets((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const changed = expenseCategories.filter((c) => {
        const raw = targets[c.id] ?? "";
        const parsed = raw === "" ? 0 : Number.parseFloat(raw);
        return Number.isFinite(parsed) && parsed !== c.target_amount;
      });
      await Promise.all(
        changed.map((c) => {
          const raw = targets[c.id] ?? "";
          const parsed = raw === "" ? 0 : Number.parseFloat(raw);
          return updateExpenseCategoryTarget(c.id, Number.isFinite(parsed) ? parsed : 0);
        })
      );
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budgets.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fintech-accent/10">
          <List size={20} className="text-fintech-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text)]">Set monthly budgets</h3>
          <p className="text-sm text-fintech-muted">Optionally set a monthly spend target per category.</p>
        </div>
      </div>

      <div
        className="max-h-72 overflow-y-auto rounded-xl border divide-y divide-[var(--app-border)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        {expenseCategories.map((cat: ExpenseCategory) => (
          <div
            key={cat.id}
            className="flex items-center justify-between px-4 py-2.5 gap-4"
          >
            <span className="text-sm text-[var(--app-text)] flex-1 truncate">{cat.name}</span>
            <div className="relative flex-shrink-0 w-32">
              <span className="absolute inset-y-0 left-3 flex items-center text-fintech-muted text-sm pointer-events-none">
                $
              </span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={targets[cat.id] ?? ""}
                onChange={(e) => handleTargetChange(cat.id, e.target.value)}
                className="w-full rounded-lg border bg-[var(--app-panel)] pl-7 pr-3 py-1.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-1 focus:ring-fintech-accent/50"
                style={{ borderColor: "var(--app-border)" }}
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-fintech-danger/30 bg-fintech-danger/10 px-3 py-2 text-sm text-fintech-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onSkip}
          disabled={saving}
          className="text-sm text-fintech-muted hover:text-[var(--app-text)] transition-colors disabled:opacity-50"
        >
          Skip for now
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-fintech-accent px-6 py-2.5 text-sm font-semibold text-[#002919] hover:bg-fintech-accent/90 disabled:opacity-60 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save &amp; Continue
        </button>
      </div>
    </div>
  );
};
