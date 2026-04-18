import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

describe("POST /api/ai-chat", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];

  beforeEach(async () => {
    db = createDatabase(":memory:");

    ({ app } = await createApp({
      db,
      includeVite: false,
      aiChatDeps: {
        verifyIdToken: vi.fn(async () => ({ uid: "user-123" })),
        loadUserBudgetData: vi.fn(async () => ({
          transactions: [
            {
              date: "2026-04-11",
              vendor: "Costco",
              amount: 140,
              category_id: "groceries",
              category_name: "Groceries",
            },
          ],
          income: [
            {
              date: "2026-04-01",
              source: "Employer",
              amount: 4200,
              category: "Salary",
            },
          ],
          categories: [
            {
              name: "Groceries",
              target_amount: 400,
            },
          ],
        })),
        callGroq: vi.fn(async () => "You spent $140.00 at Costco this month."),
        now: () => new Date("2026-04-15T12:00:00.000Z"),
      },
    }));
  });

  afterEach(() => {
    db.close();
  });

  it("returns 401 when auth token is missing", async () => {
    const response = await request(app)
      .post("/api/ai-chat")
      .send({
        message: "How am I doing?",
        uid: "user-123",
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain("Authentication token is required");
  });

  it("returns an ai reply for a valid request", async () => {
    const response = await request(app)
      .post("/api/ai-chat")
      .send({
        message: "Did I spend at Costco this month?",
        uid: "user-123",
        idToken: "valid-token",
        history: [
          { role: "user", content: "How is my budget?" },
          { role: "assistant", content: "You are under your targets overall." },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: "You spent $140.00 at Costco this month." });
  });
});
