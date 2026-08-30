import { describe, it, expect } from "vitest";
import { formatDocNumber } from "../src/lib/numbering";

describe("formatDocNumber", () => {
  it("formats a quote number with the Q prefix", () => {
    expect(formatDocNumber("QUOTE", "AU", 2026, 1)).toBe("Q-AU-2026-001");
  });

  it("formats an invoice number with the INV prefix", () => {
    expect(formatDocNumber("INVOICE", "AU", 2026, 1)).toBe("INV-AU-2026-001");
  });

  it("zero-pads the counter to 3 digits", () => {
    expect(formatDocNumber("QUOTE", "AU", 2026, 7)).toBe("Q-AU-2026-007");
    expect(formatDocNumber("QUOTE", "AU", 2026, 42)).toBe("Q-AU-2026-042");
    expect(formatDocNumber("QUOTE", "AU", 2026, 999)).toBe("Q-AU-2026-999");
  });

  it("grows naturally past 999 instead of truncating", () => {
    expect(formatDocNumber("QUOTE", "AU", 2026, 1000)).toBe("Q-AU-2026-1000");
    expect(formatDocNumber("INVOICE", "AU", 2026, 12345)).toBe("INV-AU-2026-12345");
  });

  it("uses the given region code and year verbatim", () => {
    expect(formatDocNumber("INVOICE", "US", 2027, 3)).toBe("INV-US-2027-003");
  });
});
