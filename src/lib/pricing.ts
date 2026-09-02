// Pure pricing engine: no imports from db/next, no I/O. Given a document's
// items/lines/discounts/tax rate, computes every derived total. Kept
// dependency-free so it is trivially unit-testable and safe to import from
// both server actions and plain tests (see src/lib/scope.ts for the same
// pattern).
//
// All money math happens in integer cents via exact decimal-fraction
// arithmetic (BigInt numerator/denominator, never floating-point
// multiplication of cents). This avoids both classic float traps (e.g.
// 0.1 + 0.2 !== 0.3) and the more subtle case where a value like 33.335
// *looks* exact but `33.335 * 100` does not evaluate to exactly 3333.5 in
// IEEE-754 double arithmetic. Rounding is "round half up" (ties round
// toward positive infinity), applied once per money step (item total,
// taxable base, tax amount) as specified by the plan.
//
// Note: `n`-suffixed BigInt literals (e.g. `100n`) require a TS target of
// ES2020+; this project targets ES2017, so plain `BigInt(100)` calls are
// used throughout instead — functionally identical, just without the
// literal syntax that trips TS2737.
import { formatMoney } from "./format";

/** A single option/component line attached to an item (qty * unitPrice).
 * `listPrice` is the catalogue price at the moment the line was added —
 * `null` (a custom/legacy line with no catalogue price) is treated as equal
 * to `unitPrice`, i.e. no concession — see `effectiveListPriceCents` below. */
export type EngineItemLine = {
  qty: number;
  unitPrice: number;
  listPrice?: number | null;
};

/** A discount is either a percentage of its base or a fixed cash amount —
 * see `discountCents` below. */
export type DiscountMode = "PERCENT" | "AMOUNT";

/** One priced line item on the document (e.g. a machine + its options).
 * `listPrice` is the catalogue price at the moment the item was added — see
 * `EngineItemLine.listPrice`'s doc comment for the same null-handling rule. */
export type EngineItem = {
  unitPrice: number;
  listPrice?: number | null;
  /** Defaults to `"PERCENT"` when omitted — matters only when
   * `discountValue` is non-null (a null value is 0 discount regardless of
   * mode). */
  discountMode?: DiscountMode | null;
  discountValue?: string | null;
  maxDiscountPct?: number | null;
  lines: EngineItemLine[];
  /** `Product.isCredit` (the TRADE-IN catalogue product, today) — mirrors
   * the schema column's own doc comment: a credit item's `unitPrice` (plus
   * any option lines, though it should never carry any in practice — see
   * `computeTotals`'s doc comment) is entered as a plain positive number by
   * the salesperson, and this flag is the ONLY thing that turns it into a
   * subtraction from the document's subtotal. Deliberately not "just make
   * `unitPrice` negative": that would mean a salesperson typing `-20000` for
   * a trade-in and, sooner or later, `20000` by mistake — silently *adding*
   * $20,000 to a quote meant to lose it. Keeping the sign out of the typed
   * value and in this flag instead makes that particular mistake
   * impossible. Defaults to `false` when omitted, so every existing caller
   * (and every ordinary product) is unaffected. */
  isCredit?: boolean;
};

/** A freeform document-level line (e.g. delivery, install). No `listPrice`:
 * a custom line has no catalogue entry to concede against — see
 * `documentConcession`'s doc comment on `PricingTotals` for how a negative
 * one still counts. */
export type EngineExtraLine = {
  qty: number;
  unitPrice: number;
};

export type EngineInput = {
  items: EngineItem[];
  extraLines: EngineExtraLine[];
  documentDiscountMode?: DiscountMode | null;
  documentDiscountValue?: string | null;
  /** The document's region discount cap (`Region.maxDiscountPct`) — used
   * only for `documentConcession.exceedsCap` below. Distinct from
   * `EngineItem.maxDiscountPct` (compared per-item against the engine's own
   * per-item `violations`); in practice both are fed the same region value
   * by `recalcDocument`/`getDocumentForBuilder`, but they answer different
   * questions — one item's discount vs. the whole document's concession —
   * so they stay two separate inputs rather than one shared field. `null`/
   * omitted means "no cap" (matches `EngineItem.maxDiscountPct`'s default). */
  regionMaxDiscountPct?: number | null;
  /** The document's region markup ceiling (`Region.maxMarkupPct`) — the
   * mirror of `regionMaxDiscountPct` above, for `documentConcession`'s
   * `exceedsMarkupCap` below. `null`/omitted means "no ceiling" (unlike
   * `regionMaxDiscountPct`, whose omitted default is 100 — a markup has no
   * natural 100% boundary the way "all of list price" bounds a discount, so
   * "no ceiling" has to be its own state rather than a large number). */
  regionMaxMarkupPct?: number | null;
  taxRate: number;
};

/** Reported when an item's requested discount exceeds its cap. The engine
 * still computes using the requested percentage — callers decide whether to
 * reject the save. */
export type EngineViolation = {
  itemIndex: number;
  allowedPct: number;
};

/**
 * The whole-document version of a discount-cap check — distinct from
 * `EngineViolation` (which is per item, indexed, and formatted by
 * `src/lib/validation/finalize.ts` as "item N"; a document-level entry must
 * never be pushed into that array, or it would corrupt those messages with
 * a fake index).
 *
 * Exists because a manual unit price (see `EngineItem.unitPrice`/
 * `EngineItemLine.unitPrice`) bypasses the per-item `%`/`AMOUNT` discount
 * entirely — a salesperson can sell at any price with no `discountValue` set
 * at all, so `violations` above would simply never fire no matter how far
 * below list the price was cut. `documentConcession` is what actually closes
 * that hole: it aggregates every source of "money given away" across the
 * whole document (see `concession`'s doc comment below) and compares it, as
 * one percentage, against the region's cap — the same check Ross described:
 * "if the price they're selling for is less than the maximum discount
 * that's allowed... it shouldn't allow them to save the quote."
 *
 * Always present on `PricingTotals` (never omitted the way `violations` can
 * be empty-but-present) so a caller can both enforce `exceedsCap` and
 * display the figures without a second computation.
 */
export type DocumentConcession = {
  /** Total money given away across the document, as a plain decimal string
   * (2dp) ready for `formatMoney` — see `concessionCapMessage`. Can be
   * negative (net price *increases* outweigh every discount/give-away) or
   * exceed `listValue` (e.g. a large trade-in) — never clamped. */
  concession: string;
  /** The document's full catalogue-price value (see `concession`'s doc
   * comment for what feeds it) — the denominator `effectivePct` is measured
   * against. Never negative. */
  listValue: string;
  /** `concession / listValue * 100` (0 when `listValue` is 0) — a float,
   * like `effectivePct` above; only ever compared against `allowedPct`, never
   * fed back into money math. */
  effectivePct: number;
  /** The region's discount cap (`EngineInput.regionMaxDiscountPct`), or 100
   * (no cap) when that input is null/omitted — same default as
   * `EngineItem.maxDiscountPct`. */
  allowedPct: number;
  /** `effectivePct > allowedPct`. The caller (`recalcDocument` in
   * src/lib/actions/documents.ts) decides what to do about it — same
   * division of responsibility as `violations`/`negativeSubtotal` above. */
  exceedsCap: boolean;
  /** The region's markup ceiling (`EngineInput.regionMaxMarkupPct`), or
   * `null` when that input is null/omitted — meaning "no ceiling" (see that
   * field's own doc comment for why this can't default to a number the way
   * `allowedPct` defaults to 100). */
  allowedMarkupPct: number | null;
  /** `-effectivePct > allowedMarkupPct` (a negative concession is a markup —
   * see the module doc comment on `computeTotals`'s price-adjustment sign
   * convention). Always `false` when `allowedMarkupPct` is `null`, and — by
   * construction, since `effectivePct` cannot be simultaneously positive and
   * negative — never `true` at the same time as `exceedsCap` above: the
   * discount cap and the markup ceiling are opposite signs of the same
   * figure, so at most one of the two can ever fire for a given document.
   * The caller (`recalcAndEnforce` in src/lib/actions/documents.ts) decides
   * what to do about it, the same MANAGER-blocked/ADMIN-warned split
   * `exceedsCap` already gets. */
  exceedsMarkupCap: boolean;
  /** `concession`, broken into the four sources `computeTotals`'s own doc
   * comment sums to build it — added so `concessionCapMessage` (and any
   * other reader) can name what a concession is actually made of instead of
   * reporting one opaque total. Each is a plain decimal string (2dp), and
   * together they sum to `concession` exactly, to the cent:
   *
   *   documentDiscount + itemDiscounts + priceAdjustments + tradeIns === concession
   *
   * `documentDiscount`/`itemDiscounts` are never negative (see
   * `discountCents`). `tradeIns` is reported as a positive figure — the
   * absolute value of every negative extra line, matching `concession`'s own
   * treatment of it (see `computeTotals`'s doc comment) — even though the
   * line itself is stored as a negative amount. `priceAdjustments` is the
   * only part that can be negative: the signed net of `(listPrice −
   * unitPrice) × qty` across every item and option line (see
   * `computeTotals`'s doc comment on why that term is signed on purpose) —
   * positive when prices were cut below list, negative when raised above it.
   */
  parts: {
    /** The document-level discount amount (`discountAmountCents` in
     * `computeTotals`) — never negative. */
    documentDiscount: string;
    /** Sum of every item's own discount amount — never negative. */
    itemDiscounts: string;
    /** Net of `(listPrice − unitPrice) × qty` across every item and option
     * line — signed; see this field's doc comment above. */
    priceAdjustments: string;
    /** Sum of every negative extra line's absolute value, PLUS every credit
     * item's full magnitude (`EngineItem.isCredit` — see `computeTotals`'s
     * doc comment for both mechanisms) — never negative. A credit item's
     * magnitude is counted here, in full, instead of through
     * `priceAdjustments`/`itemDiscounts` — see `computeTotals` for how that
     * avoids double-counting it. */
    tradeIns: string;
  };
};

export type PricingTotals = {
  itemTotals: number[];
  /** Per item, the cash amount its own discount actually removed (0 for an
   * item with no discount set) — parallel array to `itemTotals`, i.e.
   * `itemTotals[i] === base[i] - itemDiscounts[i]`. Exposed so a caller
   * (see `getDocumentForBuilder`) can show "Item discount: -$X" without
   * re-deriving `discountCents` itself, the same reasoning `discountAmount`
   * below already gets at document level. */
  itemDiscounts: number[];
  /** Full price before either item-level or document-level discounts. */
  grossSubtotal: number;
  subtotal: number;
  discountAmount: number;
  /** Item-level discounts plus the document-level discount. */
  totalDiscountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  violations: EngineViolation[];
  /** True when `subtotal` (items + extra lines, before the document-level
   * discount) computes below zero — a negative custom line (a trade-in,
   * see customLineSchema) can exceed the value of everything else on the
   * quote. The engine only reports this; it does not throw or clamp — the
   * caller (see `recalcDocument` in src/lib/actions/documents.ts) decides
   * whether to reject the save. */
  negativeSubtotal: boolean;
  /** See `DocumentConcession`'s doc comment — always present. */
  documentConcession: DocumentConcession;
};

// ---------------------------------------------------------------------------
// Exact decimal <-> fraction helpers
// ---------------------------------------------------------------------------

function finiteNumberFrom(x: number | string, label: string): number {
  let n: number;
  if (typeof x === "number") {
    n = x;
  } else {
    const trimmed = x.trim();
    n = trimmed === "" ? NaN : Number(trimmed);
  }
  if (!Number.isFinite(n)) {
    const shown = typeof x === "string" ? JSON.stringify(x) : String(x);
    throw new Error(`${label}: expected a finite number, got ${shown}`);
  }
  return n;
}

/** Expands a JS exponential-notation string (e.g. "1e-7") into plain decimal
 * ("0.0000001"). Number.prototype.toString only uses exponential notation
 * outside the -6..21 exponent range, which realistic money/percent values
 * never hit — this exists purely so toCents doesn't silently misbehave if
 * one ever does. */
function expandExponential(s: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(s);
  if (!match) return s;
  const [, sign, intPartRaw, fracPartRaw = "", expRaw] = match;
  const exp = Number.parseInt(expRaw, 10);
  let digits = intPartRaw + fracPartRaw;
  let pointPos = intPartRaw.length + exp;

  if (pointPos <= 0) {
    digits = "0".repeat(1 - pointPos) + digits;
    pointPos = 1;
  } else if (pointPos >= digits.length) {
    digits = digits + "0".repeat(pointPos - digits.length);
  }

  const result = pointPos < digits.length ? `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}` : digits;
  return sign + result;
}

function unsignedDecimalStringToFraction(s: string): { num: bigint; den: bigint } {
  const [intPartRaw, fracPartRaw = ""] = s.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const den = BigInt(10) ** BigInt(fracPartRaw.length);
  const num = BigInt(intPart) * den + (fracPartRaw === "" ? BigInt(0) : BigInt(fracPartRaw));
  return { num, den };
}

/** Converts a finite JS number to an exact `num/den` fraction, derived from
 * its canonical (shortest round-tripping) decimal string rather than from
 * floating-point multiplication — this is what makes the engine immune to
 * float drift. */
function numberToSignedFraction(n: number): { num: bigint; den: bigint } {
  let s = n.toString();
  if (/e/i.test(s)) s = expandExponential(s);
  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s.startsWith("+") ? s.slice(1) : s;
  const { num, den } = unsignedDecimalStringToFraction(unsigned);
  return { num: negative ? -num : num, den };
}

/** Floor division for BigInts, assuming a positive divisor. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r < BigInt(0) ? q - BigInt(1) : q;
}

/** Rounds the rational `num/den` (den > 0) to the nearest integer, with
 * ties rounding toward positive infinity ("round half up"). */
function roundHalfUp(num: bigint, den: bigint): bigint {
  return floorDiv(num * BigInt(2) + den, den * BigInt(2));
}

// ---------------------------------------------------------------------------
// Public cents helpers
// ---------------------------------------------------------------------------

/** Converts a currency-unit amount (e.g. dollars) to an integer number of
 * cents, rounding half up. Throws if `x` is not a finite number (or a
 * string that doesn't parse to one). */
export function toCents(x: number | string): number {
  const n = finiteNumberFrom(x, "toCents");
  const { num, den } = numberToSignedFraction(n);
  return Number(roundHalfUp(num * BigInt(100), den));
}

/** Converts an integer number of cents back to currency units. */
export function fromCents(c: number): number {
  if (!Number.isFinite(c)) {
    throw new Error(`fromCents: expected a finite number, got ${c}`);
  }
  return c / 100;
}

// ---------------------------------------------------------------------------
// Percentage helpers (operate on integer cents, exact fraction math)
// ---------------------------------------------------------------------------

/** Returns `amountCents * (1 - pct/100)`, rounded half up. */
function reduceByPercent(amountCents: number, pct: number): number {
  const { num: pnum, den: pden } = numberToSignedFraction(finiteNumberFrom(pct, "computeTotals: discount percent"));
  const hundred = BigInt(100);
  const numerator = BigInt(amountCents) * (hundred * pden - pnum);
  const denominator = pden * hundred;
  return Number(roundHalfUp(numerator, denominator));
}

/** Returns `amountCents * pct/100`, rounded half up. */
function percentOf(amountCents: number, pct: number): number {
  const { num: pnum, den: pden } = numberToSignedFraction(finiteNumberFrom(pct, "computeTotals: tax rate"));
  const numerator = BigInt(amountCents) * pnum;
  const denominator = pden * BigInt(100);
  return Number(roundHalfUp(numerator, denominator));
}

// ---------------------------------------------------------------------------
// Discount resolution (Task 6: a discount is a mode plus a value)
// ---------------------------------------------------------------------------

/** Resolves a discount to an integer cents amount, never exceeding the base
 * it applies to. Percent keeps the existing half-up rounding (`baseCents -
 * reduceByPercent(...)` rather than `percentOf(...)` so a PERCENT discount's
 * resolved amount is byte-for-byte the complement of what
 * `reduceByPercent` already kept — i.e. identical rounding to the
 * pre-Task-6 behaviour); amount is taken at face value and clamped so a
 * cash discount can never push a total negative on its own. Exported so
 * `setItemDiscount`/`setDocumentDiscount` (src/lib/actions/documents.ts) can
 * resolve the exact same cash amount at write time (for the region-cap
 * check) that this module will resolve again at every read/recalc. */
export function discountCents(baseCents: number, mode: DiscountMode, value: string | null): number {
  if (value === null) return 0;
  if (mode === "PERCENT") return baseCents - reduceByPercent(baseCents, Number(value));
  return Math.min(toCents(value), baseCents);
}

/** The effective percentage a discount represents, used for the region
 * discount cap (`Region.maxDiscountPct`) — without this, a cash discount
 * would bypass the cap entirely (a $20,000 discount means nothing to a "max
 * 10%" rule unless it's converted back to a percentage of its base first).
 * Returns a float; it must only ever be compared against a cap, never fed
 * back into a money value (see `discountCents` for the exact/integer-cents
 * money math). Exported for the same reason as `discountCents`. */
export function effectivePct(baseCents: number, discount: number): number {
  return baseCents === 0 ? 0 : (discount / baseCents) * 100;
}

/** The percentage to compare against a discount cap (`maxDiscountPct` /
 * `Region.maxDiscountPct`).
 *
 * PERCENT and AMOUNT are compared differently on purpose: a PERCENT
 * discount's typed value IS the percentage, so it's compared to the cap
 * directly — exactly as it was before discounts could be a cash amount.
 * Routing it through `discountCents` (which rounds to whole cents) and then
 * back through `effectivePct` would introduce cents-rounding noise that can
 * push a borderline value fractionally to either side of the typed figure
 * on a base that doesn't divide evenly — e.g. a $1.03 base with a typed 51%
 * discount resolves to a 53c discount, which is 51.46% of base, not 51%; a
 * cap of exactly 51% would then wrongly reject a discount that was, as
 * typed, exactly at the limit. AMOUNT has no typed percentage of its own —
 * `effectivePct` (the resolved cash discount as a percentage of `baseCents`)
 * is the only way to compare it to the cap at all. */
export function capPct(mode: DiscountMode, value: string | null, baseCents: number, discount: number): number {
  if (value === null) return 0;
  return mode === "PERCENT" ? Number(value) : effectivePct(baseCents, discount);
}

// ---------------------------------------------------------------------------
// computeTotals
// ---------------------------------------------------------------------------

/**
 * Computes every derived total for a document from its items, extra lines,
 * discounts and tax rate. Rules:
 *
 * - Per item: base = unitPrice + Σ(line.qty * line.unitPrice); the item's
 *   discount (a mode + value, default "no discount" when the value is null —
 *   see `discountCents`) is resolved to cents and subtracted from base →
 *   itemTotal. The discount's percentage (the typed value itself for
 *   PERCENT, or the resolved cash amount converted back to a percentage of
 *   base for AMOUNT — see `capPct`) is compared against the item's cap
 *   (maxDiscountPct, default 100 = no cap); if it exceeds the cap, a
 *   violation is reported — the cap is NOT auto-applied, the math still uses
 *   the requested discount. Callers decide whether to reject the save when
 *   violations are present.
 * - grossSubtotal = Σ item bases + Σ(extraLine.qty * extraLine.unitPrice),
 *   before any discounts.
 * - subtotal = Σ itemTotals + Σ(extraLine.qty * extraLine.unitPrice).
 * - The document-level discount (same mode + value shape, default "no
 *   discount") is resolved and subtracted from subtotal → taxableBase.
 *   discountAmount = subtotal - taxableBase.
 * - taxAmount = taxableBase * taxRate/100.
 * - total = taxableBase + taxAmount.
 *
 * All arithmetic happens in integer cents internally (see toCents/fromCents
 * and the fraction helpers above); the returned totals are back in currency
 * units.
 *
 * Alongside all of that, `documentConcession` (see its own doc comment on
 * `DocumentConcession`) is accumulated in the same pass:
 *
 *   concession = Σ over items and option lines of (listPrice − unitPrice) × qty   // signed, see below
 *              + Σ item discount amounts
 *              + Σ |negative extra lines|
 *              + document discount amount
 *
 *   listValue  = Σ over items and option lines of listPrice × qty
 *              + Σ positive extra lines
 *
 * The `(listPrice − unitPrice)` term is signed ON PURPOSE — do not "simplify"
 * it to `Math.max(0, listPrice - unitPrice)`. A price *raised* above list
 * (John: "you can increase the price of the machine by $10,000 and then give
 * away $10,000 worth of options — we do that all the time") must contribute a
 * *negative* concession, so that maneuver nets to zero instead of being
 * counted as a $10,000 discount on top of the $10,000 given away in options.
 * Clamping to zero would silently double the apparent concession every time
 * a salesperson uses exactly the workflow this feature exists to support.
 *
 * A negative extra line is one mechanism for entering a trade-in (see
 * `customLineSchema`), and a trade-in allowance is money given away just
 * like a discount — so its absolute value counts toward `concession` too,
 * added on top of (not instead of) the listPrice/unitPrice term above, which
 * never runs over extra lines at all (`EngineExtraLine` has no `listPrice` —
 * a custom line has no catalogue price to concede against).
 *
 * A credit item (`EngineItem.isCredit` — the TRADE-IN catalogue product,
 * today) is the OTHER mechanism, and is folded into the SAME `tradeIns`
 * bucket rather than a third one: its full magnitude (`unitPrice` + any
 * option lines, after its own discount if any — see the items/lines loop
 * below) is added to `tradeIns`, exactly as a negative extra line's absolute
 * value already is. This is what "replacing, not duplicating, the
 * negative-extra-line handling" means in practice — a salesperson uses one
 * mechanism or the other for a given trade-in, never both, so nothing here
 * forces that; it just makes sure a credit item's own contribution is never
 * ALSO picked up by the listPrice/unitPrice `priceAdjustments` term or by
 * `itemDiscounts` — a credit item is excluded from both of those (its
 * `(listPrice − unitPrice)` term is skipped, and its own item discount, if
 * any, is folded into its `tradeIns` magnitude instead of into
 * `itemDiscounts`) precisely so its money is counted once, not twice. A
 * credit item's `listPrice` also never adds to `listValue` (the cap's
 * denominator), matching how a negative extra line's amount doesn't either —
 * only what was actually "sold" (kept as a charge, not given back) counts
 * toward the denominator.
 *
 * A credit item contributes `-(unitPrice + options)` (after its own
 * discount) to `subtotal` itself, via its entry in the returned
 * `itemTotals` — this is what makes it actually reduce the quote, not just
 * something `documentConcession` reports on the side.
 *
 * `listPrice: null` (a custom/legacy line with no catalogue price recorded)
 * is treated as equal to `unitPrice` — zero concession, and its value still
 * counts toward `listValue` at whatever `unitPrice` actually is.
 */
export function computeTotals(input: EngineInput): PricingTotals {
  const violations: EngineViolation[] = [];

  // Accumulated across the items/lines loop below alongside the existing
  // per-item math — see the doc comment above for the formula.
  let concessionCents = 0;
  let listValueCents = 0;
  // A credit item's full magnitude (see the doc comment above) — kept
  // separate from `concessionCents` until the fold-in below so it can be
  // reported on its own as part of `tradeIns`, the same way
  // `negativeExtraLinesAbsCents` further down is.
  let creditItemsAbsCents = 0;
  // Sum of every non-credit item's own discount amount — the subset of
  // `itemDiscountsCents` (below) that actually folds into `concessionCents`/
  // `DocumentConcession.parts.itemDiscounts`. A credit item's own discount
  // (an edge case — see `EngineItem.isCredit`'s doc comment: a credit item
  // isn't expected to carry one) is deliberately excluded here so it isn't
  // folded in a second time on top of the full magnitude already captured by
  // `creditItemsAbsCents` above; it still contributes to `itemDiscountsCents`
  // itself (and therefore `PricingTotals.itemDiscounts`/`totalDiscountAmount`)
  // exactly like any other item's discount would, for display purposes.
  let itemDiscountConcessionCents = 0;

  const itemDiscountsCents: number[] = [];
  const itemTotalsCents = input.items.map((item, itemIndex) => {
    const isCredit = item.isCredit ?? false;
    const itemUnitPriceCents = toCents(item.unitPrice);
    const itemListPriceCents = item.listPrice != null ? toCents(item.listPrice) : itemUnitPriceCents;

    const linesCents = item.lines.reduce((sum, line) => {
      const lineUnitPriceCents = toCents(line.unitPrice);
      const lineListPriceCents = line.listPrice != null ? toCents(line.listPrice) : lineUnitPriceCents;
      // A credit item is excluded from the price-adjustment/list-value
      // accumulation entirely — its money is counted once, via
      // `creditItemsAbsCents` below, not through this term too (see the
      // doc comment above on avoiding double-counting).
      if (!isCredit) {
        concessionCents += (lineListPriceCents - lineUnitPriceCents) * line.qty;
        listValueCents += lineListPriceCents * line.qty;
      }
      return sum + line.qty * lineUnitPriceCents;
    }, 0);
    const baseCents = itemUnitPriceCents + linesCents;

    const mode = item.discountMode ?? "PERCENT";
    const value = item.discountValue ?? null;
    const discount = discountCents(baseCents, mode, value);
    const allowedPct = item.maxDiscountPct ?? 100;
    if (capPct(mode, value, baseCents, discount) > allowedPct) {
      violations.push({ itemIndex, allowedPct });
    }

    itemDiscountsCents.push(discount);
    if (!isCredit) itemDiscountConcessionCents += discount;
    const itemMagnitudeCents = baseCents - discount;

    if (isCredit) {
      // Full magnitude counts once, in `tradeIns` — not also via
      // `itemListPriceCents - itemUnitPriceCents` (skipped above) or via
      // `itemDiscountsCents`/`itemDiscountTotalCents` below (see
      // `documentConcession`'s doc comment on why credit items are excluded
      // from that fold). Negated so it actually reduces `subtotal` — see
      // the doc comment above.
      creditItemsAbsCents += itemMagnitudeCents;
      return -itemMagnitudeCents;
    }

    concessionCents += itemListPriceCents - itemUnitPriceCents;
    listValueCents += itemListPriceCents;
    return itemMagnitudeCents;
  });

  let extraLinesCents = 0;
  let negativeExtraLinesAbsCents = 0;
  let positiveExtraLinesCents = 0;
  for (const line of input.extraLines) {
    const lineCents = line.qty * toCents(line.unitPrice);
    extraLinesCents += lineCents;
    if (lineCents < 0) negativeExtraLinesAbsCents += -lineCents;
    else positiveExtraLinesCents += lineCents;
  }
  listValueCents += positiveExtraLinesCents;

  const subtotalCents = itemTotalsCents.reduce((sum, cents) => sum + cents, 0) + extraLinesCents;
  const itemDiscountTotalCents = itemDiscountsCents.reduce((sum, cents) => sum + cents, 0);
  const grossSubtotalCents = subtotalCents + itemDiscountTotalCents;

  const documentMode = input.documentDiscountMode ?? "PERCENT";
  const documentValue = input.documentDiscountValue ?? null;
  const discountAmountCents = discountCents(subtotalCents, documentMode, documentValue);
  const totalDiscountAmountCents = itemDiscountTotalCents + discountAmountCents;
  const taxableBaseCents = subtotalCents - discountAmountCents;

  const taxAmountCents = percentOf(taxableBaseCents, input.taxRate);
  const totalCents = taxableBaseCents + taxAmountCents;

  // `concessionCents` at this point holds only the listPrice/unitPrice
  // price-adjustment term accumulated in the items/lines loop above (see
  // `DocumentConcession.parts.priceAdjustments`'s doc comment) — captured
  // here, before the other three sources are folded in below, so `parts`
  // can report it on its own.
  const priceAdjustmentsCents = concessionCents;

  // Item discounts (excluding a credit item's own — see
  // `itemDiscountConcessionCents`'s doc comment), the negative-extra-line
  // total plus every credit item's magnitude (the two `tradeIns` sources —
  // see `computeTotals`'s doc comment), and the document discount all count
  // toward the concession.
  const tradeInsCents = negativeExtraLinesAbsCents + creditItemsAbsCents;
  concessionCents += itemDiscountConcessionCents + tradeInsCents + discountAmountCents;

  const documentAllowedPct = input.regionMaxDiscountPct ?? 100;
  const documentEffectivePct = effectivePct(listValueCents, concessionCents);
  const documentAllowedMarkupPct = input.regionMaxMarkupPct ?? null;
  const documentConcession: DocumentConcession = {
    concession: fromCents(concessionCents).toFixed(2),
    listValue: fromCents(listValueCents).toFixed(2),
    effectivePct: documentEffectivePct,
    allowedPct: documentAllowedPct,
    exceedsCap: documentEffectivePct > documentAllowedPct,
    allowedMarkupPct: documentAllowedMarkupPct,
    exceedsMarkupCap: documentAllowedMarkupPct !== null && -documentEffectivePct > documentAllowedMarkupPct,
    parts: {
      documentDiscount: fromCents(discountAmountCents).toFixed(2),
      // Excludes a credit item's own discount (if any — see
      // `itemDiscountConcessionCents`) so `parts` still sums to `concession`
      // exactly; `PricingTotals.itemDiscounts` below is unaffected (it's
      // still the full per-item figure, used for per-item display).
      itemDiscounts: fromCents(itemDiscountConcessionCents).toFixed(2),
      priceAdjustments: fromCents(priceAdjustmentsCents).toFixed(2),
      tradeIns: fromCents(tradeInsCents).toFixed(2),
    },
  };

  return {
    itemTotals: itemTotalsCents.map(fromCents),
    itemDiscounts: itemDiscountsCents.map(fromCents),
    grossSubtotal: fromCents(grossSubtotalCents),
    subtotal: fromCents(subtotalCents),
    discountAmount: fromCents(discountAmountCents),
    totalDiscountAmount: fromCents(totalDiscountAmountCents),
    taxableBase: fromCents(taxableBaseCents),
    taxAmount: fromCents(taxAmountCents),
    total: fromCents(totalCents),
    violations,
    negativeSubtotal: subtotalCents < 0,
    documentConcession,
  };
}

/** Trims a percentage to a display-friendly string (2dp, no trailing zeros)
 * — `effectivePct`/`DocumentConcession.effectivePct` are floats that can
 * carry rounding noise (e.g. `19.999999999999996`), which would look wrong
 * printed straight into a user-facing message. Shared by
 * `concessionCapMessage` below, by the builder's persistent over-cap badge
 * (`ConcessionCapBadge`, via that same message), and by `formatEffectivePct`
 * in src/lib/actions/documents.ts (which predates this export and formats
 * the unrelated per-item/per-document discount-cap message — not merged
 * with this one to avoid an unrelated cross-file behavior change). Exported
 * for those non-pricing.ts readers. */
export function formatPct(pct: number): string {
  return (Math.round(pct * 100) / 100).toString();
}

/** Joins 1+ addition phrases the way plain English lists them: just the one
 * phrase alone, two phrases joined by "plus", or three-or-more as an
 * Oxford-comma-free list ending in ", plus <last>". Mirrors the shape of the
 * owner's own example ("$10,448.20 discount plus a $20,000.00 trade-in")
 * exactly for the two-part case, and generalizes it rather than hard-coding
 * just that one combination. */
function joinParts(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  if (phrases.length === 2) return `${phrases[0]} plus ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, plus ${phrases[phrases.length - 1]}`;
}

/**
 * Builds the region-cap-exceeded message for `documentConcession` — shared
 * by every mutating action in src/lib/actions/documents.ts (via
 * `recalcDocument`) and by `finalizeDocument` (via `validateFinalizable` in
 * src/lib/validation/finalize.ts), so it lives here rather than in either of
 * those (neither imports the other, and this module is the one thing both
 * already depend on), and by the builder's Summary panel (see
 * `ConcessionCapBadge`/`ConcessionCapToast`). Pulls in `formatMoney` from
 * src/lib/format.ts — a plain, dependency-free formatter, so this stays safe
 * to import from a `@/lib/db`-free unit test the same as the rest of this
 * module — purely for that reason, despite this file's usual "no formatting
 * concerns" framing.
 *
 * A single opaque total ("Total concessions of $30,448.20...") gives the
 * reader no way to tell a real discount from, say, a trade-in entered as a
 * negative extra line — the owner saw exactly that next to a Summary panel
 * reading "Discount −$10,448.20" and reasonably concluded the bigger number
 * was wrong. It wasn't: the gap was a trade-in, which counts against the cap
 * by design (see `computeTotals`'s doc comment) but was invisible in the old
 * message. This names every non-zero part instead, e.g.:
 *
 *   "Concessions total $30,448.20 (10.12% of list price) — $10,448.20
 *   discount plus a $20,000.00 trade-in — above the 10% limit for
 *   Australia."
 *
 * `documentDiscount` and `itemDiscounts` are folded into one "discount"
 * figure — together they're exactly the number the Summary panel's own
 * "Discount" line already shows (see `DocumentForBuilder.summaryDiscountAmount`),
 * so naming them separately here would only reintroduce a second way to
 * read "discount" that disagrees with the one already on screen.
 * `priceAdjustments` (manual per-unit prices cut below list, outside the
 * discount fields entirely) gets its own phrase when positive; when
 * negative — prices raised above list — it is never described as a
 * discount (a reader must not be told a price *increase* gave money away):
 * it's named as a separate reduction instead, e.g. "...trade-in, less
 * $2,000.00 from a price increase above list — above...". A part that's
 * exactly zero is omitted entirely, so a document with only a discount (no
 * trade-in, no manual price cut) still gets a clean one-clause message.
 */
export function concessionCapMessage(dc: DocumentConcession, regionName: string, currency: string): string {
  const discountCentsTotal = toCents(dc.parts.documentDiscount) + toCents(dc.parts.itemDiscounts);
  const priceAdjustmentsCents = toCents(dc.parts.priceAdjustments);
  const tradeInCents = toCents(dc.parts.tradeIns);

  const money = (cents: number) => formatMoney(fromCents(cents).toFixed(2), currency);

  const additions: string[] = [];
  if (discountCentsTotal !== 0) additions.push(`${money(discountCentsTotal)} discount`);
  if (priceAdjustmentsCents > 0) additions.push(`${money(priceAdjustmentsCents)} price cut below list`);
  if (tradeInCents !== 0) additions.push(`a ${money(tradeInCents)} trade-in`);

  let partsClause = joinParts(additions);
  if (priceAdjustmentsCents < 0) {
    const reduction = `${money(-priceAdjustmentsCents)} from a price increase above list`;
    partsClause = partsClause ? `${partsClause}, less ${reduction}` : `reduced by ${reduction}`;
  }

  const partsSegment = partsClause ? ` — ${partsClause}` : "";

  return `Concessions total ${formatMoney(dc.concession, currency)} (${formatPct(dc.effectivePct)}% of list price)${partsSegment} — above the ${dc.allowedPct}% limit for ${regionName}.`;
}

/**
 * Builds the region-markup-ceiling-exceeded message for `documentConcession`
 * — the mirror of `concessionCapMessage` above, for the opposite-signed case
 * (Ross: "he's got a minimum selling price. And a maximum selling price. And
 * those rules apply to the LLC as well."). Shares `concessionCapMessage`'s
 * caller (`recalcAndEnforce` in src/lib/actions/documents.ts) and UI
 * surfacing (`ConcessionCapBadge`/`ConcessionCapToast`) rather than a
 * parallel mechanism of its own — see `DocumentConcession.exceedsMarkupCap`.
 *
 * Deliberately kept in the same shape `concessionCapMessage` reads in — the
 * amount, then its percentage, then the ceiling and the region — so the two
 * read as one family of message rather than two differently-worded rules,
 * e.g.:
 *
 *   "This quote is priced $12,000.00 above list (12% markup) — above the
 *   10% markup ceiling for Australia."
 *
 * Never called with `allowedMarkupPct: null` — a caller only builds this
 * once `exceedsMarkupCap` is true, which already implies a non-null ceiling
 * (see `computeTotals`).
 */
export function markupCapMessage(dc: DocumentConcession, regionName: string, currency: string): string {
  // `dc.concession` is negative for a markup (a price raised above list) —
  // negate it back to a plain positive "how much over list" figure, the
  // same way `dc.effectivePct` is negated to a plain positive markup
  // percentage below.
  const overListCents = -toCents(dc.concession);
  const markupPct = -dc.effectivePct;
  return `This quote is priced ${formatMoney(fromCents(overListCents).toFixed(2), currency)} above list (${formatPct(markupPct)}% markup) — above the ${dc.allowedMarkupPct}% markup ceiling for ${regionName}.`;
}
