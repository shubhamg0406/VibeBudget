import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__VIBEBUDGET_TEST_STATE__ = {
      user: {
        uid: "playwright-user",
        email: "playwright@vibebudget.dev",
        displayName: "Playwright User",
      },
      expenseCategories: [
        { id: "expense-groceries", name: "Groceries", target_amount: 500 },
        { id: "expense-rent", name: "Rent", target_amount: 1800 },
      ],
      incomeCategories: [
        { id: "income-salary", name: "Salary", target_amount: 5000 },
      ],
      transactions: [
        {
          id: "txn-seed",
          date: "2026-04-05",
          vendor: "Save-On Foods",
          amount: 100,
          currency: "CAD",
          category_id: "expense-groceries",
          category_name: "Groceries",
          notes: "Seed data",
        },
      ],
      income: [
        {
          id: "inc-seed",
          date: "2026-04-01",
          source: "Employer",
          amount: 3000,
          currency: "CAD",
          category_id: "income-salary",
          category: "Salary",
          notes: "Seed income",
        },
      ],
      preferences: {
        baseCurrency: "CAD",
        exchangeRates: [{ currency: "USD", rateToBase: 1.37 }],
        coreExcludedCategories: [],
      },
    };
  });
});

test("boots in mock mode, navigates core views, and can add an expense", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Transactions" }).click();
  const addTransactionFab = page.locator('button[aria-label="Add transaction"]');
  await expect(addTransactionFab).toBeVisible();
  await addTransactionFab.click();

  await page.getByPlaceholder("Amazon, Starbucks, etc.").fill("Local Cafe");
  await page.getByPlaceholder("Search and select category...").click();
  await page.getByRole("button", { name: "Groceries" }).click();
  await page.getByPlaceholder("0.00 or =100+20").fill("25");
  await page.getByRole("button", { name: /Add Expense/i }).click();

  await expect(page.getByText("Local Cafe").first()).toBeVisible();

  await page.getByRole("button", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Cloud Sync" }).click();
  await expect(page.getByPlaceholder("https://docs.google.com/spreadsheets/d/...")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
