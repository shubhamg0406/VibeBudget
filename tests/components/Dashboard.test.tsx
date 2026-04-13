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
    expect(screen.getByText("Expense Targets")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
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
