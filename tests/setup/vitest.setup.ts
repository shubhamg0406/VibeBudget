import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

Object.assign(import.meta.env, {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test-auth-domain",
  VITE_FIREBASE_PROJECT_ID: "test-project-id",
  VITE_FIREBASE_STORAGE_BUCKET: "test-storage-bucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "test-sender-id",
  VITE_FIREBASE_APP_ID: "test-app-id",
  VITE_TEST_USER_EMAIL: "shubhamg266@gmail.com",
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
});
