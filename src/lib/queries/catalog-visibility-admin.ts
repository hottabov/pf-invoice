import { db } from "@/lib/db";

// Admin-only reads for the /settings/catalog-visibility editor — unfiltered,
// unlike everything in src/lib/queries/catalog-visibility.ts: an ADMIN
// managing visibility needs to see the *whole* catalogue and every user
// regardless of what's currently hidden, not the filtered view a MANAGER
// gets. Kept as its own module so the query-filtering half of this feature
// (commit 1) never has to depend on admin-UI-only reads.

export type UserVisibilitySummary = {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
  hiddenCount: number;
};

/**
 * Every user in the system (active and inactive, like `listUsers` in
 * src/lib/queries/users.ts — an admin might as well set up visibility for a
 * user before reactivating them), each with how many `CatalogVisibility`
 * rows they have — feeds the /settings/catalog-visibility index list so an
 * admin can see at a glance which users have anything hidden at all before
 * opening one. Lists every role, ADMIN included, even though an ADMIN's own
 * hidden rows are never actually read (`catalogVisibilityUserId` always
 * resolves an ADMIN to "see everything") — same unfiltered "every X in the
 * system" shape `listUsers`/`listRegionsAdmin` already use, not a new rule
 * about who's excluded.
 */
export async function listUsersWithHiddenCounts(): Promise<UserVisibilitySummary[]> {
  const users = await db.user.findMany({
    orderBy: { email: "asc" },
    include: { _count: { select: { catalogVisibility: true } } },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    active: u.active,
    hiddenCount: u._count.catalogVisibility,
  }));
}

export type VisibilityProductRow = { id: string; code: string; name: string; hidden: boolean };

export type VisibilitySeriesRow = {
  id: string;
  code: string;
  name: string;
  hidden: boolean;
  products: VisibilityProductRow[];
};

/**
 * The whole catalogue tree (every series, each with its products, in
 * display order) flagged with `userId`'s own hidden rows — unfiltered,
 * unlike every other query in this file: the admin editor needs to show and
 * toggle *every* series/product regardless of current visibility, not just
 * what's visible. `hidden` on a product reflects only that product's own
 * row, never a series it inherits hidden-ness from — the editor's two
 * checkboxes are independent controls over independent rows, same as
 * `CatalogVisibility`'s own shape (a hidden series doesn't imply a hidden
 * *row* for each of its products, just a hidden *effect* — see
 * `isProductHidden` in src/lib/catalog-visibility.ts, which is what every
 * non-admin query actually reads).
 */
export async function getCatalogVisibilityTree(userId: string): Promise<VisibilitySeriesRow[]> {
  const [seriesList, hiddenRows] = await Promise.all([
    db.series.findMany({
      orderBy: { sortOrder: "asc" },
      include: { products: { orderBy: { sortOrder: "asc" } } },
    }),
    db.catalogVisibility.findMany({ where: { userId } }),
  ]);

  const hiddenSeriesIds = new Set(
    hiddenRows.map((r) => r.seriesId).filter((id): id is string => id !== null)
  );
  const hiddenProductIds = new Set(
    hiddenRows.map((r) => r.productId).filter((id): id is string => id !== null)
  );

  return seriesList.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    hidden: hiddenSeriesIds.has(s.id),
    products: s.products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      hidden: hiddenProductIds.has(p.id),
    })),
  }));
}
