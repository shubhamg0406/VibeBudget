import React, { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useFirebase } from "../../../contexts/FirebaseContext";

interface DoneStepProps {
  currencySet: boolean;
  budgetsSet: boolean;
  transactionAdded: boolean;
  onFinish: () => void;
}

export const DoneStep: React.FC<DoneStepProps> = ({
  currencySet,
  budgetsSet,
  transactionAdded,
  onFinish,
}) => {
  const { completeOnboarding } = useFirebase();
  const [finishing, setFinishing] = useState(false);

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await completeOnboarding();
      onFinish();
    } catch {
      // Even if the DB call fails, proceed — the wizard will remain for re-completion
      onFinish();
    } finally {
      setFinishing(false);
    }
  };

  const completedItems: { label: string; done: boolean }[] = [
    { label: "Currency configured", done: currencySet },
    { label: "Monthly budgets set", done: budgetsSet },
    { label: "First transaction added", done: transactionAdded },
  ];

  const doneCount = completedItems.filter((i) => i.done).length;

  return (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fintech-accent/10">
        <CheckCircle2 size={36} className="text-fintech-accent" />
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--app-text)]">
          You&apos;re all set!
        </h2>
        <p className="text-sm text-fintech-muted">
          {doneCount === 0
            ? "Your account is ready. You can configure everything from Settings anytime."
            : `You completed ${doneCount} of ${completedItems.length} setup steps.`}
        </p>
      </div>

      {doneCount > 0 && (
        <div className="w-full text-left rounded-xl border p-4 space-y-2.5" style={{ borderColor: "var(--app-border)" }}>
          {completedItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <CheckCircle2
                size={16}
                className={item.done ? "text-fintech-accent" : "text-fintech-muted opacity-30"}
              />
              <span className={`text-sm ${item.done ? "text-[var(--app-text)]" : "text-fintech-muted opacity-50"}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-fintech-muted">
        You can always update your preferences, categories, and integrations in Settings.
      </p>

      <button
        onClick={() => void handleFinish()}
        disabled={finishing}
        className="flex items-center gap-2 rounded-xl bg-fintech-accent px-8 py-3 text-sm font-semibold text-[#002919] hover:bg-fintech-accent/90 disabled:opacity-60 transition-colors"
      >
        {finishing && <Loader2 size={14} className="animate-spin" />}
        Go to Dashboard
      </button>
    </div>
  );
};
