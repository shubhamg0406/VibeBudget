import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncome, makeIncomeCategory, makeTransaction } from "../utils/fixtures";
import type { GoogleSheetsSyncConfig } from "../../src/types";

const makeGoogleSheetsConfig = (): GoogleSheetsSyncConfig => ({
  spreadsheetId: "mock-sheet",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock-sheet",
  spreadsheetTitle: "Mock Budget Sheet",
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
  autoSync: true,
  syncIntervalSeconds: 30,
  connectedAt: "2026-04-01T00:00:00.000Z",
  connectedBy: "test@example.com",
  lastSyncedAt: null,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
});

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the signed-out home when there is no user", () => {
    renderWithProviders(<App />, {
      firebase: {
        user: null,
        signIn: vi.fn(async () => {}),
      },
    });

    expect(screen.getByText(/Budgeting that feels clear/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sign in with Google/i)[0]).toBeInTheDocument();
  });

  it("renders the dashboard for authenticated users and navigates between views", () => {
    renderWithProviders(<App />, {
      seed: {
        expenseCategories: [makeExpenseCategory()],
        incomeCategories: [makeIncomeCategory()],
        transactions: [makeTransaction()],
        income: [makeIncome()],
      },
    });

    expect(screen.getAllByText("Dashboard")[0]).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(screen.getAllByText("Data Hub").length).toBeGreaterThan(0);
  });

  it("shows a loading spinner before data is ready", () => {
    const { container } = renderWithProviders(<App />, {
      firebase: {
        loading: true,
      },
    });

    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("refreshes Google Sheet transactions from the Transactions tab", async () => {
    const syncGoogleSheets = vi.fn(async () => {});

    renderWithProviders(<App />, {
      seed: {
        expenseCategories: [makeExpenseCategory()],
        incomeCategories: [makeIncomeCategory()],
        transactions: [makeTransaction()],
        income: [makeIncome()],
        googleSheetsConfig: makeGoogleSheetsConfig(),
      },
      firebase: {
        googleSheetsConnected: true,
        syncGoogleSheets,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Transactions" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /refresh transactions from google sheets/i }));

    await waitFor(() => {
      expect(syncGoogleSheets).toHaveBeenCalledWith("pull");
    });
    expect(screen.getByText(/Google Sheet changes fetched/i)).toBeInTheDocument();
  });

  it("shows the transaction refresh button for saved Google Sheet imports", async () => {
    localStorage.setItem("googleSheetImport_shared", JSON.stringify({
      sheetUrl: "https://docs.google.com/spreadsheets/d/mock-sheet",
      spreadsheetId: "mock-sheet",
    }));
    localStorage.setItem("googleSheetImport_expenses", JSON.stringify({
      sheetTabName: "Expenses",
      override: false,
      mapping: {
        date: {
          start: { rowIndex: 1, columnIndex: 0, cellRef: "A1", displayValue: "Date" },
          end: { rowIndex: 5, columnIndex: 0, cellRef: "A5", displayValue: "" },
        },
        vendor: {
          start: { rowIndex: 1, columnIndex: 1, cellRef: "B1", displayValue: "Vendor" },
          end: { rowIndex: 5, columnIndex: 1, cellRef: "B5", displayValue: "" },
        },
        amount: {
          start: { rowIndex: 1, columnIndex: 2, cellRef: "C1", displayValue: "Amount" },
          end: { rowIndex: 5, columnIndex: 2, cellRef: "C5", displayValue: "" },
        },
        category: {
          start: { rowIndex: 1, columnIndex: 3, cellRef: "D1", displayValue: "Category" },
          end: { rowIndex: 5, columnIndex: 3, cellRef: "D5", displayValue: "" },
        },
      },
    }));

    renderWithProviders(<App />, {
      seed: {
        expenseCategories: [makeExpenseCategory()],
        incomeCategories: [makeIncomeCategory()],
        transactions: [makeTransaction()],
        income: [makeIncome()],
      },
      firebase: {
        googleSheetsConfig: null,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Transactions" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refresh transactions from google sheets/i })).toBeInTheDocument();
    });
  });
});
