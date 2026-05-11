import type { VercelRequest, VercelResponse } from "@vercel/node";

const getBearerToken = (req: VercelRequest) => {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

const getEnv = (name: string, fallback?: string) => {
  const value = process.env[name] || (fallback ? process.env[fallback] : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const getProjectId = () => getEnv("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
const getApiKey = () => getEnv("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY");
const getDatabaseId = () => getEnv("FIREBASE_FIRESTORE_DATABASE_ID", "VITE_FIREBASE_FIRESTORE_DATABASE_ID") || "(default)";
const getDataNamespace = () => getEnv("FIREBASE_DATA_NAMESPACE", "VITE_FIREBASE_DATA_NAMESPACE") || "prod";

const encodePath = (segment: string) => encodeURIComponent(segment).replace(/%2F/g, "%252F");

const lookupUid = async (idToken: string) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing Firebase API key.");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Firebase token lookup failed (${response.status}).`);
  }

  const uid = payload?.users?.[0]?.localId;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new Error("Firebase token lookup did not return a user.");
  }
  return uid;
};

const softDeleteFirestoreTransaction = async (idToken: string, uid: string, id: string) => {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing Firebase project ID.");
  }

  const databaseId = encodePath(getDatabaseId());
  const namespace = encodePath(getDataNamespace());
  const encodedUid = encodePath(uid);
  const encodedId = encodePath(id);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/environments/${namespace}/users/${encodedUid}/transactions/${encodedId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        deleted: { booleanValue: true },
        updatedAt: { integerValue: Date.now() },
      },
    }),
  });

  if (response.status === 404) return;
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Firestore soft-delete failed (${response.status}): ${payload || response.statusText}`);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array." });
  }

  const normalizedIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return res.status(400).json({ error: "ids must include at least one valid id." });
  }

  const idToken = getBearerToken(req);
  if (!idToken) {
    return res.status(401).json({ error: "Missing Firebase authorization token." });
  }

  try {
    const uid = await lookupUid(idToken);
    await Promise.all(normalizedIds.map((id) => softDeleteFirestoreTransaction(idToken, uid, id)));
    return res.json({ success: true, deleted: normalizedIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete duplicate transactions.";
    return res.status(500).json({ error: message });
  }
}
