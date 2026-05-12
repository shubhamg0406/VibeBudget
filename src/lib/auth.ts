import { supabase } from "./supabase";

const isNativePlatform = async () => {
  try {
    const moduleName = "@capacitor/core";
    const capacitor = await import(/* @vite-ignore */ moduleName);
    return capacitor.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

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

const signInWithNativePlugin = async () => {
  const moduleName = "@codetrix-studio/capacitor-google-auth";
  const googleAuthPlugin = await import(/* @vite-ignore */ moduleName);
  const result = await googleAuthPlugin.GoogleAuth.signIn();
  const idToken = result.authentication?.idToken;
  if (!idToken) {
    throw new Error("Google Sign-In failed: missing idToken from native auth provider.");
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
};

const redirectTo = typeof window !== "undefined"
  ? `${window.location.origin}/dashboard`
  : undefined;

export const signInWithGoogle = async (
  withDriveScopes = false,
): Promise<void> => {
  if (await isNativePlatform()) {
    try {
      return await signInWithNativePlugin();
    } catch (error) {
      console.warn("Native Google Sign-In unavailable; falling back to web popup.", error);
    }
  }

  const scopes = withDriveScopes
    ? ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/spreadsheets.readonly"]
    : undefined;

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
