import React, { useCallback, useEffect, useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { ArrowRight, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, LogIn, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { auth, initFirebase, saveFirebaseConfigToStorage, clearStoredFirebaseConfig, isFirebaseReady, googleProvider } from "../firebase";
import type { FirebaseWebConfig } from "../firebase";

interface SelfHostSetupProps {
  onComplete: () => void;
}

type SetupPhase = "config" | "sign-in" | "claim-owner" | "secrets" | "done";

interface SelfHostStatus {
  ownerExists: boolean;
  isOwner: boolean;
  ownerEmail: string | null;
  secretsConfigured: boolean;
  envConfigExists: boolean;
}

export const SelfHostSetup: React.FC<SelfHostSetupProps> = ({ onComplete }) => {
  const readyAtMount = isFirebaseReady();
  const hasUserAtMount = readyAtMount && !!auth.currentUser;

  const initialPhase: SetupPhase = readyAtMount
    ? (hasUserAtMount ? "claim-owner" : "sign-in")
    : "config";

  const [phase, setPhase] = useState<SetupPhase>(initialPhase);
  const [config, setConfig] = useState<FirebaseWebConfig>({
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    firestoreDatabaseId: "",
    dataNamespace: import.meta.env.DEV ? "local-dev" : "prod",
  });
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SelfHostStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [secretsSuccess, setSecretsSuccess] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [secretsForm, setSecretsForm] = useState({
    FIREBASE_ADMIN_CREDENTIALS_JSON: "",
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "gemini-2.5-flash",
  });
  const [signingIn, setSigningIn] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!auth.currentUser) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/self-host/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SelfHostStatus;
      setStatus(data);
      if (data.ownerExists && data.secretsConfigured) {
        setPhase("done");
      } else if (data.ownerExists && data.isOwner) {
        setPhase("secrets");
      } else if (data.ownerExists && !data.isOwner) {
        setPhase("done");
      } else {
        setPhase("claim-owner");
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Failed to check setup status");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchSecretsStatus = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/self-host/secrets/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as Record<string, boolean>;
      setSecretsStatus(data);
      if (Object.values(data).some(Boolean)) {
        setSecretsSuccess(true);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (phase === "claim-owner" || phase === "secrets" || phase === "done") {
      fetchStatus();
    }
  }, [phase, fetchStatus]);

  useEffect(() => {
    if (phase === "secrets") {
      fetchSecretsStatus();
    }
  }, [phase, fetchSecretsStatus]);

  const handleConfigChange = (field: keyof FirebaseWebConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setConfigError(null);
  };

  const validateConfig = (): string | null => {
    const required: (keyof FirebaseWebConfig)[] = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    for (const field of required) {
      if (!config[field]?.trim()) {
        return `${field} is required`;
      }
    }
    if (!config.authDomain?.includes(".")) {
      return "authDomain should be a valid domain like project.firebaseapp.com";
    }
    return null;
  };

  const handleSaveConfig = async () => {
    const error = validateConfig();
    if (error) { setConfigError(error); return; }
    setSaving(true);
    try {
      const cleaned: FirebaseWebConfig = {
        apiKey: config.apiKey.trim(),
        authDomain: config.authDomain.trim(),
        projectId: config.projectId.trim(),
        storageBucket: config.storageBucket.trim(),
        messagingSenderId: config.messagingSenderId.trim(),
        appId: config.appId.trim(),
        firestoreDatabaseId: config.firestoreDatabaseId?.trim() || undefined,
        dataNamespace: config.dataNamespace?.trim() || undefined,
      };
      saveFirebaseConfigToStorage(cleaned);
      const ok = initFirebase(cleaned);
      if (!ok) {
        setConfigError("Failed to initialize Firebase. Check your config values.");
        clearStoredFirebaseConfig();
        setSaving(false);
        return;
      }
      setPhase("sign-in");
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to save config");
      clearStoredFirebaseConfig();
    } finally {
      setSaving(false);
    }
  };

  const handleResetConfig = () => {
    clearStoredFirebaseConfig();
    setPhase("config");
  };

  const handleSignIn = async () => {
    if (!googleProvider) return;
    setSigningIn(true);
    try {
      await signInWithPopup(auth!, googleProvider);
      setPhase("claim-owner");
    } catch (err: any) {
      if (err?.code === "auth/unauthorized-domain") {
        setStatusError("Add this domain to Firebase Console → Authentication → Authorized domains.");
      } else if (err?.code === "auth/popup-blocked") {
        setStatusError("Popup was blocked. Allow popups for this site and try again.");
      } else {
        setStatusError(err instanceof Error ? err.message : "Sign in failed");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleClaimOwner = async () => {
    if (!auth.currentUser) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/self-host/claim-owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 403) {
        const data = await res.json();
        setClaimError(data.error || "Owner already claimed by another user.");
        await fetchStatus();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Failed to claim owner");
    } finally {
      setClaiming(false);
    }
  };

  const handleSaveSecrets = async () => {
    if (!auth.currentUser) return;
    setSavingSecrets(true);
    setSecretsError(null);
    setSecretsSuccess(false);
    try {
      const token = await auth.currentUser.getIdToken();
      const payload: Record<string, string> = {};
      if (secretsForm.FIREBASE_ADMIN_CREDENTIALS_JSON.trim()) {
        payload.FIREBASE_ADMIN_CREDENTIALS_JSON = secretsForm.FIREBASE_ADMIN_CREDENTIALS_JSON.trim();
      }
      if (secretsForm.GEMINI_API_KEY.trim()) {
        payload.GEMINI_API_KEY = secretsForm.GEMINI_API_KEY.trim();
      }
      if (secretsForm.GEMINI_MODEL.trim()) {
        payload.GEMINI_MODEL = secretsForm.GEMINI_MODEL.trim();
      }
      const res = await fetch("/api/self-host/secrets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSecretsSuccess(true);
      setSecretsForm({
        FIREBASE_ADMIN_CREDENTIALS_JSON: "",
        GEMINI_API_KEY: "",
        GEMINI_MODEL: "gemini-2.5-flash",
      });
      await fetchSecretsStatus();
      setShowSecrets(false);
    } catch (err) {
      setSecretsError(err instanceof Error ? err.message : "Failed to save secrets");
    } finally {
      setSavingSecrets(false);
    }
  };

  // --- CONFIG PHASE ---
  if (phase === "config") {
    return (
      <div className="flex min-h-screen items-start justify-center bg-[var(--app-shell)] px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.24)_0%,_rgba(6,183,127,0.6)_100%)] text-[#dffef2] shadow-[0_12px_32px_rgba(6,183,127,0.24)]">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold">VibeBudget</h1>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Self-host setup</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6">
            <h2 className="text-base font-bold">Use your own Firebase project</h2>
            <p className="mt-2 text-xs leading-relaxed text-fintech-muted">
              VibeBudget uses Firebase for authentication and data storage. Enter your Firebase web app config below to get started.
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-3 text-xs text-fintech-muted">
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-fintech-accent" />
                Enable <strong className="text-[var(--app-text)]">Google Auth</strong> and <strong className="text-[var(--app-text)]">Firestore</strong> in Firebase Console
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-fintech-accent" />
                Add this domain to Firebase <strong className="text-[var(--app-text)]">Authorized domains</strong>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-fintech-accent" />
                Copy the web app config from Project Settings → General → Your apps
              </p>
            </div>

            <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-fintech-accent hover:underline">
              <ExternalLink size={12} />
              Open Firebase Console
            </a>

            <div className="mt-5 space-y-3">
              {(["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-[var(--app-text)]">
                    {field === "apiKey" ? "API Key" : field === "authDomain" ? "Auth Domain" : field === "projectId" ? "Project ID" : field === "storageBucket" ? "Storage Bucket" : field === "messagingSenderId" ? "Messaging Sender ID" : field === "appId" ? "App ID" : field}
                  </label>
                  <input
                    type="text"
                    value={config[field] || ""}
                    onChange={(e) => handleConfigChange(field, e.target.value)}
                    className="mt-1 w-full text-xs"
                    placeholder={field === "authDomain" ? "project.firebaseapp.com" : field === "storageBucket" ? "project.firebasestorage.app" : field === "messagingSenderId" ? "123456789" : field === "appId" ? "1:123:web:abc" : ""}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-[var(--app-text)]">Firestore Database ID <span className="text-fintech-muted">(optional)</span></label>
                <input type="text" value={config.firestoreDatabaseId || ""} onChange={(e) => handleConfigChange("firestoreDatabaseId", e.target.value)} className="mt-1 w-full text-xs" placeholder="(default)" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--app-text)]">Data Namespace</label>
                <input type="text" value={config.dataNamespace || ""} onChange={(e) => handleConfigChange("dataNamespace", e.target.value)} className="mt-1 w-full text-xs" placeholder={import.meta.env.DEV ? "local-dev" : "prod"} />
                <p className="mt-1 text-[11px] text-fintech-muted">Isolates data between environments. Default: {import.meta.env.DEV ? "local-dev" : "prod"}</p>
              </div>
            </div>
            {configError && <p className="mt-3 text-xs text-red-400">{configError}</p>}
            <div className="mt-5">
              <button onClick={handleSaveConfig} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-fintech-muted">Already have Firebase configured? Make sure your VITE_FIREBASE_* env vars are set.</p>
        </div>
      </div>
    );
  }

  // --- SIGN-IN PHASE ---
  if (!auth.currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-ghost)] text-fintech-accent"><LogIn size={22} /></div>
          <h2 className="mt-4 text-base font-bold">Sign in to continue setup</h2>
          <p className="mt-2 text-xs text-fintech-muted">Firebase is configured. Sign in with Google to set up your self-hosted instance.</p>
          {statusError && <p className="mt-3 text-xs text-red-400">{statusError}</p>}
          <button onClick={handleSignIn} disabled={signingIn} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {signingIn ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {signingIn ? "Signing in..." : "Sign in with Google"}
          </button>
          <button onClick={handleResetConfig} className="mt-3 w-full rounded-xl border border-[var(--app-border)] px-4 py-2 text-xs text-fintech-muted">Reset Firebase config</button>
        </div>
      </div>
    );
  }

  // --- STATUS LOADING ---
  if (statusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)]">
        <Loader2 size={24} className="animate-spin text-fintech-accent" />
      </div>
    );
  }

  // --- STATUS ERROR ---
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

  // --- CLAIM OWNER ---
  if (phase === "claim-owner") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-violet-soft)] text-fintech-accent"><ShieldCheck size={22} /></div>
          <h2 className="mt-4 text-base font-bold">Claim Owner</h2>
          <p className="mt-2 text-xs text-fintech-muted">No owner is configured for this instance. As the first signed-in user, you can claim owner status to configure server secrets.</p>
          {claimError && <p className="mt-3 text-xs text-red-400">{claimError}</p>}
          <div className="mt-5 space-y-3">
            <button onClick={handleClaimOwner} disabled={claiming} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {claiming ? "Claiming..." : "Claim as Owner"}
            </button>
            <p className="text-[11px] text-fintech-muted">Signed in as: {auth.currentUser.email}</p>
          </div>
        </div>
      </div>
    );
  }

  // --- SECRETS ---
  if (phase === "secrets" || phase === "done") {
    const isOwner = status?.isOwner ?? false;
    const showSecretsSection = isOwner && phase !== "done";

    return (
      <div className="flex min-h-screen items-start justify-center bg-[var(--app-shell)] px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,_rgba(105,246,184,0.24)_0%,_rgba(6,183,127,0.6)_100%)] text-[#dffef2]"><KeyRound size={18} /></div>
            <div>
              <h1 className="text-lg font-bold">Server Secrets</h1>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Self-host configuration</p>
            </div>
          </div>

          {secretsStatus && (
            <div className="mb-4 space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-ghost)] p-3">
              <p className="text-xs font-medium text-fintech-muted">Current status</p>
              {Object.entries(secretsStatus).map(([key, configured]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--app-text)]">{key}</span>
                  {configured ? (
                    <span className="flex items-center gap-1 text-fintech-accent"><CheckCircle2 size={12} /> Configured</span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-400"><XCircle size={12} /> Not set</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {showSecretsSection ? (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6">
              <div className="space-y-4">
                <div>
                  <label className="flex items-center justify-between text-xs font-medium text-[var(--app-text)]">
                    <span>FIREBASE_ADMIN_CREDENTIALS_JSON</span>
                    <button onClick={() => setShowSecrets(!showSecrets)} className="text-fintech-muted hover:text-[var(--app-text)]">
                      {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </label>
                  {showSecrets ? (
                    <textarea value={secretsForm.FIREBASE_ADMIN_CREDENTIALS_JSON} onChange={(e) => setSecretsForm((p) => ({ ...p, FIREBASE_ADMIN_CREDENTIALS_JSON: e.target.value }))} className="mt-1 w-full text-xs font-mono" rows={4} placeholder='{"type": "service_account", ...}' />
                  ) : (
                    <input type="password" value={secretsForm.FIREBASE_ADMIN_CREDENTIALS_JSON} onChange={(e) => setSecretsForm((p) => ({ ...p, FIREBASE_ADMIN_CREDENTIALS_JSON: e.target.value }))} className="mt-1 w-full text-xs font-mono" placeholder='{"type": "service_account", ...}' />
                  )}
                  <p className="mt-1 text-[11px] text-fintech-muted">Service account JSON from Firebase Console → Project Settings → Service accounts. Server-only — never shared.</p>
                </div>
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
              <p className="mt-3 text-[11px] text-fintech-muted text-center">Secrets are stored server-side only. They are never exposed to the client after saving.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] p-6 text-center">
              {isOwner ? (
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-success-soft)] text-fintech-accent"><CheckCircle2 size={22} /></div>
              ) : (
                <XCircle size={24} className="mx-auto text-yellow-400" />
              )}
              <h2 className="mt-3 text-base font-bold">{isOwner ? "Setup Complete" : "Access Restricted"}</h2>
              <p className="mt-2 text-xs text-fintech-muted">
                {isOwner
                  ? "All steps complete. Your self-hosted VibeBudget is ready."
                  : `Only the instance owner${status?.ownerEmail ? ` (${status.ownerEmail})` : ""} can configure server secrets.`}
              </p>
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
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-success-soft)] text-fintech-accent"><CheckCircle2 size={22} /></div>
        <h2 className="mt-4 text-base font-bold">Setup Complete</h2>
        <p className="mt-2 text-xs text-fintech-muted">Your self-hosted VibeBudget is ready.</p>
        <button onClick={onComplete} className="mt-5 w-full rounded-xl bg-fintech-accent px-4 py-3 text-xs font-bold text-[#002919]">Start using VibeBudget</button>
      </div>
    </div>
  );
};
