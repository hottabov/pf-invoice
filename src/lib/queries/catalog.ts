import { cache } from "react";
import { db } from "@/lib/db";

const DEFAULT_REGION_CODE = "AU";

export type RegionSummary = {
  id: string;
  code: string;
  name: string;
  currency: string;
};

/** All active regions, ordered by code, for the per-region price editors. */
export const listActiveRegions = cache(async function listActiveRegions(): Promise<
  RegionSummary[]
> {
  const regions = await db.region.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
  });
  return regions.map((r) => ({ id: r.id, code: r.code, name: r.name, currency: r.currency }));
});

/** A single region by id — used by the settings page to show the current
 * user's region name/currency alongside their role. `null` id (no region
 * assigned yet) short-circuits to `null` without hitting the database. */
export async function getRegionById(regionId: string | null): Promise<RegionSummary | null> {
  if (!regionId) return null;
  const region = await db.region.findUnique({ where: { id: regionId } });
  if (!region) return null;
  return { id: region.id, code: region.code, name: region.name, currency: region.currency };
}

export type SeriesWithCounts = {
  id: string;
  code: string;
  name: string;
  maxDiscountPct: string | null;
  sortOrder: number;
  productCount: number;
  /** Resolved display image for the /catalog series card: the series' own
   * override if set, else the first active product (ordered by sortOrder,
   * then code) that has an image, else `null`. */
  imageUrl: string | null;
};

/**
 * All series, ordered for display, with the number of products in each and
 * the image to show on its /catalog card. A single `findMany` -- the
 * fallback product image is pulled via a nested `products` relation
 * (`take: 1`, filtered/ordered so Prisma resolves it as part of the same
 * query) rather than a per-series follow-up query.
 */
export async function listSeriesWithCounts(): Promise<SeriesWithCounts[]> {
  const series = await db.series.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: true } },
      products: {
        where: { active: true, imageUrl: { not: null } },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        take: 1,
        select: { imageUrl: true },
      },
    },
  });

  return series.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    maxDiscountPct: s.maxDiscountPct?.toString() ?? null,
    sortOrder: s.sortOrder,
    productCount: s._count.products,
    imageUrl: s.imageUrl ?? s.products[0]?.imageUrl ?? null,
  }));
}

/** How many global options exist, for the "Options" entry card on /catalog. */
export async function countOptions(): Promise<number> {
  return db.option.count();
}

export type CatalogPrice = {
  amount: string;
  needsReview: boolean;
  currency: string;
};

export type ProductListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  price?: CatalogPrice;
};

export type SeriesDetail = {
  id: string;
  code: string;
  name: string;
  maxDiscountPct: string | null;
  /** The series' own image override (raw, unresolved) -- `null` means "no
   * override, falls back to a product image" (see listSeriesWithCounts and
   * getSeriesFallbackImageUrl). Distinct from ProductDetail/OptionDetail's
   * imageUrl, which has no fallback of its own. */
  imageUrl: string | null;
};

/**
 * A series (by code) plus its products ordered for display, each carrying
 * its price in the given region (default AU) if one exists. A product with
 * no Price row for the region, or whose Price row has needsReview=true, is
 * returned with `price` reflecting that (or omitted entirely when there's
 * no row at all) so the UI can render a "price required" badge.
 */
export const listProductsBySeries = cache(async function listProductsBySeries(
  seriesCode: string,
  regionCode: string = DEFAULT_REGION_CODE
): Promise<{ series: SeriesDetail; products: ProductListItem[] } | null> {
  const series = await db.series.findUnique({ where: { code: seriesCode } });
  if (!series) return null;

  const products = await db.product.findMany({
    where: { seriesId: series.id },
    orderBy: { sortOrder: "asc" },
    include: {
      prices: {
        where: { region: { code: regionCode } },
        include: { region: true },
      },
    },
  });

  return {
    series: {
      id: series.id,
      code: series.code,
      name: series.name,
      maxDiscountPct: series.maxDiscountPct?.toString() ?? null,
      imageUrl: series.imageUrl,
    },
    products: products.map((p) => {
      const price = p.prices[0];
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        active: p.active,
        price: price
          ? {
              amount: price.amount.toString(),
              needsReview: price.needsReview,
              currency: price.region.currency,
            }
          : undefined,
      };
    }),
  };
});

/** The product photo a series falls back to on /catalog when it has no
 * explicit `Series.imageUrl` override -- the first active product (ordered
 * by sortOrder, then code) that has an image of its own, mirroring
 * listSeriesWithCounts' resolution. Used by the admin "Series image" panel
 * on the series products page to show what "Reset to product image" would
 * revert to. */
export async function getSeriesFallbackImageUrl(seriesId: string): Promise<string | null> {
  const product = await db.product.findFirst({
    where: { seriesId, active: true, imageUrl: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { imageUrl: true },
  });
  return product?.imageUrl ?? null;
}

export type OptionListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  price?: CatalogPrice;
  compatSeriesCodes: string[];
};

/**
 * Global options list, ordered by code, optionally filtered by a
 * case-insensitive name/code search and/or restricted to those compatible
 * with a given series (series-level compatibility only, per phase 3 scope).
 */
export async function listOptions(params: {
  search?: string;
  seriesCode?: string;
  regionCode?: string;
} = {}): Promise<OptionListItem[]> {
  const { search, seriesCode, regionCode = DEFAULT_REGION_CODE } = params;

  const where: NonNullable<Parameters<typeof db.option.findMany>[0]>["where"] = {};

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { code: { contains: term, mode: "insensitive" } },
    ];
  }

  if (seriesCode && seriesCode.trim()) {
    where.compat = { some: { series: { code: seriesCode.trim() } } };
  }

  const options = await db.option.findMany({
    where,
    orderBy: { code: "asc" },
    include: {
      prices: {
        where: { region: { code: regionCode } },
        include: { region: true },
      },
      compat: { include: { series: true } },
    },
  });

  return options.map((o) => {
    const price = o.prices[0];
    return {
      id: o.id,
      code: o.code,
      name: o.name,
      active: o.active,
      price: price
        ? {
            amount: price.amount.toString(),
            needsReview: price.needsReview,
            currency: price.region.currency,
          }
        : undefined,
      compatSeriesCodes: o.compat
        .map((c) => c.series?.code)
        .filter((code): code is string => Boolean(code))
        .sort(),
    };
  });
}

/** A single series by code — for the "new product" page header and to
 * validate a `[seriesCode]` route param without pulling its product list. */
export async function getSeriesByCode(code: string): Promise<SeriesDetail | null> {
  const series = await db.series.findUnique({ where: { code } });
  if (!series) return null;
  return {
    id: series.id,
    code: series.code,
    name: series.name,
    maxDiscountPct: series.maxDiscountPct?.toString() ?? null,
    imageUrl: series.imageUrl,
  };
}

export type RegionPriceRow = {
  regionId: string;
  regionCode: string;
  regionName: string;
  currency: string;
  amount: string | null;
  needsReview: boolean;
};

function toRegionPriceRows(
  regions: RegionSummary[],
  prices: { regionId: string; amount: { toString(): string }; needsReview: boolean }[]
): RegionPriceRow[] {
  const priceByRegionId = new Map(prices.map((p) => [p.regionId, p]));
  return regions.map((region) => {
    const price = priceByRegionId.get(region.id);
    return {
      regionId: region.id,
      regionCode: region.code,
      regionName: region.name,
      currency: region.currency,
      amount: price ? price.amount.toString() : null,
      // No price row at all is treated the same as needsReview for display
      // purposes — both mean "price required" in the editor.
      needsReview: price ? price.needsReview : true,
    };
  });
}

export type ProductDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  imageUrl: string | null;
  series: SeriesDetail;
  prices: RegionPriceRow[];
};

/**
 * A single product (by series code + product code) with everything the
 * editor needs: every active region's price row (present or not) for the
 * per-region price section.
 */
export async function getProductDetail(
  seriesCode: string,
  productCode: string
): Promise<ProductDetail | null> {
  const [series, regions] = await Promise.all([
    db.series.findUnique({ where: { code: seriesCode } }),
    listActiveRegions(),
  ]);
  if (!series) return null;

  const product = await db.product.findFirst({
    where: { code: productCode, seriesId: series.id },
    include: { prices: { include: { region: true } } },
  });
  if (!product) return null;

  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    active: product.active,
    sortOrder: product.sortOrder,
    imageUrl: product.imageUrl,
    series: {
      id: series.id,
      code: series.code,
      name: series.name,
      maxDiscountPct: series.maxDiscountPct?.toString() ?? null,
      imageUrl: series.imageUrl,
    },
    prices: toRegionPriceRows(regions, product.prices),
  };
}

export type OptionDetail = {
  id: string;
  code: string;
  name: string;
  shortDescription: string | null;
  attributeSchema: unknown;
  active: boolean;
  sortOrder: number;
  imageUrl: string | null;
  prices: RegionPriceRow[];
  /** Series this option is compatible with at the series level (phase-3
   * scope excludes product-level compatibility). */
  compatSeriesCodes: string[];
};

/** A single option (by id) with every active region's price row and its
 * series-level compatibility, for the option editor. Looked up by id rather
 * than code: the route it backs (`/catalog/options/[optionId]`) needs a key
 * that never changes, since a code is free text an admin can edit and may
 * contain characters (like `/`) that don't survive as a URL path segment.
 * `getOptionDetail`-by-code has no other callers, so it was replaced here
 * rather than kept alongside this. */
export async function getOptionDetailById(optionId: string): Promise<OptionDetail | null> {
  const [option, regions] = await Promise.all([
    db.option.findUnique({
      where: { id: optionId },
      include: {
        prices: { include: { region: true } },
        compat: { include: { series: true } },
      },
    }),
    listActiveRegions(),
  ]);
  if (!option) return null;

  return {
    id: option.id,
    code: option.code,
    name: option.name,
    shortDescription: option.shortDescription,
    attributeSchema: option.attributeSchema,
    active: option.active,
    sortOrder: option.sortOrder,
    imageUrl: option.imageUrl,
    prices: toRegionPriceRows(regions, option.prices),
    compatSeriesCodes: option.compat
      .filter((c) => c.seriesId !== null && c.productId === null)
      .map((c) => c.series?.code)
      .filter((code): code is string => Boolean(code))
      .sort(),
  };
}
