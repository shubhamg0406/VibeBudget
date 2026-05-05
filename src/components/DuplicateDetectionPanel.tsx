import React, { useState } from "react";
import { Transaction } from "../types";
import { SearchX, Trash2, AlertTriangle, Loader2, Copy, Check, X } from "lucide-react";
import { detectDuplicateGroups } from "../utils/duplicateDetection";
import { TransactionIcon } from "./TransactionIcon";

interface DuplicateDetectionPanelProps {
  transactions: Transaction[];
  onDeleteTransaction: (id: string) => Promise<void>;
  onClose: () => void;
  onRefresh: () => void;
}

type PanelState =
  | { status: "idle" }
  | { status: "detecting" }
  | { status: "results"; groups: Transaction[][] }
  | { status: "no-duplicates" }
  | { status: "deleting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const DuplicateDetectionPanel: React.FC<DuplicateDetectionPanelProps> = ({
  transactions,
  onDeleteTransaction,
  onClose,
  onRefresh,
}) => {
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const handleDetect = () => {
    setState({ status: "detecting" });
    try {
      const groups = detectDuplicateGroups(transactions);
      if (groups.length === 0) {
        setState({ status: "no-duplicates" });
      } else {
        setState({ status: "results", groups });
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to detect duplicates",
      });
    }
  };

  const handleDeleteSingle = async (id: string) => {
    const prev = state;
    if (prev.status !== "results") return;
    setState({ status: "deleting" });
    try {
      await onDeleteTransaction(id);
      const updated = prev.groups
        .map((group) => group.filter((tx) => tx.id !== id))
        .filter((group) => group.length > 1);
      if (updated.length === 0) {
        setState({
          status: "success",
          message: "Duplicate deleted. No more duplicates found.",
        });
      } else {
        setState({ status: "results", groups: updated });
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to delete transaction",
      });
    }
  };

  const handleDeleteAllExtras = async () => {
    const prev = state;
    if (prev.status !== "results") return;
    setState({ status: "deleting" });
    try {
      let totalDeleted = 0;
      for (const group of prev.groups) {
        const [keep, ...extras] = group;
        for (const extra of extras) {
          await onDeleteTransaction(extra.id);
          totalDeleted++;
        }
      }
      setState({
        status: "success",
        message: `Deleted ${totalDeleted} duplicate transaction${totalDeleted !== 1 ? "s" : ""}. Kept 1 per group.`,
      });
      setConfirmDeleteAll(false);
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to delete duplicates",
      });
    }
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-fintech-muted">Duplicate Detection</h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-fintech-muted hover:bg-[var(--app-ghost)] transition-colors"
        aria-label="Close duplicate panel"
      >
        <X size={18} />
      </button>
    </div>
  );

  if (state.status === "idle") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <p className="text-sm text-fintech-muted mb-4">
          Scan your transactions for exact duplicates. A duplicate means two or more transactions where every field matches exactly.
        </p>
        <button
          type="button"
          onClick={handleDetect}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fintech-accent px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#002919] transition-colors hover:bg-fintech-accent/90"
        >
          <Copy size={15} />
          <span>Find Duplicates</span>
        </button>
      </section>
    );
  }

  if (state.status === "detecting") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="flex items-center gap-3 py-6">
          <Loader2 size={20} className="animate-spin text-fintech-accent" />
          <span className="text-sm text-fintech-muted">Scanning transactions for duplicates...</span>
        </div>
      </section>
    );
  }

  if (state.status === "no-duplicates") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-fintech-success/10">
            <Check size={28} className="text-fintech-success" />
          </div>
          <p className="text-sm font-semibold">No duplicate transactions found</p>
          <p className="mt-1 text-xs text-fintech-muted">
            All {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} appear to be unique.
          </p>
          <button
            type="button"
            onClick={handleDetect}
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border bg-[var(--app-ghost)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-fintech-muted transition-colors hover:bg-[var(--app-ghost-strong)]"
            style={{ borderColor: "var(--app-border)" }}
          >
            <RefreshCwIcon size={14} />
            <span>Scan Again</span>
          </button>
        </div>
      </section>
    );
  }

  if (state.status === "results") {
    const { groups } = state;
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-fintech-muted">
            Found <span className="font-bold text-[var(--app-text)]">{groups.length}</span> duplicate group{groups.length !== 1 ? "s" : ""}{" "}
            (<span className="font-bold text-[var(--app-text)]">{groups.reduce((s, g) => s + g.length, 0)}</span> total transactions,{" "}
            <span className="font-bold text-fintech-success">{groups.length}</span> will be kept)
          </p>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {groups.map((group, gi) => (
            <div key={gi} className="rounded-lg border border-fintech-danger/20 bg-fintech-danger/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fintech-danger">
                  Group {gi + 1} — {group.length} copies
                </span>
                <span className="text-[10px] text-fintech-muted">
                  Keep 1, delete {group.length - 1}
                </span>
              </div>
              <div className="space-y-2">
                {group.map((tx, ti) => (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      ti === 0
                        ? "bg-fintech-success/10 border border-fintech-success/20"
                        : "bg-[var(--app-ghost)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TransactionIcon title={tx.vendor} category={tx.category_name} type="expense" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {tx.vendor}
                          {ti === 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fintech-success bg-fintech-success/10 px-1.5 py-0.5 rounded shrink-0">
                              Will keep
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-fintech-muted uppercase tracking-wider">
                          <span>{tx.category_name}</span>
                          <span>•</span>
                          <span>{tx.date}</span>
                          {tx.notes && (
                            <>
                              <span>•</span>
                              <span className="italic lowercase normal-case truncate max-w-[120px]">{tx.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-fintech-danger">
                        ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {ti > 0 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(tx.id)}
                          className="rounded-lg p-1.5 text-fintech-danger/60 hover:bg-fintech-danger/10 hover:text-fintech-danger transition-colors"
                          aria-label={`Delete duplicate transaction ${tx.vendor}`}
                          title="Delete this duplicate"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {!confirmDeleteAll ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-fintech-danger px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-fintech-danger/90"
            >
              <Trash2 size={15} />
              <span>Delete All Extras (keep 1 per group)</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-fintech-danger/30 bg-fintech-danger/10 px-4 py-3 text-xs text-fintech-danger">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  This will delete {groups.reduce((s, g) => s + g.length - 1, 0)} transaction{groups.reduce((s, g) => s + g.length - 1, 0) !== 1 ? "s" : ""},
                  keeping 1 from each group. This action cannot be undone.
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(false)}
                  className="flex-1 min-h-11 rounded-lg border bg-[var(--app-panel)] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllExtras}
                  className="flex-1 min-h-11 rounded-lg bg-fintech-danger px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-fintech-danger/90"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (state.status === "deleting") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="flex items-center gap-3 py-6">
          <Loader2 size={20} className="animate-spin text-fintech-danger" />
          <span className="text-sm text-fintech-muted">Deleting duplicates...</span>
        </div>
      </section>
    );
  }

  if (state.status === "success") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-fintech-success/10">
            <Check size={28} className="text-fintech-success" />
          </div>
          <p className="text-sm font-semibold text-fintech-success">Done</p>
          <p className="mt-1 text-xs text-fintech-muted">{state.message}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border bg-[var(--app-panel)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onRefresh();
                setState({ status: "idle" });
              }}
              className="min-h-10 rounded-lg bg-fintech-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#002919] transition-colors hover:bg-fintech-accent/90"
            >
              Refresh & Scan Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-xl border bg-[var(--app-panel)] p-4" style={{ borderColor: "var(--app-border)" }}>
        {renderHeader()}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-fintech-danger/10">
            <AlertTriangle size={28} className="text-fintech-danger" />
          </div>
          <p className="text-sm font-semibold text-fintech-danger">Error</p>
          <p className="mt-1 text-xs text-fintech-muted">{state.message}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-lg border bg-[var(--app-panel)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-fintech-muted transition-colors hover:bg-[var(--app-ghost)]"
              style={{ borderColor: "var(--app-border)" }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setState({ status: "idle" })}
              className="min-h-10 rounded-lg bg-fintech-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#002919] transition-colors hover:bg-fintech-accent/90"
            >
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
};

function RefreshCwIcon(props: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || 24}
      height={props.size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}
