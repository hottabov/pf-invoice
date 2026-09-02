/**
 * Some options are sold by the section rather than by the piece: the
 * EasyLoader's "Additional 1.2M lengths" and "Static table 1.2M lengths",
 * plus "Electrical Busbar Per 1.2M" and "Travel Platform support rail. Per
 * 1.2m". A salesperson picking four of them is really specifying 4.8 metres
 * of table, and that is the number the customer asks about — so the builder
 * shows the running total beside the quantity stepper.
 *
 * The catalogue has no length column. The figure exists only in the name a
 * human typed, so this reads it back out rather than adding a schema field
 * for four rows and then requiring every future one to remember to fill it
 * in. If a length ever needs to differ from what the name says, that is the
 * point to introduce the column.
 */

/** Matches a decimal metre figure written as "1.2M" or "1.2 m" — but not
 * "800mm" (no word boundary after the first `m`) or "180cm". */
const METRES_PATTERN = /(\d+(?:\.\d+)?)\s*m\b/i;

/** The figure only counts as a *unit* length when the name says so — "per"
 * or "length(s)". Without this, any option that happened to mention a
 * measurement would start multiplying it by the quantity. */
const UNIT_CONTEXT_PATTERN = /\b(per|lengths?)\b/i;

/**
 * The per-unit length in metres stated in an option's name, or `null` when
 * the name states none — which is the common case, and the reason callers
 * must handle it rather than defaulting to some assumed section size.
 */
export function unitLengthMetres(optionName: string): number | null {
  if (!UNIT_CONTEXT_PATTERN.test(optionName)) return null;
  const match = METRES_PATTERN.exec(optionName);
  if (!match) return null;
  const metres = Number(match[1]);
  return Number.isFinite(metres) && metres > 0 ? metres : null;
}

/**
 * Formats a metre total for display: "4.8 m", "6 m", "1.2 m". Trailing
 * zeros are dropped because "6.0 m" of table reads like a measurement
 * someone took, not a count of sections.
 *
 * Rounded to 2dp: 1.2 × 3 is 3.5999999999999996 in binary floating point,
 * and nobody quotes a table to the picometre.
 */
export function formatMetres(metres: number): string {
  return `${Number(metres.toFixed(2))} m`;
}
