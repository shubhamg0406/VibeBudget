import React, { useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { CURRENCIES } from "../../../utils/currencyUtils";
import { useFirebase } from "../../../contexts/FirebaseContext";

interface CurrencyStepProps {
  onNext: () => void;
}

export const CurrencyStep: React.FC<CurrencyStepProps> = ({ onNext }) => {
  const { preferences, updatePreferences } = useFirebase();
  const [selected, setSelected] = useState<string>(preferences.baseCurrency || "CAD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences({ baseCurrency: selected });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save currency.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fintech-accent/10">
          <Banknote size={20} className="text-fintech-accent" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text)]">Choose your base currency</h3>
          <p className="text-sm text-fintech-muted">All amounts will be displayed in this currency.</p>
        </div>
      </div>

      <div>
        <label
          htmlFor="currency-select"
          className="mb-1.5 block text-sm font-medium text-[var(--app-text)]"
        >
          Base currency
        </label>
        <select
          id="currency-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-xl border bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-fintech-accent/50"
          style={{ borderColor: "var(--app-border)" }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-fintech-danger/30 bg-fintech-danger/10 px-3 py-2 text-sm text-fintech-danger">
          {error}
        </p>
      )}

      <p className="text-xs text-fintech-muted">
        You can change your currency and add exchange rates later in Settings &rarr; Currency.
      </p>

      <div className="flex justify-end">
        <button
          onClick={() => void handleNext()}
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
