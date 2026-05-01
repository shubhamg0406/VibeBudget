import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Settings } from "../../src/components/Settings";
import { renderWithProviders } from "../utils/renderWithProviders";
import type { GoogleSheetsSyncConfig } from "../../src/types";

const makeCompleteConfig = (): GoogleSheetsSyncConfig => ({
  spreadsheetId: "sheet-1",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
  spreadsheetTitle: "Test Budget",
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

const getPullDataHeading = () => screen.queryByRole("heading", { name: /Pull Data/i });

describe("Google Sheets Pull gating", () => {

  it("renders the Google Workspace tab with mapping-first description", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    expect(screen.getByText(/Mapping-first pull flow/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect Google Sheets/i)).toBeInTheDocument();
  });

  it("shows Pull Data heading when mapping is saved", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: makeCompleteConfig(),
        googleSheetsConnected: true,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    // Step 3 Pull Data heading appears because mappingSavedAt is set in config
    expect(getPullDataHeading()).toBeInTheDocument();
  });

  it("hides Pull Data heading when mapping is not saved", () => {
    const configWithoutSaved = { ...makeCompleteConfig(), mappingSavedAt: null };
    delete (configWithoutSaved as any).mappingVersion;

    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: configWithoutSaved,
        googleSheetsConnected: true,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    expect(getPullDataHeading()).not.toBeInTheDocument();
  });

  it("shows pull button enabled when config is complete", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: makeCompleteConfig(),
        googleSheetsConnected: true,
        googleSheetsSyncing: false,
        validateGoogleSheetsMapping: () => ({ valid: true, missing: [] }),
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    const pullButton = screen.getByRole("button", { name: /Pull Now/i });
    expect(pullButton).not.toBeDisabled();
  });

  it("shows pull button as disabled when syncing", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: makeCompleteConfig(),
        googleSheetsConnected: true,
        googleSheetsSyncing: true,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    const pullButton = screen.getByRole("button", { name: /Pulling Data/i });
    expect(pullButton).toBeDisabled();
  });

  it("shows pull summary card from context", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: makeCompleteConfig(),
        googleSheetsConnected: true,
        googlePullSummary: {
          fetched: 25,
          imported: 10,
          duplicateSkipped: 12,
          invalidSkipped: 3,
          netNew: 10,
          mode: "incremental",
        },
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    expect(screen.getByText(/Pull Complete/i)).toBeInTheDocument();
  });

  it("shows disconnected stage explicitly", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConnected: false,
        googleSheetsConfig: null,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    expect(screen.getByText(/Disconnected/i)).toBeInTheDocument();
  });

  it("hides pull data section when config is null", () => {
    renderWithProviders(<Settings onRefresh={() => {}} />, {
      firebase: {
        googleSheetsConfig: null,
        googleSheetsConnected: true,
      },
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Google Workspace/i })[0]);

    expect(screen.getByText(/Connect Google Sheets/i)).toBeInTheDocument();
    expect(getPullDataHeading()).not.toBeInTheDocument();
  });
});
