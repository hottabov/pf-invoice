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

/** A single option/component line attached to an item (qty * unitPrice). */
export type EngineItemLine = {
  qty: number;
  unitPrice: number;
};

/** A discount is either a percentage of its base or a fixed cash amount —
 * see `discountCents` below. */
export type DiscountMode = "PERCENT" | "AMOUNT";

/** One priced line item on the document (e.g. a machine + its options). */
export type EngineItem = {
  unitPrice: number;
  /** Defaults to `"PERCENT"` when omitted — matters only when
   * `discountValue` is non-null (a null value is 0 discount regardless of
   * mode). */
  discountMode?: DiscountMode | null;
  discountValue?: string | null;
  maxDiscountPct?: number | null;
  lines: EngineItemLine[];
};

/** A freeform document-level line (e.g. delivery, install). */
export type EngineExtraLine = {
  qty: number;
  unitPrice: number;
};

export type EngineInput = {
  items: EngineItem[];
  extraLines: EngineExtraLine[];
  documentDiscountMode?: DiscountMode | null;
  documentDiscountValue?: string | null;
  taxRate: number;
};

/** Reported when an item's requested discount exceeds its cap. The engine
 * still computes using the requested percentage — callers decide whether to
 * reject the save. */
export type EngineViolation = {
  itemIndex: number;
  allowedPct: number;
};

export type PricingTotals = {
  itemTotals: number[];
  subtotal: number;
  discountAmount: number;
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
 *   itemTotal. The resolved discount is converted back to an effective
 *   percentage of base (see `effectivePct`) and compared against the item's
 *   cap (maxDiscountPct, default 100 = no cap); if it exceeds the cap, a
 *   violation is reported — the cap is NOT auto-applied, the math still uses
 *   the requested discount. Callers decide whether to reject the save when
 *   violations are present.
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
 */
export function computeTotals(input: EngineInput): PricingTotals {
  const violations: EngineViolation[] = [];

  const itemTotalsCents = input.items.map((item, itemIndex) => {
    const linesCents = item.lines.reduce((sum, line) => sum + line.qty * toCents(line.unitPrice), 0);
    const baseCents = toCents(item.unitPrice) + linesCents;

    const mode = item.discountMode ?? "PERCENT";
    const value = item.discountValue ?? null;
    const discount = discountCents(baseCents, mode, value);
    const allowedPct = item.maxDiscountPct ?? 100;
    if (effectivePct(baseCents, discount) > allowedPct) {
      violations.push({ itemIndex, allowedPct });
    }

    return baseCents - discount;
  });

  const extraLinesCents = input.extraLines.reduce((sum, line) => sum + line.qty * toCents(line.unitPrice), 0);

  const subtotalCents = itemTotalsCents.reduce((sum, cents) => sum + cents, 0) + extraLinesCents;

  const documentMode = input.documentDiscountMode ?? "PERCENT";
  const documentValue = input.documentDiscountValue ?? null;
  const discountAmountCents = discountCents(subtotalCents, documentMode, documentValue);
  const taxableBaseCents = subtotalCents - discountAmountCents;

  const taxAmountCents = percentOf(taxableBaseCents, input.taxRate);
  const totalCents = taxableBaseCents + taxAmountCents;

  return {
    itemTotals: itemTotalsCents.map(fromCents),
    subtotal: fromCents(subtotalCents),
    discountAmount: fromCents(discountAmountCents),
    taxableBase: fromCents(taxableBaseCents),
    taxAmount: fromCents(taxAmountCents),
    total: fromCents(totalCents),
    violations,
    negativeSubtotal: subtotalCents < 0,
  };
}
