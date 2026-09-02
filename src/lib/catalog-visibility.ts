// Pure, DB-agnostic catalogue-visibility filtering — the query-shaping half
// of the `CatalogVisibility` feature (see the model's doc comment in
// schema.prisma for the "why hidden rows, not visible rows" reasoning).
// Kept dependency-free (no `@/lib/db` import) so it's safely importable from
// a plain unit test and from every server query/action that needs it, the
// same split `compatibilityOrFilter`/`isOptionDisabled` (src/lib/catalog-compat.ts)
// already use for `OptionCompatibility`.

/** Every hidden series id and hidden product id for one region, resolved
 * once per request (see `getHiddenCatalogIds`, src/lib/queries/catalog-visibility.ts)
 * and threaded through to every filtering call below — a `Set` lookup per
 * item beats a query per item. */
export type HiddenCatalogIds = {
  seriesIds: ReadonlySet<string>;
  productIds: ReadonlySet<string>;
};

/** The "nothing hidden" value — an ADMIN, or a user with no region assigned
 * (nothing to scope by), resolves to this rather than a real query. Shared
 * so every caller compares against/falls back to the exact same empty
 * value instead of constructing their own. */
export const NO_HIDDEN_CATALOG_IDS: HiddenCatalogIds = {
  seriesIds: new Set(),
  productIds: new Set(),
};

/** Resolves the regionId whose `CatalogVisibility` rows should gate what
 * `user` can see, or `null` when nothing should be filtered at all:
 *
 * - An ADMIN always sees the whole catalogue, unconditionally — they could
 *   not administer what they cannot see.
 * - A user with no `regionId` assigned has no region to scope by, so also
 *   sees everything — the same "unset changes nothing" default this
 *   codebase uses for other nullable scoping fields (e.g. a document
 *   falling back to the AU region when its author has none).
 *
 * Accepts `session.user` directly, including the `null`/`undefined` shape
 * an unauthenticated `auth()` call returns, so every call site can pass
 * `session?.user` without its own null-check first.
 */
export function catalogVisibilityRegionId(
  user: { role: string; regionId: string | null } | null | undefined
): string | null {
  if (!user || user.role === "ADMIN") return null;
  return user.regionId;
}

/** Whether `seriesId` itself has a hidden row for this region. */
export function isSeriesHidden(seriesId: string, hidden: HiddenCatalogIds): boolean {
  return hidden.seriesIds.has(seriesId);
}

/** Whether a product is hidden for this region — directly (its own hidden
 * row) or because its whole series is hidden (a hidden series hides every
 * product under it, per the CatalogVisibility model comment). */
export function isProductHidden(
  product: { id: string; seriesId: string },
  hidden: HiddenCatalogIds
): boolean {
  return hidden.productIds.has(product.id) || isSeriesHidden(product.seriesId, hidden);
}

/** Filters a list of series-shaped items down to those not entirely
 * hidden. Generic over the caller's own series row shape (`SeriesWithCounts`,
 * a plain `{id}`, etc.) — only `id` is read. */
export function filterHiddenSeries<T extends { id: string }>(
  series: readonly T[],
  hidden: HiddenCatalogIds
): T[] {
  return series.filter((s) => !isSeriesHidden(s.id, hidden));
}

/** Filters a list of product-shaped items down to those not hidden (directly
 * or via their series). Generic over the caller's own product row shape —
 * only `id`/`seriesId` are read. */
export function filterHiddenProducts<T extends { id: string; seriesId: string }>(
  products: readonly T[],
  hidden: HiddenCatalogIds
): T[] {
  return products.filter((p) => !isProductHidden(p, hidden));
}
