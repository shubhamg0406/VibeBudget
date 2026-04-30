import {
  Auth,
  GoogleAuthProvider,
  UserCredential,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

const shouldFallbackToRedirect = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  return [
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(code);
};

const getAuthErrorCode = (error: unknown) => (
  typeof error === "object" && error && "code" in error
    ? String((error as { code?: string }).code)
    : ""
);

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

const signInWithNativePlugin = async (auth: Auth) => {
  const moduleName = "@codetrix-studio/capacitor-google-auth";
  const googleAuthPlugin = await import(/* @vite-ignore */ moduleName);
  const result = await googleAuthPlugin.GoogleAuth.signIn();
  const idToken = result.authentication?.idToken;
  if (!idToken) {
    throw new Error("Google Sign-In failed: missing idToken from native auth provider.");
  }
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
};

export const signInWithGoogle = async (
  auth: Auth,
  provider: GoogleAuthProvider,
): Promise<UserCredential | void> => {
  if (await isNativePlatform()) {
    try {
      return await signInWithNativePlugin(auth);
    } catch (error) {
      console.warn("Native Google Sign-In unavailable; falling back to web popup.", error);
    }
  }

  // Embedded browsers commonly block popups; use redirect first there.
  if (isEmbeddedBrowser()) {
    await signInWithRedirect(auth, provider);
    return;
  }

  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code = getAuthErrorCode(error);
    if (code === "auth/unauthorized-domain") {
      throw new Error(
        "Google sign-in is blocked for this origin. In Firebase Console -> Authentication -> Settings -> Authorized domains, add localhost and 127.0.0.1, then retry."
      );
    }
    if (!shouldFallbackToRedirect(error)) {
      throw error;
    }
    await signInWithRedirect(auth, provider);
  }
};
