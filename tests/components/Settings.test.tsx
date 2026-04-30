import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/components/Settings";
import { renderWithProviders } from "../utils/renderWithProviders";

describe("Settings", () => {
  it("switches to the google workspace tab and shows drive actions", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);
    expect(screen.getByRole("button", { name: /^Connect Drive$/i })).toBeInTheDocument();
    expect(screen.getByText(/Manage your Google Sheets data source and Drive backup vault/i)).toBeInTheDocument();
  });

  it("loads spreadsheet columns through the mocked context", async () => {
    const inspectGoogleSheetsSpreadsheet = vi.fn(async () => ({
      spreadsheetId: "sheet-1",
      spreadsheetTitle: "Quarterly Budget",
      expenseHeaders: ["Date", "Vendor", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
      incomeHeaders: ["Date", "Source", "Amount", "Category", "Notes", "VibeBudget ID", "Updated At"],
      suggestedExpenseMapping: {
        date: "Date",
        vendor: "Vendor",
        amount: "Amount",
        category: "Category",
        notes: "Notes",
        id: "VibeBudget ID",
        updatedAt: "Updated At",
      },
      suggestedIncomeMapping: {
        date: "Date",
        source: "Source",
        amount: "Amount",
        category: "Category",
        notes: "Notes",
        id: "VibeBudget ID",
        updatedAt: "Updated At",
      },
    }));

    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        inspectGoogleSheetsSpreadsheet,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("https://docs.google.com/spreadsheets/d/..."), {
      target: { value: "https://docs.google.com/spreadsheets/d/sheet-1/edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify Sheet Access/i }));

    await waitFor(() => {
      expect(inspectGoogleSheetsSpreadsheet).toHaveBeenCalled();
      expect(screen.getByText(/Connection verified: sheet tabs and suggested mappings loaded/i)).toBeInTheDocument();
      expect(screen.getByText("Quarterly Budget")).toBeInTheDocument();
    });
  });

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
    fireEvent.click(screen.getByRole("button", { name: /Clear All Expenses/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, Delete Everything/i }));

    await waitFor(() => {
      expect(wipeData).toHaveBeenCalledWith("expenses");
      expect(onRefresh).toHaveBeenCalled();
    });
    expect(syncGoogleSheets).not.toHaveBeenCalled();
    expect(screen.getByText(/expenses wiped successfully/i)).toBeInTheDocument();
  });

  it("previews and commits CSV imports through the Import Center", async () => {
    const commitImport = vi.fn(async () => ({ imported: 1, skipped: 0, invalid: 0 }));

    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        commitImport,
      },
    });

    fireEvent.change(screen.getByPlaceholderText(/Paste CSV/i), {
      target: {
        value: "Date,Vendor,Amount,Category,Notes\n2026-04-10,Cafe,7.50,Groceries,Latte",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview Import/i }));

    expect(await screen.findByText("Cafe")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Commit 1/i }));

    await waitFor(() => {
      expect(commitImport).toHaveBeenCalled();
    });
  });

});
