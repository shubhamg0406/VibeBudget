import { describe, expect, it } from "vitest";
import { buildFilePayload } from "../../src/utils/documentExtraction";
import type { ExtractTransactionsResponse } from "../../src/types";

describe("documentExtraction", () => {
  it("builds unique source ids for multiple rows from the same receipt", () => {
    const candidates: ExtractTransactionsResponse["candidates"] = [
      {
        date: "2026-05-10",
        merchant: "Target",
        amount: 12.34,
        category: "Groceries",
        notes: "Bananas",
        confidence: 0.9,
        warnings: [],
        source_file: "receipt.png",
      },
      {
        date: "2026-05-10",
        merchant: "Target",
        amount: 12.34,
        category: "Household",
        notes: "Soap",
        confidence: 0.9,
        warnings: [],
        source_file: "receipt.png",
      },
    ];

    const payload = buildFilePayload(candidates) as Array<{ __sourceId?: string }>;
    expect(payload).toHaveLength(2);
    expect(payload[0].__sourceId).toBeTruthy();
    expect(payload[1].__sourceId).toBeTruthy();
    expect(payload[0].__sourceId).not.toEqual(payload[1].__sourceId);
  });
});
