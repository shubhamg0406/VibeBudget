import { describe, expect, it } from "vitest";
import { parseAndroidNotificationHistory } from "../../src/utils/androidNotificationImport";

describe("parseAndroidNotificationHistory", () => {
  it("parses debit entries from JSON notification exports", () => {
    const raw = JSON.stringify([
      {
        title: "HDFC Bank",
        text: "A/c XX1234 debited for INR 1,299.50 at SWIGGY on 24/04/2026. Avl bal INR 22,000.",
        postTime: 1777008000000,
      },
    ]);

    const result = parseAndroidNotificationHistory(raw, "expenses");
    expect(result.ignoredCount).toBe(0);
    expect(result.rows).toEqual([
      [
        "2026-04-23",
        "SWIGGY",
        1299.5,
        "Bank Alerts",
        "HDFC Bank: A/c XX1234 debited for INR 1,299.50 at SWIGGY on 24/04/2026. Avl bal INR 22,000.",
      ],
    ]);
  });

  it("parses credited salary lines for income imports", () => {
    const raw = "ICICI BANK: Salary credited INR 85,000 from ACME CORP on 2026-04-01.";
    const result = parseAndroidNotificationHistory(raw, "income");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual([
      "2026-04-01",
      "ACME CORP",
      85000,
      "Bank Credits",
      "ICICI BANK: Salary credited INR 85,000 from ACME CORP on 2026-04-01.",
    ]);
  });

  it("filters OTP and non-transaction notifications", () => {
    const raw = [
      "HDFC OTP 884199 for txn login. Do not share.",
      "Promo: cashback unlocked this weekend.",
      "SBI A/c XX111 debited Rs 250 at UBER on 12-04-26",
    ].join("\n");

    const result = parseAndroidNotificationHistory(raw, "expenses");
    expect(result.rows).toHaveLength(1);
    expect(result.ignoredCount).toBe(2);
    expect(result.rows[0][1]).toBe("UBER");
    expect(result.rows[0][2]).toBe(250);
  });
});
