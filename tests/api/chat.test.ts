import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

describe("POST /api/chat", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(async () => {
    db = createDatabase(":memory:");
    ({ app } = await createApp({ db, includeVite: false }));
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
      return;
    }
    process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  it("returns 500 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "How am I doing this month?" }],
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Missing GEMINI_API_KEY");
  });

  it("returns reply for valid message history", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: { content: "You are currently below your groceries target." },
          },
        ],
      }),
    })));

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [
          { role: "user", content: "How am I tracking?" },
          { role: "assistant", content: "You're spending steadily this month." },
          { role: "user", content: "What about groceries?" },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: "You are currently below your groceries target." });
  });
});
