import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { AiChatDependencies, registerAiChatRoute } from "./src/server/aiChat.js";
import { registerPlaidRoutes } from "./src/server/plaid.js";
import { registerTellerRoutes } from "./src/server/teller.js";
import { computeUpcoming, materializeRule } from "./src/utils/recurring.js";
import { getTodayStr } from "./src/utils/dateUtils.js";

const moduleUrl = typeof import.meta !== "undefined" ? import.meta.url : undefined;
const __dirname = moduleUrl ? path.dirname(fileURLToPath(moduleUrl)) : process.cwd();
const defaultDbPath = path.join(__dirname, "vibebudget.db");

const loadEnvFiles = () => {
  const nodeEnv = process.env.NODE_ENV || "development";
  const candidates = [
    `.env.${nodeEnv}.local`,
    ".env.local",
    `.env.${nodeEnv}`,
    ".env",
  ];

  candidates.forEach((envFile) => {
    const fullPath = path.join(__dirname, envFile);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false });
    }
  });
};

loadEnvFiles();

const INITIAL_CATEGORIES = [
  "Alcohol + Weed", "Canada Investments", "Car fuel", "Car maintenance",
  "Car Parking", "Clothing", "Donation", "Electronics", "Entertainment",
  "Gifts", "Going out food", "Groceries", "Household Items",
  "India Transfer - Parents", "India Transfer Investment", "Insurance",
  "Medical", "Misc.", "Nagar/Bamor Expenses", "Public transportation",
  "Rent", "Shopping", "Telecom", "Travel", "Utilities",
];

export interface ServerOptions {
  dbPath?: string;
  db?: Database.Database;
  includeVite?: boolean;
  rootDir?: string;
  aiChatDeps?: Partial<AiChatDependencies>;
}

export const initializeDatabase = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      target_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      vendor TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER,
      notes TEXT,
      recurring_rule_id TEXT,
      is_recurring_instance INTEGER DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories (id)
    );

    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      notes TEXT,
      recurring_rule_id TEXT,
      is_recurring_instance INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
      amount REAL NOT NULL,
      vendor TEXT,
      source TEXT,
      category_id TEXT,
      category_name TEXT,
      category TEXT,
      notes TEXT,
      original_currency TEXT,
      original_amount REAL,
      day_of_month INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      start_date TEXT NOT NULL,
      end_date TEXT,
      last_generated_month TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const currentVersion = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as { v: number | null };
  const appliedVersion = currentVersion?.v ?? 0;

  if (appliedVersion < 1) {
    const hasColumn = (table: string, column: string) => {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      return columns.some((item) => item.name === column);
    };
    if (!hasColumn("transactions", "recurring_rule_id")) {
      db.exec("ALTER TABLE transactions ADD COLUMN recurring_rule_id TEXT");
    }
    if (!hasColumn("transactions", "is_recurring_instance")) {
      db.exec("ALTER TABLE transactions ADD COLUMN is_recurring_instance INTEGER DEFAULT 0");
    }
    if (!hasColumn("income", "recurring_rule_id")) {
      db.exec("ALTER TABLE income ADD COLUMN recurring_rule_id TEXT");
    }
    if (!hasColumn("income", "is_recurring_instance")) {
      db.exec("ALTER TABLE income ADD COLUMN is_recurring_instance INTEGER DEFAULT 0");
    }
    db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  }

  const categoryCount = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };
  if (categoryCount.count > 0) return;

  const insert = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, ?)");
  INITIAL_CATEGORIES.forEach((name) => insert.run(name, 0));
};

export const createDatabase = (dbPath = defaultDbPath) => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  initializeDatabase(db);
  return db;
};

export const createApp = async ({
  db = createDatabase(),
  includeVite = process.env.NODE_ENV !== "production",
  rootDir = __dirname,
  aiChatDeps = {},
}: ServerOptions = {}) => {
  const app = express();
  const getAuthenticatedUid = (req: express.Request) => {
    const headerUid = req.header("x-user-id");
    if (headerUid?.trim()) return headerUid.trim();
    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      if (token) return token;
    }
    return null;
  };
  const requireUid = (req: express.Request, res: express.Response) => {
    const uid = getAuthenticatedUid(req);
    if (!uid) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return uid;
  };
  const runRecurringGeneration = (uid: string) => {
    const today = getTodayStr();

    const rules = db.prepare("SELECT * FROM recurring_rules WHERE uid = ? AND is_active = 1").all(uid) as any[];
    let generated = 0;
    let skipped = 0;

    const insertExpense = db.prepare(
      "INSERT INTO transactions (date, vendor, amount, category_id, notes, recurring_rule_id, is_recurring_instance) VALUES (?, ?, ?, ?, ?, ?, 1)"
    );
    const insertIncome = db.prepare(
      "INSERT INTO income (date, source, amount, category, notes, recurring_rule_id, is_recurring_instance) VALUES (?, ?, ?, ?, ?, ?, 1)"
    );
    const hasExpenseInstance = db.prepare("SELECT id FROM transactions WHERE recurring_rule_id = ? AND date = ? LIMIT 1");
    const hasIncomeInstance = db.prepare("SELECT id FROM income WHERE recurring_rule_id = ? AND date = ? LIMIT 1");
    const updateRuleProgress = db.prepare("UPDATE recurring_rules SET last_generated_month = ?, updated_at = ? WHERE id = ? AND uid = ?");

    const run = db.transaction(() => {
      for (const rule of rules) {
        const occurrences = materializeRule(rule, today);
        for (const occurrence of occurrences) {
          if (rule.type === "expense") {
            const exists = hasExpenseInstance.get(rule.id, occurrence.dueDate);
            if (exists) {
              skipped += 1;
              continue;
            }
            insertExpense.run(
              occurrence.dueDate,
              rule.vendor || "Recurring expense",
              rule.amount,
              rule.category_id ? Number(rule.category_id) : null,
              rule.notes || "",
              rule.id
            );
            generated += 1;
            continue;
          }

          const exists = hasIncomeInstance.get(rule.id, occurrence.dueDate);
          if (exists) {
            skipped += 1;
            continue;
          }
          insertIncome.run(
            occurrence.dueDate,
            rule.source || "Recurring income",
            rule.amount,
            rule.category || "Recurring",
            rule.notes || "",
            rule.id
          );
          generated += 1;
        }

        const nextGeneratedMonth = occurrences.length > 0
          ? occurrences[occurrences.length - 1].month
          : rule.last_generated_month;
        updateRuleProgress.run(nextGeneratedMonth, new Date().toISOString(), rule.id, uid);
      }
    });

    run();
    return { generated, skipped };
  };

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  registerAiChatRoute(app, aiChatDeps);
  registerPlaidRoutes(app);
  registerTellerRoutes(app);

  app.get("/api/categories", (_req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY name ASC").all();
    res.json(categories);
  });

  app.post("/api/categories", (req, res) => {
    const { name, target_amount } = req.body;
    try {
      const result = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, ?)").run(name, target_amount);
      res.json({ id: result.lastInsertRowid, name, target_amount });
    } catch (err: any) {
      if (err?.code === "SQLITE_CONSTRAINT_UNIQUE" || err?.code === "SQLITE_CONSTRAINT") {
        res.status(400).json({ error: "Category already exists" });
      } else {
        throw err;
      }
    }
  });

  app.put("/api/categories/:id", (req, res) => {
    const { target_amount } = req.body;
    db.prepare("UPDATE categories SET target_amount = ? WHERE id = ?").run(target_amount, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/transactions", (_req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, c.name as category_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY date DESC
    `).all();
    res.json(transactions);
  });

  app.post("/api/transactions", (req, res) => {
    const { date, vendor, amount, category_id, notes, recurring_rule_id, is_recurring_instance } = req.body;
    const result = db
      .prepare("INSERT INTO transactions (date, vendor, amount, category_id, notes, recurring_rule_id, is_recurring_instance) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(date, vendor, amount, category_id, notes, recurring_rule_id || null, is_recurring_instance ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/transactions/:id", (req, res) => {
    const { date, vendor, amount, category_id, notes, recurring_rule_id, is_recurring_instance } = req.body;
    db.prepare("UPDATE transactions SET date = ?, vendor = ?, amount = ?, category_id = ?, notes = ?, recurring_rule_id = ?, is_recurring_instance = ? WHERE id = ?")
      .run(date, vendor, amount, category_id, notes, recurring_rule_id || null, is_recurring_instance ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/transactions/:id", (req, res) => {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/income", (_req, res) => {
    const income = db.prepare("SELECT * FROM income ORDER BY date DESC").all();
    res.json(income);
  });

  app.post("/api/income", (req, res) => {
    const { date, source, amount, category, notes, recurring_rule_id, is_recurring_instance } = req.body;
    const result = db
      .prepare("INSERT INTO income (date, source, amount, category, notes, recurring_rule_id, is_recurring_instance) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(date, source, amount, category, notes, recurring_rule_id || null, is_recurring_instance ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/income/:id", (req, res) => {
    const { date, source, amount, category, notes, recurring_rule_id, is_recurring_instance } = req.body;
    db.prepare("UPDATE income SET date = ?, source = ?, amount = ?, category = ?, notes = ?, recurring_rule_id = ?, is_recurring_instance = ? WHERE id = ?")
      .run(date, source, amount, category, notes, recurring_rule_id || null, is_recurring_instance ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/recurring/rules", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;

    const now = new Date().toISOString();
    const {
      type,
      amount,
      vendor,
      source,
      category_id,
      category_name,
      category,
      notes,
      original_currency,
      original_amount,
      day_of_month,
      start_date,
      end_date,
      last_generated_month,
      is_active,
      id,
    } = req.body || {};
    const ruleId = id || crypto.randomUUID();

    db.prepare(`
      INSERT INTO recurring_rules (
        id, uid, type, amount, vendor, source, category_id, category_name, category, notes,
        original_currency, original_amount, day_of_month, frequency, start_date, end_date,
        last_generated_month, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'monthly', ?, ?, ?, ?, ?, ?)
    `).run(
      ruleId,
      uid,
      type,
      amount,
      vendor || null,
      source || null,
      category_id || null,
      category_name || null,
      category || null,
      notes || null,
      original_currency || null,
      original_amount ?? null,
      Math.min(28, Math.max(1, Number(day_of_month || 1))),
      start_date,
      end_date || null,
      last_generated_month || start_date?.slice(0, 7),
      is_active === false ? 0 : 1,
      now,
      now
    );
    res.json({ id: ruleId });
  });

  app.post("/api/recurring/generate", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;
    res.json(runRecurringGeneration(uid));
  });

  app.get("/api/recurring/upcoming", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;

    const today = getTodayStr();
    const daysRaw = Number(req.query.days);
    const days = Number.isFinite(daysRaw) ? daysRaw : 30;
    const cappedDays = Math.max(1, Math.min(90, Math.trunc(days)));
    const rules = db.prepare("SELECT * FROM recurring_rules WHERE uid = ? AND is_active = 1").all(uid) as any[];
    const upcoming = computeUpcoming(rules, today, cappedDays);
    res.json({ upcoming });
  });

  app.patch("/api/recurring/:ruleId", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;
    const { ruleId } = req.params;
    const updates = req.body || {};
    const existing = db.prepare("SELECT * FROM recurring_rules WHERE id = ? AND uid = ?").get(ruleId, uid) as any;
    if (!existing) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }

    const next = {
      ...existing,
      is_active: typeof updates.is_active === "boolean" ? (updates.is_active ? 1 : 0) : existing.is_active,
      end_date: updates.end_date === null ? null : (updates.end_date || existing.end_date),
      amount: typeof updates.amount === "number" ? updates.amount : existing.amount,
      notes: typeof updates.notes === "string" ? updates.notes : existing.notes,
      updated_at: new Date().toISOString(),
    };

    db.prepare("UPDATE recurring_rules SET is_active = ?, end_date = ?, amount = ?, notes = ?, updated_at = ? WHERE id = ? AND uid = ?")
      .run(next.is_active, next.end_date, next.amount, next.notes, next.updated_at, ruleId, uid);
    res.json({ success: true });
  });

  app.delete("/api/recurring/:ruleId", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;
    const { ruleId } = req.params;
    db.prepare("UPDATE recurring_rules SET is_active = 0, end_date = ?, updated_at = ? WHERE id = ? AND uid = ?")
      .run(getTodayStr(), new Date().toISOString(), ruleId, uid);
    res.json({ success: true });
  });

  app.post("/api/cron/recurring", (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;
    res.json(runRecurringGeneration(uid));
  });

  app.delete("/api/income/:id", (req, res) => {
    db.prepare("DELETE FROM income WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/wipe", (req, res) => {
    const { type } = req.body;
    if (type === "expenses") db.prepare("DELETE FROM transactions").run();
    if (type === "income") db.prepare("DELETE FROM income").run();
    if (type === "categories") {
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM categories").run();
    }
    if (type === "targets") db.prepare("UPDATE categories SET target_amount = 0").run();
    res.json({ success: true });
  });

  app.post("/api/import/targets", (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const update = db.prepare("UPDATE categories SET target_amount = ? WHERE name = ?");
    const insert = db.prepare("INSERT OR IGNORE INTO categories (name, target_amount) VALUES (?, ?)");

    try {
      const transaction = db.transaction((rows: any[][]) => {
        for (const row of rows) {
          const [name, target] = row;
          if (!name) continue;
          const result = update.run(target || 0, name);
          if (result.changes === 0) insert.run(name, target || 0);
        }
      });

      transaction(data);
      return res.json({ success: true });
    } catch (error) {
      console.error("Target import error:", error);
      return res.status(500).json({ error: "Failed to import targets" });
    }
  });

  app.post("/api/import/income", (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const insert = db.prepare("INSERT INTO income (date, source, amount, category, notes) VALUES (?, ?, ?, ?, ?)");

    try {
      const transaction = db.transaction((rows: any[][]) => {
        for (const row of rows) {
          const [date, source, amount, category, notes] = row;
          insert.run(date, source, amount, category, notes);
        }
      });

      transaction(data);
      return res.json({ success: true });
    } catch (error) {
      console.error("Income import error:", error);
      return res.status(500).json({ error: "Failed to import income" });
    }
  });

  app.post("/api/import/extract-transactions", async (req, res) => {
    const uid = requireUid(req, res);
    if (!uid) return;
    void uid;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY server configuration." });
    }

    const { files, targetType } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "`files` must be a non-empty array." });
    }
    if (files.length > 20) {
      return res.status(400).json({ error: "Maximum 20 files per request." });
    }

    const candidates: Array<{
      date: string;
      merchant: string;
      amount: number;
      category: string;
      notes: string;
      confidence: number;
      warnings: string[];
      source_file: string;
      page?: number;
    }> = [];
    const errors: Array<{ file: string; error: string }> = [];
    const totalPages = files.reduce((sum, f) => sum + (f.type === "application/pdf" ? 10 : 1), 0);
    if (totalPages > 50) {
      return res.status(400).json({ error: `Estimated pages (${totalPages}) exceeds maximum of 50. Please split into smaller batches.` });
    }

    const typeHint = targetType === "income" ? "income" : "expense";
    const receiptModeHint = targetType === "income"
      ? "Each file typically represents one income document (pay stub, invoice). Aggregate line items into one row."
      : "For receipt/invoice images: aggregate line items into one transaction row with total amount; include key line-item details in notes.";

    for (const file of files) {
      try {
        const mimeType = file.type || "image/png";
        const isPdf = mimeType === "application/pdf";
        const fileSize = (file.content?.length || 0) * 0.75;
        if (fileSize > 20 * 1024 * 1024) {
          errors.push({ file: file.name, error: "File exceeds 20 MB limit." });
          continue;
        }

        const canonicalCategories = INITIAL_CATEGORIES.map((c) => `"${c}"`).join(", ");
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
          `Date format: YYYY-MM-DD. Amount: positive number. If amount is absolute value (ignore +/- signs).`,
        ].join("\n");

        const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
          { text: prompt },
        ];

        if (isPdf) {
          parts.push({ inline_data: { mime_type: "application/pdf", data: file.content } });
        } else {
          parts.push({ inline_data: { mime_type: mimeType, data: file.content } });
        }

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.05,
                maxOutputTokens: 8192,
              },
            }),
          }
        );

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text().catch(() => "");
          errors.push({ file: file.name, error: `Gemini API error (${geminiResponse.status}): ${errorText.slice(0, 500)}` });
          continue;
        }

        const geminiData = await geminiResponse.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
          promptFeedback?: { blockReason?: string };
        };

        if (geminiData.promptFeedback?.blockReason) {
          errors.push({ file: file.name, error: `Content blocked: ${geminiData.promptFeedback.blockReason}` });
          continue;
        }

        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!responseText) {
          errors.push({ file: file.name, error: "Gemini returned empty response." });
          continue;
        }

        let parsed: Array<Record<string, unknown>>;
        try {
          const cleaned = responseText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
          parsed = JSON.parse(cleaned);
          if (!Array.isArray(parsed)) {
            throw new Error("Response is not an array");
          }
        } catch {
          errors.push({ file: file.name, error: "Failed to parse Gemini response as JSON array." });
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
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({ file: file.name, error: message });
      }
    }

    return res.json({
      candidates,
      errors,
      summary: {
        filesProcessed: files.length,
        filesFailed: errors.length,
        totalCandidates: candidates.length,
      },
    } satisfies import("./src/types.js").ExtractTransactionsResponse);
  });

  app.post("/api/import/expenses", (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const getCategory = db.prepare("SELECT id FROM categories WHERE name = ?");
    const insertCategory = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, 0)");
    const insertExpense = db.prepare("INSERT INTO transactions (date, vendor, amount, category_id, notes) VALUES (?, ?, ?, ?, ?)");

    try {
      const transaction = db.transaction((rows: any[][]) => {
        for (const row of rows) {
          const [date, vendor, amount, categoryName, notes] = row;
          let category = getCategory.get(categoryName) as { id: number } | undefined;

          if (!category) {
            const result = insertCategory.run(categoryName);
            category = { id: Number(result.lastInsertRowid) };
          }

          insertExpense.run(date, vendor, amount, category.id, notes);
        }
      });

      transaction(data);
      return res.json({ success: true });
    } catch (error) {
      console.error("Expense import error:", error);
      return res.status(500).json({ error: "Failed to import expenses" });
    }
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Global error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  });

  if (includeVite) {
    const react = (await import("@vitejs/plugin-react")).default;
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    const vite = await createViteServer({
      configFile: false,
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": path.resolve(rootDir, "."),
        },
      },
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(rootDir, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(rootDir, "dist", "index.html"));
    });
  }

  return { app, db };
};

export const startServer = async (options: ServerOptions = {}) => {
  const port = Number(process.env.PORT || 3000);
  const { app, db } = await createApp(options);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return { app, db, server };
};

const isMainModule = moduleUrl
  ? process.argv[1] === fileURLToPath(moduleUrl)
  : true;

if (isMainModule) {
  startServer();
}
