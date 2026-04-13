import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionEntry } from "../../src/components/TransactionEntry";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncomeCategory } from "../utils/fixtures";

describe("TransactionEntry", () => {
  it("submits a new expense entry", async () => {
    const addTransaction = vi.fn(async () => {});
    const onRefresh = vi.fn();

    renderWithProviders(
      <TransactionEntry
        expenseCategories={[makeExpenseCategory()]}
        incomeCategories={[makeIncomeCategory()]}
        onRefresh={onRefresh}
      />,
      { firebase: { addTransaction } },
    );

    fireEvent.change(screen.getByPlaceholderText(/Amazon, Starbucks/i), { target: { value: "Coffee Shop" } });
    fireEvent.focus(screen.getByPlaceholderText(/Search and select category/i));
    fireEvent.mouseDown(screen.getByText("Groceries"));
    fireEvent.change(screen.getByPlaceholderText("0.00 or =100+20"), { target: { value: "=100+20" } });
    fireEvent.click(screen.getByRole("button", { name: /Add Expense/i }));

    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
        vendor: "Coffee Shop",
        amount: 120,
        category_id: "expense-groceries",
      }));
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("submits a new income entry", async () => {
    const addIncome = vi.fn(async () => {});

    renderWithProviders(
      <TransactionEntry
        expenseCategories={[makeExpenseCategory()]}
        incomeCategories={[makeIncomeCategory()]}
        onRefresh={() => {}}
      />,
      { firebase: { addIncome } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    fireEvent.change(screen.getByPlaceholderText(/Job, Side Project/i), { target: { value: "Freelance Gig" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "income-salary" } });
    fireEvent.change(screen.getByPlaceholderText("0.00 or =100+20"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: /Add Income/i }));

    await waitFor(() => {
      expect(addIncome).toHaveBeenCalledWith(expect.objectContaining({
        source: "Freelance Gig",
        amount: 800,
        category_id: "income-salary",
      }));
    });
  });
});
