import type { ExtractTransactionsResponse } from "../types";

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
};

export const extractTransactionsFromFiles = async (
  files: File[],
  targetType: "expenses" | "income",
  uid?: string
): Promise<ExtractTransactionsResponse> => {
  const fileData = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || "application/octet-stream",
      content: await readFileAsBase64(file),
    }))
  );

  const response = await fetch("/api/import/extract-transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(uid ? { "x-user-id": uid } : {}),
    },
    body: JSON.stringify({ files: fileData, targetType }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Extraction failed (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  return response.json() as Promise<ExtractTransactionsResponse>;
};

export const fileToImportRow = (
  candidate: ExtractTransactionsResponse["candidates"][number]
): unknown[] => [
  candidate.date,
  candidate.merchant,
  candidate.amount,
  candidate.category,
  candidate.notes,
];

export const buildFilePayload = (
  candidates: ExtractTransactionsResponse["candidates"]
): unknown[] =>
  candidates.map((c) => ({
    __row: fileToImportRow(c),
    __sourceId: `ocr-${c.source_file.replace(/[^a-zA-Z0-9_-]/g, "-")}-${c.date}-${c.merchant}-${c.amount}`,
    __rawDescription: `source_file:${c.source_file} | ${c.notes || ""}`,
  }));
