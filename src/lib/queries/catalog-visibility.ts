import { db } from "@/lib/db";
import {
  NO_HIDDEN_CATALOG_IDS,
  type HiddenCatalogIds,
} from "@/lib/catalog-visibility";

/**
 * Every hidden series/product id for `regionId` — the one DB round trip
 * every filtered catalogue query/page needs, resolved once per request and
 * threaded through to the pure filtering helpers in
 * src/lib/catalog-visibility.ts. `regionId === null` (an ADMIN, or a user
 * with no region — see `catalogVisibilityRegionId`) short-circuits to
 * `NO_HIDDEN_CATALOG_IDS` without a query.
 */
export async function getHiddenCatalogIds(regionId: string | null): Promise<HiddenCatalogIds> {
  if (!regionId) return NO_HIDDEN_CATALOG_IDS;

  const rows = await db.catalogVisibility.findMany({
    where: { regionId },
    select: { seriesId: true, productId: true },
  });

  return {
    seriesIds: new Set(rows.map((r) => r.seriesId).filter((id): id is string => id !== null)),
    productIds: new Set(rows.map((r) => r.productId).filter((id): id is string => id !== null)),
  };
}
