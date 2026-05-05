import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

describe("duplicate detection api", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];

  beforeEach(async () => {
    db = createDatabase(":memory:");
    ({ app } = await createApp({ db, includeVite: false }));
  });

  afterEach(() => {
    db.close();
  });

  const addCategory = async (name: string) => {
    const res = await request(app).post("/api/categories").send({ name, target_amount: 0 });
    return res.body.id;
  };

  const addTransaction = async (overrides: Record<string, unknown> = {}) => {
    const res = await request(app).post("/api/transactions").send({
      date: "2026-04-10",
      vendor: "Test Store",
      amount: 50,
      category_id: 1,
      notes: "",
      ...overrides,
    });
    return res.body.id;
  };

  describe("POST /api/transactions/detect-duplicates", () => {
    it("returns empty groups when no duplicates exist", async () => {
      const catId = await addCategory("Groceries");
      await addTransaction({ date: "2026-04-01", vendor: "Store A", amount: 10, category_id: catId });
      await addTransaction({ date: "2026-04-02", vendor: "Store B", amount: 20, category_id: catId });

      const res = await request(app).post("/api/transactions/detect-duplicates");
      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.totalGroups).toBe(0);
    });

    it("detects duplicate groups with exact matching fields", async () => {
      const catId = await addCategory("Groceries");
      const id1 = await addTransaction({ date: "2026-04-10", vendor: "Walmart", amount: 75.5, category_id: catId, notes: "Weekly shop" });
      const id2 = await addTransaction({ date: "2026-04-10", vendor: "Walmart", amount: 75.5, category_id: catId, notes: "Weekly shop" });
      const id3 = await addTransaction({ date: "2026-04-10", vendor: "Walmart", amount: 75.5, category_id: catId, notes: "Weekly shop" });

      const res = await request(app).post("/api/transactions/detect-duplicates");
      expect(res.status).toBe(200);
      expect(res.body.totalGroups).toBe(1);
      expect(res.body.groups[0].length).toBe(3);
      const ids = res.body.groups[0].map((tx: any) => tx.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toContain(id3);
    });

    it("does not group near-duplicates as duplicates", async () => {
      const catId = await addCategory("Groceries");
      await addTransaction({ date: "2026-04-10", vendor: "Walmart", amount: 75.5, category_id: catId, notes: "Weekly shop" });
      await addTransaction({ date: "2026-04-10", vendor: "Walmart", amount: 75.51, category_id: catId, notes: "Weekly shop" });
      await addTransaction({ date: "2026-04-10", vendor: "Costco", amount: 75.5, category_id: catId, notes: "Weekly shop" });

      const res = await request(app).post("/api/transactions/detect-duplicates");
      expect(res.status).toBe(200);
      expect(res.body.totalGroups).toBe(0);
    });

    it("detects multiple separate duplicate groups", async () => {
      const catId = await addCategory("Groceries");
      await addTransaction({ date: "2026-04-01", vendor: "Dupe A", amount: 10, category_id: catId, notes: "a" });
      await addTransaction({ date: "2026-04-01", vendor: "Dupe A", amount: 10, category_id: catId, notes: "a" });
      await addTransaction({ date: "2026-04-02", vendor: "Dupe B", amount: 20, category_id: catId, notes: "b" });
      await addTransaction({ date: "2026-04-02", vendor: "Dupe B", amount: 20, category_id: catId, notes: "b" });

      const res = await request(app).post("/api/transactions/detect-duplicates");
      expect(res.status).toBe(200);
      expect(res.body.totalGroups).toBe(2);
      expect(res.body.groups[0].length).toBe(2);
      expect(res.body.groups[1].length).toBe(2);
    });
  });

  describe("POST /api/transactions/delete-batch", () => {
    it("deletes multiple transaction IDs", async () => {
      const catId = await addCategory("Groceries");
      const id1 = await addTransaction({ category_id: catId });
      const id2 = await addTransaction({ category_id: catId });
      const id3 = await addTransaction({ category_id: catId });

      const res = await request(app).post("/api/transactions/delete-batch").send({ ids: [id1, id3] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);

      const all = await request(app).get("/api/transactions");
      const remainingIds = all.body.map((tx: any) => tx.id);
      expect(remainingIds).toContain(id2);
      expect(remainingIds).not.toContain(id1);
      expect(remainingIds).not.toContain(id3);
    });

    it("rejects empty ids array", async () => {
      const res = await request(app).post("/api/transactions/delete-batch").send({ ids: [] });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/transactions/delete-duplicate-extras", () => {
    it("keeps one and deletes extras", async () => {
      const catId = await addCategory("Groceries");
      const id1 = await addTransaction({ date: "2026-05-01", vendor: "Dupe", amount: 100, category_id: catId, notes: "test" });
      const id2 = await addTransaction({ date: "2026-05-01", vendor: "Dupe", amount: 100, category_id: catId, notes: "test" });
      const id3 = await addTransaction({ date: "2026-05-01", vendor: "Dupe", amount: 100, category_id: catId, notes: "test" });

      const res = await request(app)
        .post("/api/transactions/delete-duplicate-extras")
        .send({ keepId: id1, deleteIds: [id1, id2, id3] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);

      const all = await request(app).get("/api/transactions");
      const remainingIds = all.body.map((tx: any) => tx.id);
      expect(remainingIds).toContain(id1);
      expect(remainingIds).not.toContain(id2);
      expect(remainingIds).not.toContain(id3);
    });

    it("rejects missing keepId", async () => {
      const res = await request(app).post("/api/transactions/delete-duplicate-extras").send({ deleteIds: [1, 2] });
      expect(res.status).toBe(400);
    });
  });
});
