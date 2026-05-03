import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

const createMockFetch = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  });

describe("POST /api/plaid/create_link_token", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    db = createDatabase(":memory:");
    ({ app } = await createApp({ db, includeVite: false }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    db.close();
  });

  it("returns 400 when clientId is missing", async () => {
    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ secret: "s", environment: "sandbox", userId: "u1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("clientId is required.");
  });

  it("returns 400 when secret is missing", async () => {
    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c1", environment: "sandbox", userId: "u1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("secret is required.");
  });

  it("returns 400 when environment is invalid", async () => {
    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c1", secret: "s", environment: "invalid", userId: "u1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("environment must be sandbox, development, or production.");
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c1", secret: "s", environment: "sandbox" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userId is required.");
  });

  it("returns 400 when userId is not a string", async () => {
    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c1", secret: "s", environment: "sandbox", userId: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userId is required.");
  });

  it("returns 500 when Plaid API returns an error", async () => {
    global.fetch = createMockFetch(400, {
      error_type: "INVALID_INPUT",
      error_code: "INVALID_FIELD",
      error_message: "client_id is not valid",
    });

    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "bad", secret: "bad", environment: "sandbox", userId: "u1" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("client_id is not valid");
  });

  it("returns link_token on successful creation", async () => {
    global.fetch = createMockFetch(200, {
      link_token: "link-sandbox-abc123",
      expiration: "2026-12-31T23:59:59Z",
      request_id: "req_123",
    });

    const res = await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c1", secret: "s", environment: "sandbox", userId: "u1" });

    expect(res.status).toBe(200);
    expect(res.body.link_token).toBe("link-sandbox-abc123");
  });

  it("calls Plaid API with correct body", async () => {
    let requestBody: unknown = null;
    let requestUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      requestUrl = url;
      requestBody = JSON.parse(opts.body as string);
      return { ok: true, status: 200, json: vi.fn().mockResolvedValue({ link_token: "lt", expiration: "e", request_id: "r" }) };
    });

    await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "my_client", secret: "my_secret", environment: "development", userId: "user_42" });

    expect(requestUrl).toContain("https://development.plaid.com/link/token/create");
    expect(requestBody).toMatchObject({
      client_id: "my_client",
      secret: "my_secret",
      client_name: "VibeBudget",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      user: { client_user_id: "user_42" },
    });
  });

  it("works in sandbox environment", async () => {
    let requestUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url) => {
      requestUrl = url;
      return { ok: true, status: 200, json: vi.fn().mockResolvedValue({ link_token: "lt", expiration: "e", request_id: "r" }) };
    });

    await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c", secret: "s", environment: "sandbox", userId: "u1" });

    expect(requestUrl).toContain("https://sandbox.plaid.com/link/token/create");
  });

  it("works in production environment", async () => {
    let requestUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url) => {
      requestUrl = url;
      return { ok: true, status: 200, json: vi.fn().mockResolvedValue({ link_token: "lt", expiration: "e", request_id: "r" }) };
    });

    await request(app)
      .post("/api/plaid/create_link_token")
      .send({ clientId: "c", secret: "s", environment: "production", userId: "u1" });

    expect(requestUrl).toContain("https://production.plaid.com/link/token/create");
  });
});

describe("createLinkToken function", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws on rate limit (429)", async () => {
    global.fetch = createMockFetch(429, {
      error_type: "RATE_LIMIT",
      error_code: "RATE_LIMIT_EXCEEDED",
      error_message: "Rate limit exceeded",
    });

    const { createLinkToken } = await import("../../src/server/plaid");

    await expect(
      createLinkToken({
        clientId: "c",
        secret: "s",
        environment: "sandbox",
        userId: "u1",
      }),
    ).rejects.toThrow("Rate limit exceeded");
  });
});
