import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionEntry } from "../../src/components/TransactionEntry";
import { renderWithProviders } from "../utils/renderWithProviders";
import { makeExpenseCategory, makeIncomeCategory } from "../utils/fixtures";

describe("TransactionEntry", () => {
  it("submits a new expense entry", async () => {
    const addTransaction = vi.fn(async () => {});
    const createRecurringRule = vi.fn(async () => "rule-1");
    const onRefresh = vi.fn();

    renderWithProviders(
      <TransactionEntry
        expenseCategories={[makeExpenseCategory()]}
        incomeCategories={[makeIncomeCategory()]}
        onRefresh={onRefresh}
      />,
      { firebase: { addTransaction, createRecurringRule } },
    );

    fireEvent.change(screen.getByPlaceholderText(/Amazon, Starbucks/i), { target: { value: "Coffee Shop" } });
    fireEvent.focus(screen.getByPlaceholderText(/Search and select category/i));
    fireEvent.mouseDown(screen.getByText("Groceries"));
    fireEvent.change(screen.getByPlaceholderText("0.00 or =100+20"), { target: { value: "=100+20" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /Add Expense/i }));

    await waitFor(() => {
      expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
        vendor: "Coffee Shop",
        amount: 120,
        category_id: "expense-groceries",
      }));
      expect(createRecurringRule).toHaveBeenCalledWith(expect.objectContaining({
        type: "expense",
        day_of_month: 15,
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

  it("allows converting an existing manual transaction to recurring without backfilling past months", async () => {
    const updateTransaction = vi.fn(async () => {});
    const createRecurringRule = vi.fn(async () => "rule-1");

    renderWithProviders(
      <TransactionEntry
        expenseCategories={[makeExpenseCategory()]}
        incomeCategories={[makeIncomeCategory()]}
        onRefresh={() => {}}
        initialData={{ id: "txn-1", type: "expense", date: "2026-04-05", vendor: "Coffee", amount: 8, category_id: "expense-groceries", category_name: "Groceries", notes: "" }}
      />,
      { firebase: { updateTransaction, createRecurringRule } }
    );

    expect(screen.getByText(/Convert to recurring monthly/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;

    await waitFor(() => {
      expect(updateTransaction).toHaveBeenCalled();
      expect(createRecurringRule).toHaveBeenCalledWith(expect.objectContaining({
        start_date: today,
        day_of_month: 12,
        last_generated_month: previousMonthKey,
      }));
    });
  });
});
