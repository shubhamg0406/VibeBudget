import { Preferences } from "../types";

export const CURRENCIES = [
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
];

export const getCurrencySymbol = (code: string | undefined): string => {
  if (!code) return "$";
  const currency = CURRENCIES.find(c => c.code === code);
  return currency ? currency.symbol : "$";
};

export const convertToBaseCurrency = (
  amount: number,
  currency: string | undefined,
  preferences: Preferences | undefined
): number => {
  if (!amount) return 0;
  
  // Default to base currency if none specified
  const effectiveCurrency = currency || preferences?.baseCurrency || "CAD";
  const baseCurrency = preferences?.baseCurrency || "CAD";

  if (effectiveCurrency === baseCurrency) {
    return amount;
  }

  // Find the exchange rate 
  const rateObj = preferences?.exchangeRates?.find(r => r.currency === effectiveCurrency);
  
  // If no rate is found, just return original amount (or could return 0 if we want to be strict)
  // But generally if no rate, assume 1:1 fallback
  if (!rateObj || !rateObj.rateToBase) {
    return amount;
  }

  return amount * rateObj.rateToBase;
};
