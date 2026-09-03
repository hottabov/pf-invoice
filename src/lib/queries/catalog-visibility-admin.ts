import { db } from "@/lib/db";

// Admin-only reads for the catalogue-visibility editor on a user's own
// settings page (/settings/users/[userId] — moved there from the now-removed
// standalone /settings/catalog-visibility list by "feat: settings gets its
// own navigation") — unfiltered, unlike everything in
// src/lib/queries/catalog-visibility.ts: an admin managing visibility needs
// to see the *whole* catalogue regardless of what's currently hidden, not
// the filtered view a MANAGER gets. Kept as its own module so the
// query-filtering half of this feature never has to depend on admin-UI-only
// reads.

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
 * rows they have. Previously fed the standalone /settings/catalog-visibility
 * index list; that route is gone (catalogue visibility now lives on the user
 * it describes — see /settings/users/[userId] — since an admin no longer
 * needs a parallel list to find the same person twice), but this query is
 * kept as-is per that change's own scope (routing and placement only) in
 * case a future screen wants an at-a-glance "who has anything hidden" view
 * again. Lists every role, ADMIN included, even though an ADMIN's own hidden
 * rows are never actually read (`catalogVisibilityUserId` always resolves an
 * ADMIN to "see everything") — same unfiltered "every X in the system" shape
 * `listUsers`/`listRegionsAdmin` already use, not a new rule about who's
 * excluded.
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
