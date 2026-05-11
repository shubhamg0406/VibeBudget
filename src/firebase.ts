import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from "firebase/firestore";

export const SELF_HOST_CONFIG_KEY = "vibebudgetSelfHostConfig";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
  dataNamespace?: string;
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _googleProvider: GoogleAuthProvider | null = null;
let _googleDriveProvider: GoogleAuthProvider | null = null;
let _firebaseDataNamespace: string = "local-dev";

let _lastInitConfig: string | null = null;

export let app: FirebaseApp = null!;
export let auth: Auth = null!;
export let db: Firestore = null!;
export let googleProvider: GoogleAuthProvider = null!;
export let googleDriveProvider: GoogleAuthProvider = null!;
export let firebaseDataNamespace: string = null!;

function configFingerprint(config: FirebaseWebConfig): string {
  return `${config.apiKey}|${config.authDomain}|${config.projectId}|${config.storageBucket}|${config.messagingSenderId}|${config.appId}|${config.firestoreDatabaseId ?? ""}`;
}

function resolveDataNamespace(configured?: string): string {
  if (configured && configured.trim().length > 0) return configured.trim();
  if (import.meta.env.MODE === "test") return "test";
  return import.meta.env.DEV ? "local-dev" : "prod";
}

export function getEnvFirebaseConfig(): FirebaseWebConfig | null {
  const requiredKeys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ] as const;
  const missing = requiredKeys.filter((key) => {
    const value = import.meta.env[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length > 0) return null;
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || undefined,
    dataNamespace: import.meta.env.VITE_FIREBASE_DATA_NAMESPACE || undefined,
  };
}

export function getStoredFirebaseConfig(): FirebaseWebConfig | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SELF_HOST_CONFIG_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseWebConfig;
    if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.storageBucket || !parsed.messagingSenderId || !parsed.appId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveFirebaseConfigToStorage(config: FirebaseWebConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SELF_HOST_CONFIG_KEY, JSON.stringify(config));
}

export function clearStoredFirebaseConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SELF_HOST_CONFIG_KEY);
}

export function initFirebase(config: FirebaseWebConfig): boolean {
  const fp = configFingerprint(config);

  if (_app) {
    if (_lastInitConfig === fp) {
      return true;
    }
    console.warn("Firebase already initialized with different config; resetting.");
    _app = null!;
    _auth = null!;
    _db = null!;
    _googleProvider = null!;
    _googleDriveProvider = null!;
    _lastInitConfig = null;
  }

  try {
    const firebaseConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };
    const newApp = initializeApp(firebaseConfig);
    const newAuth = getAuth(newApp);
    const newDb = initializeFirestore(
      newApp,
      { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
      config.firestoreDatabaseId || undefined,
    );
    const newNs = resolveDataNamespace(config.dataNamespace);
    const newGp = new GoogleAuthProvider();
    newGp.setCustomParameters({ prompt: "select_account" });
    const newGdp = new GoogleAuthProvider();
    newGdp.setCustomParameters({ prompt: "consent select_account" });
    newGdp.addScope("https://www.googleapis.com/auth/drive.file");
    newGdp.addScope("https://www.googleapis.com/auth/spreadsheets.readonly");

    _app = app = newApp;
    _auth = auth = newAuth;
    _db = db = newDb;
    _firebaseDataNamespace = firebaseDataNamespace = newNs;
    _googleProvider = googleProvider = newGp;
    _googleDriveProvider = googleDriveProvider = newGdp;

    _lastInitConfig = fp;
    return true;
  } catch (error) {
    console.error("Failed to initialize Firebase", error);
    _app = null!;
    _auth = null!;
    _db = null!;
    _googleProvider = null!;
    _googleDriveProvider = null!;
    _lastInitConfig = null;
    return false;
  }
}

export function isFirebaseReady(): boolean {
  return _app !== null;
}

export const hasFirebaseEnvConfig = (): boolean => getEnvFirebaseConfig() !== null;
