/**
 * Pure mapping layer for the DB seed: catalog.json -> flat upsert payloads.
 *
 * No IO and no Prisma client here on purpose — everything in this file is a
 * plain function of its inputs, so it can be unit tested without a database
 * (see tests/seed-mapping.test.ts). prisma/seed.ts is the IO shell: it calls
 * these functions and turns the payloads into upserts.
 */

export interface CatalogItem {
  code: string;
  name: string;
  description: string;
  price: number | null;
  needsReview: boolean;
}

export interface CatalogSeries {
  seriesCode: string;
  seriesName: string;
  maxDiscountPct: number | null;
  products: CatalogItem[];
}

export interface CatalogOption extends CatalogItem {
  compatibleSeries: string[];
  /** Present (non-empty) only for options scoped to specific products
   *  (e.g. an EasyLoader accessory tied to one drive-module product) rather
   *  than a whole series -- in that case compatibleSeries is `[]`. */
  compatibleProducts?: string[];
}

export interface Catalog {
  extractedAt: string;
  series: CatalogSeries[];
  options: CatalogOption[];
}

export interface RegionSeed {
  code: string;
  name: string;
  currency: string;
  taxName: string;
  taxRate: number;
  entityName: string;
  entityLegalId?: string;
  entityAddress?: string;
  bankDetails?: Record<string, string>;
}

/**
 * The three regions PathQuote operates in. AU carries the real Pathfinder
 * Australia entity + bank details; US and UK are placeholders until real
 * entity data for those regions is supplied.
 */
export const REGIONS: RegionSeed[] = [
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    taxName: "GST",
    taxRate: 10.0,
    entityName: "Pathfinder Australia Pty Ltd",
    entityLegalId: "ABN 64 072 458 667",
    entityAddress: "12 Did Ct, Tullamarine Vic. 3043, Australia",
    bankDetails: {
      bank: "ANZ Westfield",
      accountName: "Pathfinder Australia Pty Ltd",
      swift: "ANZBAU3M",
      bsb: "013 442",
      accountNo: "4405 63886",
    },
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    taxName: "Sales Tax",
    taxRate: 0,
    entityName: "Pathfinder USA", // placeholder — real US entity data TBD
  },
  {
    code: "UK",
    name: "United Kingdom",
    currency: "GBP",
    taxName: "VAT",
    taxRate: 20,
    entityName: "Pathfinder UK", // placeholder — real UK entity data TBD
  },
];

export interface SeriesPayload {
  code: string;
  name: string;
  maxDiscountPct: number | null;
  sortOrder: number;
}

export function mapSeries(catalog: Catalog): SeriesPayload[] {
  return catalog.series.map((s, i) => ({
    code: s.seriesCode,
    name: s.seriesName,
    maxDiscountPct: s.maxDiscountPct,
    sortOrder: i,
  }));
}

export interface ProductPayload {
  code: string;
  name: string;
  description: string | null;
  seriesCode: string;
  sortOrder: number;
}

export function mapProducts(catalog: Catalog): ProductPayload[] {
  const out: ProductPayload[] = [];
  for (const series of catalog.series) {
    series.products.forEach((p, i) => {
      out.push({
        code: p.code,
        name: p.name,
        description: p.description ?? null,
        seriesCode: series.seriesCode,
        sortOrder: i,
      });
    });
  }
  return out;
}

export interface OptionPayload {
  code: string;
  name: string;
  shortDescription: string | null;
  sortOrder: number;
}

export function mapOptions(catalog: Catalog): OptionPayload[] {
  return catalog.options.map((o, i) => ({
    code: o.code,
    name: o.name,
    shortDescription: o.description ?? null,
    sortOrder: i,
  }));
}

export type PriceTargetKind = "product" | "option";

export interface PricePayload {
  kind: PriceTargetKind;
  code: string;
  regionCode: string;
  amount: number;
  needsReview: boolean;
}

/**
 * One Price row per product and per option, all against `regionCode`
 * (AU-only for now — the other regions have no pricing data yet). Items
 * with a null price in the catalog get amount 0 with needsReview forced
 * true, so admins see them flagged as "price required" rather than a
 * silent $0. Items with a real price (including a genuine 0) keep the
 * catalog's own needsReview flag as-is.
 */
export function mapPrices(catalog: Catalog, regionCode = "AU"): PricePayload[] {
  const out: PricePayload[] = [];
  for (const series of catalog.series) {
    for (const p of series.products) {
      out.push({
        kind: "product",
        code: p.code,
        regionCode,
        amount: p.price ?? 0,
        needsReview: p.price === null ? true : p.needsReview,
      });
    }
  }
  for (const o of catalog.options) {
    out.push({
      kind: "option",
      code: o.code,
      regionCode,
      amount: o.price ?? 0,
      needsReview: o.price === null ? true : o.needsReview,
    });
  }
  return out;
}

/**
 * One row per (option, compatible series) OR (option, compatible product)
 * pair. Exactly one of `seriesCode` / `productCode` is set per entry — the
 * DB mirrors this with OptionCompatibility.seriesId/productId, one of which
 * is always null (see the two partial-unique indexes in schema.prisma).
 */
export type CompatPayload =
  | { optionCode: string; seriesCode: string; productCode?: undefined }
  | { optionCode: string; seriesCode?: undefined; productCode: string };

/** One row per (option, compatible series) pair and one row per (option,
 *  compatible product) pair. Most options are series-level (productCode
 *  entries stay empty for them); a few (e.g. EasyLoader accessories) are
 *  scoped to one or more specific products instead, via compatibleProducts. */
export function mapCompatibility(catalog: Catalog): CompatPayload[] {
  const out: CompatPayload[] = [];
  for (const o of catalog.options) {
    for (const seriesCode of o.compatibleSeries) {
      out.push({ optionCode: o.code, seriesCode });
    }
    for (const productCode of o.compatibleProducts ?? []) {
      out.push({ optionCode: o.code, productCode });
    }
  }
  return out;
}

// --- content blocks ------------------------------------------------------

/** One entry of prisma/seed-data/content-blocks.json's `blocks` array. */
export interface ContentBlockJsonItem {
  key: string;
  title: string;
  sortOrder: number;
  body: string;
}

/** Shape of prisma/seed-data/content-blocks.json. `placeholders` maps a
 * `{{token}}` name (as it appears in one or more block bodies) to a
 * human-readable description — consumed directly by the admin editor's
 * placeholder hint panel, not by this mapper. */
export interface ContentBlocksJson {
  blocks: ContentBlockJsonItem[];
  placeholders: Record<string, string>;
}

export interface ContentBlockPayload {
  key: string;
  title: string;
  body: string;
  sortOrder: number;
}

/**
 * Pure passthrough mapping from content-blocks.json's `blocks` array to the
 * flat payload prisma/seed.ts writes as each key's regionId:null default row.
 * No validation here (that's the admin editor's zod schema's job for
 * *edits*) — this just shapes the seed data 1:1, kept as its own function so
 * it's unit-testable and so the IO shell (prisma/seed.ts) never touches the
 * JSON's field names directly.
 */
export function mapContentBlocks(json: ContentBlocksJson): ContentBlockPayload[] {
  return json.blocks.map((b) => ({
    key: b.key,
    title: b.title,
    body: b.body,
    sortOrder: b.sortOrder,
  }));
}
