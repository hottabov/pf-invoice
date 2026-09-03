import { describe, it, expect } from "vitest";
import {
  quoteValidityDaysSchema,
  showOptionIconsSchema,
  commissionTiersSchema,
  isAllowedSettingKey,
  ALLOWED_SETTING_KEYS,
} from "../src/lib/validation/settings";
import { DEFAULT_COMMISSION_TIERS } from "../src/lib/pricing";

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

describe("showOptionIconsSchema", () => {
  it("accepts the literal string \"true\" and transforms to boolean true", () => {
    const result = showOptionIconsSchema.safeParse("true");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it("accepts the literal string \"false\" and transforms to boolean false", () => {
    const result = showOptionIconsSchema.safeParse("false");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("rejects a native boolean (only the two literal strings are accepted)", () => {
    expect(showOptionIconsSchema.safeParse(true).success).toBe(false);
    expect(showOptionIconsSchema.safeParse(false).success).toBe(false);
  });

  it("rejects an arbitrary string, null, or undefined", () => {
    expect(showOptionIconsSchema.safeParse("on").success).toBe(false);
    expect(showOptionIconsSchema.safeParse("").success).toBe(false);
    expect(showOptionIconsSchema.safeParse(null).success).toBe(false);
    expect(showOptionIconsSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("commissionTiersSchema", () => {
  it("accepts the default table as JSON", () => {
    const result = commissionTiersSchema.safeParse(JSON.stringify(DEFAULT_COMMISSION_TIERS));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(DEFAULT_COMMISSION_TIERS);
  });

  it("accepts an empty array (clearing the table)", () => {
    const result = commissionTiersSchema.safeParse("[]");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it("rejects text that isn't valid JSON", () => {
    const result = commissionTiersSchema.safeParse("not json");
    expect(result.success).toBe(false);
  });

  it("rejects JSON that isn't an array of tier rows", () => {
    expect(commissionTiersSchema.safeParse('{"minPct":0}').success).toBe(false);
    expect(commissionTiersSchema.safeParse('[{"minPct":"0","maxPct":null,"ratePct":5}]').success).toBe(false);
  });

  it("rejects a table with a gap, surfacing validateCommissionTiers's message", () => {
    const tiers = [
      { minPct: 0, maxPct: 5, ratePct: 5 },
      { minPct: 6, maxPct: null, ratePct: 4 },
    ];
    const result = commissionTiersSchema.safeParse(JSON.stringify(tiers));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/gap/);
  });

  it("rejects a table not starting at 0%", () => {
    const tiers = [{ minPct: 1, maxPct: null, ratePct: 5 }];
    const result = commissionTiersSchema.safeParse(JSON.stringify(tiers));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/start at 0/);
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
