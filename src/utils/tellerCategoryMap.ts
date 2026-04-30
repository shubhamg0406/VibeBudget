import type { TellerCategoryMapping } from "../types";

/**
 * Default mapping from Teller transaction descriptions/categories to
 * VibeBudget canonical categories.
 *
 * Teller doesn't return structured categories like Plaid. Instead, we
 * match against the transaction description and details.category fields.
 */
const DEFAULT_TELLER_TO_VIBEBUDGET: Record<string, string> = {
  // Food & Drink
  "restaurant": "Going out food",
  "fast food": "Going out food",
  "coffee": "Going out food",
  "cafe": "Going out food",
  "bar": "Alcohol + Weed",
  "brewery": "Alcohol + Weed",
  "liquor": "Alcohol + Weed",
  "grocery": "Groceries",
  "supermarket": "Groceries",
  "food": "Groceries",

  // Transport
  "gas": "Car fuel",
  "fuel": "Car fuel",
  "parking": "Public transportation",
  "toll": "Public transportation",
  "transit": "Public transportation",
  "uber": "Public transportation",
  "lyft": "Public transportation",
  "taxi": "Public transportation",
  "auto insurance": "Insurance",
  "car insurance": "Insurance",
  "auto repair": "Car maintenance",
  "car repair": "Car maintenance",
  "car wash": "Car maintenance",
  "maintenance": "Car maintenance",

  // Housing
  "rent": "Rent",
  "mortgage": "Rent",
  "utility": "Utilities",
  "electric": "Utilities",
  "power": "Utilities",
  "water": "Utilities",
  "internet": "Utilities",
  "phone": "Telecom",
  "cable": "Entertainment",
  "home improvement": "Household Items",
  "hardware": "Household Items",
  "property tax": "Misc.",
  "hoa": "Rent",

  // Health
  "medical": "Medical",
  "doctor": "Medical",
  "dentist": "Medical",
  "pharmacy": "Medical",
  "drug": "Medical",
  "health": "Medical",
  "optical": "Medical",
  "vet": "Medical",
  "veterinary": "Medical",
  "pet": "Misc.",

  // Shopping
  "clothing": "Clothing",
  "apparel": "Clothing",
  "electronics": "Electronics",
  "department": "Shopping",
  "retail": "Shopping",
  "sporting": "Shopping",
  "book": "Entertainment",
  "amazon": "Shopping",

  // Entertainment
  "movie": "Entertainment",
  "theatre": "Entertainment",
  "theater": "Entertainment",
  "music": "Entertainment",
  "streaming": "Entertainment",
  "netflix": "Entertainment",
  "spotify": "Entertainment",
  "game": "Entertainment",
  "recreation": "Entertainment",
  "sport": "Entertainment",
  "amusement": "Entertainment",
  "concert": "Entertainment",

  // Travel
  "airline": "Travel",
  "flight": "Travel",
  "hotel": "Travel",
  "lodging": "Travel",
  "motel": "Travel",
  "car rental": "Travel",
  "travel": "Travel",

  // Financial
  "insurance": "Insurance",
  "bank fee": "Misc.",
  "service fee": "Misc.",
  "atm": "Misc.",
  "interest": "Misc.",
  "transfer": "Misc.",
  "wire": "Misc.",
  "investment": "Canada Investments",
  "dividend": "Canada Investments",

  // Personal
  "gym": "Misc.",
  "fitness": "Misc.",
  "spa": "Misc.",
  "beauty": "Misc.",
  "salon": "Misc.",
  "barber": "Misc.",
  "laundry": "Misc.",
  "education": "Misc.",
  "tuition": "Misc.",
  "childcare": "Misc.",
  "daycare": "Misc.",
  "charity": "Donation",
  "donation": "Donation",
  "gift": "Gifts",

  // Income
  "payroll": "Uncategorized",
  "salary": "Uncategorized",
  "direct deposit": "Uncategorized",
  "refund": "Uncategorized",
  "reimbursement": "Uncategorized",
  "deposit": "Uncategorized",

  // Catch-all
  "other": "Misc.",
  "misc": "Misc.",
  "miscellaneous": "Misc.",
};

/**
 * Map a Teller transaction to a VibeBudget category name.
 * Matches against description, details.category, and details.merchant.
 */
export const mapTellerCategory = (
  transaction: { description: string; details?: { category?: string; merchant?: string } },
  userMappings: TellerCategoryMapping[],
): string => {
  // Build a lookup from user overrides (takes precedence)
  const userMap = new Map<string, string>();
  for (const mapping of userMappings) {
    userMap.set(mapping.tellerCategory.toLowerCase(), mapping.vibeBudgetCategory);
  }

  // Collect all text sources to match against
  const texts: string[] = [];
  if (transaction.details?.category) texts.push(transaction.details.category);
  if (transaction.details?.merchant) texts.push(transaction.details.merchant);
  texts.push(transaction.description);

  // Try each text source
  for (const text of texts) {
    const lower = text.toLowerCase().trim();

    // Check user override first (exact match)
    const userMatch = userMap.get(lower);
    if (userMatch) return userMatch;

    // Check default mapping (exact match)
    const defaultMatch = DEFAULT_TELLER_TO_VIBEBUDGET[lower];
    if (defaultMatch) return defaultMatch;

    // Check partial matches (e.g., "Shell Gas" matches "gas")
    for (const [key, value] of Object.entries(DEFAULT_TELLER_TO_VIBEBUDGET)) {
      if (lower.includes(key)) return value;
    }
  }

  return "Misc.";
};

/**
 * Get the full default mapping for display purposes.
 */
export const getDefaultTellerCategoryMappings = (): Record<string, string> => {
  return { ...DEFAULT_TELLER_TO_VIBEBUDGET };
};
