import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthlyAnalysis } from "../../src/components/MonthlyAnalysis";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncome, makeIncomeCategory, makeTransaction } from "../utils/fixtures";

describe("MonthlyAnalysis", () => {
  it("lets users select a month and updates the analysis totals", () => {
    renderWithProviders(
      <MonthlyAnalysis
        expenseCategories={[makeExpenseCategory({ target_amount: 500 })]}
        incomeCategories={[makeIncomeCategory({ target_amount: 5000 })]}
        allTransactions={[
          makeTransaction({ id: "march-expense", date: "2026-03-08", amount: 75 }),
          makeTransaction({ id: "april-expense", date: "2026-04-10", amount: 120 }),
        ]}
        allIncome={[
          makeIncome({ id: "march-income", date: "2026-03-01", amount: 2000 }),
          makeIncome({ id: "april-income", date: "2026-04-01", amount: 4500 }),
        ]}
      />,
    );

    const monthSelector = screen.getByLabelText("Select analysis month");
    fireEvent.change(monthSelector, { target: { value: "2026-04" } });

    expect(screen.getByText(/April 2026/)).toBeInTheDocument();
    expect(screen.getAllByText("$120.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$4,500.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$75.00")).not.toBeInTheDocument();
  });
});
