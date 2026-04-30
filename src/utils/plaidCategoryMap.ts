import type { PlaidCategoryMapping } from "../types";

/**
 * Default mapping from Plaid categories to VibeBudget canonical categories.
 * Plaid returns an array of category strings (e.g., ["Food and Drink", "Restaurants"]).
 * We match against the most specific (last) element first, then fall back to broader ones.
 */
const DEFAULT_PLAID_TO_VIBEBUDGET: Record<string, string> = {
  // Food & Drink
  "Restaurants": "Going out food",
  "Fast Food": "Going out food",
  "Coffee": "Going out food",
  "Bars": "Alcohol + Weed",
  "Food and Drink": "Groceries",
  "Groceries": "Groceries",

  // Transport
  "Gas": "Car fuel",
  "Gas Stations": "Car fuel",
  "Auto Fuel": "Car fuel",
  "Parking": "Public transportation",
  "Tolls": "Public transportation",
  "Ride Share": "Public transportation",
  "Taxi": "Public transportation",
  "Public Transit": "Public transportation",
  "Transportation": "Public transportation",
  "Auto Insurance": "Insurance",
  "Auto Repair": "Car maintenance",
  "Car Wash": "Car maintenance",
  "Auto": "Car maintenance",

  // Housing
  "Rent": "Rent",
  "Mortgage": "Rent",
  "Utilities": "Utilities",
  "Electric": "Utilities",
  "Gas Utility": "Utilities",
  "Water": "Utilities",
  "Internet": "Utilities",
  "Phone": "Phone",
  "Cable": "Entertainment",
  "Home Improvement": "Home maintenance",
  "Home Services": "Home maintenance",
  "Home": "Home maintenance",
  "Property Tax": "Taxes",
  "HOA": "Rent",

  // Health
  "Medical": "Medical",
  "Doctor": "Medical",
  "Dentist": "Medical",
  "Pharmacy": "Medical",
  "Health Insurance": "Insurance",
  "Health": "Medical",
  "Optical": "Medical",
  "Veterinary": "Pets",
  "Pet": "Pets",

  // Shopping
  "Shopping": "Shopping",
  "Clothing": "Clothing",
  "Electronics": "Electronics",
  "Department Stores": "Shopping",
  "Supermarkets": "Groceries",
  "Hardware": "Home maintenance",
  "Sporting Goods": "Shopping",
  "Books": "Entertainment",

  // Entertainment
  "Entertainment": "Entertainment",
  "Movies": "Entertainment",
  "Music": "Entertainment",
  "Streaming": "Entertainment",
  "Gaming": "Entertainment",
  "Recreation": "Entertainment",
  "Sports": "Entertainment",
  "Amusement": "Entertainment",
  "Arts": "Entertainment",

  // Travel
  "Travel": "Travel",
  "Airlines": "Travel",
  "Hotels": "Travel",
  "Lodging": "Travel",
  "Car Rental": "Travel",
  "Cruises": "Travel",

  // Financial
  "Insurance": "Insurance",
  "Life Insurance": "Insurance",
  "Interest": "Bank fees",
  "Bank Fees": "Bank fees",
  "Late Fee": "Bank fees",
  "ATM": "Bank fees",
  "Overdraft": "Bank fees",
  "Transfer": "Transfers",
  "Wire Transfer": "Transfers",
  "Investment": "Investments",
  "Dividend": "Investments",

  // Personal
  "Gym": "Fitness",
  "Fitness": "Fitness",
  "Spa": "Personal care",
  "Beauty": "Personal care",
  "Hair": "Personal care",
  "Barber": "Personal care",
  "Laundry": "Personal care",
  "Dry Cleaning": "Personal care",
  "Education": "Education",
  "Tuition": "Education",
  "Childcare": "Kids",
  "Daycare": "Kids",
  "Charity": "Gifts",
  "Gifts": "Gifts",
  "Donations": "Gifts",

  // Income
  "Paycheck": "Uncategorized",
  "Salary": "Uncategorized",
  "Direct Deposit": "Uncategorized",
  "Refund": "Uncategorized",
  "Reimbursement": "Uncategorized",
  "Interest Income": "Uncategorized",
  "Dividend Income": "Uncategorized",

  // Catch-all
  "Other": "Misc.",
};

/**
 * Map a Plaid category array to a VibeBudget category name.
 * Tries the most specific (last) category first, then walks backwards.
 */
export const mapPlaidCategory = (
  plaidCategories: string[] | undefined,
  userMappings: PlaidCategoryMapping[],
): string => {
  if (!plaidCategories || plaidCategories.length === 0) return "Misc.";

  // Build a lookup from user overrides (takes precedence)
  const userMap = new Map<string, string>();
  for (const mapping of userMappings) {
    userMap.set(mapping.plaidCategory.toLowerCase(), mapping.vibeBudgetCategory);
  }

  // Walk from most specific (last) to broadest (first)
  for (let i = plaidCategories.length - 1; i >= 0; i--) {
    const plaidCat = plaidCategories[i];
    const lower = plaidCat.toLowerCase();

    // Check user override first
    const userMatch = userMap.get(lower);
    if (userMatch) return userMatch;

    // Check default mapping
    const defaultMatch = DEFAULT_PLAID_TO_VIBEBUDGET[plaidCat];
    if (defaultMatch) return defaultMatch;
  }

  return "Misc.";
};

/**
 * Get the full default mapping for display purposes.
 */
export const getDefaultPlaidCategoryMappings = (): Record<string, string> => {
  return { ...DEFAULT_PLAID_TO_VIBEBUDGET };
};
