import { describe, it, expect } from "vitest";
import { toCents, fromCents, computeTotals } from "../src/lib/pricing";

describe("toCents", () => {
  it("converts a whole-dollar amount", () => {
    expect(toCents(100)).toBe(10000);
    expect(toCents(0)).toBe(0);
  });

  it("converts a two-decimal amount exactly", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1)).toBe(10);
  });

  it("rounds half up despite a naive-multiplication float trap (1.005)", () => {
    // 1.005 * 100 evaluates to 100.49999999999999 in naive IEEE-754
    // arithmetic (Math.round(1.005 * 100) === 100), which would silently
    // lose the intended half-up cent instead of the mathematically correct
    // result of 101.
    expect(Math.round(1.005 * 100)).toBe(100); // demonstrates the float trap exists
    expect(toCents(1.005)).toBe(101);
  });

  it("rounds half up on a value whose *100 happens to land exactly on .5 (33.335)", () => {
    expect(toCents(33.335)).toBe(3334);
  });

  it("rounds a third-decimal-place half exactly up", () => {
    expect(toCents(10.005)).toBe(1001);
    expect(toCents(10.004)).toBe(1000);
    expect(toCents(10.006)).toBe(1001);
  });

  it("accepts numeric strings", () => {
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("10.005")).toBe(1001);
  });

  it("throws on NaN", () => {
    expect(() => toCents(NaN)).toThrow(/finite/);
  });

  it("throws on Infinity", () => {
    expect(() => toCents(Infinity)).toThrow(/finite/);
    expect(() => toCents(-Infinity)).toThrow(/finite/);
  });

  it("throws on a non-numeric string", () => {
    expect(() => toCents("abc")).toThrow(/finite/);
  });

  it("throws on an empty string", () => {
    expect(() => toCents("")).toThrow(/finite/);
  });
});

describe("fromCents", () => {
  it("converts cents back to currency units", () => {
    expect(fromCents(10000)).toBe(100);
    expect(fromCents(3334)).toBe(33.34);
    expect(fromCents(0)).toBe(0);
  });

  it("round-trips with toCents for exact cent amounts", () => {
    expect(fromCents(toCents(19.99))).toBe(19.99);
  });

  it("throws on a non-finite input", () => {
    expect(() => fromCents(NaN)).toThrow(/finite/);
  });
});

describe("computeTotals", () => {
  it("computes a single item with no discounts and no tax", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result).toEqual({
      itemTotals: [100],
      subtotal: 100,
      discountAmount: 0,
      taxableBase: 100,
      taxAmount: 0,
      total: 100,
      violations: [],
      negativeSubtotal: false,
    });
  });

  it("sums an item's base price with its options lines", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [{ qty: 2, unitPrice: 25 }] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    // 100 + (2 * 25) = 150
    expect(result.itemTotals).toEqual([150]);
    expect(result.subtotal).toBe(150);
    expect(result.total).toBe(150);
  });

  it("applies a 10% item discount", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([90]);
    expect(result.subtotal).toBe(90);
    expect(result.total).toBe(90);
    expect(result.violations).toEqual([]);
  });

  it("reports a cap violation but still computes with the requested pct", () => {
    // L-Series: max discount 10%, manager requests 15% anyway.
    const result = computeTotals({
      items: [{ unitPrice: 100, discountPct: 15, maxDiscountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    // Math uses the requested 15%, NOT the 10% cap: 100 * 0.85 = 85.
    expect(result.itemTotals).toEqual([85]);
    expect(result.subtotal).toBe(85);
    expect(result.violations).toEqual([{ itemIndex: 0, allowedPct: 10 }]);
  });

  it("does not report a violation when the discount is within the cap", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountPct: 10, maxDiscountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
  });

  it("does not report a violation when maxDiscountPct is null (uncapped)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountPct: 50, maxDiscountPct: null, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
    expect(result.itemTotals).toEqual([50]);
  });

  it("indexes violations by the item's position for multiple items", () => {
    const result = computeTotals({
      items: [
        { unitPrice: 100, discountPct: 5, maxDiscountPct: 10, lines: [] },
        { unitPrice: 100, discountPct: 20, maxDiscountPct: 10, lines: [] },
      ],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([{ itemIndex: 1, allowedPct: 10 }]);
  });

  it("applies a document-level discount to the subtotal", () => {
    const result = computeTotals({
      items: [
        { unitPrice: 100, lines: [] },
        { unitPrice: 200, lines: [] },
      ],
      extraLines: [],
      documentDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([100, 200]);
    expect(result.subtotal).toBe(300);
    expect(result.discountAmount).toBe(30);
    expect(result.taxableBase).toBe(270);
    expect(result.total).toBe(270);
  });

  it("combines an item discount and a document discount", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountPct: 10,
      taxRate: 0,
    });
    // item: 100 * 0.9 = 90 (subtotal); document: 90 * 0.9 = 81.
    expect(result.itemTotals).toEqual([90]);
    expect(result.subtotal).toBe(90);
    expect(result.discountAmount).toBe(9);
    expect(result.taxableBase).toBe(81);
    expect(result.total).toBe(81);
  });

  it("applies a 10% AU-style tax on top of the taxable base", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 10,
    });
    expect(result.taxableBase).toBe(100);
    expect(result.taxAmount).toBe(10);
    expect(result.total).toBe(110);
  });

  it("charges no tax when taxRate is 0", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(result.taxableBase);
  });

  it("rounds half up at each money step for a fractional-cent unit price", () => {
    // unitPrice 33.335 -> 3334c; 3 lines of 33.335 -> 3 * 3334c = 10002c;
    // base = 3334 + 10002 = 13336c = 133.36.
    const result = computeTotals({
      items: [{ unitPrice: 33.335, lines: [{ qty: 3, unitPrice: 33.335 }] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([133.36]);
    expect(result.subtotal).toBe(133.36);
    expect(result.total).toBe(133.36);
  });

  it("avoids the classic 0.1 + 0.2 float trap across items and extra lines", () => {
    // Naive floating point: 0.1 + 0.2 === 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);
    const result = computeTotals({
      items: [{ unitPrice: 0.2, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: 0.1 }],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(0.3);
    expect(result.total).toBe(0.3);
  });

  it("avoids float drift when summing repeated fractional lines (3 * 0.1)", () => {
    // Naive floating point: 0.1 + 0.1 + 0.1 === 0.30000000000000004.
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
    const result = computeTotals({
      items: [
        {
          unitPrice: 0,
          lines: [
            { qty: 1, unitPrice: 0.1 },
            { qty: 1, unitPrice: 0.1 },
            { qty: 1, unitPrice: 0.1 },
          ],
        },
      ],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([0.3]);
    expect(result.subtotal).toBe(0.3);
  });

  it("handles a zero-line item (no options)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 50, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([50]);
    expect(result.subtotal).toBe(50);
  });

  it("multiplies option lines by quantity greater than 1", () => {
    const result = computeTotals({
      items: [{ unitPrice: 0, lines: [{ qty: 4, unitPrice: 12.5 }] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([50]);
  });

  it("computes extra lines only, with no items", () => {
    const result = computeTotals({
      items: [],
      extraLines: [{ qty: 3, unitPrice: 15.5 }],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([]);
    expect(result.subtotal).toBe(46.5);
    expect(result.total).toBe(46.5);
    expect(result.violations).toEqual([]);
  });

  it("returns all zeros for a fully empty input", () => {
    const result = computeTotals({
      items: [],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result).toEqual({
      itemTotals: [],
      subtotal: 0,
      discountAmount: 0,
      taxableBase: 0,
      taxAmount: 0,
      total: 0,
      violations: [],
      negativeSubtotal: false,
    });
  });

  it("treats a missing discountPct the same as zero", () => {
    const withUndefined = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountPct: undefined,
      taxRate: 0,
    });
    const withNull = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(withUndefined).toEqual(withNull);
  });

  it("lets a negative extra line reduce the subtotal", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -15000 }],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(85000);
    expect(result.total).toBe(85000);
    expect(result.negativeSubtotal).toBe(false);
  });

  it("reports a violation when the subtotal goes negative", () => {
    const result = computeTotals({
      items: [{ unitPrice: 1000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -5000 }],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(-4000);
    expect(result.negativeSubtotal).toBe(true);
  });

  it("does not flag negativeSubtotal for an ordinary positive quote", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: 10 }],
      documentDiscountPct: null,
      taxRate: 0,
    });
    expect(result.negativeSubtotal).toBe(false);
  });
});
