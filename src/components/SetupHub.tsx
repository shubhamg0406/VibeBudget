import React from "react";
import {
  ArrowRight,
  Banknote,
  BookOpen,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Tag,
} from "lucide-react";
import { View } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";

interface SetupHubProps {
  setView: (view: View) => void;
}

interface OnboardingAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  action: () => void;
  actionLabel: string;
  status: "todo" | "in-progress" | "done";
}

export const SetupHub: React.FC<SetupHubProps> = ({ setView }) => {
  const {
    expenseCategories,
    incomeCategories,
    googleSheetsConnected,
    googleSheetsConfig,
    aiConfig,
    plaidConnected,
    tellerConnected,
    transactions,
  } = useFirebase();

  const actions: OnboardingAction[] = [
    {
      id: "expense-categories",
      title: "Expense Categories",
      description: "Define your spending categories and set monthly budget targets.",
      icon: Tag,
      action: () => setView("settings"),
      actionLabel: "Go to Settings",
      status: expenseCategories.length > 0 ? "done" : "todo",
    },
    {
      id: "income-categories",
      title: "Income Categories",
      description: "Set up income sources so VibeBudget can track what comes in.",
      icon: Tag,
      action: () => setView("settings"),
      actionLabel: "Go to Settings",
      status: incomeCategories.length > 0 ? "done" : "todo",
    },
    {
      id: "google-sheets",
      title: "Google Sheets Sync",
      description: "Connect a Google Sheet to pull expenses and income automatically.",
      icon: FileSpreadsheet,
      action: () => setView("settings"),
      actionLabel: "Configure in Settings",
      status: googleSheetsConnected && googleSheetsConfig ? "done" : "todo",
    },
    {
      id: "ai-provider",
      title: "AI Provider Key",
      description: "Set up a Gemini or DeepSeek API key to power AI features.",
      icon: Sparkles,
      action: () => setView("settings"),
      actionLabel: "Configure in Settings",
      status: aiConfig?.apiKey ? "done" : "todo",
    },
    {
      id: "bank-feeds",
      title: "Bank Feed Connection",
      description: "Connect Plaid or Teller to import transactions directly from your bank.",
      icon: Banknote,
      action: () => setView("settings"),
      actionLabel: "Configure in Settings",
      status: plaidConnected || tellerConnected ? "done" : "todo",
    },
    {
      id: "manual-entry",
      title: "Manual Transaction Entry",
      description: "Add expenses or income manually when automation isn't available.",
      icon: Plus,
      action: () => setView("transactions"),
      actionLabel: "Go to Transactions",
      status: transactions.length > 0 ? "done" : "todo",
    },
    {
      id: "docs",
      title: "Docs & Help",
      description: "Read the docs for setup guides, troubleshooting, and best practices.",
      icon: BookOpen,
      action: () => setView("docs"),
      actionLabel: "Open Docs",
      status: "todo",
    },
  ];

  const completedCount = actions.filter((a) => a.status === "done").length;
  const totalCount = actions.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Getting Started</h1>
        <p className="text-sm text-fintech-muted">
          Set up the core pieces of your budget.{" "}
          {completedCount === totalCount
            ? "Everything is configured!"
            : `${completedCount} of ${totalCount} complete.`}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--app-ghost)]">
          <div
            className="h-full rounded-full bg-fintech-accent transition-all duration-500"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((item) => {
          const Icon = item.icon;
          const isDone = item.status === "done";
          return (
            <div
              key={item.id}
              className={`group relative rounded-xl border p-4 transition-all duration-200 ${
                isDone
                  ? "border-fintech-accent/30 bg-fintech-accent/5"
                  : "bg-[var(--app-panel)] hover:border-[var(--app-border-strong)]"
              }`}
              style={{ borderColor: isDone ? undefined : "var(--app-border)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isDone
                        ? "bg-fintech-accent/15 text-fintech-accent"
                        : "bg-[var(--app-panel-strong)] text-fintech-muted"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-tight">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-fintech-muted">
                      {item.description}
                    </p>
                  </div>
                </div>
                {isDone && (
                  <span className="shrink-0 rounded-full bg-fintech-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fintech-accent">
                    Done
                  </span>
                )}
              </div>

              <button
                onClick={item.action}
                className={`mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  isDone
                    ? "bg-[var(--app-ghost)] text-fintech-muted hover:text-fintech-accent"
                    : "bg-fintech-accent text-[#002919] hover:bg-fintech-accent/90"
                }`}
              >
                <span>{item.actionLabel}</span>
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
