import { db } from "@/lib/db";
import {
  NO_HIDDEN_CATALOG_IDS,
  type HiddenCatalogIds,
} from "@/lib/catalog-visibility";

/**
 * Every hidden series/product id for `userId` — the one DB round trip every
 * filtered catalogue query/page needs, resolved once per request and
 * threaded through to the pure filtering helpers in
 * src/lib/catalog-visibility.ts. `userId === null` (an ADMIN — see
 * `catalogVisibilityUserId`) short-circuits to `NO_HIDDEN_CATALOG_IDS`
 * without a query; a real user with no rows of their own gets back the same
 * empty sets from the query itself, which is the feature's actual default
 * (see the CatalogVisibility model's own doc comment).
 */
export async function getHiddenCatalogIds(userId: string | null): Promise<HiddenCatalogIds> {
  if (!userId) return NO_HIDDEN_CATALOG_IDS;

  const rows = await db.catalogVisibility.findMany({
    where: { userId },
    select: { seriesId: true, productId: true },
  });

  return {
    seriesIds: new Set(rows.map((r) => r.seriesId).filter((id): id is string => id !== null)),
    productIds: new Set(rows.map((r) => r.productId).filter((id): id is string => id !== null)),
  };
}
