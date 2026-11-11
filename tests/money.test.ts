import { describe, it, expect } from "vitest";
import { formatEuro } from "../src/components/money";

// Intl uses non-breaking spaces between number and symbol.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatEuro", () => {
  it("shows cents for normal amounts", () => {
    expect(plain(formatEuro(12.5))).toBe("12,50 €");
    expect(plain(formatEuro(0.01))).toBe("0,01 €");
  });
  it("keeps sub-cent amounts readable without float artifacts", () => {
    expect(plain(formatEuro(0.00022484000000000002))).toBe("0,000225 €");
  });
  it("handles zero and invalid values", () => {
    expect(plain(formatEuro(0))).toBe("0,00 €");
    expect(formatEuro(Number.NaN)).toBe("–");
  });
});
