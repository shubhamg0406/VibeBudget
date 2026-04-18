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

const isNativePlatform = async () => {
  try {
    const moduleName = "@capacitor/core";
    const capacitor = await import(/* @vite-ignore */ moduleName);
    return capacitor.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
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

  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) {
      throw error;
    }
  }

  await signInWithRedirect(auth, provider);
};
