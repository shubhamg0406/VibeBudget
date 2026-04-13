import { ExpenseCategory, IncomeCategory } from "../types";

type NamedCategory = Pick<ExpenseCategory, "name"> | Pick<IncomeCategory, "name">;
export type CategoryDropdownType = "expense" | "income" | "all";

const uniqueSortedNames = (categories: NamedCategory[]) => (
  Array.from(
    new Set(
      categories
        .map((category) => category.name.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))
);

export const getCategoryDropdownNames = (
  type: CategoryDropdownType,
  expenseCategories: ExpenseCategory[],
  incomeCategories: IncomeCategory[]
) => {
  const expenseNames = uniqueSortedNames(expenseCategories);
  const incomeNames = uniqueSortedNames(incomeCategories);

  if (type === "expense") return expenseNames;
  if (type === "income") return incomeNames;
  return uniqueSortedNames([
    ...expenseNames.map((name) => ({ name })),
    ...incomeNames.map((name) => ({ name })),
  ]);
};

