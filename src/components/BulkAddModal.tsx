import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Image,
  Loader2,
  Search,
  Upload,
  X,
  XCircle,
  FileWarning,
  AlertTriangle,
} from "lucide-react";
import type {
  ExpenseCategory,
  ImportBatch,
  ImportRecord,
  ImportRecordStatus,
  IncomeCategory,
  ExtractTransactionsResponse,
} from "../types";
import { useFirebase } from "../contexts/FirebaseContext";
import { extractTransactionsFromFiles, buildFilePayload } from "../utils/documentExtraction";

interface BulkAddModalProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_STYLES: Record<ImportRecordStatus, string> = {
  new: "bg-fintech-accent/10 text-fintech-accent",
  duplicate: "bg-[var(--app-ghost)] text-fintech-muted",
  warning: "bg-fintech-import/10 text-fintech-import",
  invalid: "bg-fintech-danger/10 text-fintech-danger",
};

export const BulkAddModal: React.FC<BulkAddModalProps> = ({
  expenseCategories,
  incomeCategories,
  onClose,
  onRefresh,
}) => {
  const { user, previewImport, commitImport, aiConfig } = useFirebase();
  const [files, setFiles] = useState<File[]>([]);
  const [targetType, setTargetType] = useState<"expenses" | "income">("expenses");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractTransactionsResponse | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ImportRecordStatus | "all">("all");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categoryOptions = targetType === "income"
    ? incomeCategories.map((c) => c.name)
    : expenseCategories.map((c) => c.name);

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
        const warnings = record.warnings.filter((w) => !w.includes("Unknown expense category"));
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
          new: records.filter((r) => r.status === "new").length,
          duplicate: records.filter((r) => r.status === "duplicate").length,
          warning: records.filter((r) => r.status === "warning").length,
          invalid: records.filter((r) => r.status === "invalid").length,
        },
      };
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    setBatch(null);
    setExtractResult(null);
    setMessage(null);
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setBatch(null);
    setExtractResult(null);
    setMessage(null);
  };

  const resetAll = () => {
    setFiles([]);
    setExtractResult(null);
    setBatch(null);
    setSearch("");
    setStatusFilter("all");
    setSelectedIds(new Set());
    setMessage(null);
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setMessage(null);
    setExtractResult(null);
    setBatch(null);

    try {
      const result = await extractTransactionsFromFiles(files, targetType, user?.uid, aiConfig);
      setExtractResult(result);

      if (result.candidates.length === 0) {
        setMessage(`No transactions extracted. ${result.errors.length} file(s) had errors.`);
        return;
      }

      const payload = buildFilePayload(result.candidates);
      const nextBatch = previewImport("document_ocr", payload, { type: targetType });
      setBatch(nextBatch);
      setSelectedIds(new Set(
        nextBatch.records
          .filter((r) => r.status !== "invalid" && r.status !== "duplicate")
          .map((r) => r.id)
      ));

      const parts: string[] = [
        `${nextBatch.summary.total} transaction(s) extracted from ${result.summary.filesProcessed} file(s).`,
      ];
      if (nextBatch.summary.invalid > 0) parts.push(`${nextBatch.summary.invalid} invalid.`);
      if (nextBatch.summary.duplicate > 0) parts.push(`${nextBatch.summary.duplicate} duplicates.`);
      if (result.errors.length > 0) parts.push(`${result.errors.length} file(s) had errors.`);
      setMessage(parts.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const handleCommit = async () => {
    if (!batch) return;
    setCommitting(true);
    try {
      const summary = await commitImport(batch, {
        includeDuplicates,
        recordIds: selectedCommitIds,
      });
      const historyEntry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actionType: "import_document_ocr" as const,
        label: `OCR Import (${files.length} file(s))`,
        status: "Completed" as const,
        message: `${summary.imported} rows imported. ${summary.skipped} skipped.`,
        scope: targetType,
        imported: summary.imported,
        skipped: summary.skipped,
        invalid: summary.invalid,
      };
      try {
        const raw = localStorage.getItem("impex_history_v1");
        const existing = raw ? JSON.parse(raw) : [];
        localStorage.setItem("impex_history_v1", JSON.stringify([historyEntry, ...existing].slice(0, 25)));
      } catch {}
      resetAll();
      setMessage(`${summary.imported} transaction(s) imported. ${summary.skipped} skipped.`);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-[var(--app-panel)] shadow-2xl"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--app-border)" }}>
          <h3 className="text-base font-bold">Bulk Add from Files</h3>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fintech-muted transition-colors hover:bg-[var(--app-ghost)] hover:text-[var(--app-text)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {message && (
            <div className="rounded-lg bg-[var(--app-ghost)] px-4 py-3 text-sm text-fintech-muted">{message}</div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-fintech-muted">Target</span>
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as "expenses" | "income");
                    setBatch(null);
                    setExtractResult(null);
                  }}
                  className="w-full min-w-[140px] rounded-lg border bg-[var(--app-ghost)] px-3 py-2.5 text-sm"
                  style={{ borderColor: "var(--app-border)" }}
                  disabled={extracting}
                >
                  <option value="expenses">Expenses</option>
                  <option value="income">Income</option>
                </select>
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-[var(--app-ghost)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--app-ghost-strong)]" style={{ borderColor: "var(--app-border)" }}>
                <Upload size={16} />
                {files.length > 0 ? `${files.length} file(s) selected` : "Choose files"}
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={extracting}
                />
              </label>

              {files.length > 0 && (
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="inline-flex items-center gap-2 rounded-lg bg-fintech-accent px-4 py-2.5 text-sm font-bold text-[#002919] disabled:opacity-50"
                >
                  {extracting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {extracting ? "Extracting..." : "Extract & Preview"}
                </button>
              )}
            </div>

            {files.length > 0 && (
              <button
                onClick={resetAll}
                className="text-[11px] font-bold uppercase tracking-widest text-fintech-muted hover:text-fintech-accent"
              >
                Clear all
              </button>
            )}
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="inline-flex items-center gap-2 rounded-lg border bg-[var(--app-ghost)] px-3 py-1.5 text-xs"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {file.type === "application/pdf" ? <FileText size={14} /> : <Image size={14} />}
                  <span className="max-w-[200px] truncate">{file.name}</span>
                  <button onClick={() => removeFile(index)} className="text-fintech-muted hover:text-fintech-danger">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {extractResult && extractResult.errors.length > 0 && (
            <div className="rounded-lg border border-fintech-danger/30 bg-fintech-danger/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-fintech-danger">
                <AlertTriangle size={16} />
                File errors ({extractResult.errors.length})
              </div>
              <ul className="mt-2 space-y-1 text-xs text-fintech-muted">
                {extractResult.errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <FileWarning size={13} className="mt-0.5 shrink-0 text-fintech-danger" />
                    <span><strong>{err.file}:</strong> {err.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {batch && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fintech-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search preview"
                    className="w-full rounded-lg border bg-[var(--app-ghost)] py-2 pl-9 pr-3 text-sm"
                    style={{ borderColor: "var(--app-border)" }}
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ImportRecordStatus | "all")}
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

              <div className="max-h-80 overflow-auto rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
                <table className="w-full min-w-[800px] text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--app-panel-strong)] text-fintech-muted">
                    <tr>
                      <th className="p-3">Use</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">File</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Merchant</th>
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
                              onChange={(e) => {
                                setSelectedIds((current) => {
                                  const next = new Set(current);
                                  if (e.target.checked) next.add(record.id);
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
                          <td className="max-w-[120px] truncate p-3 text-fintech-muted" title={record.raw_description?.startsWith("source_file:") ? record.raw_description.split("|")[0].replace("source_file:", "") : ""}>
                            {record.raw_description?.startsWith("source_file:") ? record.raw_description.split("|")[0].replace("source_file:", "") : "-"}
                          </td>
                          <td className="p-3">{record.date || "-"}</td>
                          <td className="p-3 font-semibold">{record.merchant || "-"}</td>
                          <td className="p-3">{record.amount?.toFixed(2) || "-"}</td>
                          <td className="p-3">
                            <select
                              value={record.category || ""}
                              onChange={(e) => setRecordCategory(record.id, e.target.value)}
                              className="w-full rounded-md border bg-[var(--app-ghost)] px-2 py-1 text-xs"
                              style={{ borderColor: "var(--app-border)" }}
                            >
                              {categoryOptions.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                              {record.category && !categoryOptions.includes(record.category) && (
                                <option value={record.category}>{record.category}</option>
                              )}
                            </select>
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

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-fintech-muted">
                    <input
                      type="checkbox"
                      checked={includeDuplicates}
                      onChange={(e) => setIncludeDuplicates(e.target.checked)}
                    />
                    Include duplicates
                  </label>
                  <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider text-fintech-muted">
                    <span className="text-fintech-accent">{batch.summary.new} new</span>
                    {batch.summary.duplicate > 0 && <span>{batch.summary.duplicate} dup</span>}
                    {batch.summary.warning > 0 && <span className="text-fintech-import">{batch.summary.warning} warn</span>}
                    {batch.summary.invalid > 0 && <span className="text-fintech-danger">{batch.summary.invalid} invalid</span>}
                  </div>
                </div>
                <button
                  onClick={() => void handleCommit()}
                  disabled={committing || selectedCommitIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-fintech-accent px-5 py-2.5 text-sm font-bold text-[#002919] disabled:opacity-50"
                >
                  {committing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {committing ? "Committing..." : `Commit ${selectedCommitIds.length}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
