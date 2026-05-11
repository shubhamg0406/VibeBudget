import type { VercelRequest, VercelResponse } from "@vercel/node";

type CommitMode = "individual" | "category";

interface CommitRow {
  date?: string;
  merchant?: string;
  category?: string;
  notes?: string;
  amount?: number;
  amount_formula?: string;
}

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

const getProjectId = (req?: VercelRequest) => {
  const headerVal = req?.headers["x-firebase-project-id"];
  const headerProjectId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (headerProjectId && headerProjectId.trim()) return headerProjectId.trim();
  return getEnv("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
};
const getApiKey = () => getEnv("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY");
const getDatabaseId = (req?: VercelRequest) => {
  const headerVal = req?.headers["x-firebase-database-id"];
  const headerDb = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (headerDb && headerDb.trim()) return headerDb.trim();
  return getEnv("FIREBASE_FIRESTORE_DATABASE_ID", "VITE_FIREBASE_FIRESTORE_DATABASE_ID") || "(default)";
};
const getDataNamespace = (req?: VercelRequest) => {
  const headerVal = req?.headers["x-firebase-namespace"];
  const headerNs = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (headerNs && headerNs.trim()) return headerNs.trim();
  return getEnv("FIREBASE_DATA_NAMESPACE", "VITE_FIREBASE_DATA_NAMESPACE") || "prod";
};

const encodePath = (segment: string) => encodeURIComponent(segment).replace(/%2F/g, "%252F");

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const lookupUid = async (idToken: string) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing Firebase API key.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Firebase token lookup failed (${response.status}).`);
  const uid = payload?.users?.[0]?.localId;
  if (typeof uid !== "string" || !uid.trim()) throw new Error("Firebase token lookup did not return a user.");
  return uid;
};

const fString = (value: string) => ({ stringValue: value });
const fNumber = (value: number) => ({ doubleValue: Number(value) });

const writeFirestoreDoc = async (
  req: VercelRequest,
  idToken: string,
  uid: string,
  collectionName: "transactions" | "categories",
  docId: string,
  fields: Record<string, unknown>
) => {
  const projectId = getProjectId(req);
  if (!projectId) throw new Error("Missing Firebase project ID.");
  const databaseId = encodePath(getDatabaseId(req));
  const namespace = encodePath(getDataNamespace(req));
  const encodedUid = encodePath(uid);
  const encodedDocId = encodePath(docId);
  const encodedCollection = encodePath(collectionName);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/environments/${namespace}/users/${encodedUid}/${encodedCollection}/${encodedDocId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Firestore write failed (${response.status}): ${payload || response.statusText}`);
  }
};

const normalizeRows = (rows: unknown[]): CommitRow[] => rows
  .map((row) => (row && typeof row === "object" ? row as CommitRow : null))
  .filter(Boolean)
  .map((row) => ({
    date: String(row?.date || "").trim(),
    merchant: String(row?.merchant || "").trim(),
    category: String(row?.category || "Misc.").trim() || "Misc.",
    notes: String(row?.notes || "").trim(),
    amount: Number(row?.amount || 0),
  }))
  .filter((row) => row.date && row.merchant && Number.isFinite(row.amount) && row.amount > 0);

const toCategoryRows = (rows: CommitRow[]): CommitRow[] => {
  const grouped = new Map<string, CommitRow[]>();
  rows.forEach((row) => {
    const key = [row.date, row.merchant, row.category].join("|").toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  });

  const consolidated: CommitRow[] = [];
  grouped.forEach((items) => {
    const first = items[0];
    const amounts = items.map((item) => Number(item.amount || 0));
    const amount = amounts.reduce((sum, a) => sum + a, 0);
    const amountFormula = "=" + amounts.map((a) => a.toFixed(2)).join("+");
    const notes = items.map((item) => item.notes).filter(Boolean).join("; ");
    consolidated.push({
      date: first.date,
      merchant: first.merchant,
      category: first.category,
      notes,
      amount: Number(amount.toFixed(2)),
      amount_formula: amountFormula,
    });
  });
  return consolidated;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const mode = (req.body?.mode || "individual") as CommitMode;
  if (mode !== "individual" && mode !== "category") {
    return res.status(400).json({ error: "mode must be `individual` or `category`." });
  }
  const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rawRows.length === 0) return res.status(400).json({ error: "rows must be a non-empty array." });

  const idToken = getBearerToken(req);
  if (!idToken) return res.status(401).json({ error: "Missing Firebase authorization token." });

  try {
    const uid = await lookupUid(idToken);
    const normalized = normalizeRows(rawRows);
    if (normalized.length === 0) return res.status(400).json({ error: "No valid rows to commit." });
    const commitRows = mode === "category" ? toCategoryRows(normalized) : normalized;
    const now = new Date().toISOString();

    for (const row of commitRows) {
      const categoryName = row.category || "Misc.";
      const categoryId = `ocr-cat-${hashString(categoryName.toLowerCase())}`;
      await writeFirestoreDoc(req, idToken, uid, "categories", categoryId, {
        id: fString(categoryId),
        name: fString(categoryName),
        target_amount: fNumber(0),
      });

      const identity = `${row.date}|${row.merchant}|${row.category}|${row.amount}|${row.notes}|${now}`;
      const txnId = `document_ocr-expense-${hashString(identity)}`;
      await writeFirestoreDoc(req, idToken, uid, "transactions", txnId, {
        id: fString(txnId),
        date: fString(row.date || now.slice(0, 10)),
        vendor: fString(row.merchant || "Imported expense"),
        amount: fNumber(Number(row.amount || 0)),
        ...(row.amount_formula ? { amount_formula: fString(row.amount_formula) } : {}),
        category_id: fString(categoryId),
        category_name: fString(categoryName),
        notes: fString(row.notes || ""),
        import_source: fString("document_ocr"),
        source_id: fString(`ocr-${hashString(identity)}`),
        import_batch_id: fString(`ocr-commit-${hashString(now)}`),
        raw_description: fString(row.notes || ""),
        status: fString("posted"),
        updated_at: fString(now),
      });
    }

    return res.json({
      success: true,
      mode,
      imported: commitRows.length,
      uid,
      projectId: getProjectId(req),
      namespace: getDataNamespace(req),
      databaseId: getDatabaseId(req),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to commit OCR rows.";
    return res.status(500).json({ error: message });
  }
}
