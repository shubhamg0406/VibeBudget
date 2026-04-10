import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "vibebudget.db");
const db = new Database(dbPath);

// Initialize Database
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
    FOREIGN KEY (category_id) REFERENCES categories (id)
  );

  CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    notes TEXT
  );
`);

// Seed Initial Categories if empty
const categoryCount = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };
if (categoryCount.count === 0) {
  const initialCategories = [
    "Alcohol + Weed", "Canada Transfer", "Car fuel", "Car maintenance", 
    "Car Parking", "Clothing", "Donation", "Electronics", "Entertainment", 
    "Gifts", "Going out food", "Groceries", "Household Items", 
    "India Transfer - Parents", "India Transfer - Self", "Insurance", 
    "Medical", "Misc.", "Nagar/Bamor Expenses", "Public transportation", 
    "Rent", "Shopping", "Telecom", "Travel", "Utilities"
  ];
  const insert = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, ?)");
  initialCategories.forEach(name => insert.run(name, 0));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes
  
  // Categories
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY name ASC").all();
    res.json(categories);
  });

  app.post("/api/categories", (req, res) => {
    const { name, target_amount } = req.body;
    try {
      const result = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, ?)").run(name, target_amount);
      res.json({ id: result.lastInsertRowid, name, target_amount });
    } catch (e) {
      res.status(400).json({ error: "Category already exists" });
    }
  });

  app.put("/api/categories/:id", (req, res) => {
    const { target_amount } = req.body;
    db.prepare("UPDATE categories SET target_amount = ? WHERE id = ?").run(target_amount, req.params.id);
    res.json({ success: true });
  });

  // Transactions
  app.get("/api/transactions", (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, c.name as category_name 
      FROM transactions t 
      LEFT JOIN categories c ON t.category_id = c.id 
      ORDER BY date DESC
    `).all();
    res.json(transactions);
  });

  app.post("/api/transactions", (req, res) => {
    const { date, vendor, amount, category_id, notes } = req.body;
    const result = db.prepare("INSERT INTO transactions (date, vendor, amount, category_id, notes) VALUES (?, ?, ?, ?, ?)").run(date, vendor, amount, category_id, notes);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/transactions/:id", (req, res) => {
    const { date, vendor, amount, category_id, notes } = req.body;
    db.prepare("UPDATE transactions SET date = ?, vendor = ?, amount = ?, category_id = ?, notes = ? WHERE id = ?")
      .run(date, vendor, amount, category_id, notes, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/transactions/:id", (req, res) => {
    db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Income
  app.get("/api/income", (req, res) => {
    const income = db.prepare("SELECT * FROM income ORDER BY date DESC").all();
    res.json(income);
  });

  app.post("/api/income", (req, res) => {
    const { date, source, amount, category, notes } = req.body;
    const result = db.prepare("INSERT INTO income (date, source, amount, category, notes) VALUES (?, ?, ?, ?, ?)").run(date, source, amount, category, notes);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/income/:id", (req, res) => {
    const { date, source, amount, category, notes } = req.body;
    db.prepare("UPDATE income SET date = ?, source = ?, amount = ?, category = ?, notes = ? WHERE id = ?")
      .run(date, source, amount, category, notes, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/income/:id", (req, res) => {
    db.prepare("DELETE FROM income WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Data Wipe
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

  // CSV Import
  app.post("/api/import/targets", (req, res) => {
    const { data } = req.body;
    console.log(`Importing ${data?.length} targets...`);
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const update = db.prepare("UPDATE categories SET target_amount = ? WHERE name = ?");
    const insert = db.prepare("INSERT OR IGNORE INTO categories (name, target_amount) VALUES (?, ?)");
    
    try {
      const transaction = db.transaction((rows) => {
        for (const row of rows) {
          const [name, target] = row;
          if (!name) continue;
          const result = update.run(target || 0, name);
          if (result.changes === 0) {
            insert.run(name, target || 0);
          }
        }
      });
      
      transaction(data);
      res.json({ success: true });
    } catch (error) {
      console.error("Target import error:", error);
      res.status(500).json({ error: "Failed to import targets" });
    }
  });

  app.post("/api/import/income", (req, res) => {
    const { data } = req.body;
    console.log(`Importing ${data?.length} income records...`);

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const insert = db.prepare("INSERT INTO income (date, source, amount, category, notes) VALUES (?, ?, ?, ?, ?)");
    
    try {
      const transaction = db.transaction((rows) => {
        for (const row of rows) {
          const [date, source, amount, category, notes] = row;
          insert.run(date, source, amount, category, notes);
        }
      });
      
      transaction(data);
      res.json({ success: true });
    } catch (error) {
      console.error("Income import error:", error);
      res.status(500).json({ error: "Failed to import income" });
    }
  });

  app.post("/api/import/expenses", (req, res) => {
    const { data } = req.body;
    console.log(`Importing ${data?.length} expense records...`);

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Invalid data format" });
    }
    
    const getCategory = db.prepare("SELECT id FROM categories WHERE name = ?");
    const insertCategory = db.prepare("INSERT INTO categories (name, target_amount) VALUES (?, 0)");
    const insertExpense = db.prepare("INSERT INTO transactions (date, vendor, amount, category_id, notes) VALUES (?, ?, ?, ?, ?)");

    try {
      const transaction = db.transaction((rows) => {
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
      res.json({ success: true });
    } catch (error) {
      console.error("Expense import error:", error);
      res.status(500).json({ error: "Failed to import expenses" });
    }
  });

  // Global Error Handler for JSON responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
