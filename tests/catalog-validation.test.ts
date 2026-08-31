import { describe, it, expect } from "vitest";
import {
  productSchema,
  optionSchema,
  priceInputSchema,
  compatDiff,
  maxDiscountPctSchema,
} from "../src/lib/validation/catalog";

describe("productSchema", () => {
  const base = {
    code: "M5180",
    name: "M5180 Cutter",
    description: "A cutting machine",
    active: "on",
    sortOrder: "3",
  };

  it("accepts a valid code and stores it exactly as entered (no case normalization)", () => {
    const result = productSchema.safeParse({ ...base, code: "m5180" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("m5180");
      expect(result.data.active).toBe(true);
      expect(result.data.sortOrder).toBe(3);
    }
  });

  it("accepts real seeded codes: long, mixed case, with parens/slashes/commas/apostrophes", () => {
    for (const code of [
      "Drills included",
      "MTS- additional gantry",
      "M5.180",
      "A/B",
      "Waste Bin-180",
      "Drill Guard (heavy duty), incl. mounting bracket's hardware",
      "A".repeat(120),
    ]) {
      const result = productSchema.safeParse({ ...base, code });
      expect(result.success, `expected "${code}" to be valid`).toBe(true);
      if (result.success) expect(result.data.code).toBe(code);
    }
  });

  it("accepts a single-character code", () => {
    const result = productSchema.safeParse({ ...base, code: "A" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty code", () => {
    const result = productSchema.safeParse({ ...base, code: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a code over 120 characters", () => {
    const result = productSchema.safeParse({ ...base, code: "A".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("accepts a code at exactly the 120 character bound", () => {
    const result = productSchema.safeParse({ ...base, code: "A".repeat(120) });
    expect(result.success).toBe(true);
  });

  it("rejects a code with leading whitespace", () => {
    const result = productSchema.safeParse({ ...base, code: " M5180" });
    expect(result.success).toBe(false);
  });

  it("rejects a code with trailing whitespace", () => {
    const result = productSchema.safeParse({ ...base, code: "M5180 " });
    expect(result.success).toBe(false);
  });

  it("rejects a code containing a control character (tab, newline, null)", () => {
    for (const code of ["M5180\t", "M5180\n", "M51\x0080"]) {
      const result = productSchema.safeParse({ ...base, code });
      expect(result.success, `expected ${JSON.stringify(code)} to be invalid`).toBe(false);
    }
  });

  it("accepts codes containing internal spaces and hyphens", () => {
    for (const code of ["M51 80", "80-code"]) {
      const result = productSchema.safeParse({ ...base, code });
      expect(result.success, `expected "${code}" to be valid`).toBe(true);
    }
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = productSchema.safeParse({ ...base, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    const result = productSchema.safeParse({ ...base, name: "A".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 2000 characters", () => {
    const result = productSchema.safeParse({ ...base, description: "A".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("treats a missing/null description as absent, not an error", () => {
    const result = productSchema.safeParse({ ...base, description: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeUndefined();
  });

  describe("checkbox coercion for `active`", () => {
    it('coerces the raw FormData "on" value to true', () => {
      const result = productSchema.safeParse({ ...base, active: "on" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.active).toBe(true);
    });

    it("coerces a missing/null value (unchecked checkbox) to false", () => {
      const result = productSchema.safeParse({ ...base, active: null });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.active).toBe(false);
    });

    it("coerces an actual boolean straight through", () => {
      expect(productSchema.safeParse({ ...base, active: true }).success).toBe(true);
      const result = productSchema.safeParse({ ...base, active: true });
      if (result.success) expect(result.data.active).toBe(true);
    });

    it('treats any other string (e.g. "off") as false', () => {
      const result = productSchema.safeParse({ ...base, active: "off" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.active).toBe(false);
    });
  });

  describe("sortOrder", () => {
    it("defaults an empty/missing value to 0", () => {
      for (const sortOrder of ["", null, undefined]) {
        const result = productSchema.safeParse({ ...base, sortOrder });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.sortOrder).toBe(0);
      }
    });

    it("coerces a numeric string", () => {
      const result = productSchema.safeParse({ ...base, sortOrder: "12" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sortOrder).toBe(12);
    });

    it("rejects a negative sort order", () => {
      const result = productSchema.safeParse({ ...base, sortOrder: "-1" });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer sort order", () => {
      const result = productSchema.safeParse({ ...base, sortOrder: "1.5" });
      expect(result.success).toBe(false);
    });
  });
});

describe("optionSchema", () => {
  const base = {
    code: "MTS",
    name: "Mid Travel Skate",
    active: "on",
    sortOrder: "0",
    shortDescription: "A skate option",
    attributeSchema: "",
  };

  it("accepts a valid option with all product fields plus option-only fields", () => {
    const result = optionSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects a shortDescription over 500 characters", () => {
    const result = optionSchema.safeParse({ ...base, shortDescription: "A".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("still enforces the base product code/name rules", () => {
    expect(optionSchema.safeParse({ ...base, code: " leading space" }).success).toBe(false);
    expect(optionSchema.safeParse({ ...base, code: "" }).success).toBe(false);
    expect(optionSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  describe("attributeSchema JSON refine", () => {
    it("collapses an empty string to null", () => {
      const result = optionSchema.safeParse({ ...base, attributeSchema: "" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.attributeSchema).toBeNull();
    });

    it("collapses whitespace-only input to null", () => {
      const result = optionSchema.safeParse({ ...base, attributeSchema: "   " });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.attributeSchema).toBeNull();
    });

    it("collapses a missing/null value to null", () => {
      const result = optionSchema.safeParse({ ...base, attributeSchema: null });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.attributeSchema).toBeNull();
    });

    it("parses a valid JSON array", () => {
      const result = optionSchema.safeParse({
        ...base,
        attributeSchema: '[{"key":"metres","label":"Travel (m)","type":"number"}]',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attributeSchema).toEqual([
          { key: "metres", label: "Travel (m)", type: "number" },
        ]);
      }
    });

    it("parses a valid JSON object", () => {
      const result = optionSchema.safeParse({ ...base, attributeSchema: '{"metres":4}' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.attributeSchema).toEqual({ metres: 4 });
    });

    it("rejects malformed JSON", () => {
      const result = optionSchema.safeParse({ ...base, attributeSchema: "{not json" });
      expect(result.success).toBe(false);
    });

    it("rejects valid JSON that isn't an array or object (e.g. a bare number or string)", () => {
      expect(optionSchema.safeParse({ ...base, attributeSchema: "123" }).success).toBe(false);
      expect(optionSchema.safeParse({ ...base, attributeSchema: '"hello"' }).success).toBe(false);
      expect(optionSchema.safeParse({ ...base, attributeSchema: "null" }).success).toBe(false);
      expect(optionSchema.safeParse({ ...base, attributeSchema: "true" }).success).toBe(false);
    });
  });
});

describe("priceInputSchema", () => {
  it('allows an empty amount ("" = clear the price)', () => {
    const result = priceInputSchema.safeParse({ regionCode: "AU", amount: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe("");
  });

  it("accepts a whole-number amount", () => {
    expect(priceInputSchema.safeParse({ regionCode: "AU", amount: "175000" }).success).toBe(true);
  });

  it("accepts an amount with exactly 2 decimal places", () => {
    expect(priceInputSchema.safeParse({ regionCode: "AU", amount: "12.50" }).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(priceInputSchema.safeParse({ regionCode: "AU", amount: "-1" }).success).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    expect(priceInputSchema.safeParse({ regionCode: "AU", amount: "1.234" }).success).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(priceInputSchema.safeParse({ regionCode: "AU", amount: "abc" }).success).toBe(false);
  });

  it("uppercases a lowercase region code", () => {
    const result = priceInputSchema.safeParse({ regionCode: "au", amount: "100" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.regionCode).toBe("AU");
  });

  it("rejects a region code that isn't 2-3 letters", () => {
    for (const regionCode of ["A", "ABCD", "A1", ""]) {
      expect(priceInputSchema.safeParse({ regionCode, amount: "100" }).success, regionCode).toBe(
        false
      );
    }
  });
});

describe("compatDiff", () => {
  it("returns empty add/remove when current and submitted match", () => {
    expect(compatDiff(["M", "L"], ["M", "L"])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("returns empty add/remove for two empty lists", () => {
    expect(compatDiff([], [])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("detects additions", () => {
    expect(compatDiff(["M"], ["M", "L"])).toEqual({ toAdd: ["L"], toRemove: [] });
  });

  it("detects removals", () => {
    expect(compatDiff(["M", "L"], ["M"])).toEqual({ toAdd: [], toRemove: ["L"] });
  });

  it("detects a mix of additions and removals", () => {
    expect(compatDiff(["M", "L"], ["L", "XC"])).toEqual({ toAdd: ["XC"], toRemove: ["M"] });
  });

  it("handles clearing all compatibility", () => {
    expect(compatDiff(["M", "L"], [])).toEqual({ toAdd: [], toRemove: ["M", "L"] });
  });

  it("handles adding to an empty current list", () => {
    expect(compatDiff([], ["M", "L"])).toEqual({ toAdd: ["M", "L"], toRemove: [] });
  });
});

describe("maxDiscountPctSchema", () => {
  it("collapses an empty string to null (no cap)", () => {
    const result = maxDiscountPctSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("collapses a missing/null value to null", () => {
    expect(maxDiscountPctSchema.safeParse(null).success).toBe(true);
    expect(maxDiscountPctSchema.safeParse(undefined).success).toBe(true);
  });

  it("accepts an integer percentage", () => {
    const result = maxDiscountPctSchema.safeParse("10");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(10);
  });

  it("accepts up to 2 decimal places", () => {
    const result = maxDiscountPctSchema.safeParse("12.5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(12.5);
  });

  it("accepts the boundary values 0 and 100", () => {
    expect(maxDiscountPctSchema.safeParse("0").success).toBe(true);
    expect(maxDiscountPctSchema.safeParse("100").success).toBe(true);
  });

  it("rejects more than 2 decimal places", () => {
    expect(maxDiscountPctSchema.safeParse("10.555").success).toBe(false);
  });

  it("rejects a value above 100", () => {
    expect(maxDiscountPctSchema.safeParse("101").success).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(maxDiscountPctSchema.safeParse("-5").success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    expect(maxDiscountPctSchema.safeParse("abc").success).toBe(false);
  });
});
