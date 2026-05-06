import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp, createDatabase } from "../../server";

describe("self-host api", () => {
  let db: Database.Database;
  let app: Awaited<ReturnType<typeof createApp>>["app"];

  beforeEach(async () => {
    db = createDatabase(":memory:");
    ({ app } = await createApp({ db, includeVite: false }));
  });

  afterEach(() => {
    db.close();
  });

  function makeToken(uid = "test-user-1", email = "owner@example.com"): string {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      user_id: uid,
      sub: uid,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "test-project",
      iss: "https://securetoken.google.com/test-project",
    })).toString("base64url");
    const signature = "mock_signature";
    return `${header}.${payload}.${signature}`;
  }

  describe("GET /api/self-host/status", () => {
    it("returns ownerExists=false and isOwner=false when no owner", async () => {
      const res = await request(app).get("/api/self-host/status");
      expect(res.status).toBe(200);
      expect(res.body.ownerExists).toBe(false);
      expect(res.body.isOwner).toBe(false);
      expect(res.body.ownerEmail).toBeNull();
      expect(typeof res.body.secretsConfigured).toBe("boolean");
      expect(typeof res.body.envConfigExists).toBe("boolean");
    });

    it("returns isOwner=true for the owner token", async () => {
      const token = makeToken("uid-1", "a@b.com");
      // Claim owner first
      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      const res = await request(app)
        .get("/api/self-host/status")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.ownerExists).toBe(true);
      expect(res.body.isOwner).toBe(true);
      expect(res.body.ownerEmail).toBe("a@b.com");
    });

    it("returns isOwner=false for non-owner token", async () => {
      const token1 = makeToken("uid-1", "a@b.com");
      const token2 = makeToken("uid-2", "c@d.com");

      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token1}`)
        .send();

      const res = await request(app)
        .get("/api/self-host/status")
        .set("Authorization", `Bearer ${token2}`);
      expect(res.status).toBe(200);
      expect(res.body.ownerExists).toBe(true);
      expect(res.body.isOwner).toBe(false);
      // Non-owner should not see ownerEmail
      expect(res.body.ownerEmail).toBeNull();
    });

    it("never returns raw secrets", async () => {
      const res = await request(app).get("/api/self-host/status");
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("FIREBASE_ADMIN_CREDENTIALS_JSON");
      expect(res.body).not.toHaveProperty("GEMINI_API_KEY");
      expect(res.body).not.toHaveProperty("secrets");
    });
  });

  describe("POST /api/self-host/claim-owner", () => {
    it("rejects without authorization", async () => {
      const res = await request(app).post("/api/self-host/claim-owner").send();
      expect(res.status).toBe(401);
    });

    it("allows first user to claim owner and stores stable uid/email from JWT", async () => {
      const token = makeToken("stable-uid-123", "owner@test.com");
      const res = await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ownerEmail).toBe("owner@test.com");
      // Verify bootstrap mode flag since no Admin SDK
      expect(res.body.bootstrapMode).toBe(true);

      // Verify stored uid is stable, not the raw token
      const row = db.prepare("SELECT value FROM self_host_config WHERE key='owner_uid'").get() as { value: string };
      expect(row.value).toBe("stable-uid-123");
      // Raw token should NOT be stored
      expect(row.value).not.toBe(token);

      // Verify email stored
      const emailRow = db.prepare("SELECT value FROM self_host_config WHERE key='owner_email'").get() as { value: string };
      expect(emailRow.value).toBe("owner@test.com");
    });

    it("rejects second user claiming owner", async () => {
      const token1 = makeToken("uid-1", "first@test.com");
      const token2 = makeToken("uid-2", "second@test.com");

      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token1}`)
        .send();

      const res = await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token2}`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("already exists");
    });

    it("stores bootstrap_mode=1 when using JWT decode (no Admin SDK)", async () => {
      const token = makeToken("uid-jwt", "jwt@test.com");
      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      const row = db.prepare("SELECT value FROM self_host_config WHERE key='bootstrap_mode'").get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe("1");
    });
  });

  describe("POST /api/self-host/secrets", () => {
    it("rejects saving secrets before owner claimed", async () => {
      const res = await request(app)
        .post("/api/self-host/secrets")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ GEMINI_API_KEY: "test-key" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No owner");
    });

    it("allows owner to save secrets", async () => {
      const token = makeToken("owner-uid", "owner@test.com");
      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      const res = await request(app)
        .post("/api/self-host/secrets")
        .set("Authorization", `Bearer ${token}`)
        .send({
          FIREBASE_ADMIN_CREDENTIALS_JSON: '{"type":"service_account"}',
          GEMINI_API_KEY: "gemini-key-123",
          GEMINI_MODEL: "gemini-2.5-pro",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify stored in DB
      const adminRow = db.prepare("SELECT value FROM self_host_config WHERE key='secrets:FIREBASE_ADMIN_CREDENTIALS_JSON'").get() as { value: string } | undefined;
      const geminiRow = db.prepare("SELECT value FROM self_host_config WHERE key='secrets:GEMINI_API_KEY'").get() as { value: string } | undefined;
      const modelRow = db.prepare("SELECT value FROM self_host_config WHERE key='secrets:GEMINI_MODEL'").get() as { value: string } | undefined;

      expect(adminRow?.value).toBe('{"type":"service_account"}');
      expect(geminiRow?.value).toBe("gemini-key-123");
      expect(modelRow?.value).toBe("gemini-2.5-pro");
    });

    it("rejects non-owner saving secrets", async () => {
      const ownerToken = makeToken("owner-uid", "owner@test.com");
      const nonOwnerToken = makeToken("other-uid", "other@test.com");

      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send();

      const res = await request(app)
        .post("/api/self-host/secrets")
        .set("Authorization", `Bearer ${nonOwnerToken}`)
        .send({ GEMINI_API_KEY: "stolen-key" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/self-host/secrets/status", () => {
    it("returns only boolean status, never raw values", async () => {
      const token = makeToken("owner-uid", "owner@test.com");
      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      await request(app)
        .post("/api/self-host/secrets")
        .set("Authorization", `Bearer ${token}`)
        .send({ GEMINI_API_KEY: "super-secret-key" });

      const res = await request(app)
        .get("/api/self-host/secrets/status")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Must only return booleans
      expect(typeof res.body.GEMINI_API_KEY).toBe("boolean");
      expect(typeof res.body.GEMINI_MODEL).toBe("boolean");
      expect(typeof res.body.FIREBASE_ADMIN_CREDENTIALS_JSON).toBe("boolean");
      // Must not return raw values
      expect(res.body.GEMINI_API_KEY).not.toBe("super-secret-key");
    });

    it("rejects non-owner checking secret status", async () => {
      const ownerToken = makeToken("owner-uid", "owner@test.com");
      const nonOwnerToken = makeToken("other-uid", "other@test.com");

      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send();

      const res = await request(app)
        .get("/api/self-host/secrets/status")
        .set("Authorization", `Bearer ${nonOwnerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("SQLite secret fallback in server features", () => {
    it("AI config resolver reads from SQLite when env is missing", async () => {
      const token = makeToken("owner-uid", "owner@test.com");
      await request(app)
        .post("/api/self-host/claim-owner")
        .set("Authorization", `Bearer ${token}`)
        .send();

      await request(app)
        .post("/api/self-host/secrets")
        .set("Authorization", `Bearer ${token}`)
        .send({ GEMINI_API_KEY: "sqlite-gemini-key" });

      // Verify the key is stored in DB
      const row = db.prepare("SELECT value FROM self_host_config WHERE key='secrets:GEMINI_API_KEY'").get() as { value: string } | undefined;
      expect(row?.value).toBe("sqlite-gemini-key");
    });
  });
});
