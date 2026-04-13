import type {
  ExpenseCategory,
  Income,
  IncomeCategory,
  Preferences,
  Transaction,
} from "../../src/types";

export const makeExpenseCategory = (overrides: Partial<ExpenseCategory> = {}): ExpenseCategory => ({
  id: "expense-groceries",
  name: "Groceries",
  target_amount: 500,
  ...overrides,
});

export const makeIncomeCategory = (overrides: Partial<IncomeCategory> = {}): IncomeCategory => ({
  id: "income-salary",
  name: "Salary",
  target_amount: 5000,
  ...overrides,
});

export const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "txn-1",
  date: "2026-04-05",
  vendor: "Save-On Foods",
  amount: 120.35,
  currency: "CAD",
  category_id: "expense-groceries",
  category_name: "Groceries",
  notes: "Weekly groceries",
  ...overrides,
});

export const makeIncome = (overrides: Partial<Income> = {}): Income => ({
  id: "inc-1",
  date: "2026-04-01",
  source: "Employer",
  amount: 4500,
  currency: "CAD",
  category_id: "income-salary",
  category: "Salary",
  notes: "Payday",
  ...overrides,
});

export const makePreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  baseCurrency: "CAD",
  exchangeRates: [{ currency: "USD", rateToBase: 1.37 }],
  coreExcludedCategories: [],
  ...overrides,
});
