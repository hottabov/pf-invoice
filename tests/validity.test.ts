import { describe, it, expect } from "vitest";
import { validityDaysSchema } from "@/lib/validation/documents";

describe("validity days", () => {
  it("accepts a value inside the usual range", () => {
    expect(validityDaysSchema.safeParse("30").success).toBe(true);
  });

  it("accepts a longer window for a slow capex process", () => {
    expect(validityDaysSchema.safeParse("56").success).toBe(true);
  });

  it("clears to null when empty", () => {
    expect(validityDaysSchema.parse("")).toBeNull();
  });

  it("rejects zero and negatives", () => {
    expect(validityDaysSchema.safeParse("0").success).toBe(false);
    expect(validityDaysSchema.safeParse("-5").success).toBe(false);
  });
});
