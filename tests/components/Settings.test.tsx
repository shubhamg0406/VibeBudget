import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/components/Settings";
import { renderWithProviders } from "../utils/renderWithProviders";
import type { GoogleSheetsSyncConfig } from "../../src/types";

const makeGoogleSheetsConfig = (): GoogleSheetsSyncConfig => ({
  spreadsheetId: "sheet-1",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
  spreadsheetTitle: "Quarterly Budget",
  expensesSheetName: "Expenses",
  incomeSheetName: "Income",
  expenseMapping: {
    date: "Date",
    vendor: "Vendor",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  },
  incomeMapping: {
    date: "Date",
    source: "Source",
    amount: "Amount",
    category: "Category",
    notes: "Notes",
    id: "VibeBudget ID",
    updatedAt: "Updated At",
  },
  autoSync: false,
  syncIntervalSeconds: 30,
  connectedAt: new Date().toISOString(),
  connectedBy: "test@example.com",
  mappingSavedAt: new Date().toISOString(),
  mappingVersion: 1,
});

describe("Settings", () => {
  it("switches to the google workspace tab and shows drive actions", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);
    expect(screen.getByRole("button", { name: /^Connect Drive$/i })).toBeInTheDocument();
    expect(screen.getByText(/Mapping-first pull flow/i)).toBeInTheDocument();
  });

  it("loads spreadsheet columns through the mocked context", async () => {
    const config = makeGoogleSheetsConfig();
    const inspectGoogleSheetsSpreadsheet = vi.fn(async () => ({
      spreadsheetId: "sheet-1",
      spreadsheetTitle: "Quarterly Budget",
      sheetTitles: ["Expenses", "Income"],
      expenseHeaders: ["Date", "Vendor", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
      incomeHeaders: ["Date", "Source", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
      suggestedExpenseMapping: config.expenseMapping,
      suggestedIncomeMapping: config.incomeMapping,
    }));
    const saveConfig = vi.fn(async () => {});

    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: config,
        googleSheetsConnected: true,
        inspectGoogleSheetsSpreadsheet,
        saveGoogleSheetsConfig: saveConfig,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("https://docs.google.com/spreadsheets/d/..."), {
      target: { value: "https://docs.google.com/spreadsheets/d/sheet-1/edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

    await waitFor(() => {
      expect(inspectGoogleSheetsSpreadsheet).toHaveBeenCalled();
      expect(screen.getByText("Quarterly Budget")).toBeInTheDocument();
    });
  }, 10000);

  it("runs maintenance wipes without syncing or deleting Google Sheet data", async () => {
    const wipeData = vi.fn(async () => {});
    const syncGoogleSheets = vi.fn(async () => {});
    const onRefresh = vi.fn();

    renderWithProviders(<Settings onRefresh={onRefresh} />, {
      firebase: {
        wipeData,
        syncGoogleSheets,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Maintenance/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Wipe Expenses/i }));

    expect(screen.getByText(/Danger Zone Confirmation/i)).toBeInTheDocument();
    expect(syncGoogleSheets).not.toHaveBeenCalled();
  });

  it("shows the ImpEx export options on the data tab", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />);

    expect(screen.getByText(/Export Data/i)).toBeInTheDocument();
  });
});
