import React, { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useFirebase } from "../../../contexts/FirebaseContext";
import { getTodayStr } from "../../../utils/dateUtils";

interface FirstTransactionStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export const FirstTransactionStep: React.FC<FirstTransactionStepProps> = ({ onNext, onSkip }) => {
  const { expenseCategories, addTransaction, preferences } = useFirebase();
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [categoryId, setCategoryId] = useState(expenseCategories[0]?.id ?? "");
  const [date, setDate] = useState(getTodayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);

  const handleAdd = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    if (!vendor.trim()) {
      setError("Please enter a vendor/description.");
      return;
    }
    if (!categoryId || !selectedCategory) {
      setError("Please select a category.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addTransaction({
        date,
        vendor: vendor.trim(),
        amount: parsedAmount,
        category_id: categoryId,
        category_name: selectedCategory.name,
        notes: "",
        import_source: undefined,
        status: "posted",
      });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add transaction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fintech-accent/10">
          <Plus size={20} className="text-fintech-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text)]">Add your first transaction</h3>
          <p className="text-sm text-fintech-muted">Record an expense to get started tracking.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--app-text)]">
            Vendor / Description
          </label>
          <input
            type="text"
            placeholder="e.g. Grocery Store"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-fintech-accent/50"
            style={{ borderColor: "var(--app-border)" }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--app-text)]">
            Amount ({preferences.baseCurrency})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-fintech-accent/50"
            style={{ borderColor: "var(--app-border)" }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--app-text)]">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-fintech-accent/50"
            style={{ borderColor: "var(--app-border)" }}
          />
        </div>

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-[var(--app-text)]">
            Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-fintech-accent/50"
            style={{ borderColor: "var(--app-border)" }}
          >
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
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
          onClick={() => void handleAdd()}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-fintech-accent px-6 py-2.5 text-sm font-semibold text-[#002919] hover:bg-fintech-accent/90 disabled:opacity-60 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Add &amp; Continue
        </button>
      </div>
    </div>
  );
};
