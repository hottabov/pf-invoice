import { describe, it, expect } from "vitest";
import {
  quoteValidityDaysSchema,
  isAllowedSettingKey,
  ALLOWED_SETTING_KEYS,
} from "../src/lib/validation/settings";

describe("quoteValidityDaysSchema", () => {
  it("accepts the lower bound (1)", () => {
    expect(quoteValidityDaysSchema.safeParse(1).success).toBe(true);
    expect(quoteValidityDaysSchema.safeParse("1").success).toBe(true);
  });

  it("accepts the upper bound (365)", () => {
    expect(quoteValidityDaysSchema.safeParse(365).success).toBe(true);
  });

  it("accepts a typical value (7)", () => {
    const result = quoteValidityDaysSchema.safeParse("7");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(7);
  });

  it("rejects 0", () => {
    expect(quoteValidityDaysSchema.safeParse(0).success).toBe(false);
  });

  it("rejects a negative number", () => {
    expect(quoteValidityDaysSchema.safeParse(-5).success).toBe(false);
  });

  it("rejects a value over 365", () => {
    expect(quoteValidityDaysSchema.safeParse(366).success).toBe(false);
  });

  it("rejects a non-integer", () => {
    expect(quoteValidityDaysSchema.safeParse(7.5).success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    expect(quoteValidityDaysSchema.safeParse("not-a-number").success).toBe(false);
  });

  it("rejects null", () => {
    // Coerced via Number(null) === 0, which then fails the min(1) bound —
    // still a rejection, just via the range check rather than a type error.
    expect(quoteValidityDaysSchema.safeParse(null).success).toBe(false);
  });
});

describe("isAllowedSettingKey", () => {
  it("accepts every key in ALLOWED_SETTING_KEYS", () => {
    for (const key of ALLOWED_SETTING_KEYS) {
      expect(isAllowedSettingKey(key)).toBe(true);
    }
  });

  it("rejects an arbitrary key", () => {
    expect(isAllowedSettingKey("quote.validityDays; DROP TABLE")).toBe(false);
    expect(isAllowedSettingKey("some.other.key")).toBe(false);
    expect(isAllowedSettingKey("")).toBe(false);
  });
});
