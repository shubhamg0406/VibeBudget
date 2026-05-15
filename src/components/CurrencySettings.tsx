import React, { useState, useMemo } from "react";
import { Globe, RefreshCw, X } from "lucide-react";
import type { ExchangeRate, FxRateMode } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";
import { CURRENCIES, getCurrencySymbol } from "../utils/currencyUtils";

const MODES: { id: FxRateMode; label: string; description: string }[] = [
  { id: "live", label: "Live", description: "Auto-fetched from Yahoo Finance" },
  { id: "fixed", label: "Fixed", description: "You set the rate manually" },
  { id: "historical", label: "Per Transaction", description: "Rate captured when transaction was added" },
];

export const CurrencySettings: React.FC = () => {
  const { preferences, transactions, income, updatePreferences, updateSingleExchangeRate } = useFirebase();

  const baseCurrency = preferences?.baseCurrency || "CAD";
  const exchangeRates = preferences?.exchangeRates || [];

  const [pendingBase, setPendingBase] = useState(baseCurrency);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fetchingRates, setFetchingRates] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync pendingBase when baseCurrency changes (e.g. after save)
  const [prevBase, setPrevBase] = useState(baseCurrency);
  if (baseCurrency !== prevBase) {
    setPrevBase(baseCurrency);
    setPendingBase(baseCurrency);
  }

  const currenciesInData = useMemo(() => {
    const fromExpenses = transactions.map((t) => t.currency).filter(Boolean) as string[];
    const fromIncome = income.map((i) => i.currency).filter(Boolean) as string[];
    return Array.from(new Set([...fromExpenses, ...fromIncome])).filter((c) => c !== baseCurrency);
  }, [transactions, income, baseCurrency]);

  const missingCoverage = useMemo(() => {
    const covered = new Set(exchangeRates.map((r) => r.currency));
    return currenciesInData.filter((c) => !covered.has(c));
  }, [currenciesInData, exchangeRates]);

  const staleRates = useMemo(() => {
    const now = Date.now();
    return exchangeRates
      .filter((r) => {
        if (r.mode !== "live") return false;
        if (!r.liveRateUpdatedAt) return true;
        return (now - new Date(r.liveRateUpdatedAt).getTime()) > 24 * 60 * 60 * 1000;
      })
      .map((r) => r.currency);
  }, [exchangeRates]);

  const flash = (type: "success" | "error", msg: string) => {
    if (type === "success") { setSuccessMsg(msg); setError(null); }
    else { setError(msg); setSuccessMsg(null); }
    setTimeout(() => { setSuccessMsg(null); setError(null); }, 5000);
  };

  const fetchLiveRate = async (currency: string) => {
    setFetchingRates((p) => ({ ...p, [currency]: true }));
    try {
      const res = await fetch(`/api/fx?from=${currency}&to=${baseCurrency}`);
      const data = await res.json() as { rate?: number; error?: string };
      if (!res.ok || !data.rate) throw new Error(data.error || "Rate unavailable");
      await updateSingleExchangeRate(currency, { rateToBase: data.rate, liveRateUpdatedAt: new Date().toISOString() });
    } catch (err) {
      flash("error", `Live rate failed for ${currency}: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setFetchingRates((p) => ({ ...p, [currency]: false }));
    }
  };

  const handleAddCurrency = async (code: string) => {
    if (!code) return;
    if (exchangeRates.find((r) => r.currency === code)) return;
    const newRate: ExchangeRate = { currency: code, rateToBase: 0, mode: "live" };
    await updatePreferences({ exchangeRates: [...exchangeRates, newRate] });
    void fetchLiveRate(code);
  };

  const handleRemoveCurrency = async (currency: string) => {
    await updatePreferences({ exchangeRates: exchangeRates.filter((r) => r.currency !== currency) });
  };

  const handleSetMode = async (currency: string, mode: FxRateMode) => {
    const next = exchangeRates.map((r) => r.currency === currency ? { ...r, mode } : r);
    await updatePreferences({ exchangeRates: next });
    if (mode === "live") void fetchLiveRate(currency);
  };

  const handleRateInput = async (currency: string, value: string) => {
    const rate = parseFloat(value) || 0;
    const next = exchangeRates.map((r) => r.currency === currency ? { ...r, rateToBase: rate } : r);
    await updatePreferences({ exchangeRates: next });
  };

  const handleSaveBase = async () => {
    await updatePreferences({ baseCurrency: pendingBase });
    setShowConfirm(false);
    flash("success", `Primary currency updated to ${pendingBase}.`);
  };

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Globe size={18} className="text-fintech-accent" /> Currency
        </h2>
        <p className="text-sm text-fintech-muted">
          Primary currency defines all budget rollups. FX rates cover non-base transactions.
        </p>
      </div>

      {/* Status */}
      {error && (
        <div className="rounded-xl border border-fintech-danger/20 bg-fintech-danger/10 px-4 py-3 text-sm text-fintech-danger">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-fintech-accent/20 bg-fintech-accent/10 px-4 py-3 text-sm text-fintech-accent">
          {successMsg}
        </div>
      )}

      {/* Coverage warnings */}
      {(missingCoverage.length > 0 || staleRates.length > 0) && (
        <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/10 p-3 text-xs text-yellow-300 space-y-1">
          {missingCoverage.length > 0 && (
            <div>Missing FX coverage for currencies in your data: <span className="font-semibold">{missingCoverage.join(", ")}</span>.</div>
          )}
          {staleRates.length > 0 && (
            <div>Live rates older than 24h: <span className="font-semibold">{staleRates.join(", ")}</span>.</div>
          )}
        </div>
      )}

      {/* Primary currency */}
      <div className="rounded-xl border bg-[var(--app-panel)] p-5 space-y-3" style={{ borderColor: "var(--app-border)" }}>
        <div className="text-xs font-bold uppercase tracking-widest text-fintech-muted">Primary Currency</div>
        <select
          value={pendingBase}
          onChange={(e) => setPendingBase(e.target.value)}
          className="w-full rounded-xl border bg-[var(--app-ghost)] px-4 py-3 text-sm font-bold"
          style={{ borderColor: "var(--app-border)" }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
          ))}
        </select>
        <p className="text-xs text-fintech-muted">Budget totals and analytics normalize into {pendingBase}.</p>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={pendingBase === baseCurrency}
          className="rounded-xl bg-fintech-accent/10 px-4 py-2 text-sm font-bold text-fintech-accent disabled:opacity-40"
        >
          Save Primary Currency
        </button>
      </div>

      {/* Secondary currencies */}
      <div className="rounded-xl border bg-[var(--app-panel)] p-5 space-y-4" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold">Secondary Currencies</h3>
            <p className="mt-0.5 text-xs text-fintech-muted">
              Each foreign currency needs a rate to convert into {baseCurrency}.
            </p>
          </div>
          <span className="text-xs text-fintech-muted">{exchangeRates.length} configured</span>
        </div>

        {exchangeRates.length === 0 && (
          <p className="text-sm text-fintech-muted">No secondary currencies added yet.</p>
        )}

        {exchangeRates.map((rate) => {
          const mode: FxRateMode = rate.mode || "fixed";
          const currencyInfo = CURRENCIES.find((c) => c.code === rate.currency);
          const isFetching = fetchingRates[rate.currency] || false;

          return (
            <div
              key={rate.currency}
              className="rounded-xl border bg-[var(--app-ghost)] p-4 space-y-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold">{rate.currency}</span>
                  {currencyInfo && (
                    <span className="text-xs text-fintech-muted">{currencyInfo.name}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveCurrency(rate.currency)}
                  className="rounded-md p-1.5 text-fintech-muted hover:bg-fintech-danger/10 hover:text-fintech-danger transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Mode picker */}
              <div className="flex gap-1 rounded-lg bg-[var(--app-panel)] p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void handleSetMode(rate.currency, m.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                      mode === m.id
                        ? "bg-fintech-accent/20 text-fintech-accent"
                        : "text-fintech-muted hover:text-[var(--app-text)]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Live mode */}
              {mode === "live" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      {isFetching ? (
                        <span className="text-sm text-fintech-muted italic">Fetching rate…</span>
                      ) : rate.rateToBase > 0 ? (
                        <span className="text-xl font-bold tabular-nums">
                          {rate.rateToBase.toFixed(4)}
                          <span className="ml-1.5 text-sm font-normal text-fintech-muted">
                            {baseCurrency} per {rate.currency}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm text-fintech-muted italic">No rate yet</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchLiveRate(rate.currency)}
                      disabled={isFetching}
                      className="flex items-center gap-1.5 rounded-lg bg-fintech-accent/10 px-3 py-2 text-xs font-bold text-fintech-accent disabled:opacity-60 hover:bg-fintech-accent/20 transition-colors"
                    >
                      <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
                      Refresh
                    </button>
                  </div>
                  {rate.liveRateUpdatedAt && (
                    <p className="text-[10px] text-fintech-muted">
                      Live via Yahoo Finance · Updated {new Date(rate.liveRateUpdatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Fixed mode */}
              {mode === "fixed" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      defaultValue={rate.rateToBase || ""}
                      onBlur={(e) => void handleRateInput(rate.currency, e.target.value)}
                      placeholder="e.g. 1.35"
                      className="flex-1 rounded-lg border bg-[var(--app-panel-strong)] px-3 py-2 text-sm tabular-nums"
                      style={{ borderColor: "var(--app-border)" }}
                    />
                    <span className="text-sm font-semibold text-fintech-muted whitespace-nowrap">
                      {baseCurrency} per {rate.currency}
                    </span>
                  </div>
                  <p className="text-[10px] text-fintech-muted">
                    Example: 100 {rate.currency} × {rate.rateToBase || "?"} = {getCurrencySymbol(baseCurrency)}
                    {rate.rateToBase ? (100 * rate.rateToBase).toFixed(2) : "?"} in budget rollups.
                  </p>
                </div>
              )}

              {/* Per-transaction mode */}
              {mode === "historical" && (
                <div className="rounded-lg border border-fintech-accent/20 bg-fintech-accent/5 p-3 text-xs text-fintech-muted space-y-1">
                  <p className="font-semibold text-[var(--app-text)]">Rate captured at transaction time</p>
                  <p>
                    Each transaction uses the rate from when it was added or imported. Transactions
                    without a stored rate fall back to{" "}
                    <span className="font-mono font-semibold">{rate.rateToBase || "1.0"}</span>.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      defaultValue={rate.rateToBase || ""}
                      onBlur={(e) => void handleRateInput(rate.currency, e.target.value)}
                      placeholder="Fallback rate"
                      className="w-32 rounded-lg border bg-[var(--app-panel-strong)] px-3 py-1.5 text-xs font-mono"
                      style={{ borderColor: "var(--app-border)" }}
                    />
                    <span className="text-[10px]">fallback rate</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add currency */}
        <div className={exchangeRates.length > 0 ? "border-t pt-4" : ""} style={exchangeRates.length > 0 ? { borderColor: "var(--app-border)" } : undefined}>
          <select
            value=""
            onChange={(e) => { void handleAddCurrency(e.target.value); e.target.value = ""; }}
            className="w-full rounded-xl border bg-[var(--app-ghost)] px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="">+ Add currency…</option>
            {CURRENCIES
              .filter((c) => c.code !== baseCurrency && !exchangeRates.find((r) => r.currency === c.code))
              .map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
              ))}
          </select>
        </div>
      </div>

      {/* Base currency confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            className="w-full max-w-md rounded-2xl border bg-[var(--app-panel)] p-6 shadow-2xl"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h3 className="text-lg font-bold">Change Primary Currency</h3>
            <p className="mt-2 text-sm text-fintech-muted">
              Budget totals, targets, and rollups will recalculate in{" "}
              <span className="font-semibold text-[var(--app-text)]">{pendingBase}</span>. Raw
              transaction rows remain unchanged.
            </p>
            <p className="mt-1 text-xs text-fintech-muted">
              Example: transaction currency stays as entered, but dashboard and analysis normalize to
              your primary currency.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => void handleSaveBase()}
                className="flex-1 rounded-xl bg-fintech-accent px-4 py-2 text-sm font-bold text-[#002919]"
              >
                Confirm Change
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl bg-[var(--app-ghost)] px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
