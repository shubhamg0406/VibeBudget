import { afterEach, describe, expect, it, vi } from "vitest";
import chatHandler from "../../api/chat";

describe("Vercel POST /api/chat", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
      return;
    }
    process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  it("serves the chat route from the serverless API entrypoint", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "Serverless chat is online." } }],
      }),
    })));

    const req = {
      method: "POST",
      body: {
        messages: [{ role: "user", content: "Are you online?" }],
      },
    } as any;
    const res = {
      statusCode: 0,
      body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
        return this;
      },
    } as any;

    await chatHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ reply: "Serverless chat is online." });
  });
});
