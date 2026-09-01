import { describe, it, expect } from "vitest";
import {
  customLineSchema,
  discountPctSchema,
  idSchema,
  isPermutation,
  notesSchema,
  optionSelectionSchema,
  optionalIdSchema,
  priceDisplaySchema,
  reorderSchema,
} from "../src/lib/validation/documents";

describe("idSchema", () => {
  it("accepts a cuid-shaped id", () => {
    expect(idSchema.safeParse("cldz9x1a30000abcd1234efgh").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = idSchema.safeParse("  cldz9x1a30000abcd1234efgh  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("cldz9x1a30000abcd1234efgh");
  });

  it("rejects an empty string", () => {
    expect(idSchema.safeParse("").success).toBe(false);
  });

  it("rejects an id shorter than 10 characters", () => {
    expect(idSchema.safeParse("short").success).toBe(false);
  });

  it("rejects an id longer than 40 characters", () => {
    expect(idSchema.safeParse("a".repeat(41)).success).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(idSchema.safeParse(12345).success).toBe(false);
  });
});

describe("optionalIdSchema", () => {
  it("accepts a valid id", () => {
    const result = optionalIdSchema.safeParse("cldz9x1a30000abcd1234efgh");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("cldz9x1a30000abcd1234efgh");
  });

  it("collapses undefined to undefined", () => {
    const result = optionalIdSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses null to undefined", () => {
    const result = optionalIdSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses an empty string to undefined", () => {
    const result = optionalIdSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses a whitespace-only string to undefined", () => {
    const result = optionalIdSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("rejects an invalid non-empty id", () => {
    expect(optionalIdSchema.safeParse("short").success).toBe(false);
  });
});

describe("discountPctSchema", () => {
  it("accepts a two-decimal value", () => {
    const result = discountPctSchema.safeParse("10.55");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(10.55);
  });

  it("rejects a three-decimal value", () => {
    expect(discountPctSchema.safeParse("10.555").success).toBe(false);
  });

  it("rejects a value over 100", () => {
    expect(discountPctSchema.safeParse("101").success).toBe(false);
  });

  it("accepts exactly 100", () => {
    const result = discountPctSchema.safeParse("100");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(100);
  });

  it("accepts exactly 0", () => {
    const result = discountPctSchema.safeParse("0");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });

  it("collapses an empty string to null", () => {
    const result = discountPctSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("collapses null to null", () => {
    const result = discountPctSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("collapses undefined to null", () => {
    const result = discountPctSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("rejects a negative value", () => {
    expect(discountPctSchema.safeParse("-5").success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    expect(discountPctSchema.safeParse("abc").success).toBe(false);
  });
});

describe("customLineSchema", () => {
  const valid = { name: "Delivery", qty: "1", unitPrice: "150.00", description: "" };

  it("accepts valid input", () => {
    const result = customLineSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Delivery",
        qty: 1,
        unitPrice: "150.00",
        description: undefined,
      });
    }
  });

  it("accepts a description", () => {
    const result = customLineSchema.safeParse({ ...valid, description: "Freight to site" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("Freight to site");
  });

  it("rejects an empty name", () => {
    expect(customLineSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    expect(customLineSchema.safeParse({ ...valid, name: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects qty 0", () => {
    expect(customLineSchema.safeParse({ ...valid, qty: "0" }).success).toBe(false);
  });

  it("rejects qty 1000", () => {
    expect(customLineSchema.safeParse({ ...valid, qty: "1000" }).success).toBe(false);
  });

  it("accepts qty at the 999 boundary", () => {
    expect(customLineSchema.safeParse({ ...valid, qty: "999" }).success).toBe(true);
  });

  it("rejects a fractional qty", () => {
    expect(customLineSchema.safeParse({ ...valid, qty: "1.5" }).success).toBe(false);
  });

  it("rejects a negative unit price", () => {
    expect(customLineSchema.safeParse({ ...valid, unitPrice: "-1" }).success).toBe(false);
  });

  it("rejects a unit price with three decimal places", () => {
    expect(customLineSchema.safeParse({ ...valid, unitPrice: "1.234" }).success).toBe(false);
  });

  it("accepts a zero unit price", () => {
    expect(customLineSchema.safeParse({ ...valid, unitPrice: "0" }).success).toBe(true);
  });

  it("rejects a description over 500 characters", () => {
    expect(customLineSchema.safeParse({ ...valid, description: "a".repeat(501) }).success).toBe(false);
  });
});

describe("optionSelectionSchema", () => {
  it("accepts a selection with no attributes", () => {
    const result = optionSelectionSchema.safeParse({ optionCode: "MTS", qty: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ optionCode: "MTS", qty: 1, attributes: undefined });
  });

  it("accepts a selection with attributes", () => {
    const result = optionSelectionSchema.safeParse({
      optionCode: "VRB-180",
      qty: 2,
      attributes: { metres: 4, label: "north" },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.attributes).toEqual({ metres: 4, label: "north" });
  });

  it("rejects a missing option code", () => {
    expect(optionSelectionSchema.safeParse({ optionCode: "", qty: 1 }).success).toBe(false);
  });

  it("rejects qty 0", () => {
    expect(optionSelectionSchema.safeParse({ optionCode: "MTS", qty: 0 }).success).toBe(false);
  });

  it("rejects qty over 999", () => {
    expect(optionSelectionSchema.safeParse({ optionCode: "MTS", qty: 1000 }).success).toBe(false);
  });

  it("rejects a non-string/number attribute value", () => {
    const result = optionSelectionSchema.safeParse({
      optionCode: "MTS",
      qty: 1,
      attributes: { metres: true },
    });
    expect(result.success).toBe(false);
  });
});

describe("reorderSchema", () => {
  const id1 = "cldz9x1a30000abcd1234efgh";
  const id2 = "cldz9x1a30001abcd1234efgh";
  const id3 = "cldz9x1a30002abcd1234efgh";

  it("accepts a list of valid ids", () => {
    const result = reorderSchema.safeParse([id1, id2, id3]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([id1, id2, id3]);
  });

  it("accepts a single id", () => {
    expect(reorderSchema.safeParse([id1]).success).toBe(true);
  });

  it("rejects an empty array", () => {
    expect(reorderSchema.safeParse([]).success).toBe(false);
  });

  it("rejects more than 100 ids", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `cldz9x1a3${String(i).padStart(4, "0")}abcd1234efgh`);
    expect(reorderSchema.safeParse(ids).success).toBe(false);
  });

  it("accepts exactly 100 ids", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `cldz9x1a3${String(i).padStart(4, "0")}abcd1234efgh`);
    expect(reorderSchema.safeParse(ids).success).toBe(true);
  });

  it("rejects a duplicate id", () => {
    expect(reorderSchema.safeParse([id1, id2, id1]).success).toBe(false);
  });

  it("rejects an invalid id in the list", () => {
    expect(reorderSchema.safeParse([id1, "short"]).success).toBe(false);
  });

  it("rejects a non-array value", () => {
    expect(reorderSchema.safeParse(id1).success).toBe(false);
  });
});

describe("isPermutation", () => {
  it("returns true for the same set in a different order", () => {
    expect(isPermutation(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("returns true for identical order", () => {
    expect(isPermutation(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("returns true for two empty arrays", () => {
    expect(isPermutation([], [])).toBe(true);
  });

  it("returns false when a member is missing", () => {
    expect(isPermutation(["a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("returns false when an extra member is present", () => {
    expect(isPermutation(["a", "b", "c"], ["a", "b"])).toBe(false);
  });

  it("returns false when proposed has a duplicate", () => {
    expect(isPermutation(["a", "a"], ["a", "b"])).toBe(false);
  });

  it("returns false when actual has a duplicate", () => {
    expect(isPermutation(["a", "b"], ["a", "a"])).toBe(false);
  });

  it("returns false when sets differ entirely", () => {
    expect(isPermutation(["a", "b"], ["c", "d"])).toBe(false);
  });
});

describe("priceDisplaySchema", () => {
  it("accepts both flags false", () => {
    expect(priceDisplaySchema.safeParse({ showItemPrices: false, showOptionPrices: false }).success).toBe(true);
  });

  it("accepts both flags true", () => {
    expect(priceDisplaySchema.safeParse({ showItemPrices: true, showOptionPrices: true }).success).toBe(true);
  });

  it("rejects a non-boolean value", () => {
    expect(priceDisplaySchema.safeParse({ showItemPrices: "true", showOptionPrices: false }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(priceDisplaySchema.safeParse({ showItemPrices: true }).success).toBe(false);
  });

  it("rejects a non-object input", () => {
    expect(priceDisplaySchema.safeParse(null).success).toBe(false);
  });
});

describe("notesSchema", () => {
  it("collapses a missing/blank body to null (clears notes)", () => {
    for (const value of [undefined, null, "", "   "]) {
      const result = notesSchema.safeParse(value);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    }
  });

  it("accepts and trims a normal markdown body", () => {
    const result = notesSchema.safeParse("  **Important:** handle with care.  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("**Important:** handle with care.");
  });

  it("rejects a body over 5000 characters", () => {
    expect(notesSchema.safeParse("a".repeat(5001)).success).toBe(false);
  });

  it("accepts a body at exactly the 5000 character bound", () => {
    expect(notesSchema.safeParse("a".repeat(5000)).success).toBe(true);
  });
});
