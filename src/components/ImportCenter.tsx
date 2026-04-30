import React, { useMemo, useState } from "react";
import { CheckCircle2, FileText, Search, Upload, XCircle } from "lucide-react";
import type { ImportBatch, ImportRecord, ImportRecordStatus, ImportSource } from "../types";
import { useFirebase } from "../contexts/FirebaseContext";

type ImportCenterSource = Extract<ImportSource, "csv" | "android_notifications" | "manual_backup">;
type ImportTarget = "expenses" | "income" | "expenseCategories" | "incomeCategories";

const SOURCE_LABELS: Record<ImportCenterSource, string> = {
  csv: "CSV",
  android_notifications: "Android Alerts",
  manual_backup: "Backup JSON",
};

const STATUS_STYLES: Record<ImportRecordStatus, string> = {
  new: "bg-fintech-accent/10 text-fintech-accent",
  duplicate: "bg-[var(--app-ghost)] text-fintech-muted",
  warning: "bg-fintech-import/10 text-fintech-import",
  invalid: "bg-fintech-danger/10 text-fintech-danger",
};

export const ImportCenter: React.FC<{ onImported?: () => void; allowedSources?: ImportCenterSource[] }> = ({ onImported, allowedSources }) => {
  const { previewImport, commitImport, expenseCategories, incomeCategories } = useFirebase();
  const sourceOptions = allowedSources && allowedSources.length > 0
    ? allowedSources
    : (Object.keys(SOURCE_LABELS) as ImportCenterSource[]);
  const canChangeSource = sourceOptions.length > 1;
  const [source, setSource] = useState<ImportCenterSource>(sourceOptions[0]);
  const [target, setTarget] = useState<ImportTarget>("expenses");
  const [rawInput, setRawInput] = useState("");
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ImportRecordStatus | "all">("all");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categoryOptions = target === "income"
    ? incomeCategories.map((category) => category.name)
    : expenseCategories.map((category) => category.name);

  const previewRecords = useMemo(() => {
    if (!batch) return [];
    const query = search.trim().toLowerCase();
    return batch.records.filter((record) => {
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const searchable = [record.merchant, record.category, record.notes, record.raw_description].join(" ").toLowerCase();
      return matchesStatus && (!query || searchable.includes(query));
    });
  }, [batch, search, statusFilter]);

  const selectedCommitIds = useMemo(() => {
    if (!batch) return [];
    return Array.from(selectedIds).filter((recordId) => {
      const record = batch.records.find((item) => item.id === recordId);
      return Boolean(record && record.status !== "invalid" && (includeDuplicates || record.status !== "duplicate"));
    });
  }, [batch, includeDuplicates, selectedIds]);

  const setRecordCategory = (recordId: string, category: string) => {
    setBatch((current) => {
      if (!current) return current;
      const records = current.records.map((record) => {
        if (record.id !== recordId) return record;
        const warnings = record.warnings.filter((warning) => !warning.includes("Unknown expense category"));
        return {
          ...record,
          category,
          warnings,
          status: record.status === "warning" && warnings.length === 0 ? "new" : record.status,
        } satisfies ImportRecord;
      });
      return {
        ...current,
        records,
        summary: {
          total: records.length,
          new: records.filter((record) => record.status === "new").length,
          duplicate: records.filter((record) => record.status === "duplicate").length,
          warning: records.filter((record) => record.status === "warning").length,
          invalid: records.filter((record) => record.status === "invalid").length,
        },
      };
    });
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setRawInput(String(loadEvent.target?.result || ""));
      setBatch(null);
      setMessage(null);
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  const handlePreview = () => {
    const nextBatch = previewImport(source, rawInput, { type: target });
    setBatch(nextBatch);
    setSelectedIds(new Set(nextBatch.records
      .filter((record) => record.status !== "invalid" && record.status !== "duplicate")
      .map((record) => record.id)));
    setMessage(`${nextBatch.summary.total} rows parsed. ${nextBatch.summary.invalid} invalid, ${nextBatch.summary.duplicate} duplicates.`);
  };

  const handleCommit = async () => {
    if (!batch) return;
    setCommitting(true);
    try {
      const summary = await commitImport(batch, {
        includeDuplicates,
        recordIds: selectedCommitIds,
      });
      setMessage(`${summary.imported} rows imported. ${summary.skipped} skipped.`);
      setBatch(null);
      setRawInput("");
      setSelectedIds(new Set());
      onImported?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <section className="rounded-xl border bg-[var(--app-panel)] p-5" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-bold">Import Center</h3>
          <p className="mt-1 text-xs text-fintech-muted">Preview, clean up, and commit imported records into Firestore.</p>
        </div>
        {message && (
          <div className="rounded-lg bg-[var(--app-ghost)] px-3 py-2 text-xs text-fintech-muted">
            {message}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[0.75fr_0.75fr_1fr]">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Source</span>
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value as ImportCenterSource);
              setBatch(null);
            }}
            disabled={!canChangeSource}
            className="w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            {sourceOptions.map((value) => (
              <option key={value} value={value}>{SOURCE_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Target</span>
          <select
            value={target}
            onChange={(event) => {
              setTarget(event.target.value as ImportTarget);
              setBatch(null);
            }}
            className="w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="expenses">Expenses</option>
            <option value="income">Income</option>
            <option value="expenseCategories">Expense Categories</option>
            <option value="incomeCategories">Income Categories</option>
          </select>
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>
          <Upload size={16} />
          Upload source file
          <input type="file" accept=".csv,.txt,.json,text/csv,text/plain,application/json" className="hidden" onChange={handleFile} />
        </label>
      </div>

      <textarea
        value={rawInput}
        onChange={(event) => {
          setRawInput(event.target.value);
          setBatch(null);
        }}
        placeholder="Paste CSV, Android notification export, or budget backup JSON..."
        className="mt-4 min-h-32 w-full rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm"
        style={{ borderColor: "var(--app-border)" }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!rawInput.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-fintech-accent px-4 py-2 text-sm font-bold text-[#002919] disabled:opacity-50"
        >
          <FileText size={16} />
          Preview Import
        </button>
        {batch && (
          <>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-fintech-muted">
              <input
                type="checkbox"
                checked={includeDuplicates}
                onChange={(event) => setIncludeDuplicates(event.target.checked)}
              />
              Include duplicates
            </label>
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={committing || selectedCommitIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-fintech-import/20 px-4 py-2 text-sm font-bold text-fintech-import disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              {committing ? "Committing..." : `Commit ${selectedCommitIds.length}`}
            </button>
          </>
        )}
      </div>

      {batch && (
        <div className="mt-5 space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fintech-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search preview"
                className="w-full rounded-lg border bg-[var(--app-ghost)] py-2 pl-9 pr-3 text-sm"
                style={{ borderColor: "var(--app-border)" }}
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ImportRecordStatus | "all")}
              className="rounded-lg border bg-[var(--app-ghost)] px-3 py-2 text-sm"
              style={{ borderColor: "var(--app-border)" }}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="warning">Warnings</option>
              <option value="duplicate">Duplicates</option>
              <option value="invalid">Invalid</option>
            </select>
          </div>

          <div className="max-h-96 overflow-auto rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-[var(--app-panel-strong)] text-fintech-muted">
                <tr>
                  <th className="p-3">Use</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Merchant / Source</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {previewRecords.map((record) => {
                  const checked = selectedIds.has(record.id);
                  return (
                    <tr key={record.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={record.status === "invalid"}
                          onChange={(event) => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(record.id);
                              else next.delete(record.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${STATUS_STYLES[record.status]}`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="p-3">{record.date || "-"}</td>
                      <td className="p-3 font-semibold">{record.merchant || "-"}</td>
                      <td className="p-3">{record.amount?.toFixed(2) || "-"}</td>
                      <td className="p-3">
                        {record.kind === "expense" || record.kind === "income" ? (
                          <select
                            value={record.category || ""}
                            onChange={(event) => setRecordCategory(record.id, event.target.value)}
                            className="w-full rounded-md border bg-[var(--app-ghost)] px-2 py-1"
                            style={{ borderColor: "var(--app-border)" }}
                          >
                            {categoryOptions.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                            {record.category && !categoryOptions.includes(record.category) && (
                              <option value={record.category}>{record.category}</option>
                            )}
                          </select>
                        ) : (
                          record.merchant || "-"
                        )}
                        {record.warnings.length > 0 && (
                          <div className="mt-1 flex items-start gap-1 text-[10px] text-fintech-import">
                            <XCircle size={11} className="mt-0.5 shrink-0" />
                            <span>{record.warnings.join(" ")}</span>
                          </div>
                        )}
                      </td>
                      <td className="max-w-xs truncate p-3 text-fintech-muted">{record.notes || record.raw_description || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
