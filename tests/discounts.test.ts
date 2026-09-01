// Task 6: a discount is a mode ("PERCENT" | "AMOUNT") plus a value, not a
// bare percentage. Covers both item-level and document-level discounts —
// see src/lib/pricing.ts's `discountCents`/`effectivePct` and their use in
// `computeTotals`. Follows tests/pricing.test.ts's conventions (plain
// dollar-unit fixtures fed straight to `computeTotals`, `toEqual` on the
// bits under test) rather than re-testing money-rounding edge cases already
// covered there.
import { describe, it, expect } from "vitest";
import { computeTotals } from "../src/lib/pricing";

describe("item-level discount mode", () => {
  it("an AMOUNT discount below the base reduces the item total by exactly that amount", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, discountMode: "AMOUNT", discountValue: "20000", lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([80000]);
    expect(result.subtotal).toBe(80000);
  });

  it("an AMOUNT discount larger than the base is clamped to the base, never a negative item total", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, discountMode: "AMOUNT", discountValue: "150000", lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([0]);
    expect(result.subtotal).toBe(0);
  });

  it("reports a violation when an AMOUNT discount's effective percentage exceeds the item's cap", () => {
    // $20,000 off a $100,000 base is 20% — above the 10% region cap.
    const result = computeTotals({
      items: [
        { unitPrice: 100000, discountMode: "AMOUNT", discountValue: "20000", maxDiscountPct: 10, lines: [] },
      ],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([{ itemIndex: 0, allowedPct: 10 }]);
    // The math still uses the requested discount, not the cap.
    expect(result.itemTotals).toEqual([80000]);
  });

  it("a PERCENT discount still yields the same result as before Task 6, to the cent", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, discountMode: "PERCENT", discountValue: "5", lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([95000]);
    expect(result.subtotal).toBe(95000);
  });
});

describe("document-level discount mode", () => {
  it("an AMOUNT discount below the subtotal reduces it by exactly that amount", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [],
      documentDiscountMode: "AMOUNT",
      documentDiscountValue: "20000",
      taxRate: 0,
    });
    expect(result.subtotal).toBe(100000);
    expect(result.discountAmount).toBe(20000);
    expect(result.taxableBase).toBe(80000);
    expect(result.total).toBe(80000);
  });

  it("an AMOUNT discount larger than the subtotal is clamped, taxableBase never negative", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [],
      documentDiscountMode: "AMOUNT",
      documentDiscountValue: "150000",
      taxRate: 0,
    });
    expect(result.subtotal).toBe(100000);
    expect(result.discountAmount).toBe(100000);
    expect(result.taxableBase).toBe(0);
    expect(result.total).toBe(0);
  });

  it("an AMOUNT discount's effective percentage of the subtotal is computable the same way an item's is", () => {
    // Mirrors the item-level cap check above: the region cap is enforced
    // against the *document* subtotal by the caller (setDocumentDiscount in
    // src/lib/actions/documents.ts), using the same discountCents/
    // effectivePct pair computeTotals uses internally — the engine itself
    // has no document-level maxDiscountPct input (only items carry
    // maxDiscountPct — see EngineItem), so this asserts the resolved
    // discount amount and its effective percentage against the subtotal
    // directly, exactly the figures the action's cap check consumes: $20,000
    // off a $100,000 subtotal is 20%, above a 10% cap.
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [],
      documentDiscountMode: "AMOUNT",
      documentDiscountValue: "20000",
      taxRate: 0,
    });
    expect(result.discountAmount).toBe(20000);
    const effectivePct = (result.discountAmount / result.subtotal) * 100;
    expect(effectivePct).toBe(20);
    expect(effectivePct).toBeGreaterThan(10);
  });

  it("a PERCENT document discount still yields the same result as before Task 6, to the cent", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "5",
      taxRate: 0,
    });
    expect(result.subtotal).toBe(100000);
    expect(result.discountAmount).toBe(5000);
    expect(result.taxableBase).toBe(95000);
    expect(result.total).toBe(95000);
  });
});

describe("PERCENT cap comparison is not distorted by cents rounding (regression)", () => {
  // discountCents for PERCENT computes the *kept* amount (base * (1 -
  // pct/100), rounded half up) and subtracts it from base to get the
  // discount — not `base * pct/100` rounded directly. That asymmetry means
  // converting the resolved discount back to a percentage via `effectivePct`
  // can land on either side of the typed value on a base that doesn't
  // divide evenly. `capPct` (src/lib/pricing.ts) avoids this entirely for
  // PERCENT by comparing the typed value to the cap directly.

  it("does not flag a violation on the originally suspected case ($333.35 base, 10% discount, 10% cap)", () => {
    // 10% of 33335c is 3333.5c. One might expect this to round up to 3334c
    // (making the effective percentage 10.0015%, just over a 10% cap) — but
    // discountCents actually rounds the *kept* 90% up (30001.5 -> 30002)
    // and subtracts, giving a 3333c discount: 9.9985% of base, under the
    // cap even via the old (buggy) effectivePct comparison. This case does
    // NOT reproduce the regression; it's kept here as a documented negative.
    const result = computeTotals({
      items: [{ unitPrice: 333.35, discountMode: "PERCENT", discountValue: "10", maxDiscountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
  });

  it("does not flag a violation for a discount typed at exactly the cap, on a base where rounding pushes the naive effective percentage over it", () => {
    // $1.03 base, 51% discount: 51% of 103c is 52.53c, which rounds up to
    // 53c — 51.46% of base. Routing this through effectivePct (as the code
    // did before this fix) would report a violation for a discount typed at
    // exactly the 51% cap; comparing the typed value directly does not.
    const result = computeTotals({
      items: [{ unitPrice: 1.03, discountMode: "PERCENT", discountValue: "51", maxDiscountPct: 51, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
    expect(result.itemTotals).toEqual([0.5]);
  });

  it("still flags a PERCENT discount that is genuinely above the cap on that same base", () => {
    const result = computeTotals({
      items: [{ unitPrice: 1.03, discountMode: "PERCENT", discountValue: "52", maxDiscountPct: 51, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([{ itemIndex: 0, allowedPct: 51 }]);
  });
});

describe("no discount set (mode present, value null)", () => {
  it("treats a null discountValue as zero discount regardless of mode", () => {
    const percentMode = computeTotals({
      items: [{ unitPrice: 100000, discountMode: "PERCENT", discountValue: null, lines: [] }],
      extraLines: [],
      documentDiscountMode: "AMOUNT",
      documentDiscountValue: null,
      taxRate: 0,
    });
    const amountMode = computeTotals({
      items: [{ unitPrice: 100000, discountMode: "AMOUNT", discountValue: null, lines: [] }],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(percentMode.itemTotals).toEqual([100000]);
    expect(amountMode.itemTotals).toEqual([100000]);
    expect(percentMode.discountAmount).toBe(0);
    expect(amountMode.discountAmount).toBe(0);
  });
});
