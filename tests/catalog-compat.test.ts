import { describe, it, expect } from "vitest";
import { compatibilityOrFilter } from "../src/lib/catalog-compat";

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
