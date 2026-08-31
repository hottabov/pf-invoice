import { describe, it, expect } from "vitest";
import catalogData from "../prisma/seed-data/catalog.json";
import contentBlocksData from "../prisma/seed-data/content-blocks.json";
import {
  type Catalog,
  type ContentBlocksJson,
  REGIONS,
  mapSeries,
  mapProducts,
  mapOptions,
  mapPrices,
  mapCompatibility,
  mapContentBlocks,
  shouldMigrateBlock,
  BLOCK_BODY_MIGRATIONS,
  M_SERIES_OLD_BODY,
} from "../prisma/seed-lib";

const catalog = catalogData as Catalog;
const contentBlocksJson = contentBlocksData as ContentBlocksJson;

/**
 * Small, handcrafted catalog used to assert literal expected outputs of the
 * mapping functions, independent of whatever the real catalog.json happens
 * to contain -- so these assertions don't just re-derive their own expected
 * value from the same source (tautological) and don't silently drift if the
 * real catalog is regenerated.
 *
 * 2 series ("A", "B"), 3 products (A has 2, including one with a null price
 * to exercise the amount-0/needsReview-true path; B has 1), 3 options:
 * two series-scoped with distinct compatibleSeries (one spanning both
 * series, one series-exclusive) so mapCompatibility's series fan-out can be
 * checked against known pairs, and one product-scoped (compatibleSeries: [],
 * compatibleProducts: ["A-100"]) mirroring EasyLoader-style accessories, so
 * mapCompatibility's product fan-out is exercised too.
 */
const FIXTURE: Catalog = {
  extractedAt: "2026-01-01T00:00:00.000Z",
  series: [
    {
      seriesCode: "A",
      seriesName: "Series A",
      maxDiscountPct: 10,
      products: [
        { code: "A-100", name: "Widget", description: "A widget", price: 500, needsReview: false },
        { code: "A-200", name: "Gadget", description: "A gadget", price: null, needsReview: true },
      ],
    },
    {
      seriesCode: "B",
      seriesName: "Series B",
      maxDiscountPct: null,
      products: [
        { code: "B-100", name: "Doohickey", description: "A doohickey", price: 1000, needsReview: false },
      ],
    },
  ],
  options: [
    {
      code: "OPT-1",
      name: "Option One",
      description: "First option",
      price: 50,
      needsReview: false,
      compatibleSeries: ["A", "B"],
    },
    {
      code: "OPT-2",
      name: "Option Two",
      description: "Second option",
      price: 0,
      needsReview: true,
      compatibleSeries: ["B"],
    },
    {
      code: "OPT-3",
      name: "Widget Accessory",
      description: "Product-scoped accessory",
      price: 25,
      needsReview: false,
      compatibleSeries: [],
      compatibleProducts: ["A-100"],
    },
  ],
};

describe("seed-lib: pure mapping (FIXTURE -> literal expected outputs)", () => {
  it("mapSeries produces the exact series payload", () => {
    expect(mapSeries(FIXTURE)).toEqual([
      { code: "A", name: "Series A", maxDiscountPct: 10, sortOrder: 0 },
      { code: "B", name: "Series B", maxDiscountPct: null, sortOrder: 1 },
    ]);
  });

  it("mapProducts produces the exact product payload with per-series sortOrder", () => {
    expect(mapProducts(FIXTURE)).toEqual([
      { code: "A-100", name: "Widget", description: "A widget", seriesCode: "A", sortOrder: 0 },
      { code: "A-200", name: "Gadget", description: "A gadget", seriesCode: "A", sortOrder: 1 },
      { code: "B-100", name: "Doohickey", description: "A doohickey", seriesCode: "B", sortOrder: 0 },
    ]);
  });

  it("mapOptions produces the exact option payload", () => {
    expect(mapOptions(FIXTURE)).toEqual([
      { code: "OPT-1", name: "Option One", shortDescription: "First option", sortOrder: 0 },
      { code: "OPT-2", name: "Option Two", shortDescription: "Second option", sortOrder: 1 },
      { code: "OPT-3", name: "Widget Accessory", shortDescription: "Product-scoped accessory", sortOrder: 2 },
    ]);
  });

  it("mapPrices produces the exact price payload, incl. null-price -> amount 0 + needsReview true", () => {
    expect(mapPrices(FIXTURE, "AU")).toEqual([
      { kind: "product", code: "A-100", regionCode: "AU", amount: 500, needsReview: false },
      { kind: "product", code: "A-200", regionCode: "AU", amount: 0, needsReview: true },
      { kind: "product", code: "B-100", regionCode: "AU", amount: 1000, needsReview: false },
      { kind: "option", code: "OPT-1", regionCode: "AU", amount: 50, needsReview: false },
      { kind: "option", code: "OPT-2", regionCode: "AU", amount: 0, needsReview: true },
      { kind: "option", code: "OPT-3", regionCode: "AU", amount: 25, needsReview: false },
    ]);
  });

  it("mapCompatibility produces the exact (option, series) and (option, product) pairs", () => {
    expect(mapCompatibility(FIXTURE)).toEqual([
      { optionCode: "OPT-1", seriesCode: "A" },
      { optionCode: "OPT-1", seriesCode: "B" },
      { optionCode: "OPT-2", seriesCode: "B" },
      { optionCode: "OPT-3", productCode: "A-100" },
    ]);
  });
});

describe("seed-lib: smoke assertions against the real catalog.json (counts only)", () => {
  it("has exactly 3 regions", () => {
    expect(REGIONS).toHaveLength(3);
  });

  it("has exactly 10 series", () => {
    expect(mapSeries(catalog)).toHaveLength(10);
  });

  it("has exactly 67 total products", () => {
    expect(mapProducts(catalog)).toHaveLength(67);
  });
});

describe("mapContentBlocks", () => {
  const FIXTURE_JSON: ContentBlocksJson = {
    blocks: [
      { key: "terms.delivery", title: "Delivery", sortOrder: 1, body: "Delivered in {{weeks}} weeks." },
      { key: "option.OFD", title: "OFD", sortOrder: 2, body: "**OFD** offload display." },
    ],
    placeholders: { weeks: "Delivery time in weeks" },
  };

  it("maps each block's key/title/body/sortOrder 1:1 from the JSON", () => {
    expect(mapContentBlocks(FIXTURE_JSON)).toEqual([
      { key: "terms.delivery", title: "Delivery", body: "Delivered in {{weeks}} weeks.", sortOrder: 1 },
      { key: "option.OFD", title: "OFD", body: "**OFD** offload display.", sortOrder: 2 },
    ]);
  });

  it("real content-blocks.json has exactly 52 blocks", () => {
    expect(mapContentBlocks(contentBlocksJson)).toHaveLength(52);
  });

  it("real content-blocks.json has unique keys", () => {
    const keys = mapContentBlocks(contentBlocksJson).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("real content-blocks.json has no empty (or whitespace-only) bodies", () => {
    for (const block of mapContentBlocks(contentBlocksJson)) {
      expect(block.body.trim().length, `expected "${block.key}" to have a non-empty body`).toBeGreaterThan(0);
    }
  });

  it("real content-blocks.json has no empty titles and non-negative sort orders", () => {
    for (const block of mapContentBlocks(contentBlocksJson)) {
      expect(block.title.trim().length, `expected "${block.key}" to have a non-empty title`).toBeGreaterThan(0);
      expect(block.sortOrder).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("shouldMigrateBlock / BLOCK_BODY_MIGRATIONS", () => {
  it("returns true when the existing body exactly matches the old body", () => {
    expect(shouldMigrateBlock("old text", "old text")).toBe(true);
  });

  it("returns false when the existing body differs at all (admin-edited, or already migrated)", () => {
    expect(shouldMigrateBlock("old text, tweaked", "old text")).toBe(false);
    expect(shouldMigrateBlock("new text", "old text")).toBe(false);
    expect(shouldMigrateBlock("", "old text")).toBe(false);
  });

  it("machine.m-series's registered old body differs from the current seed-data body", () => {
    // Guards against the migration entry going stale: the hardcoded
    // M_SERIES_OLD_BODY (captured pre-315e089) must not equal what
    // content-blocks.json seeds today, or shouldMigrateBlock would never
    // fire for an already-current-format DB.
    const current = contentBlocksJson.blocks.find((b) => b.key === "machine.m-series");
    expect(current).toBeDefined();
    expect(current!.body).not.toBe(M_SERIES_OLD_BODY);
    expect(shouldMigrateBlock(M_SERIES_OLD_BODY, BLOCK_BODY_MIGRATIONS["machine.m-series"].oldBody)).toBe(true);
  });
});
