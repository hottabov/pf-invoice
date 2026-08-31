import { describe, it, expect } from "vitest";
import catalogData from "../prisma/seed-data/catalog.json";
import usPricesData from "../prisma/seed-data/prices-us.json";
import { type Catalog, type UsPricesJson, mapUsPrices, missingUsPriceCodes } from "../prisma/seed-lib";

const catalog = catalogData as Catalog;
const usPrices = usPricesData as UsPricesJson;

describe("prices-us.json well-formedness", () => {
  it("has a valid extractedAt timestamp", () => {
    expect(usPrices.extractedAt).toBeDefined();
    const timestamp = new Date(usPrices.extractedAt);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it("prices is a non-empty array of {code, amountUsd}", () => {
    expect(Array.isArray(usPrices.prices)).toBe(true);
    expect(usPrices.prices.length).toBeGreaterThan(0);
    for (const p of usPrices.prices) {
      expect(typeof p.code).toBe("string");
      expect(p.code.length).toBeGreaterThan(0);
      expect(typeof p.amountUsd).toBe("number");
      expect(Number.isFinite(p.amountUsd)).toBe(true);
    }
  });

  it("unmatched is an array of {sheet, label, price}", () => {
    expect(Array.isArray(usPrices.unmatched)).toBe(true);
    for (const u of usPrices.unmatched) {
      expect(typeof u.sheet).toBe("string");
      expect(u.sheet.length).toBeGreaterThan(0);
      expect(typeof u.label).toBe("string");
      expect(u.label.length).toBeGreaterThan(0);
      expect(typeof u.price).toBe("number");
    }
  });

  it("has no duplicate codes", () => {
    const codes = usPrices.prices.map((p) => p.code);
    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(duplicates).toEqual([]);
  });

  it("every price amount is rounded to at most 2 decimal places", () => {
    for (const p of usPrices.prices) {
      expect(Math.round(p.amountUsd * 100) / 100).toBe(p.amountUsd);
    }
  });
});

describe("prices-us.json <-> catalog.json consistency", () => {
  it("every priced code exists in catalog.json (as a product or an option)", () => {
    const productCodes = new Set(catalog.series.flatMap((s) => s.products.map((p) => p.code)));
    const optionCodes = new Set(catalog.options.map((o) => o.code));

    const missing = usPrices.prices.filter((p) => !productCodes.has(p.code) && !optionCodes.has(p.code));
    expect(missing.map((p) => p.code)).toEqual([]);
  });

  it("mapUsPrices resolves every priced entry to a product or option (no unknownCodes)", () => {
    const mapping = mapUsPrices(catalog, usPrices);
    expect(mapping.unknownCodes).toEqual([]);
    expect(mapping.payloads).toHaveLength(usPrices.prices.length);
    for (const payload of mapping.payloads) {
      expect(payload.regionCode).toBe("US");
      expect(payload.needsReview).toBe(false);
    }
  });

  it("missingUsPriceCodes only lists real catalog codes, never a priced one", () => {
    const missing = missingUsPriceCodes(catalog, usPrices);
    const pricedCodes = new Set(usPrices.prices.map((p) => p.code));
    for (const code of missing) {
      expect(pricedCodes.has(code)).toBe(false);
    }
  });
});

describe("Spot Price Validation (USD)", () => {
  const byCode = new Map(usPrices.prices.map((p) => [p.code, p.amountUsd]));

  it("M3180 = 163350", () => {
    expect(byCode.get("M3180")).toBe(163350);
  });

  it("X-10180 = 248000", () => {
    expect(byCode.get("X-10180")).toBe(248000);
  });

  it("L-180 = 118029", () => {
    expect(byCode.get("L-180")).toBe(118029);
  });

  it("PTW(S) = 3621", () => {
    expect(byCode.get("PTW(S)")).toBe(3621);
  });

  it("LNS-2020 = 27534", () => {
    expect(byCode.get("LNS-2020")).toBe(27534);
  });

  // HDRF was split into three width variants -- HDRF-180 is the one that
  // absorbed the old width-less "HDRF" code's US price (see extractHDRF in
  // scripts/extract-us-prices.ts).
  it("HDRF-180 = 12500", () => {
    expect(byCode.get("HDRF-180")).toBe(12500);
  });

  it("HDRF-220 = 13900", () => {
    expect(byCode.get("HDRF-220")).toBe(13900);
  });

  it("HDRF-320 = 15290", () => {
    expect(byCode.get("HDRF-320")).toBe(15290);
  });
});
