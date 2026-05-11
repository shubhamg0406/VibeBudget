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
import { auth, firebaseDataNamespace, getStoredFirebaseConfig, getEnvFirebaseConfig } from "../firebase";
import { extractTransactionsFromFiles, buildFilePayload } from "../utils/documentExtraction";

interface BulkAddModalProps {
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  onClose: () => void;
  onRefresh: () => void;
}

interface OcrMeta {
  pre_tax_amount?: number;
  tax_amount?: number;
  taxable?: boolean;
  receipt_tax_total?: number;
  receipt_subtotal?: number;
  source_file?: string;
  page?: number;
}

interface EditableRowValues {
  preTaxAmount: number;
  taxPercent: number;
  finalAmount: number;
  notes: string;
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
  const { user, previewImport, aiConfig, refreshTransactionsNow } = useFirebase();
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
  const [editableRows, setEditableRows] = useState<Record<string, EditableRowValues>>({});
  const [receiptDate, setReceiptDate] = useState("");

  const getSourceFileFromRawDescription = (value?: string) => {
    if (!value?.startsWith("source_file:")) return "";
    return value.split("|")[0].replace("source_file:", "").trim();
  };

  const mergeRecordStatus = (statuses: ImportRecordStatus[]): ImportRecordStatus => {
    if (statuses.some((status) => status === "invalid")) return "invalid";
    if (statuses.some((status) => status === "warning")) return "warning";
    if (statuses.every((status) => status === "duplicate")) return "duplicate";
    if (statuses.some((status) => status === "new")) return "new";
    return "warning";
  };

  const consolidateForCommit = (input: ImportBatch): ImportBatch => {
    const groups = new Map<string, ImportRecord[]>();
    const passthrough: ImportRecord[] = [];

    input.records.forEach((record) => {
      if (record.kind !== "expense" && record.kind !== "income") {
        passthrough.push(record);
        return;
      }

      const sourceFile = getSourceFileFromRawDescription(record.raw_description);
      const key = [
        record.kind,
        sourceFile || "",
        record.date || "",
        (record.merchant || "").toLowerCase(),
        (record.category || "").toLowerCase(),
      ].join("|");

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(record);
    });

    const consolidated: ImportRecord[] = [];
    groups.forEach((records, key) => {
      if (records.length === 1) {
        consolidated.push(records[0]);
        return;
      }

      const first = records[0];
      const notes = Array.from(new Set(records.map((item) => (item.notes || "").trim()).filter(Boolean))).join("; ");
      const warnings = Array.from(new Set(records.flatMap((item) => item.warnings)));
      const amount = records.reduce((sum, item) => sum + (item.amount || 0), 0);
      const status = mergeRecordStatus(records.map((item) => item.status));
      const confidence = records.reduce((sum, item) => sum + item.confidence, 0) / records.length;
      const sourceId = `${first.source}-group-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`.slice(0, 160);

      consolidated.push({
        ...first,
        id: `${first.source}-consolidated-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        source_id: sourceId,
        amount: Number(amount.toFixed(2)),
        notes: notes || first.notes || "",
        warnings,
        status,
        confidence,
      });
    });

    const nextRecords = [...consolidated, ...passthrough];
    return {
      ...input,
      records: nextRecords,
      summary: {
        total: nextRecords.length,
        new: nextRecords.filter((r) => r.status === "new").length,
        duplicate: nextRecords.filter((r) => r.status === "duplicate").length,
        warning: nextRecords.filter((r) => r.status === "warning").length,
        invalid: nextRecords.filter((r) => r.status === "invalid").length,
      },
    };
  };

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

  const setRecordNotes = (recordId: string, notes: string) => {
    setEditableRows((current) => {
      const existing = current[recordId];
      if (!existing) return current;
      return {
        ...current,
        [recordId]: {
          ...existing,
          notes,
        },
      };
    });
    setBatch((current) => {
      if (!current) return current;
      const records = current.records.map((record) => (
        record.id === recordId
          ? { ...record, notes }
          : record
      ));
      return { ...current, records };
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
    setEditableRows({});
    setReceiptDate("");
    setMessage(null);
  };

  const initializeEditableRows = (records: ImportRecord[]) => {
    const next: Record<string, EditableRowValues> = {};
    records.forEach((record) => {
      const raw = record.raw_payload && typeof record.raw_payload === "object"
        ? record.raw_payload as { __meta?: OcrMeta }
        : undefined;
      const meta = raw?.__meta;
      const preTaxAmount = Number((meta?.pre_tax_amount ?? record.amount ?? 0).toFixed(2));
      const taxAmount = Number((meta?.tax_amount ?? Math.max(0, (record.amount ?? 0) - preTaxAmount)).toFixed(2));
      const taxPercent = preTaxAmount > 0 ? Number(((taxAmount / preTaxAmount) * 100).toFixed(2)) : 0;
      const finalAmount = Number((preTaxAmount + taxAmount).toFixed(2));
      next[record.id] = {
        preTaxAmount,
        taxPercent,
        finalAmount,
        notes: record.notes || "",
      };
    });
    setEditableRows(next);
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
      initializeEditableRows(nextBatch.records);
      setSelectedIds(new Set(
        nextBatch.records
          .filter((r) => r.status !== "invalid" && r.status !== "duplicate")
          .map((r) => r.id)
      ));

      const parts: string[] = [
        `${nextBatch.summary.total} transaction(s) extracted from ${result.summary.filesProcessed} file(s).`,
      ];
      const firstRecordDate = nextBatch.records.find((record) => record.date)?.date || "";
      setReceiptDate(firstRecordDate);
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

  const setRecordTaxPercent = (recordId: string, taxPercent: number) => {
    setEditableRows((current) => {
      const existing = current[recordId];
      if (!existing) return current;
      const clamped = Number.isFinite(taxPercent) ? Math.max(0, taxPercent) : 0;
      const taxAmount = Number((existing.preTaxAmount * (clamped / 100)).toFixed(2));
      const finalAmount = Number((existing.preTaxAmount + taxAmount).toFixed(2));
      return {
        ...current,
        [recordId]: {
          ...existing,
          taxPercent: clamped,
          finalAmount,
        },
      };
    });
  };

  const buildCommitBatch = (mode: "individual" | "category"): ImportBatch | null => {
    if (!batch) return null;
    const selected = batch.records.filter((record) => selectedCommitIds.includes(record.id));
    if (selected.length === 0) return null;
    const prepared = selected.map((record) => {
      const edit = editableRows[record.id];
      const finalDate = receiptDate || record.date;
      if (!edit) {
        return {
          ...record,
          date: finalDate,
        } satisfies ImportRecord;
      }
      return {
        ...record,
        date: finalDate,
        amount: edit.finalAmount,
        notes: edit.notes,
      } satisfies ImportRecord;
    });
    if (mode === "individual") {
      return { ...batch, records: prepared };
    }
    const consolidated = consolidateForCommit({ ...batch, records: prepared });
    if (consolidated.records.length === 0) return null;
    return consolidated;
  };

  const handleCommit = async (mode: "individual" | "category") => {
    if (!batch) return;
    if (selectedCommitIds.length === 0) {
      setMessage("Select at least one row to commit.");
      return;
    }
    setMessage(mode === "category" ? "Preparing category-wise commit..." : "Preparing individual commit...");
    const commitBatch = buildCommitBatch(mode);
    if (!commitBatch) {
      setMessage("No valid rows available for this commit mode.");
      return;
    }
    setCommitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Missing Firebase session token. Please sign in again.");
      }
      const rows = commitBatch.records
        .filter((record) => record.kind === "expense")
        .map((record) => ({
          date: record.date,
          merchant: record.merchant,
          category: record.category,
          notes: record.notes,
          amount: record.amount,
        }));
      const response = await fetch("/api/import/commit-ocr", {
        // Send exact active Firebase target so server writes to the same dataset the UI reads from.
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-firebase-project-id": getStoredFirebaseConfig()?.projectId || getEnvFirebaseConfig()?.projectId || "",
          "x-firebase-namespace": firebaseDataNamespace || "prod",
          "x-firebase-database-id": getStoredFirebaseConfig()?.firestoreDatabaseId || getEnvFirebaseConfig()?.firestoreDatabaseId || "(default)",
        },
        body: JSON.stringify({ mode, rows, includeDuplicates }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Commit OCR failed (${response.status}).`);
      }
      const summary = {
        imported: Number(payload?.imported || 0),
        skipped: 0,
        invalid: 0,
      };
      await refreshTransactionsNow();
      const committedDates = rows
        .map((row) => String(row.date || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        .sort();
      if (committedDates.length > 0) {
        window.dispatchEvent(new CustomEvent("vibebudget:focus-date-range", {
          detail: {
            start: committedDates[0],
            end: committedDates[committedDates.length - 1],
          },
        }));
      }
      const historyEntry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actionType: "import_document_ocr" as const,
        label: `OCR Import (${mode === "individual" ? "individual" : "category-wise"}, ${files.length} file(s))`,
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
      setMessage(`${summary.imported} transaction(s) imported. ${summary.skipped} skipped.`);
      if (summary.imported > 0) {
        setTimeout(() => {
          resetAll();
          onRefresh();
        }, 300);
      }
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
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--app-panel-strong)] text-fintech-muted">
                    <tr>
                      <th className="p-3">Use</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">File</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Merchant</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Tax %</th>
                      <th className="p-3">Final</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRecords.map((record) => {
                      const checked = selectedIds.has(record.id);
                      const isFirstRow = previewRecords[0]?.id === record.id;
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
                          <td className="p-3">
                            {isFirstRow ? (
                              <input
                                type="date"
                                value={receiptDate}
                                onChange={(e) => setReceiptDate(e.target.value)}
                                className="w-[145px] rounded-md border bg-[var(--app-ghost)] px-2 py-1 text-xs text-[var(--app-text)]"
                                style={{ borderColor: "var(--app-border)" }}
                              />
                            ) : (
                              <input
                                type="date"
                                value={receiptDate || record.date || ""}
                                readOnly
                                disabled
                                className="w-[145px] cursor-not-allowed rounded-md border bg-[var(--app-ghost)] px-2 py-1 text-xs text-fintech-muted opacity-80"
                                style={{ borderColor: "var(--app-border)" }}
                              />
                            )}
                          </td>
                          <td className="p-3 font-semibold">{record.merchant || "-"}</td>
                          <td className="p-3">{editableRows[record.id]?.preTaxAmount.toFixed(2) || record.amount?.toFixed(2) || "-"}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={editableRows[record.id]?.taxPercent ?? 0}
                              onChange={(e) => setRecordTaxPercent(record.id, Number(e.target.value))}
                              className="w-24 rounded-md border bg-[var(--app-ghost)] px-2 py-1 text-xs text-[var(--app-text)]"
                              style={{ borderColor: "var(--app-border)" }}
                            />
                          </td>
                          <td className="p-3 font-semibold">{editableRows[record.id]?.finalAmount.toFixed(2) || record.amount?.toFixed(2) || "-"}</td>
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
                          <td className="p-3">
                            <textarea
                              value={record.notes || ""}
                              onChange={(e) => setRecordNotes(record.id, e.target.value)}
                              placeholder="Edit note"
                              rows={2}
                              className="w-full min-w-[220px] resize-y rounded-md border bg-[var(--app-ghost)] px-2 py-1 text-xs text-[var(--app-text)] outline-none focus:border-fintech-accent focus:ring-1 focus:ring-fintech-accent/40"
                              style={{ borderColor: "var(--app-border)" }}
                            />
                          </td>
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCommit("individual")}
                    disabled={committing || selectedCommitIds.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-fintech-accent px-4 py-2.5 text-sm font-bold text-[#002919] disabled:opacity-50"
                  >
                    {committing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {committing ? "Committing..." : `Add Individual Items (${selectedCommitIds.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCommit("category")}
                    disabled={committing || selectedCommitIds.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-fintech-accent bg-transparent px-4 py-2.5 text-sm font-bold text-fintech-accent disabled:opacity-50"
                  >
                    {committing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {committing ? "Committing..." : "Add Category wise Items"}
                  </button>
                </div>
              </div>

              {(() => {
                const rows = previewRecords.filter((record) => selectedCommitIds.includes(record.id));
                if (rows.length === 0) return null;
                const expected = rows.reduce((sum, record) => {
                  const raw = record.raw_payload && typeof record.raw_payload === "object"
                    ? record.raw_payload as { __meta?: OcrMeta }
                    : undefined;
                  const meta = raw?.__meta;
                  if (typeof meta?.receipt_subtotal === "number" || typeof meta?.receipt_tax_total === "number") {
                    return sum + (meta.receipt_subtotal || 0) + (meta.receipt_tax_total || 0);
                  }
                  return sum;
                }, 0);
                const calculated = rows.reduce((sum, record) => sum + (editableRows[record.id]?.finalAmount || record.amount || 0), 0);
                const hasExpected = expected > 0;
                const diff = Number((calculated - expected).toFixed(2));
                return (
                  <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <span className="font-semibold">Totals:</span>{" "}
                    Calculated {calculated.toFixed(2)}
                    {hasExpected ? ` | Receipt ${expected.toFixed(2)} | Diff ${diff.toFixed(2)}` : " | Receipt total not provided by OCR"}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
