import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { supabase } from "./supabase";

const isEmbeddedBrowser = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes("codex") ||
    ua.includes("electron") ||
    ua.includes("wv") ||
    ua.includes("webview")
  );
};

// On native, redirect to custom scheme so the system browser routes back to app.
// Must be added to Supabase Auth > URL Configuration > Redirect URLs.
const NATIVE_REDIRECT = "com.vibebudget.app://login-callback";

const signInWithBrowserPlugin = async (scopes?: string[]) => {

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_REDIRECT,
      scopes: scopes?.join(" "),
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("No OAuth URL returned");

  await Browser.open({ url: data.url });

  await new Promise<void>((resolve, reject) => {
    const listener = App.addListener("appUrlOpen", async (event: { url: string }) => {
      try {
        (await listener).remove();
        await Browser.close();
        const url = new URL(event.url);
        const code = url.searchParams.get("code");
        if (code) {
          // PKCE flow
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          if (sessionError) throw sessionError;
        } else {
          // Implicit flow — tokens in hash fragment
          const hash = new URLSearchParams(url.hash.replace("#", ""));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
            if (sessionError) throw sessionError;
          } else {
            throw new Error("No auth code or tokens in callback URL");
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
};

const redirectTo =
  typeof window !== "undefined"
    ? `${window.location.origin}/dashboard`
    : undefined;

export const signInWithGoogle = async (
  withDriveScopes = false,
): Promise<void> => {
  const scopes = withDriveScopes
    ? ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/spreadsheets.readonly"]
    : undefined;

  if (Capacitor.isNativePlatform()) {
    return await signInWithBrowserPlugin(scopes);
  }

  if (isEmbeddedBrowser()) {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: scopes?.join(" "),
        skipBrowserRedirect: false,
      },
    });
    return;
  }

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes: scopes?.join(" "),
      },
    });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (
      message.includes("popup") ||
      message.includes("closed") ||
      message.includes("cancelled")
    ) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: scopes?.join(" "),
          skipBrowserRedirect: false,
        },
      });
      return;
    }
    throw error;
  }
};
