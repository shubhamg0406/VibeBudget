import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AiClientError, callAiOcr } from "../../src/server/aiClient.js";
import type { AiProviderConfig, ExtractTransactionsResponse } from "../../src/types.js";

const INITIAL_CATEGORIES = [
  "Housing",
  "Transportation",
  "Food",
  "Utilities",
  "Insurance",
  "Healthcare",
  "Savings",
  "Personal",
  "Entertainment",
  "Debt",
];

interface UploadedFile {
  name: string;
  type?: string;
  content?: string;
}

const resolveAiConfig = (rawAiConfig: unknown): AiProviderConfig | null => {
  if (rawAiConfig && typeof rawAiConfig === "object") {
    const config = rawAiConfig as Partial<AiProviderConfig>;
    if ((config.provider === "gemini" || config.provider === "deepseek") && config.model && config.apiKey) {
      return {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
      };
    }
  }

  if (!process.env.GEMINI_API_KEY) return null;

  return {
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const uid = req.headers["x-user-id"];
  if (!uid || Array.isArray(uid)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { files, targetType, aiConfig: rawAiConfig } = req.body || {};
  const aiConfig = resolveAiConfig(rawAiConfig);

  if (!aiConfig) {
    return res.status(500).json({ error: "Missing AI configuration. Configure an AI provider in Settings or set GEMINI_API_KEY server env." });
  }
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "`files` must be a non-empty array." });
  }
  if (files.length > 20) {
    return res.status(400).json({ error: "Maximum 20 files per request." });
  }

  const uploadedFiles = files as UploadedFile[];
  const candidates: ExtractTransactionsResponse["candidates"] = [];
  const errors: ExtractTransactionsResponse["errors"] = [];
  const totalPages = uploadedFiles.reduce((sum, file) => sum + (file.type === "application/pdf" ? 10 : 1), 0);

  if (totalPages > 50) {
    return res.status(400).json({ error: `Estimated pages (${totalPages}) exceeds maximum of 50. Please split into smaller batches.` });
  }

  const typeHint = targetType === "income" ? "income" : "expense";
  const receiptModeHint = targetType === "income"
    ? "Each file typically represents one income document (pay stub, invoice). Aggregate line items into one row."
    : "For receipt/invoice images: aggregate line items into one transaction row with total amount; include key line-item details in notes.";
  const providerLabel = aiConfig.provider === "gemini" ? "Gemini" : "DeepSeek";
  const canonicalCategories = INITIAL_CATEGORIES.map((category) => `"${category}"`).join(", ");

  for (const file of uploadedFiles) {
    try {
      const mimeType = file.type || "image/png";
      const isPdf = mimeType === "application/pdf";
      const fileSize = (file.content?.length || 0) * 0.75;

      if (!file.name || !file.content) {
        errors.push({ file: file.name || "unknown", error: "File name and content are required." });
        continue;
      }
      if (fileSize > 20 * 1024 * 1024) {
        errors.push({ file: file.name, error: "File exceeds 20 MB limit." });
        continue;
      }

      const prompt = [
        "You are a financial document OCR assistant. Extract all transactions from the provided document.",
        "Return ONLY valid JSON with NO markdown formatting, NO code fences, NO explanation.",
        "The JSON must be an array of objects with these fields:",
        "- date (string, YYYY-MM-DD format, use today if not visible)",
        "- merchant (string, vendor/payee name)",
        "- amount (number, positive value)",
        `- category (string, MUST be one of: ${canonicalCategories}. Pick the closest match.)`,
        "- notes (string, additional context or line-item details)",
        "- confidence (number, 0.0 to 1.0 how confident you are in the extraction)",
        "- warnings (array of strings, any issues like blurry text, missing fields, uncertain values)",
        "",
        `This document is for ${typeHint} tracking.`,
        receiptModeHint,
        "",
        "If the document is a bank or credit card statement with multiple transactions, extract ALL of them.",
        "If the document is unreadable or contains no financial data, return an empty array [].",
        "Date format: YYYY-MM-DD. Amount: positive number. If amount is absolute value (ignore +/- signs).",
      ].join("\n");

      const responseText = await callAiOcr(
        aiConfig,
        file.content,
        isPdf ? "application/pdf" : mimeType,
        prompt,
      );

      let parsed: Array<Record<string, unknown>>;
      try {
        const cleaned = responseText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) {
          throw new Error("Response is not an array");
        }
      } catch {
        errors.push({ file: file.name, error: `Failed to parse ${providerLabel} response as JSON array.` });
        continue;
      }

      if (parsed.length === 0) {
        errors.push({ file: file.name, error: "No transactions found in document." });
        continue;
      }

      for (const item of parsed) {
        candidates.push({
          date: String(item.date || ""),
          merchant: String(item.merchant || ""),
          amount: typeof item.amount === "number" ? item.amount : Number(item.amount) || 0,
          category: String(item.category || ""),
          notes: String(item.notes || ""),
          confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
          warnings: Array.isArray(item.warnings) ? item.warnings.map(String) : [],
          source_file: file.name,
        });
      }
    } catch (error) {
      const message = error instanceof AiClientError
        ? error.message
        : error instanceof Error ? error.message : "Unknown error";
      errors.push({ file: file.name || "unknown", error: message });
    }
  }

  return res.json({
    candidates,
    errors,
    summary: {
      filesProcessed: uploadedFiles.length,
      filesFailed: errors.length,
      totalCandidates: candidates.length,
    },
  } satisfies ExtractTransactionsResponse);
}
