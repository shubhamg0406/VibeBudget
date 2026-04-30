import * as XLSX from "xlsx";

export interface ExcelSheetInfo {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface ExcelParseResult {
  sheets: ExcelSheetInfo[];
  fileName: string;
}

/**
 * Parse an Excel (.xlsx) or CSV file and return structured sheet data.
 * For CSV files, creates a single sheet with the filename as the sheet name.
 */
export const parseExcelFile = async (file: File): Promise<ExcelParseResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets: ExcelSheetInfo[] = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    // Filter out completely empty rows
    const nonEmptyRows = data.filter((row) =>
      row.some((cell) => cell.trim() !== "")
    );

    const headers = nonEmptyRows.length > 0
      ? nonEmptyRows[0].map((h) => h.trim())
      : [];
    const rows = nonEmptyRows.slice(1).map((row) =>
      row.map((cell) => String(cell).trim())
    );

    return {
      name,
      headers,
      rows,
      totalRows: rows.length,
    };
  });

  return {
    sheets,
    fileName: file.name,
  };
};

/**
 * Parse a CSV file as text (for backward compatibility with existing flow).
 */
export const parseCSVText = (
  text: string,
  delimiter: string = ","
): { headers: string[]; rows: string[][] } => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitCSVRow = (row: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parsed = lines.map((line) =>
    splitCSVRow(line).map((cell) => cell.replace(/^"|"$/g, "").trim())
  );

  return {
    headers: parsed[0],
    rows: parsed.slice(1),
  };
};

/**
 * Detect the best delimiter for CSV text by comparing comma vs tab counts.
 */
export const detectDelimiter = (text: string): string => {
  const sampleLines = text.split("\n").slice(0, 5);
  const commaCount = sampleLines.join("").split(",").length - 1;
  const tabCount = sampleLines.join("").split("\t").length - 1;
  return tabCount > commaCount ? "\t" : ",";
};
