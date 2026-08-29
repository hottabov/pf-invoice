import { describe, it, expect } from "vitest";
import catalogData from "../prisma/seed-data/catalog.json";
import {
  type Catalog,
  REGIONS,
  mapSeries,
  mapProducts,
  mapOptions,
  mapPrices,
  mapCompatibility,
} from "../prisma/seed-lib";

const catalog = catalogData as Catalog;

describe("seed-lib: pure mapping (catalog.json -> upsert payloads)", () => {
  describe("REGIONS", () => {
    it("has exactly 3 regions", () => {
      expect(REGIONS).toHaveLength(3);
    });

    it("has codes AU, US, UK", () => {
      expect(REGIONS.map((r) => r.code).sort()).toEqual(["AU", "UK", "US"]);
    });
  });

  describe("mapSeries", () => {
    const payload = mapSeries(catalog);

    it("has exactly 9 series", () => {
      expect(payload).toHaveLength(9);
    });

    it("includes the XC series", () => {
      expect(payload.some((s) => s.code === "XC")).toBe(true);
    });

    it("assigns sortOrder by array index", () => {
      payload.forEach((s, i) => expect(s.sortOrder).toBe(i));
    });
  });

  describe("mapProducts", () => {
    const payload = mapProducts(catalog);

    it("has exactly 37 total products", () => {
      expect(payload).toHaveLength(37);
    });

    it("assigns sortOrder by index within each series", () => {
      const bySeries = new Map<string, typeof payload>();
      for (const p of payload) {
        const list = bySeries.get(p.seriesCode) ?? [];
        list.push(p);
        bySeries.set(p.seriesCode, list);
      }
      for (const list of bySeries.values()) {
        list.forEach((p, i) => expect(p.sortOrder).toBe(i));
      }
    });

    it("carries description from the catalog", () => {
      const xc = catalog.series.find((s) => s.seriesCode === "XC")!;
      const firstProduct = xc.products[0];
      const mapped = payload.find((p) => p.code === firstProduct.code);
      expect(mapped?.description).toBe(firstProduct.description);
    });
  });

  describe("mapOptions", () => {
    const payload = mapOptions(catalog);

    it("matches the catalog's option count", () => {
      expect(payload).toHaveLength(catalog.options.length);
    });

    it("assigns sortOrder by array index", () => {
      payload.forEach((o, i) => expect(o.sortOrder).toBe(i));
    });

    it("puts description into shortDescription", () => {
      const first = catalog.options[0];
      const mapped = payload.find((o) => o.code === first.code);
      expect(mapped?.shortDescription).toBe(first.description);
    });
  });

  describe("mapPrices", () => {
    const payload = mapPrices(catalog, "AU");
    const totalProducts = catalog.series.reduce((sum, s) => sum + s.products.length, 0);
    const totalItems = totalProducts + catalog.options.length;

    it("has one row per product plus one row per option (AU)", () => {
      expect(payload).toHaveLength(totalItems);
      expect(payload.every((p) => p.regionCode === "AU")).toBe(true);
    });

    it("maps a null-priced product to amount 0 + needsReview true", () => {
      const nullPriced = catalog.series
        .flatMap((s) => s.products)
        .find((p) => p.price === null);
      expect(nullPriced).toBeDefined();
      const mapped = payload.find((p) => p.kind === "product" && p.code === nullPriced!.code);
      expect(mapped).toMatchObject({ amount: 0, needsReview: true });
    });

    it("maps a null-priced option to amount 0 + needsReview true", () => {
      const nullPriced = catalog.options.find((o) => o.price === null);
      expect(nullPriced).toBeDefined();
      const mapped = payload.find((p) => p.kind === "option" && p.code === nullPriced!.code);
      expect(mapped).toMatchObject({ amount: 0, needsReview: true });
    });

    it("preserves catalog price + needsReview for a priced item", () => {
      const priced = catalog.series.flatMap((s) => s.products).find((p) => p.price !== null)!;
      const mapped = payload.find((p) => p.kind === "product" && p.code === priced.code);
      expect(mapped).toMatchObject({ amount: priced.price, needsReview: priced.needsReview });
    });
  });

  describe("mapCompatibility", () => {
    const payload = mapCompatibility(catalog);

    it("has one row per (option, compatibleSeries) pair", () => {
      const expectedCount = catalog.options.reduce((sum, o) => sum + o.compatibleSeries.length, 0);
      expect(payload).toHaveLength(expectedCount);
    });

    it("every row's seriesCode is one the option actually declared", () => {
      const byOption = new Map(catalog.options.map((o) => [o.code, o.compatibleSeries]));
      for (const row of payload) {
        expect(byOption.get(row.optionCode)).toContain(row.seriesCode);
      }
    });
  });
});
