import { DriveConnection, GoogleSheetsSyncConfig, Income, Transaction, ExpenseCategory, IncomeCategory } from "../types";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DEFAULT_BUDGET_FILE_NAME = "budget.json";

export interface BudgetDataFile {
  version: number;
  exportedAt: string;
  categories?: ExpenseCategory[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  transactions: Transaction[];
  income: Income[];
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
}

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

interface DriveListResponse {
  files?: DriveFile[];
}

const driveFetch = async <T>(token: string, url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Google Drive request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
};

export const parseDriveFolderId = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromUrl) return fromUrl;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};

export const createBudgetDataFile = (
  expenseCategories: ExpenseCategory[],
  incomeCategories: IncomeCategory[],
  transactions: Transaction[],
  income: Income[],
  googleSheetsConfig: GoogleSheetsSyncConfig | null
): BudgetDataFile => ({
  version: 2,
  exportedAt: new Date().toISOString(),
  expenseCategories,
  incomeCategories,
  transactions,
  income,
  googleSheetsConfig,
});

export const parseBudgetDataFile = (raw: string): BudgetDataFile => {
  const parsed = JSON.parse(raw) as Partial<BudgetDataFile>;
  const legacyExpenseCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
  const expenseCategories = Array.isArray(parsed.expenseCategories)
    ? parsed.expenseCategories
    : legacyExpenseCategories;
  const income = Array.isArray(parsed.income) ? parsed.income : [];
  const incomeCategories = Array.isArray(parsed.incomeCategories)
    ? parsed.incomeCategories
    : Array.from(new Set(income.map((item) => item.category).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          id: crypto.randomUUID(),
          name,
          target_amount: 0,
        }));

  return {
    version: typeof parsed.version === "number" ? parsed.version : 2,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    categories: legacyExpenseCategories,
    expenseCategories,
    incomeCategories,
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    income,
    googleSheetsConfig: parsed.googleSheetsConfig || null,
  };
};

export const getDriveFileMetadata = async (token: string, fileId: string) => (
  driveFetch<DriveFile>(token, `${GOOGLE_DRIVE_API}/files/${fileId}?fields=id,name,webViewLink`)
);

export const listDriveFiles = async (token: string, q: string) => {
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: "20",
    supportsAllDrives: "false",
  });
  return driveFetch<DriveListResponse>(token, `${GOOGLE_DRIVE_API}/files?${params.toString()}`);
};

export const findAccessibleVibeBudgetFolder = async (token: string, folderName = "VibeBudget") => {
  const q = [
    `mimeType='${FOLDER_MIME_TYPE}'`,
    `trashed=false`,
    `name='${folderName.replace(/'/g, "\\'")}'`,
  ].join(" and ");
  const response = await listDriveFiles(token, q);
  return response.files?.[0] || null;
};

export const createDriveFolder = async (token: string, folderName = "VibeBudget") => {
  const metadata = {
    name: folderName,
    mimeType: FOLDER_MIME_TYPE,
  };

  return driveFetch<DriveFile>(token, `${GOOGLE_DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
};

export const ensureVibeBudgetFolder = async (token: string, folderRef?: string) => {
  if (folderRef) {
    const folderId = parseDriveFolderId(folderRef);
    if (!folderId) {
      throw new Error("Enter a valid Google Drive folder URL or folder ID.");
    }

    const folder = await getDriveFileMetadata(token, folderId);
    return {
      folderId: folder.id,
      folderName: folder.name,
      folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    };
  }

  const existing = await findAccessibleVibeBudgetFolder(token);
  const folder = existing || await createDriveFolder(token);
  return {
    folderId: folder.id,
    folderName: folder.name,
    folderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
  };
};

export const findBudgetFileInFolder = async (token: string, folderId: string, fileName = DEFAULT_BUDGET_FILE_NAME) => {
  const q = [
    `trashed=false`,
    `'${folderId}' in parents`,
    `name='${fileName.replace(/'/g, "\\'")}'`,
  ].join(" and ");
  const response = await listDriveFiles(token, q);
  return response.files?.[0] || null;
};

const buildMultipartBody = (metadata: Record<string, unknown>, content: string) => {
  const boundary = `vibebudget_${Math.random().toString(16).slice(2)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    content,
    `--${boundary}--`,
  ].join("\r\n");

  return { body, boundary };
};

export const createBudgetFileInFolder = async (
  token: string,
  folderId: string,
  content: string,
  fileName = DEFAULT_BUDGET_FILE_NAME
) => {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const { body, boundary } = buildMultipartBody(metadata, content);
  return driveFetch<DriveFile>(
    token,
    `${GOOGLE_DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
};

export const updateBudgetFileContent = async (token: string, fileId: string, content: string) => {
  await fetch(`${GOOGLE_DRIVE_UPLOAD_API}/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: content,
  }).then(async (response) => {
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Failed to update Drive file (${response.status})`);
    }
  });
};

export const readBudgetFileContent = async (token: string, fileId: string) => {
  const response = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to read Drive file (${response.status})`);
  }

  return response.text();
};

export const ensureBudgetFile = async (
  token: string,
  connection: Pick<DriveConnection, "folderId" | "budgetFileName">,
  initialContent: string
) => {
  const existing = await findBudgetFileInFolder(token, connection.folderId, connection.budgetFileName);
  if (existing) {
    return { fileId: existing.id, fileName: existing.name };
  }

  const created = await createBudgetFileInFolder(token, connection.folderId, initialContent, connection.budgetFileName);
  return { fileId: created.id, fileName: created.name };
};
