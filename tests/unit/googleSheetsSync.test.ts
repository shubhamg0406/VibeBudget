import { describe, expect, it } from "vitest";
import {
  buildA1Range,
  buildCellRef,
  detectHeaderRow,
  getGoogleSheetsAccessErrorMessage,
  parseA1CellReference,
  parseSpreadsheetId,
  trimValuesAtEmptyRun,
} from "../../src/utils/googleSheetsSync";

describe("googleSheetsSync helpers", () => {
  it("builds spreadsheet references", () => {
    expect(buildCellRef(12, 27)).toBe("AB12");
    expect(buildA1Range("My Sheet", "A1", "C3")).toBe("'My Sheet'!A1:C3");
    expect(parseA1CellReference("ab12")).toEqual({
      rowIndex: 12,
      columnIndex: 27,
      cellRef: "AB12",
    });
  });

  it("extracts spreadsheet ids from URLs and direct ids", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/abc123/edit#gid=0")).toBe("abc123");
    expect(parseSpreadsheetId("abc123def456ghi789jkl")).toBe("abc123def456ghi789jkl");
  });

  it("detects the most likely header row", () => {
    const result = detectHeaderRow(
      [
        ["random", "values"],
        ["Date", "Vendor", "Amount", "Category"],
        ["2026-04-01", "Coffee", "5.25", "Dining"],
      ],
      [
        { field: "date", label: "Date", aliases: ["Date"], required: true },
        { field: "vendor", label: "Vendor", aliases: ["Vendor"], required: true },
        { field: "amount", label: "Amount", aliases: ["Amount"], required: true },
      ],
    );

    expect(result?.headerRowIndex).toBe(2);
    expect(result?.matchedFields).toEqual(expect.arrayContaining(["date", "vendor", "amount"]));
  });

  it("maps permission and auth errors to helpful messages", () => {
    const authError = Object.assign(new Error("expired"), { statusCode: 401 });
    const permissionError = Object.assign(new Error("caller does not have permission"), { statusCode: 403 });

    expect(getGoogleSheetsAccessErrorMessage(authError)).toContain("session expired");
    expect(getGoogleSheetsAccessErrorMessage(permissionError)).toContain("does not have access");
  });

  it("stops open-ended imports after five consecutive empty rows", () => {
    expect(trimValuesAtEmptyRun([
      "Coffee",
      "",
      "Groceries",
      "",
      "",
      "",
      "",
      "",
      "Ignored",
    ])).toEqual(["Coffee", "", "Groceries"]);
  });
});
