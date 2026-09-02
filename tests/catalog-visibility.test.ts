import { describe, it, expect } from "vitest";
import {
  catalogVisibilityRegionId,
  isProductHidden,
  isSeriesHidden,
  filterHiddenSeries,
  filterHiddenProducts,
  NO_HIDDEN_CATALOG_IDS,
  type HiddenCatalogIds,
} from "../src/lib/catalog-visibility";

const hidden: HiddenCatalogIds = {
  seriesIds: new Set(["series_X"]),
  productIds: new Set(["prod_M5180"]),
};

describe("catalogVisibilityRegionId", () => {
  it("returns null for an ADMIN, regardless of their own regionId", () => {
    expect(catalogVisibilityRegionId({ role: "ADMIN", regionId: "region_AU" })).toBeNull();
    expect(catalogVisibilityRegionId({ role: "ADMIN", regionId: null })).toBeNull();
  });

  it("returns the user's own regionId for a non-ADMIN", () => {
    expect(catalogVisibilityRegionId({ role: "MANAGER", regionId: "region_AU" })).toBe("region_AU");
  });

  it("returns null for a non-ADMIN with no region assigned (nothing to scope by)", () => {
    expect(catalogVisibilityRegionId({ role: "MANAGER", regionId: null })).toBeNull();
  });

  it("treats a missing session the same as no user (sees everything)", () => {
    expect(catalogVisibilityRegionId(null)).toBeNull();
    expect(catalogVisibilityRegionId(undefined)).toBeNull();
  });
});

describe("isSeriesHidden / isProductHidden", () => {
  it("a region with no rows (NO_HIDDEN_CATALOG_IDS) sees the whole catalogue", () => {
    expect(isSeriesHidden("series_X", NO_HIDDEN_CATALOG_IDS)).toBe(false);
    expect(isProductHidden({ id: "prod_M5180", seriesId: "series_M" }, NO_HIDDEN_CATALOG_IDS)).toBe(false);
  });

  it("flags a series with its own hidden row", () => {
    expect(isSeriesHidden("series_X", hidden)).toBe(true);
    expect(isSeriesHidden("series_M", hidden)).toBe(false);
  });

  it("flags a product hidden by its own row", () => {
    expect(isProductHidden({ id: "prod_M5180", seriesId: "series_M" }, hidden)).toBe(true);
  });

  it("flags a product hidden because its whole series is hidden, even with no product-level row", () => {
    expect(isProductHidden({ id: "prod_X100", seriesId: "series_X" }, hidden)).toBe(true);
  });

  it("leaves a sibling product visible when only its own product row is hidden", () => {
    expect(isProductHidden({ id: "prod_M5190", seriesId: "series_M" }, hidden)).toBe(false);
  });
});

describe("filterHiddenSeries", () => {
  it("removes a hidden series and keeps the rest, for any {id}-shaped row", () => {
    const series = [
      { id: "series_M", name: "M-Series" },
      { id: "series_X", name: "X-Calibre" },
    ];
    expect(filterHiddenSeries(series, hidden)).toEqual([{ id: "series_M", name: "M-Series" }]);
  });

  it("keeps every series when nothing is hidden", () => {
    const series = [{ id: "series_M" }, { id: "series_X" }];
    expect(filterHiddenSeries(series, NO_HIDDEN_CATALOG_IDS)).toEqual(series);
  });
});

describe("filterHiddenProducts", () => {
  it("removes a directly-hidden product and a product whose series is hidden, keeps siblings", () => {
    const products = [
      { id: "prod_M5180", seriesId: "series_M", code: "M5180" }, // directly hidden
      { id: "prod_M5190", seriesId: "series_M", code: "M5190" }, // sibling, stays visible
      { id: "prod_X100", seriesId: "series_X", code: "X100" }, // series hidden
    ];
    expect(filterHiddenProducts(products, hidden)).toEqual([
      { id: "prod_M5190", seriesId: "series_M", code: "M5190" },
    ]);
  });

  it("keeps every product when nothing is hidden", () => {
    const products = [{ id: "prod_M5180", seriesId: "series_M" }];
    expect(filterHiddenProducts(products, NO_HIDDEN_CATALOG_IDS)).toEqual(products);
  });
});
