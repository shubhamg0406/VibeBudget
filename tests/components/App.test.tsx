import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncome, makeIncomeCategory, makeTransaction } from "../utils/fixtures";

describe("App", () => {
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
});
