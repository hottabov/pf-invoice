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
  /** Region-level discount cap (owner: "USA 15%, Australia 10; don't
   * surface in the catalog") -- `null` means no cap. See
   * Region.maxDiscountPct in schema.prisma and its enforcement in
   * setItemDiscount/setDocumentDiscount (src/lib/actions/documents.ts). */
  maxDiscountPct: number | null;
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
    entityAddress:
      "12 Dib Court\nTullamarine, VIC 3043, Australia\nPh: +61 3 9338 3471\nEmail: sales@pathfindercut.com\nWeb: pathfindercut.com",
    bankDetails: {
      bank: "ANZ Westfield",
      accountName: "Pathfinder Australia Pty Ltd",
      swift: "ANZBAU3M",
      bsb: "013 442",
      accountNo: "4405 63886",
    },
    maxDiscountPct: 10,
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    taxName: "Sales Tax",
    taxRate: 0,
    entityName: "Pathfinder Cutting Technology LLC",
    entityAddress:
      "5623–5625 W74th Street\nIndianapolis, IN, 46278, USA\nTel: +1 (317) 349 0002\nEmail: salesusa@pathfindercut.com\nWeb: pathfindercut.com",
    maxDiscountPct: 15,
  },
  {
    code: "UK",
    name: "United Kingdom",
    currency: "GBP",
    taxName: "VAT",
    taxRate: 20,
    entityName: "Pathfinder Cutting Technology UK LTD",
    entityAddress:
      "Unit 5 Maricott Court, Holywell Business Park,\nKineton Road Industrial Estate, Southam,\nWarwickshire, CV47 0FT, United Kingdom\nTel: +44 (0) 7572 949248\nEmail: salesuk@pathfindercut.com\nWeb: pathfindercut.com",
    maxDiscountPct: null,
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

// --- US region prices (prisma/seed-data/prices-us.json) -----------------

/** Shape of prisma/seed-data/prices-us.json, written by
 *  scripts/extract-us-prices.ts. `unmatched` isn't consumed here -- it's
 *  purely informational (services, per-width crate rows, etc. with no
 *  catalog code to attach to) and stays in the JSON file for the report. */
export interface UsPricesJson {
  extractedAt: string;
  prices: { code: string; amountUsd: number }[];
  unmatched: { sheet: string; label: string; price: number }[];
}

export interface UsPricesMapping {
  /** One Price payload per prices-us.json entry whose code matched a real
   *  catalog product or option, always against region "US" with
   *  needsReview: false -- unlike AU's price:null convention, the US price
   *  list is a real, published, authoritative retail price for the codes it
   *  covers, so there's no "amount 0, flagged for review" case here. */
  payloads: PricePayload[];
  /** prices-us.json codes that don't exist in the given catalog at all --
   *  should be empty in practice (scripts/extract-us-prices.ts already
   *  validates every code it writes against the catalog it was run
   *  against), but the catalog and the price file can drift apart if one is
   *  regenerated without the other, so this is surfaced rather than
   *  silently dropped. */
  unknownCodes: string[];
}

/**
 * Resolves each prices-us.json entry's code against the catalog's products
 * and options (a code is exactly one or the other, never both -- product
 * and option codes are drawn from disjoint namespaces) to produce US Price
 * payloads. Pure function of its inputs, like every other mapper in this
 * file -- prisma/seed.ts is the only place that turns `payloads` into
 * upserts and reports `unknownCodes`.
 */
export function mapUsPrices(catalog: Catalog, usPrices: UsPricesJson): UsPricesMapping {
  const productCodes = new Set(catalog.series.flatMap((s) => s.products.map((p) => p.code)));
  const optionCodes = new Set(catalog.options.map((o) => o.code));

  const payloads: PricePayload[] = [];
  const unknownCodes: string[] = [];

  for (const { code, amountUsd } of usPrices.prices) {
    if (productCodes.has(code)) {
      payloads.push({ kind: "product", code, regionCode: "US", amount: amountUsd, needsReview: false });
    } else if (optionCodes.has(code)) {
      payloads.push({ kind: "option", code, regionCode: "US", amount: amountUsd, needsReview: false });
    } else {
      unknownCodes.push(code);
    }
  }

  return { payloads, unknownCodes };
}

/** Every product/option code in the catalog that prices-us.json's matched
 *  entries don't cover -- i.e. it simply has no US price yet. Purely
 *  informational (mirrors scripts/extract-us-prices.ts's own "catalog codes
 *  with no US price" summary line), used by prisma/seed.ts to log a warning
 *  per missing code rather than leave the gap silent. */
export function missingUsPriceCodes(catalog: Catalog, usPrices: UsPricesJson): string[] {
  const pricedCodes = new Set(usPrices.prices.map((p) => p.code));
  const allCodes = [
    ...catalog.series.flatMap((s) => s.products.map((p) => p.code)),
    ...catalog.options.map((o) => o.code),
  ];
  return allCodes.filter((code) => !pricedCodes.has(code)).sort((a, b) => a.localeCompare(b, "en"));
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
