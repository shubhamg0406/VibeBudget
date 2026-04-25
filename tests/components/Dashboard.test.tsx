import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../../src/components/Dashboard";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncome, makeIncomeCategory, makeTransaction } from "../utils/fixtures";

describe("Dashboard", () => {
  it("renders KPI totals and target progress", () => {
    renderWithProviders(
      <Dashboard
        expenseCategories={[makeExpenseCategory({ target_amount: 400 })]}
        incomeCategories={[makeIncomeCategory({ target_amount: 4000 })]}
        transactions={[makeTransaction({ amount: 100 })]}
        income={[makeIncome({ amount: 2500 })]}
        previousTransactions={[makeTransaction({ id: "prev-txn", amount: 50 })]}
        previousIncome={[makeIncome({ id: "prev-inc", amount: 2000 })]}
        monthMultiplier={1}
      />,
    );

    expect(screen.getByText("Total Income")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This Month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "YTD" })).toBeInTheDocument();
    expect(screen.getByText("Budget used")).toBeInTheDocument();
    expect(screen.getByText("Net take-home")).toBeInTheDocument();
    expect(screen.getByText("Projected balance")).toBeInTheDocument();
    expect(screen.getByText("Expense Targets")).toBeInTheDocument();
    expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0);
  });

  it("shows the empty-state guidance when there is no activity", () => {
    renderWithProviders(
      <Dashboard
        expenseCategories={[]}
        incomeCategories={[]}
        transactions={[]}
        income={[]}
      />,
    );

    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });
});
