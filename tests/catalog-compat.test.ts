import { describe, it, expect } from "vitest";
import { compatibilityOrFilter, isOptionDisabled } from "../src/lib/catalog-compat";

describe("compatibilityOrFilter", () => {
  it("includes both clauses when both ids are present (product-level compat within a series)", () => {
    expect(compatibilityOrFilter("prod_EL2020", "series_EL")).toEqual([
      { seriesId: "series_EL" },
      { productId: "prod_EL2020" },
    ]);
  });

  it("includes only the series clause when productId is missing", () => {
    expect(compatibilityOrFilter(null, "series_EL")).toEqual([{ seriesId: "series_EL" }]);
  });

  it("includes only the product clause when seriesId is missing", () => {
    expect(compatibilityOrFilter("prod_EL2020", null)).toEqual([{ productId: "prod_EL2020" }]);
  });

  it("returns null when neither id is present", () => {
    expect(compatibilityOrFilter(null, null)).toBeNull();
  });

  it("treats undefined the same as null", () => {
    expect(compatibilityOrFilter(undefined, undefined)).toBeNull();
  });

  it("treats an empty string id as absent", () => {
    expect(compatibilityOrFilter("", "")).toBeNull();
  });
});

describe("isOptionDisabled", () => {
  // Change 2 ("an incompatible pairing warns instead of blocking"): a price
  // is a different condition from compatibility — the quote literally
  // cannot be priced without one — and stays a hard disable. Compatibility
  // itself is advisory only from here down (see `CompatibleOption.compatible`
  // in src/lib/queries/documents.ts) and is deliberately not even an input
  // to this function, so an incompatible-but-priced option can never be
  // disabled through it, by construction.

  it("disables an option with no price row at all", () => {
    expect(isOptionDisabled(null)).toBe(true);
  });

  it("disables an option whose only price needs review", () => {
    expect(isOptionDisabled({ needsReview: true })).toBe(true);
  });

  it("does not disable a priced, reviewed option", () => {
    expect(isOptionDisabled({ needsReview: false })).toBe(false);
  });
});
