import { beforeEach, describe, expect, it, vi } from "vitest";

describe("firebase config resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getEnvFirebaseConfig returns null when env vars are missing", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");

    const { getEnvFirebaseConfig } = await import("../../src/firebase");
    expect(getEnvFirebaseConfig()).toBeNull();
  });

  it("getEnvFirebaseConfig returns valid config when all env vars set", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "test-project");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "test.appspot.com");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123456789");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123:web:abc");

    const { getEnvFirebaseConfig } = await import("../../src/firebase");
    const config = getEnvFirebaseConfig();
    expect(config).not.toBeNull();
    expect(config!.apiKey).toBe("test-key");
    expect(config!.projectId).toBe("test-project");
  });

  it("hasFirebaseEnvConfig returns false when vars missing", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    const { hasFirebaseEnvConfig } = await import("../../src/firebase");
    expect(hasFirebaseEnvConfig()).toBe(false);
  });

  it("hasFirebaseEnvConfig returns true when vars present", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "key");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "domain");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "proj");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "bucket");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "appid");
    const { hasFirebaseEnvConfig } = await import("../../src/firebase");
    expect(hasFirebaseEnvConfig()).toBe(true);
  });

  it("isFirebaseReady returns false when not initialized", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    const { isFirebaseReady } = await import("../../src/firebase");
    expect(isFirebaseReady()).toBe(false);
  });

  it("initFirebase is idempotent", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "test-key");
    const { initFirebase, isFirebaseReady } = await import("../../src/firebase");
    const config = {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
      storageBucket: "test.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123:web:abc",
    };
    const ok1 = initFirebase(config);
    expect(ok1).toBe(true);
    expect(isFirebaseReady()).toBe(true);

    // Call init again with same config
    const ok2 = initFirebase(config);
    expect(ok2).toBe(true);
    expect(isFirebaseReady()).toBe(true);
  });
});
