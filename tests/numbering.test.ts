import { describe, it, expect } from "vitest";
import { formatDocNumber } from "../src/lib/numbering";

describe("formatDocNumber", () => {
  it("formats a quote number", () => {
    expect(formatDocNumber("AU", 2026, 1)).toBe("Q-AU-2026-001");
  });

  it("pads to three digits and grows past 999", () => {
    expect(formatDocNumber("AU", 2026, 42)).toBe("Q-AU-2026-042");
    expect(formatDocNumber("AU", 2026, 1234)).toBe("Q-AU-2026-1234");
  });
});
