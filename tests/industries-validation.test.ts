import { describe, it, expect } from "vitest";
import { industryNameSchema, normalizeIndustryName } from "../src/lib/validation/industries";

describe("industryNameSchema", () => {
  it("accepts a normal name", () => {
    expect(industryNameSchema.safeParse("Automotive").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = industryNameSchema.safeParse("  Marine upholstery  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Marine upholstery");
  });

  it("rejects an empty string", () => {
    expect(industryNameSchema.safeParse("").success).toBe(false);
  });

  it("rejects whitespace only", () => {
    expect(industryNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a name longer than 80 characters", () => {
    expect(industryNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("normalizeIndustryName", () => {
  it("lowercases for comparison", () => {
    expect(normalizeIndustryName("Automotive")).toBe("automotive");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeIndustryName("Marine   upholstery")).toBe("marine upholstery");
  });

  it("treats differently cased spellings as the same key", () => {
    expect(normalizeIndustryName("AUTOMOTIVE")).toBe(normalizeIndustryName("automotive"));
  });
});
