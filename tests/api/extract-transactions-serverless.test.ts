import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/import/extract-transactions";

const createResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  return res;
};

describe("api/import/extract-transactions serverless handler", () => {
  it("rejects non-POST requests", async () => {
    const req = { method: "GET", body: {} } as unknown as VercelRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed." });
  });

  it("requires an AI configuration before extraction", async () => {
    const req = { method: "POST", headers: { "x-user-id": "user-1" }, body: { files: [] } } as unknown as VercelRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing AI configuration. Configure an AI provider in Settings or set GEMINI_API_KEY server env.",
    });
  });

  it("validates uploaded files without calling the provider", async () => {
    const req = {
      method: "POST",
      headers: { "x-user-id": "user-1" },
      body: {
        aiConfig: { provider: "gemini", model: "gemini-2.5-flash", apiKey: "test-key" },
        files: [],
      },
    } as unknown as VercelRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "`files` must be a non-empty array." });
  });

  it("requires the signed-in user header", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: {
        aiConfig: { provider: "gemini", model: "gemini-2.5-flash", apiKey: "test-key" },
        files: [],
      },
    } as unknown as VercelRequest;
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
});
