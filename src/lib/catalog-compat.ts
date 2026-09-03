// --- option/product compatibility ------------------------------------------

/**
 * The `OptionCompatibility` OR-filter for "is this option compatible with
 * this item": an `Option` counts as compatible when it has a compat row at
 * *either* the series level (`seriesId` matches the item's product's series)
 * *or* the product level (`productId` matches the item's product itself) —
 * see the `OptionCompatibility` model, which allows both kinds of row
 * side-by-side (e.g. EasyLoader accessories are product-level, compatible
 * only with EL-2020, while most options are series-level).
 *
 * Pure and DB-agnostic so it's unit-testable without a database: shared by
 * `listCompatibleOptions` (queries/documents.ts, building the options list
 * shown in the builder) and `setItemOptions` (actions/documents.ts,
 * re-validating a submitted selection server-side).
 *
 * Returns `null` when neither id is available — a caller should treat that
 * as "no compatible options" (an empty `OR: []` would need per-ORM handling
 * to mean "match nothing," so callers short-circuit on `null` instead of
 * relying on that).
 */
export function compatibilityOrFilter(
  productId: string | null | undefined,
  seriesId: string | null | undefined
): Array<{ seriesId: string } | { productId: string }> | null {
  const or: Array<{ seriesId: string } | { productId: string }> = [];
  if (seriesId) or.push({ seriesId });
  if (productId) or.push({ productId });
  return or.length > 0 ? or : null;
}

/**
 * Whether an option in the item options editor should be disabled outright:
 * an option with no usable price for the document's region (no `Price` row
 * at all, or one flagged `needsReview`) is shown but its checkbox is
 * disabled — the quote literally cannot be priced without one. Only ever
 * offered on options `listCompatibleOptions` has already filtered down to
 * ones compatible with the item, so compatibility itself is never an input
 * here.
 */
export function isOptionDisabled(price: { needsReview: boolean } | null): boolean {
  return price === null || price.needsReview;
}
