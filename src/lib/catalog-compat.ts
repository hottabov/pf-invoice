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
 * Why an option in the item options editor is disabled, or `null` when it's
 * selectable. Two independent reasons, checked in this order:
 *
 * 1. `unpriced` — no usable price for the document's region (no `Price` row
 *    at all, or one flagged `needsReview`). The quote literally cannot be
 *    priced without one.
 * 2. `conflict` — a specific *other* option, already selected on this item,
 *    that this one has an `OptionConflict` row with (e.g. a knife too long
 *    for the machine's cut height — see the `OptionConflict` model comment
 *    in schema.prisma). Carries that option's code/name so the UI can name
 *    it ("Conflicts with MTS — additional travel"), not just say "disabled".
 *
 * `unpriced` wins when both apply — an option with no price is disabled for
 * its own reason regardless of what else is selected.
 *
 * Originally took only `price` (a deliberate narrowing — an earlier change
 * wrongly let *compatibility* disable an option here, which this signature
 * was written to make impossible: `listCompatibleOptions` is the only thing
 * allowed to keep an incompatible option out of the list entirely). A
 * conflict is a different, legitimate kind of "can't have both", so it's
 * added as an explicit second parameter rather than smuggled in — the
 * caller decides what counts as "already selected" (see
 * `ItemOptionsEditor`, which deliberately never treats the option currently
 * being toggled as its own conflict source, so deselecting the option that
 * caused a conflict re-enables the others on the very next render, no
 * server round trip).
 */
export type OptionDisabledReason =
  | { type: "unpriced" }
  | { type: "conflict"; conflictingOptionCode: string; conflictingOptionName: string };

export function isOptionDisabled(
  price: { needsReview: boolean } | null,
  conflictingWith?: { code: string; name: string } | null
): OptionDisabledReason | null {
  if (price === null || price.needsReview) return { type: "unpriced" };
  if (conflictingWith) {
    return {
      type: "conflict",
      conflictingOptionCode: conflictingWith.code,
      conflictingOptionName: conflictingWith.name,
    };
  }
  return null;
}

/**
 * Finds the first pair of currently-selected option codes that conflict,
 * given each selected option's own set of codes it conflicts with. Pure and
 * DB-agnostic like `compatibilityOrFilter` above — shared by `setItemOptions`
 * (server-side rejection of a submitted selection) and unit-tested directly
 * so the pairwise-scan logic doesn't have to be exercised through a mocked
 * database. The builder UI doesn't use this: it only ever needs "does *this*
 * option conflict with something selected", a single lookup, not a full scan
 * — see `isOptionDisabled` above.
 */
export function findConflictingSelection(
  selectedCodes: string[],
  conflictsByCode: Map<string, Set<string>>
): [string, string] | null {
  for (let i = 0; i < selectedCodes.length; i++) {
    const a = selectedCodes[i];
    const aConflicts = conflictsByCode.get(a);
    if (!aConflicts || aConflicts.size === 0) continue;
    for (let j = i + 1; j < selectedCodes.length; j++) {
      const b = selectedCodes[j];
      if (aConflicts.has(b)) return [a, b];
    }
  }
  return null;
}
