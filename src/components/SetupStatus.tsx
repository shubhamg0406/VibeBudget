import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle, HelpCircle, Database, Shield, KeyRound, Sparkles, Globe, ExternalLink } from "lucide-react";

interface SetupStatusData {
  mode: string;
  app: { nodeEnv: string; namespace?: string };
  supabase: { configured: boolean; hasUrl: boolean; hasAnonKey: boolean; hasServiceRole: boolean };
  selfHost: { ownerExists: boolean; secretsConfigured: boolean };
  ai: { serverKeyConfigured: boolean; modelConfigured: boolean; model: string | null };
  features: Record<string, boolean>;
}

type StatusItem = {
  label: string;
  icon: React.ReactNode;
  ok: boolean;
  detail?: string;
};

export const SetupStatus: React.FC = () => {
  const [data, setData] = useState<SetupStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as SetupStatusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch setup status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchStatus(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin text-fintech-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/10 p-4 text-xs text-yellow-300">
        <p>Setup diagnostics unavailable: {error}</p>
        <button onClick={() => fetchStatus()} className="mt-2 underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const items: StatusItem[] = [
    {
      label: "Supabase Config",
      icon: <Database size={14} />,
      ok: data.supabase.configured,
      detail: data.supabase.configured ? "URL and anon key configured" : "Not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
    },
    {
      label: "Service Role Key",
      icon: <Shield size={14} />,
      ok: data.supabase.hasServiceRole,
      detail: data.supabase.hasServiceRole ? "Service role key configured" : "Not configured (needed for server-side operations)",
    },
    {
      label: "Owner Claimed",
      icon: <KeyRound size={14} />,
      ok: data.selfHost.ownerExists,
      detail: data.selfHost.ownerExists ? "Self-host owner claimed" : "No owner — first sign-in auto-claims",
    },
    {
      label: "AI Server Key",
      icon: <Sparkles size={14} />,
      ok: data.ai.serverKeyConfigured,
      detail: data.ai.serverKeyConfigured ? `Model: ${data.ai.model || "configured"}` : "No server GEMINI_API_KEY — configure in Settings or browser setup",
    },
    {
      label: "Environment",
      icon: <Globe size={14} />,
      ok: data.app.nodeEnv === "production",
      detail: `Node env: ${data.app.nodeEnv}`,
    },
  ];

  const modeLabel = data.mode === "hosted" ? "Production (Hosted)" : "Local Development";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${
          data.mode === "hosted" ? "bg-fintech-accent/10 text-fintech-accent" : "bg-[var(--app-ghost)] text-fintech-muted"
        }`}>
          {modeLabel}
        </span>
        {data.app.nodeEnv && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--app-ghost)] px-3 py-1 text-[11px] font-bold text-fintech-muted">
            {data.app.nodeEnv}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${
              item.ok
                ? "border-fintech-accent/20 bg-fintech-accent/5"
                : "border-yellow-400/20 bg-yellow-500/5"
            }`}
            style={{ borderColor: item.ok ? undefined : "var(--app-border)" }}
          >
            <span className={`mt-0.5 ${item.ok ? "text-fintech-accent" : "text-yellow-400"}`}>
              {item.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--app-text)]">
                {item.icon}
                {item.label}
              </div>
              <p className="mt-0.5 text-fintech-muted">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <details className="rounded-xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-3">
        <summary className="cursor-pointer text-xs font-bold text-fintech-muted">Feature Availability ({Object.values(data.features).filter(Boolean).length}/{Object.keys(data.features).length})</summary>
        <div className="mt-2 space-y-1">
          {Object.entries(data.features).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-[11px]">
              <span className="text-fintech-muted">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              {val ? (
                <span className="flex items-center gap-1 text-fintech-accent"><CheckCircle2 size={10} /> Available</span>
              ) : (
                <span className="flex items-center gap-1 text-fintech-muted"><HelpCircle size={10} /> Missing config</span>
              )}
            </div>
          ))}
        </div>
      </details>

      <div className="flex items-center gap-2 text-[11px] text-fintech-muted">
        <a
          href="/docs/setup-modes.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-fintech-accent hover:underline"
        >
          <ExternalLink size={10} /> Setup guide
        </a>
        <span>·</span>
        <button onClick={() => fetchStatus()} className="text-fintech-accent hover:underline">
          Refresh
        </button>
      </div>
    </div>
  );
};
