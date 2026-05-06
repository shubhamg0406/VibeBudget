import React from "react";
import { type LucideIcon, Sparkles } from "lucide-react";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Sparkles,
  title,
  description,
  action,
  compact = false,
}) => {
  if (compact) {
    return (
      <div
        className="rounded-xl border border-dashed bg-[var(--app-panel-muted)] p-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-panel-strong)] text-fintech-accent">
            <Icon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--app-text)]">{title}</div>
            <p className="mt-1 text-xs leading-5 text-fintech-muted">{description}</p>
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-fintech-accent/10 px-3 py-1.5 text-xs font-semibold text-fintech-accent transition-colors hover:bg-fintech-accent/20"
              >
                {action.label}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-dashed bg-[var(--app-panel-muted)] p-6 text-center"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border bg-[var(--app-panel-strong)] text-fintech-accent"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        <Icon size={22} />
      </div>
      <div className="mt-3 text-base font-bold text-[var(--app-text)]">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-fintech-muted">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-fintech-accent px-4 py-2 text-xs font-bold text-[#002919] transition-colors hover:bg-fintech-accent/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
