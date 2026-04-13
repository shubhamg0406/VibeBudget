import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/components/Settings";
import { renderWithProviders } from "../utils/renderWithProviders";

describe("Settings", () => {
  it("switches to the cloud sync tab and shows drive actions", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Cloud Sync/i })[0]);
    expect(screen.getByText(/Create \/ Connect Folder/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Google Sheets Sync/i).length).toBeGreaterThan(0);
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

    fireEvent.click(screen.getAllByRole("button", { name: /Cloud Sync/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("https://docs.google.com/spreadsheets/d/..."), {
      target: { value: "https://docs.google.com/spreadsheets/d/sheet-1/edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Load Columns/i }));

    await waitFor(() => {
      expect(inspectGoogleSheetsSpreadsheet).toHaveBeenCalled();
      expect(screen.getByText(/Loaded sheet tabs and suggested column mappings/i)).toBeInTheDocument();
      expect(screen.getByText("Quarterly Budget")).toBeInTheDocument();
    });
  });
});
