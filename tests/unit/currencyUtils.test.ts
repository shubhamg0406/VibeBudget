import { describe, expect, it } from "vitest";
import { convertToBaseCurrency, getCurrencySymbol } from "../../src/utils/currencyUtils";
import { makePreferences } from "../utils/fixtures";

describe("currencyUtils", () => {
  it("returns a fallback symbol when the code is unknown", () => {
    expect(getCurrencySymbol("CAD")).toBe("$");
    expect(getCurrencySymbol("ZZZ")).toBe("$");
  });

  it("converts amounts using the configured exchange rate", () => {
    const preferences = makePreferences();
    expect(convertToBaseCurrency(100, "USD", preferences)).toBe(137);
  });

  it("falls back to the original amount when no rate exists", () => {
    const preferences = makePreferences({ exchangeRates: [] });
    expect(convertToBaseCurrency(100, "EUR", preferences)).toBe(100);
  });
});
