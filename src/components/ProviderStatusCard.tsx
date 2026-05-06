import React from "react";
import { AlertCircle, CheckCircle2, Clock, Info, RefreshCw, XCircle } from "lucide-react";

export type ProviderStatusLevel = "not_configured" | "configured" | "connected" | "needs_attention";

export interface ProviderStatusInfo {
  level: ProviderStatusLevel;
  label: string;
}

interface ProviderStatusCardProps {
  name: string;
  status: ProviderStatusInfo;
  lastSyncAt?: string | null;
  lastCheckedAt?: string | null;
  error?: string | null;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionDisabled?: boolean;
  onTertiaryAction?: () => void;
  tertiaryActionLabel?: string;
  tertiaryActionDisabled?: boolean;
  helpText?: string;
  setupLink?: { url: string; label: string };
  children?: React.ReactNode;
}

const STATUS_STYLES: Record<ProviderStatusLevel, { icon: React.ReactNode; badgeBg: string; badgeColor: string; dot: string }> = {
  not_configured: {
    icon: <Info size={12} />,
    badgeBg: "bg-[var(--app-ghost)]",
    badgeColor: "text-fintech-muted",
    dot: "bg-fintech-muted/40",
  },
  configured: {
    icon: <Clock size={12} />,
    badgeBg: "bg-fintech-import/10",
    badgeColor: "text-fintech-import",
    dot: "bg-fintech-import",
  },
  connected: {
    icon: <CheckCircle2 size={12} />,
    badgeBg: "bg-fintech-accent/10",
    badgeColor: "text-fintech-accent",
    dot: "bg-fintech-accent",
  },
  needs_attention: {
    icon: <AlertCircle size={12} />,
    badgeBg: "bg-yellow-500/10",
    badgeColor: "text-yellow-300",
    dot: "bg-yellow-400",
  },
};

const formatDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export const ProviderStatusCard: React.FC<ProviderStatusCardProps> = ({
  name,
  status,
  lastSyncAt,
  lastCheckedAt,
  error,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionDisabled,
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionDisabled,
  onTertiaryAction,
  tertiaryActionLabel,
  tertiaryActionDisabled,
  helpText,
  setupLink,
  children,
}) => {
  const style = STATUS_STYLES[status.level];

  return (
    <div className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-fintech-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-fintech-accent">
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {name}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badgeBg} ${style.badgeColor}`}>
          {style.icon}
          {status.label}
        </span>
        {lastSyncAt && (
          <span className="inline-flex items-center gap-1 text-[10px] text-fintech-muted">
            <RefreshCw size={10} />
            Synced {formatDateTime(lastSyncAt)}
          </span>
        )}
        {!lastSyncAt && lastCheckedAt && (
          <span className="inline-flex items-center gap-1 text-[10px] text-fintech-muted">
            <Clock size={10} />
            Checked {formatDateTime(lastCheckedAt)}
          </span>
        )}
      </div>
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-fintech-danger/10 px-3 py-2 text-xs text-fintech-danger">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {(onPrimaryAction && primaryActionLabel) || onSecondaryAction || onTertiaryAction ? (
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          {onPrimaryAction && primaryActionLabel && (
            <button
              onClick={onPrimaryAction}
              disabled={primaryActionDisabled}
              className="rounded-lg bg-fintech-accent/10 py-2 text-xs font-bold text-fintech-accent disabled:opacity-50 hover:bg-fintech-accent/20 transition-colors"
            >
              {primaryActionLabel}
            </button>
          )}
          {onSecondaryAction && secondaryActionLabel && (
            <button
              onClick={onSecondaryAction}
              disabled={secondaryActionDisabled}
              className="rounded-lg bg-[var(--app-ghost)] py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--app-border)] transition-colors"
            >
              {secondaryActionLabel}
            </button>
          )}
          {onTertiaryAction && tertiaryActionLabel && (
            <button
              onClick={onTertiaryAction}
              disabled={tertiaryActionDisabled}
              className="rounded-lg bg-fintech-danger/10 py-2 text-xs font-bold text-fintech-danger disabled:opacity-50 hover:bg-fintech-danger/20 transition-colors"
            >
              {tertiaryActionLabel}
            </button>
          )}
        </div>
      ) : null}
      {(helpText || setupLink) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[var(--app-ghost)] px-3 py-2 text-[11px] leading-relaxed text-fintech-muted">
          {helpText && <span>{helpText}</span>}
          {setupLink && (
            <a href={setupLink.url} target="_blank" rel="noreferrer" className="font-semibold text-fintech-accent hover:underline">
              {setupLink.label}
            </a>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
