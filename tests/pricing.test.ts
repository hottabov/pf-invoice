import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  computeTotals,
  discountCents,
  capPct,
  concessionCapMessage,
  markupCapMessage,
} from "../src/lib/pricing";

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
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result).toEqual({
      itemTotals: [100],
      itemDiscounts: [0],
      grossSubtotal: 100,
      subtotal: 100,
      discountAmount: 0,
      totalDiscountAmount: 0,
      taxableBase: 100,
      taxAmount: 0,
      total: 100,
      violations: [],
      negativeSubtotal: false,
      documentConcession: {
        concession: "0.00",
        listValue: "100.00",
        effectivePct: 0,
        allowedPct: 100,
        exceedsCap: false,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
      },
    });
  });

  it("sums an item's base price with its options lines", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [{ qty: 2, unitPrice: 25 }] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    // 100 + (2 * 25) = 150
    expect(result.itemTotals).toEqual([150]);
    expect(result.subtotal).toBe(150);
    expect(result.total).toBe(150);
  });

  it("applies a 10% item discount", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "10", lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([90]);
    expect(result.itemDiscounts).toEqual([10]);
    expect(result.grossSubtotal).toBe(100);
    expect(result.subtotal).toBe(90);
    expect(result.totalDiscountAmount).toBe(10);
    expect(result.total).toBe(90);
    expect(result.violations).toEqual([]);
  });

  it("reports a cap violation but still computes with the requested pct", () => {
    // L-Series: max discount 10%, manager requests 15% anyway.
    const result = computeTotals({
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "15", maxDiscountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    // Math uses the requested 15%, NOT the 10% cap: 100 * 0.85 = 85.
    expect(result.itemTotals).toEqual([85]);
    expect(result.subtotal).toBe(85);
    expect(result.violations).toEqual([{ itemIndex: 0, allowedPct: 10 }]);
  });

  it("does not report a violation when the discount is within the cap", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "10", maxDiscountPct: 10, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
  });

  it("does not report a violation when maxDiscountPct is null (uncapped)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "50", maxDiscountPct: null, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.violations).toEqual([]);
    expect(result.itemTotals).toEqual([50]);
  });

  it("indexes violations by the item's position for multiple items", () => {
    const result = computeTotals({
      items: [
        { unitPrice: 100, discountMode: "PERCENT", discountValue: "5", maxDiscountPct: 10, lines: [] },
        { unitPrice: 100, discountMode: "PERCENT", discountValue: "20", maxDiscountPct: 10, lines: [] },
      ],
      extraLines: [],
      documentDiscountValue: null,
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
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "10",
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
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "10", lines: [] }],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "10",
      taxRate: 0,
    });
    // item: 100 * 0.9 = 90 (subtotal); document: 90 * 0.9 = 81.
    expect(result.itemTotals).toEqual([90]);
    expect(result.grossSubtotal).toBe(100);
    expect(result.subtotal).toBe(90);
    expect(result.discountAmount).toBe(9);
    expect(result.totalDiscountAmount).toBe(19);
    expect(result.taxableBase).toBe(81);
    expect(result.total).toBe(81);
  });

  it("applies a 10% AU-style tax on top of the taxable base", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
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
      documentDiscountValue: null,
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
      documentDiscountValue: null,
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
      documentDiscountValue: null,
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
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([0.3]);
    expect(result.subtotal).toBe(0.3);
  });

  it("handles a zero-line item (no options)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 50, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([50]);
    expect(result.subtotal).toBe(50);
  });

  it("multiplies option lines by quantity greater than 1", () => {
    const result = computeTotals({
      items: [{ unitPrice: 0, lines: [{ qty: 4, unitPrice: 12.5 }] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([50]);
  });

  it("computes extra lines only, with no items", () => {
    const result = computeTotals({
      items: [],
      extraLines: [{ qty: 3, unitPrice: 15.5 }],
      documentDiscountValue: null,
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
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result).toEqual({
      itemTotals: [],
      itemDiscounts: [],
      grossSubtotal: 0,
      subtotal: 0,
      discountAmount: 0,
      totalDiscountAmount: 0,
      taxableBase: 0,
      taxAmount: 0,
      total: 0,
      violations: [],
      negativeSubtotal: false,
      documentConcession: {
        concession: "0.00",
        listValue: "0.00",
        effectivePct: 0,
        allowedPct: 100,
        exceedsCap: false,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
      },
    });
  });

  it("treats a missing documentDiscountValue the same as null", () => {
    const withUndefined = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountValue: undefined,
      taxRate: 0,
    });
    const withNull = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(withUndefined).toEqual(withNull);
  });

  it("lets a negative extra line reduce the subtotal", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -15000 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(85000);
    expect(result.total).toBe(85000);
    expect(result.negativeSubtotal).toBe(false);
  });

  it("sets negativeSubtotal when the subtotal goes below zero", () => {
    const result = computeTotals({
      items: [{ unitPrice: 1000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -5000 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(-4000);
    expect(result.negativeSubtotal).toBe(true);
  });

  it("does not flag negativeSubtotal when a trade-in exactly zeroes the subtotal", () => {
    // Boundary: subtotalCents === 0 must not trip the `< 0` check — giving
    // an item away even-up on a trade-in is a valid (if unusual) quote, not
    // an error to reject.
    const result = computeTotals({
      items: [{ unitPrice: 1000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -1000 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.subtotal).toBe(0);
    expect(result.negativeSubtotal).toBe(false);
  });

  it("does not flag negativeSubtotal for an ordinary positive quote", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: 10 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.negativeSubtotal).toBe(false);
  });
});

describe("documentConcession", () => {
  it("treats a null listPrice as no concession", () => {
    const result = computeTotals({
      items: [{ unitPrice: 100, listPrice: null, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.documentConcession).toEqual({
      concession: "0.00",
      listValue: "100.00",
      effectivePct: 0,
      allowedPct: 100,
      exceedsCap: false,
      allowedMarkupPct: null,
      exceedsMarkupCap: false,
      parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
    });
  });

  it("a price cut below list is a positive concession, reducing the subtotal by exactly the cut", () => {
    // A $1,000 machine sold for $0 — John's demo-room giveaway.
    const result = computeTotals({
      items: [{ unitPrice: 0, listPrice: 1000, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([0]);
    expect(result.subtotal).toBe(0);
    // Subtotal is reduced by exactly the item's list price (1000 - 0).
    expect(result.documentConcession).toEqual({
      concession: "1000.00",
      listValue: "1000.00",
      effectivePct: 100,
      allowedPct: 100,
      exceedsCap: false,
      allowedMarkupPct: null,
      exceedsMarkupCap: false,
      parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "1000.00", tradeIns: "0.00" },
    });
  });

  it("a price raised above list is a negative concession", () => {
    const result = computeTotals({
      items: [{ unitPrice: 12000, listPrice: 10000, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.documentConcession.concession).toBe("-2000.00");
    expect(result.documentConcession.effectivePct).toBe(-20);
    expect(result.documentConcession.exceedsCap).toBe(false);
  });

  it("raising one item's price and lowering another's by the same amount nets to a zero concession with no cap violation", () => {
    // John: "you can increase the price of the machine by $10,000 and then
    // give away $10,000 worth of options — we do that all the time."
    const result = computeTotals({
      items: [
        { unitPrice: 60000, listPrice: 50000, lines: [] }, // +$10,000 raise
        { unitPrice: 0, listPrice: 10000, lines: [] }, // $10,000 given away
      ],
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.concession).toBe("0.00");
    expect(result.documentConcession.effectivePct).toBe(0);
    expect(result.documentConcession.exceedsCap).toBe(false);
  });

  it("sets exceedsCap once a price cut pushes the concession over the region cap", () => {
    // $10,000 list, cut to $8,900 (11% concession) against a 10% cap.
    const result = computeTotals({
      items: [{ unitPrice: 8900, listPrice: 10000, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBeCloseTo(11, 5);
    expect(result.documentConcession.exceedsCap).toBe(true);
  });

  it("stays within the cap just under the boundary (9.99% against a 10% cap)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 9001, listPrice: 10000, lines: [] }], // 9.99% concession
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBeCloseTo(9.99, 5);
    expect(result.documentConcession.exceedsCap).toBe(false);
  });

  it("does not flag exceedsCap exactly at the boundary (10% against a 10% cap)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 9000, listPrice: 10000, lines: [] }], // exactly 10%
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBe(10);
    expect(result.documentConcession.exceedsCap).toBe(false);
  });

  it("flags exceedsCap just over the boundary (10.01% against a 10% cap)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 8999, listPrice: 10000, lines: [] }], // 10.01%
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBeCloseTo(10.01, 5);
    expect(result.documentConcession.exceedsCap).toBe(true);
  });

  it("counts a negative extra line (a trade-in) toward the concession", () => {
    const result = computeTotals({
      items: [{ unitPrice: 10000, listPrice: 10000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: -2000 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    // listValue is unaffected by the trade-in (a negative extra line
    // contributes nothing to listValue, only to the concession numerator).
    expect(result.documentConcession).toEqual({
      concession: "2000.00",
      listValue: "10000.00",
      effectivePct: 20,
      allowedPct: 100,
      exceedsCap: false,
      allowedMarkupPct: null,
      exceedsMarkupCap: false,
      parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "2000.00" },
    });
  });

  it("counts a positive extra line toward listValue but not the concession", () => {
    const result = computeTotals({
      items: [{ unitPrice: 10000, listPrice: 10000, lines: [] }],
      extraLines: [{ qty: 1, unitPrice: 500 }],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.documentConcession.concession).toBe("0.00");
    expect(result.documentConcession.listValue).toBe("10500.00");
  });

  it("counts an item discount and a manual price cut on the same item once each, not double-counted", () => {
    // List $10,000, manually cut to $9,000 (a $1,000 concession), then a
    // further 10% item discount on top of that already-cut $9,000 base
    // ($900) — the two must add, not compound through listPrice twice.
    const result = computeTotals({
      items: [
        {
          unitPrice: 9000,
          listPrice: 10000,
          discountMode: "PERCENT",
          discountValue: "10",
          lines: [],
        },
      ],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.itemDiscounts).toEqual([900]);
    // 1000 (price cut) + 900 (discount on the cut price) = 1900.
    expect(result.documentConcession.concession).toBe("1900.00");
    expect(result.documentConcession.listValue).toBe("10000.00");
  });

  it("counts an option line's manual price cut alongside the item's own", () => {
    const result = computeTotals({
      items: [
        {
          unitPrice: 9000,
          listPrice: 10000,
          lines: [{ qty: 2, unitPrice: 400, listPrice: 500 }],
        },
      ],
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    // item: 10000 - 9000 = 1000; line: (500 - 400) * 2 = 200.
    expect(result.documentConcession.concession).toBe("1200.00");
    expect(result.documentConcession.listValue).toBe("11000.00"); // 10000 + 500*2
  });

  it("counts the document-level discount amount toward the concession", () => {
    const result = computeTotals({
      items: [{ unitPrice: 10000, listPrice: 10000, lines: [] }],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "5",
      taxRate: 0,
    });
    expect(result.documentConcession.concession).toBe("500.00");
    expect(result.documentConcession.listValue).toBe("10000.00");
  });

  it("percentage-only behaviour (no listPrice/regionMaxDiscountPct given) is unchanged to the cent", () => {
    // Same fixture as the "combines an item discount and a document
    // discount" test above, with no listPrice anywhere — every money total
    // must match exactly what it was before this feature existed.
    const result = computeTotals({
      items: [{ unitPrice: 100, discountMode: "PERCENT", discountValue: "10", lines: [] }],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "10",
      taxRate: 0,
    });
    expect(result.itemTotals).toEqual([90]);
    expect(result.grossSubtotal).toBe(100);
    expect(result.subtotal).toBe(90);
    expect(result.discountAmount).toBe(9);
    expect(result.totalDiscountAmount).toBe(19);
    expect(result.taxableBase).toBe(81);
    expect(result.total).toBe(81);
    // With no listPrice anywhere, listPrice defaults to unitPrice for both
    // the item discount's base and the document discount's base, so the
    // concession is exactly the item discount (10) plus the document
    // discount (9) — no price-cut component.
    expect(result.documentConcession.concession).toBe("19.00");
    expect(result.documentConcession.listValue).toBe("100.00");
  });
});

describe("concessionCapMessage", () => {
  // Every fixture below uses non-whole-dollar figures throughout — formatMoney's
  // own "whole amounts render without decimals" rule (src/lib/format.ts) would
  // otherwise make these `toBe` assertions depend on that unrelated formatting
  // choice (e.g. a $20,000.00 part would actually render as "$20,000").

  it("names the concession amount, its percentage, the cap, and the region for a discount-only concession", () => {
    const message = concessionCapMessage(
      {
        concession: "34000.55",
        listValue: "195402.30",
        effectivePct: 17.402982,
        allowedPct: 10,
        exceedsCap: true,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: { documentDiscount: "34000.55", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "Concessions total $34,000.55 (17.4% of list price) — $34,000.55 discount — above the 10% limit for Australia."
    );
  });

  it("reproduces the discount-plus-trade-in report that prompted this change, naming both parts", () => {
    // The scenario that triggered this whole change: a $30,448.something
    // concession next to a Summary panel reading "Discount −$10,448.20" —
    // the owner reasonably concluded the bigger number was wrong. It
    // wasn't: the gap was a trade-in (a negative extra line), which counts
    // against the cap by design (see computeTotals's doc comment) but was
    // invisible in the old single-total message.
    const message = concessionCapMessage(
      {
        concession: "30448.25",
        listValue: "300870.99",
        effectivePct: 10.12,
        allowedPct: 10,
        exceedsCap: true,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: {
          documentDiscount: "10448.20",
          itemDiscounts: "0.00",
          priceAdjustments: "0.00",
          tradeIns: "20000.05",
        },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "Concessions total $30,448.25 (10.12% of list price) — $10,448.20 discount plus a $20,000.05 trade-in — above the 10% limit for Australia."
    );
  });

  it("names only the non-zero parts, omitting the zero ones (a trade-in with no discount at all)", () => {
    const message = concessionCapMessage(
      {
        concession: "5000.50",
        listValue: "50005.00",
        effectivePct: 10,
        allowedPct: 10,
        exceedsCap: false,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "5000.50" },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "Concessions total $5,000.50 (10% of list price) — a $5,000.50 trade-in — above the 10% limit for Australia."
    );
  });

  it("words a net price increase as reducing concessions, never as a discount", () => {
    // priceAdjustments negative (a manual price raised above list) must
    // read as a reduction alongside the real discount, never get folded
    // into the "discount" figure itself — a reader must never be told a
    // price increase gave money away.
    const message = concessionCapMessage(
      {
        concession: "8000.05",
        listValue: "100000.00",
        effectivePct: 8,
        allowedPct: 10,
        exceedsCap: false,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: {
          documentDiscount: "10000.40",
          itemDiscounts: "0.00",
          priceAdjustments: "-2000.35",
          tradeIns: "0.00",
        },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "Concessions total $8,000.05 (8% of list price) — $10,000.40 discount, less $2,000.35 from a price increase above list — above the 10% limit for Australia."
    );
    expect(message).not.toContain("$2,000.35 discount");
  });

  it("still reads cleanly when a price increase is the only concession source", () => {
    const message = concessionCapMessage(
      {
        concession: "-1500.25",
        listValue: "100000.00",
        effectivePct: -1.5,
        allowedPct: 10,
        exceedsCap: false,
        allowedMarkupPct: null,
        exceedsMarkupCap: false,
        parts: {
          documentDiscount: "0.00",
          itemDiscounts: "0.00",
          priceAdjustments: "-1500.25",
          tradeIns: "0.00",
        },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "Concessions total -$1,500.25 (-1.5% of list price) — reduced by $1,500.25 from a price increase above list — above the 10% limit for Australia."
    );
  });
});

describe("DocumentConcession.parts", () => {
  it("sums to the concession total, to the cent, for a document combining a document discount, an item discount, a price cut, and a trade-in", () => {
    // item: list $10,000, manually cut to $9,000 (a $1,000 price-cut
    // concession), then a 10% item discount on that $9,000 base ($900);
    // extra line: a $3,000 trade-in; document discount: 5% of the
    // resulting subtotal.
    const result = computeTotals({
      items: [
        {
          unitPrice: 9000,
          listPrice: 10000,
          discountMode: "PERCENT",
          discountValue: "10",
          lines: [],
        },
      ],
      extraLines: [{ qty: 1, unitPrice: -3000 }],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: "5",
      regionMaxDiscountPct: 10,
      taxRate: 0,
    });

    // subtotal = 9000 - 900 (item discount) - 3000 (trade-in) = 5100;
    // document discount = 5% of 5100 = 255.
    expect(result.documentConcession.parts).toEqual({
      documentDiscount: "255.00",
      itemDiscounts: "900.00",
      priceAdjustments: "1000.00",
      tradeIns: "3000.00",
    });

    const partsSum =
      Number(result.documentConcession.parts.documentDiscount) +
      Number(result.documentConcession.parts.itemDiscounts) +
      Number(result.documentConcession.parts.priceAdjustments) +
      Number(result.documentConcession.parts.tradeIns);
    expect(partsSum.toFixed(2)).toBe(result.documentConcession.concession);
    expect(result.documentConcession.concession).toBe("5155.00");
  });
});

describe("markup ceiling (Region.maxMarkupPct)", () => {
  // Mirrors the discount-cap boundary tests above ("stays within the cap
  // just under the boundary" / "does not flag exceedsCap exactly at the
  // boundary" / "flags exceedsCap just over the boundary"), for the
  // opposite-signed case: a negative concession (a price raised above list)
  // is a markup — see `exceedsMarkupCap`'s own doc comment on
  // `DocumentConcession`.

  it("does not flag exceedsMarkupCap exactly at the boundary (10% markup against a 10% ceiling)", () => {
    // $10,000 list, sold at $11,000 -- exactly 10% above list.
    const result = computeTotals({
      items: [{ unitPrice: 11000, listPrice: 10000, lines: [] }],
      extraLines: [],
      documentDiscountValue: null,
      regionMaxMarkupPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBe(-10);
    expect(result.documentConcession.exceedsMarkupCap).toBe(false);
  });

  it("flags exceedsMarkupCap a cent past the boundary (10.01% markup against a 10% ceiling)", () => {
    const result = computeTotals({
      items: [{ unitPrice: 11001, listPrice: 10000, lines: [] }], // 10.01% above list
      extraLines: [],
      documentDiscountValue: null,
      regionMaxMarkupPct: 10,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBeCloseTo(-10.01, 5);
    expect(result.documentConcession.exceedsMarkupCap).toBe(true);
  });

  it("never flags exceedsMarkupCap when regionMaxMarkupPct is unset (no ceiling), no matter how large the markup", () => {
    const result = computeTotals({
      items: [{ unitPrice: 1000000, listPrice: 10000, lines: [] }], // 9,900% above list
      extraLines: [],
      documentDiscountValue: null,
      taxRate: 0,
    });
    expect(result.documentConcession.allowedMarkupPct).toBeNull();
    expect(result.documentConcession.exceedsMarkupCap).toBe(false);
  });

  it("leaves a document priced below list unaffected by the markup ceiling", () => {
    // Sold *under* list -- a discount, not a markup -- so the ceiling (which
    // only ever bounds a negative concession) can never fire here regardless
    // of how tight it is.
    const result = computeTotals({
      items: [{ unitPrice: 8900, listPrice: 10000, lines: [] }], // 11% below list
      extraLines: [],
      documentDiscountValue: null,
      regionMaxMarkupPct: 1,
      taxRate: 0,
    });
    expect(result.documentConcession.effectivePct).toBeCloseTo(11, 5);
    expect(result.documentConcession.exceedsMarkupCap).toBe(false);
  });

  it("never fires the discount cap and the markup ceiling at once for the same document (opposite signs)", () => {
    // Same region (both caps set to 10%), two documents: one discounted well
    // past the discount cap, one marked up well past the markup ceiling.
    // Each can only ever trip its own guardrail -- a single concession
    // figure can't be simultaneously a large positive discount and a large
    // negative markup.
    const heavilyDiscounted = computeTotals({
      items: [{ unitPrice: 5000, listPrice: 10000, lines: [] }], // 50% below list
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      regionMaxMarkupPct: 10,
      taxRate: 0,
    });
    expect(heavilyDiscounted.documentConcession.exceedsCap).toBe(true);
    expect(heavilyDiscounted.documentConcession.exceedsMarkupCap).toBe(false);

    const heavilyMarkedUp = computeTotals({
      items: [{ unitPrice: 15000, listPrice: 10000, lines: [] }], // 50% above list
      extraLines: [],
      documentDiscountValue: null,
      regionMaxDiscountPct: 10,
      regionMaxMarkupPct: 10,
      taxRate: 0,
    });
    expect(heavilyMarkedUp.documentConcession.exceedsCap).toBe(false);
    expect(heavilyMarkedUp.documentConcession.exceedsMarkupCap).toBe(true);

    // Neither result ever has both flags true at once.
    expect(heavilyDiscounted.documentConcession.exceedsCap && heavilyDiscounted.documentConcession.exceedsMarkupCap).toBe(
      false
    );
    expect(heavilyMarkedUp.documentConcession.exceedsCap && heavilyMarkedUp.documentConcession.exceedsMarkupCap).toBe(
      false
    );
  });
});

describe("markupCapMessage", () => {
  // Non-whole-dollar figures throughout, same reasoning as
  // concessionCapMessage's own tests above — formatMoney's "whole amounts
  // render without decimals" rule would otherwise make a `toBe` assertion
  // depend on that unrelated formatting choice.
  it("states the amount over list, its percentage, the ceiling, and the region", () => {
    const message = markupCapMessage(
      {
        concession: "-1000.50",
        listValue: "10000.00",
        effectivePct: -10,
        allowedPct: 100,
        exceedsCap: false,
        allowedMarkupPct: 10,
        exceedsMarkupCap: true,
        parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "-1000.50", tradeIns: "0.00" },
      },
      "Australia",
      "AUD"
    );
    expect(message).toBe(
      "This quote is priced $1,000.50 above list (10% markup) — above the 10% markup ceiling for Australia."
    );
  });
});

describe("capPct", () => {
  it("returns the typed value directly for PERCENT, ignoring the resolved cents discount", () => {
    // A $1.03 base with a 51% discount resolves to a 53c discount (51.46% of
    // base) — capPct must still report 51, not 51.46, for PERCENT.
    const base = toCents(1.03);
    const discount = discountCents(base, "PERCENT", "51");
    expect(discount).toBe(53);
    expect(capPct("PERCENT", "51", base, discount)).toBe(51);
  });

  it("returns the resolved effective percentage for AMOUNT", () => {
    const base = toCents(100000);
    const discount = discountCents(base, "AMOUNT", "20000");
    expect(capPct("AMOUNT", "20000", base, discount)).toBe(20);
  });

  it("returns 0 for a null value regardless of mode", () => {
    expect(capPct("PERCENT", null, 10000, 0)).toBe(0);
    expect(capPct("AMOUNT", null, 10000, 0)).toBe(0);
  });
});
