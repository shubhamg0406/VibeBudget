import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ArrowRight, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, LogIn,
  ShieldCheck, Sparkles, XCircle,
} from "lucide-react";

interface SelfHostSetupProps { onComplete: () => void; }

type SetupPhase = "sign-in" | "claim-owner" | "secrets" | "done";

interface SelfHostStatus {
  ownerExists: boolean; isOwner: boolean; ownerEmail: string | null; secretsConfigured: boolean;
}

export const SelfHostSetup: React.FC<SelfHostSetupProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<SetupPhase>("sign-in");
  const [status, setStatus] = useState<SelfHostStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [secretsSuccess, setSecretsSuccess] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [secretsForm, setSecretsForm] = useState({ GEMINI_API_KEY: "", GEMINI_MODEL: "gemini-2.5-flash" });
  const [signingIn, setSigningIn] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean> | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  };

  const fetchStatus = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setStatusLoading(true); setStatusError(null);
    try {
      const res = await fetch("/api/self-host/status", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SelfHostStatus;
      setStatus(data);
      if (data.ownerExists && data.secretsConfigured) setPhase("done");
      else if (data.ownerExists && data.isOwner) setPhase("secrets");
      else if (data.ownerExists && !data.isOwner) setPhase("done");
      else setPhase("claim-owner");
    } catch (err) { setStatusError(err instanceof Error ? err.message : "Failed to check setup status"); }
    finally { setStatusLoading(false); }
  }, []);

  const fetchSecretsStatus = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/self-host/secrets/status", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json() as Record<string, boolean>;
      setSecretsStatus(data);
      if (Object.values(data).some(Boolean)) setSecretsSuccess(true);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (phase === "claim-owner" || phase === "secrets" || phase === "done") fetchStatus(); }, [phase, fetchStatus]);
  useEffect(() => { if (phase === "secrets") fetchSecretsStatus(); }, [phase, fetchSecretsStatus]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setUserEmail(user.email); setPhase("claim-owner"); }
    } catch (err: any) {
      setStatusError(err?.message || "Sign in failed");
    } finally { setSigningIn(false); }
  };

  const handleClaimOwner = async () => {
    const token = await getToken();
    if (!token) return;
    setClaiming(true); setClaimError(null);
    try {
      const res = await fetch("/api/self-host/claim-owner", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
      if (res.status === 403) { const data = await res.json(); setClaimError(data.error || "Owner already claimed."); await fetchStatus(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (err) { setClaimError(err instanceof Error ? err.message : "Failed to claim owner"); }
    finally { setClaiming(false); }
  };

  const handleSaveSecrets = async () => {
    const token = await getToken();
    if (!token) return;
    setSavingSecrets(true); setSecretsError(null); setSecretsSuccess(false);
    try {
      const payload: Record<string, string> = {};
      if (secretsForm.GEMINI_API_KEY.trim()) payload.GEMINI_API_KEY = secretsForm.GEMINI_API_KEY.trim();
      if (secretsForm.GEMINI_MODEL.trim()) payload.GEMINI_MODEL = secretsForm.GEMINI_MODEL.trim();
      const res = await fetch("/api/self-host/secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `HTTP ${res.status}`); }
      setSecretsSuccess(true); setSecretsForm({ GEMINI_API_KEY: "", GEMINI_MODEL: "gemini-2.5-flash" }); await fetchSecretsStatus(); setShowSecrets(false);
    } catch (err) { setSecretsError(err instanceof Error ? err.message : "Failed to save secrets"); }
    finally { setSavingSecrets(false); }
  };

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setUserEmail(user.email); setPhase("claim-owner"); fetchStatus(); }
  };
  useEffect(() => { checkAuth(); }, []);

  // SIGN-IN PHASE
  if (phase === "sign-in") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-ghost)] text-fintech-accent"><LogIn size={22} /></div>
          <h2 className="mt-4 text-base font-bold">Sign in to continue setup</h2>
          <p className="mt-2 text-xs text-fintech-muted">Sign in with Google to configure your self-hosted instance.</p>
          {statusError && <p className="mt-3 text-xs text-red-400">{statusError}</p>}
          <button onClick={handleSignIn} disabled={signingIn} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {signingIn ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {signingIn ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
      </div>
    );
  }

  // STATUS LOADING
  if (statusLoading) return (<div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)]"><Loader2 size={24} className="animate-spin text-fintech-accent" /></div>);

  // STATUS ERROR
  if (statusError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
          <XCircle size={24} className="mx-auto text-red-400" />
          <h2 className="mt-3 text-base font-bold">Setup Status Error</h2>
          <p className="mt-2 text-xs text-fintech-muted">{statusError}</p>
          <button onClick={fetchStatus} className="mt-5 w-full rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919]">Retry</button>
        </div>
      </div>
    );
  }

  // CLAIM OWNER
  if (phase === "claim-owner") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-violet-soft)] text-fintech-accent"><ShieldCheck size={22} /></div>
          <h2 className="mt-4 text-base font-bold">Claim Owner</h2>
          <p className="mt-2 text-xs text-fintech-muted">No owner is configured for this instance. As the first signed-in user, you can claim owner status.</p>
          {claimError && <p className="mt-3 text-xs text-red-400">{claimError}</p>}
          <div className="mt-5 space-y-3">
            <button onClick={handleClaimOwner} disabled={claiming} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {claiming ? "Claiming..." : "Claim as Owner"}
            </button>
            <p className="text-[11px] text-fintech-muted">Signed in as: {userEmail}</p>
          </div>
        </div>
      </div>
    );
  }

  // SECRETS
  if (phase === "secrets" || phase === "done") {
    const isOwner = status?.isOwner ?? false;
    const showSecretsSection = isOwner && phase !== "done";
    return (
      <div className="flex min-h-screen items-start justify-center bg-[var(--app-shell)] px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.24)_0%,_rgba(6,183,127,0.6)_100%)] text-[#dffef2]"><KeyRound size={18} /></div>
            <div><h1 className="text-lg font-bold">Server Secrets</h1><p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Self-host configuration</p></div>
          </div>
          {secretsStatus && (
            <div className="mb-4 space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-3">
              <p className="text-xs font-medium text-fintech-muted">Current status</p>
              {Object.entries(secretsStatus).map(([key, configured]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--app-text)]">{key}</span>
                  {configured ? <span className="flex items-center gap-1 text-fintech-accent"><CheckCircle2 size={12} /> Configured</span> : <span className="flex items-center gap-1 text-yellow-400"><XCircle size={12} /> Not set</span>}
                </div>
              ))}
            </div>
          )}
          {showSecretsSection ? (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--app-text)]">GEMINI_API_KEY</label>
                  <input type="password" value={secretsForm.GEMINI_API_KEY} onChange={(e) => setSecretsForm((p) => ({ ...p, GEMINI_API_KEY: e.target.value }))} className="mt-1 w-full text-xs" placeholder="AIza..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--app-text)]">GEMINI_MODEL</label>
                  <input type="text" value={secretsForm.GEMINI_MODEL} onChange={(e) => setSecretsForm((p) => ({ ...p, GEMINI_MODEL: e.target.value }))} className="mt-1 w-full text-xs" placeholder="gemini-2.5-flash" />
                  <p className="mt-1 text-[11px] text-fintech-muted">Default: gemini-2.5-flash. Requires server restart after saving.</p>
                </div>
              </div>
              {secretsError && <p className="mt-3 text-xs text-red-400">{secretsError}</p>}
              {secretsSuccess && <p className="mt-3 flex items-center gap-1.5 text-xs text-fintech-accent"><CheckCircle2 size={13} />Secrets saved successfully.</p>}
              <div className="mt-5 flex gap-3">
                <button onClick={handleSaveSecrets} disabled={savingSecrets} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
                  {savingSecrets ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {savingSecrets ? "Saving..." : "Save Secrets"}
                </button>
                <button onClick={onComplete} className="rounded-xl border border-[var(--app-border)] px-4 py-3 text-xs font-semibold text-[var(--app-text)]">Done</button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
              {isOwner ? <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-success-soft)] text-fintech-accent"><CheckCircle2 size={22} /></div> : <XCircle size={24} className="mx-auto text-yellow-400" />}
              <h2 className="mt-3 text-base font-bold">{isOwner ? "Setup Complete" : "Access Restricted"}</h2>
              <p className="mt-2 text-xs text-fintech-muted">{isOwner ? "All steps complete. Your self-hosted VibeBudget is ready." : `Only the instance owner${status?.ownerEmail ? ` (${status.ownerEmail})` : ""} can configure server secrets.`}</p>
              <button onClick={onComplete} className="mt-5 w-full rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919]">Continue to Dashboard</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
        <CheckCircle2 size={24} className="mx-auto text-fintech-accent" />
        <h2 className="mt-4 text-base font-bold">Setup Complete</h2>
        <p className="mt-2 text-xs text-fintech-muted">Your self-hosted VibeBudget is ready.</p>
        <button onClick={onComplete} className="mt-5 w-full rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919]">Start using VibeBudget</button>
      </div>
    </div>
  );
};
