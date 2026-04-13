import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

describe("server api", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];

  beforeEach(async () => {
    db = createDatabase(":memory:");
    ({ app } = await createApp({ db, includeVite: false }));
  });

  afterEach(() => {
    db.close();
  });

  it("supports category CRUD basics", async () => {
    const createResponse = await request(app)
      .post("/api/categories")
      .send({ name: "Dining", target_amount: 250 });

    expect(createResponse.status).toBe(200);

    const listResponse = await request(app).get("/api/categories");
    expect(listResponse.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Dining", target_amount: 250 }),
    ]));

    const categoryId = createResponse.body.id;
    const updateResponse = await request(app)
      .put(`/api/categories/${categoryId}`)
      .send({ target_amount: 300 });

    expect(updateResponse.body).toEqual({ success: true });
  });

  it("creates, updates, and deletes transactions and income", async () => {
    const category = await request(app)
      .post("/api/categories")
      .send({ name: "Travel", target_amount: 100 });

    const transaction = await request(app)
      .post("/api/transactions")
      .send({ date: "2026-04-10", vendor: "Airline", amount: 599, category_id: category.body.id, notes: "Flight" });

    expect(transaction.body.id).toBeTruthy();

    const updateTransaction = await request(app)
      .put(`/api/transactions/${transaction.body.id}`)
      .send({ date: "2026-04-11", vendor: "Airline", amount: 650, category_id: category.body.id, notes: "Changed flight" });
    expect(updateTransaction.body).toEqual({ success: true });

    const income = await request(app)
      .post("/api/income")
      .send({ date: "2026-04-01", source: "Employer", amount: 5000, category: "Salary", notes: "Payroll" });
    expect(income.body.id).toBeTruthy();

    const deleteTransaction = await request(app).delete(`/api/transactions/${transaction.body.id}`);
    const deleteIncome = await request(app).delete(`/api/income/${income.body.id}`);
    expect(deleteTransaction.body).toEqual({ success: true });
    expect(deleteIncome.body).toEqual({ success: true });
  });

  it("supports import endpoints and validation", async () => {
    const invalidTargets = await request(app).post("/api/import/targets").send({ data: null });
    expect(invalidTargets.status).toBe(400);

    const importExpenses = await request(app)
      .post("/api/import/expenses")
      .send({ data: [["2026-04-10", "Cafe", 7.5, "Dining", "Latte"]] });
    expect(importExpenses.body).toEqual({ success: true });

    const transactions = await request(app).get("/api/transactions");
    expect(transactions.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ vendor: "Cafe", category_name: "Dining" }),
    ]));
  });

  it("wipes the requested dataset", async () => {
    await request(app)
      .post("/api/income")
      .send({ date: "2026-04-01", source: "Employer", amount: 5000, category: "Salary", notes: "Payroll" });

    const wipeResponse = await request(app).post("/api/wipe").send({ type: "income" });
    expect(wipeResponse.body).toEqual({ success: true });

    const incomeResponse = await request(app).get("/api/income");
    expect(incomeResponse.body).toEqual([]);
  });
});
