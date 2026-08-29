import { cache } from "react";
import { db } from "@/lib/db";

const DEFAULT_REGION_CODE = "AU";

export type SeriesWithCounts = {
  id: string;
  code: string;
  name: string;
  maxDiscountPct: string | null;
  sortOrder: number;
  productCount: number;
};

/** All series, ordered for display, with the number of products in each. */
export async function listSeriesWithCounts(): Promise<SeriesWithCounts[]> {
  const series = await db.series.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return series.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    maxDiscountPct: s.maxDiscountPct?.toString() ?? null,
    sortOrder: s.sortOrder,
    productCount: s._count.products,
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
