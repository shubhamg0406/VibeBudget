import React, { useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  Circle,
  Database,
  List,
  FileSpreadsheet,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { SetupChecklistItemId, SetupProgress } from "../types";
import { ALL_SETUP_ITEMS } from "../types";

interface ChecklistItemConfig {
  id: SetupChecklistItemId;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const CHECKLIST_ITEMS: ChecklistItemConfig[] = [
  {
    id: "currency",
    icon: <Banknote size={18} />,
    title: "Set your currency",
    description: "Confirm your base currency and preferred exchange rates.",
  },
  {
    id: "expense_categories",
    icon: <List size={18} />,
    title: "Review expense categories",
    description: "Set monthly targets for your expense categories.",
  },
  {
    id: "income_categories",
    icon: <List size={18} />,
    title: "Review income categories",
    description: "Set monthly targets for your income categories.",
  },
  {
    id: "google_sheets",
    icon: <FileSpreadsheet size={18} />,
    title: "Connect Google Sheets",
    description: "Sync your budget with Google Sheets for live updates.",
  },
  {
    id: "ai_provider",
    icon: <Sparkles size={18} />,
    title: "Add AI provider key",
    description: "Configure AI for budget insights and document OCR.",
  },
  {
    id: "bank_feed",
    icon: <Database size={18} />,
    title: "Connect bank feed",
    description: "Link Plaid or Teller for automatic transaction import.",
  },
  {
    id: "first_entry",
    icon: <Plus size={18} />,
    title: "Add your first entry",
    description: "Create your first transaction or income record.",
  },
];

interface SetupChecklistProps {
  progress: SetupProgress;
  autoCompleted: SetupChecklistItemId[];
  onUpdateProgress: (patch: Partial<SetupProgress>) => void;
  onNavigate: (itemId: SetupChecklistItemId) => void;
  onClose?: () => void;
  inline?: boolean;
}

function getStatusIcon(status: "unchecked" | "completed" | "skipped"): React.ReactNode {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={18} className="text-fintech-accent" />;
    case "skipped":
      return <X size={18} className="text-fintech-muted" />;
    default:
      return <Circle size={18} className="text-fintech-muted/40" />;
  }
}

function getEffectiveStatus(
  itemId: SetupChecklistItemId,
  progress: SetupProgress,
  autoCompleted: SetupChecklistItemId[],
): "unchecked" | "completed" | "skipped" {
  const manual = progress.items[itemId];
  if (manual === "skipped") return "skipped";
  if (manual === "completed") return "completed";
  if (autoCompleted.includes(itemId)) return "completed";
  return "unchecked";
}

export const SetupChecklist: React.FC<SetupChecklistProps> = ({
  progress,
  autoCompleted,
  onUpdateProgress,
  onNavigate,
  onClose,
  inline,
}) => {
  const allDone = useMemo(() => {
    return ALL_SETUP_ITEMS.every(
      (id) => getEffectiveStatus(id, progress, autoCompleted) !== "unchecked",
    );
  }, [progress, autoCompleted]);

  const handleSkip = useCallback((itemId: SetupChecklistItemId) => {
    const nextItems = { ...progress.items, [itemId]: "skipped" as const };
    onUpdateProgress({ items: nextItems });
  }, [progress.items, onUpdateProgress]);

  const handleMarkDone = useCallback((itemId: SetupChecklistItemId) => {
    const nextItems = { ...progress.items, [itemId]: "completed" as const };
    onUpdateProgress({ items: nextItems });
  }, [progress.items, onUpdateProgress]);

  const completedCount = useMemo(() => {
    return ALL_SETUP_ITEMS.filter(
      (id) => getEffectiveStatus(id, progress, autoCompleted) === "completed",
    ).length;
  }, [progress, autoCompleted]);

  const totalCount = ALL_SETUP_ITEMS.length;

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Getting Started</h3>
          <p className="mt-0.5 text-xs text-fintech-muted">
            {allDone
              ? "All setup steps complete!"
              : `${completedCount} of ${totalCount} steps done`}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-fintech-muted transition-colors hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
            aria-label="Dismiss checklist"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {allDone && (
        <div className="rounded-xl border border-fintech-accent/20 bg-fintech-accent/5 px-4 py-3">
          <p className="text-sm font-semibold text-fintech-accent">You're all set!</p>
          <p className="mt-0.5 text-xs text-fintech-muted">
            All setup items are complete. You can always revisit these from Settings.
          </p>
        </div>
      )}

      {!allDone && (
        <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--app-ghost)]">
          <motion.div
            className="h-full rounded-full bg-fintech-accent"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / totalCount) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      )}

      <div className="space-y-1.5">
        {CHECKLIST_ITEMS.map((item) => {
          const status = getEffectiveStatus(item.id, progress, autoCompleted);
          const isDone = status === "completed";
          const isSkipped = status === "skipped";
          const isPending = status === "unchecked";

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                isDone
                  ? "border-fintech-accent/20 bg-fintech-accent/5"
                  : isSkipped
                    ? "border-[var(--app-border)] bg-[var(--app-panel)] opacity-50"
                    : "border-[var(--app-border)] bg-[var(--app-panel)] hover:border-fintech-accent/30"
              }`}
              style={{ borderColor: isDone ? undefined : isSkipped ? "var(--app-border)" : "var(--app-border)" }}
            >
              <div className={`shrink-0 ${isDone ? "text-fintech-accent" : isSkipped ? "text-fintech-muted" : "text-fintech-muted"}`}>
                {getStatusIcon(status)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isDone ? "text-fintech-accent" : isSkipped ? "text-fintech-muted line-through" : "text-[var(--app-text)]"}`}>
                    {item.title}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-fintech-muted">{item.description}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {isPending && (
                  <>
                    <button
                      onClick={() => onNavigate(item.id)}
                      className="flex items-center gap-1 rounded-lg bg-fintech-accent/10 px-3 py-1.5 text-xs font-bold text-fintech-accent transition-colors hover:bg-fintech-accent/20"
                    >
                      Go <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => handleSkip(item.id)}
                      className="rounded-lg px-2 py-1.5 text-xs text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
                      title="Skip this step"
                    >
                      Skip
                    </button>
                  </>
                )}
                {isDone && (
                  <span className="text-xs text-fintech-accent font-semibold">Done</span>
                )}
                {isSkipped && (
                  <button
                    onClick={() => handleMarkDone(item.id)}
                    className="rounded-lg px-2 py-1.5 text-xs text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
                    title="Mark as done"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-2.5 text-sm font-semibold text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
        >
          {allDone ? "Close" : "Dismiss"}
        </button>
      )}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 pt-12 sm:p-6 sm:pt-16 pointer-events-none"
        style={{ backgroundColor: "var(--app-overlay)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-lg rounded-2xl border bg-[var(--app-shell)] p-5 shadow-2xl pointer-events-auto"
          style={{ borderColor: "var(--app-border)" }}
        >
          {content}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
