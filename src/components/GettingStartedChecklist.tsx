import React from "react";
import {
  ArrowRight,
  BookOpen,
  Cloud,
  Database,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { SettingsTab } from "./Settings";

interface ChecklistItem {
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  targetView: "settings";
  targetSection: SettingsTab;
}

interface GettingStartedChecklistProps {
  onNavigate: (view: "settings", section: SettingsTab) => void;
}

const ITEMS: ChecklistItem[] = [
  {
    label: "View Setup Guide",
    description: "Open the Data Hub to learn about importing and managing your budget data.",
    icon: BookOpen,
    targetView: "settings",
    targetSection: "data",
  },
  {
    label: "Set Up Integrations",
    description: "Connect to Plaid or Teller for automatic bank feed imports.",
    icon: Cloud,
    targetView: "settings",
    targetSection: "finance_feeds",
  },
  {
    label: "Import Your Data",
    description: "Upload a CSV, Excel file, or connect to Google Sheets.",
    icon: Database,
    targetView: "settings",
    targetSection: "data",
  },
  {
    label: "Configure AI",
    description: "Set up AI-powered transaction extraction from documents and screenshots.",
    icon: Sparkles,
    targetView: "settings",
    targetSection: "ai",
  },
  {
    label: "Manage Categories",
    description: "Set up expense and income categories with budget targets.",
    icon: Wrench,
    targetView: "settings",
    targetSection: "maintenance",
  },
];

const ITEMS_MAP: Record<string, { targetView: "settings"; targetSection: SettingsTab }> = {};
for (const item of ITEMS) {
  ITEMS_MAP[item.label] = { targetView: item.targetView, targetSection: item.targetSection };
}

export const GETTING_STARTED_ACTIONS = ITEMS_MAP;

export const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  onNavigate,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fintech-accent/10 text-fintech-accent">
          <Settings size={16} />
        </div>
        <div>
          <div className="text-sm font-bold text-[var(--app-text)]">Getting Started</div>
          <p className="text-xs text-fintech-muted">
            Complete these steps to set up your budget
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.targetView, item.targetSection)}
              className="group flex items-start gap-3 rounded-xl border border-dashed bg-[var(--app-panel-muted)] p-3 text-left transition-all hover:border-fintech-accent/30 hover:bg-fintech-accent/5"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-panel-strong)] text-fintech-accent">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--app-text)]">{item.label}</div>
                <p className="mt-0.5 text-xs leading-4 text-fintech-muted">{item.description}</p>
              </div>
              <ArrowRight size={14} className="mt-1 shrink-0 text-fintech-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fintech-accent" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
