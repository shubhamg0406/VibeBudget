import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Transaction } from "../../src/types.js";
import { detectDuplicateGroups } from "../../src/utils/duplicateDetection.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const transactions = req.body?.transactions;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: "transactions must be an array." });
  }

  const groups = detectDuplicateGroups(transactions as Transaction[]);
  return res.json({ groups, totalGroups: groups.length });
}
