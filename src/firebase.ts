import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const requiredFirebaseEnvKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const missingFirebaseEnvKeys = requiredFirebaseEnvKeys.filter((key) => {
  const value = import.meta.env[key];
  return typeof value !== "string" || value.trim().length === 0;
});

if (missingFirebaseEnvKeys.length > 0) {
  throw new Error(
    `Missing Firebase environment variables: ${missingFirebaseEnvKeys.join(", ")}. ` +
      "Add them to your Vercel project settings, then redeploy."
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
const resolveFirebaseDataNamespace = () => {
  const configuredNamespace = import.meta.env.VITE_FIREBASE_DATA_NAMESPACE;
  if (typeof configuredNamespace === "string" && configuredNamespace.trim().length > 0) {
    return configuredNamespace.trim();
  }

  if (import.meta.env.MODE === "test") {
    return "test";
  }

  // Safe default: local dev should not share the production namespace.
  return import.meta.env.DEV ? "local-dev" : "prod";
};

export const firebaseDataNamespace = resolveFirebaseDataNamespace();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = firestoreDatabaseId
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const googleDriveProvider = new GoogleAuthProvider();
googleDriveProvider.setCustomParameters({ prompt: "select_account" });
googleDriveProvider.addScope("https://www.googleapis.com/auth/drive.file");
googleDriveProvider.addScope("https://www.googleapis.com/auth/spreadsheets");

export default app;
