import { describe, it, expect } from "vitest";
import {
  validateFinalizable,
  type FinalizableDocument,
  type FinalizerRole,
} from "../src/lib/validation/finalize";
import type { DocumentConcession, EngineViolation } from "../src/lib/pricing";

const noViolations: EngineViolation[] = [];
const MANAGER: FinalizerRole = "MANAGER";
const ADMIN: FinalizerRole = "ADMIN";
const DEVELOPER: FinalizerRole = "DEVELOPER";
const REGION_NAME = "Australia";
const CURRENCY = "AUD";

const noConcession: DocumentConcession = {
  concession: "0.00",
  listValue: "10000.00",
  effectivePct: 0,
  allowedPct: 10,
  exceedsCap: false,
  allowedMarkupPct: null,
  exceedsMarkupCap: false,
  parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
};

const overCapConcession: DocumentConcession = {
  concession: "3400.00",
  listValue: "10000.00",
  effectivePct: 34,
  allowedPct: 10,
  exceedsCap: true,
  allowedMarkupPct: null,
  exceedsMarkupCap: false,
  parts: { documentDiscount: "3400.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
};

function baseDoc(overrides: Partial<FinalizableDocument> = {}): FinalizableDocument {
  return {
    companyId: "clcompany0000000000000001",
    items: [{ id: "item-1" }],
    lines: [],
    ...overrides,
  };
}

describe("validateFinalizable", () => {
  it("rejects a document with no client selected", () => {
    const doc = baseDoc({ companyId: null });
    expect(validateFinalizable(doc, noViolations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBe(
      "Select a client before finalizing"
    );
  });

  it("rejects a document with zero items and zero document-level lines", () => {
    const doc = baseDoc({ items: [], lines: [] });
    expect(validateFinalizable(doc, noViolations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("accepts a document with zero items but at least one document-level line", () => {
    const doc = baseDoc({ items: [], lines: [{ itemId: null }] });
    expect(validateFinalizable(doc, noViolations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBeNull();
  });

  it("ignores lines attached to an item when checking for document-level lines", () => {
    // A line with a non-null itemId is an item's own OPTION/PRODUCT line,
    // not a document-level "extra line" — it must not count toward the
    // "at least one line" fallback when there are zero items.
    const doc = baseDoc({ items: [], lines: [{ itemId: "item-1" }] });
    expect(validateFinalizable(doc, noViolations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("rejects a MANAGER finalizing a document with discount-cap violations, naming item indexes and allowed pcts", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    const result = validateFinalizable(doc, violations, noConcession, MANAGER, REGION_NAME, CURRENCY);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
  });

  it("names every violating item when there is more than one", () => {
    const doc = baseDoc({ items: [{ id: "item-1" }, { id: "item-2" }] });
    const violations: EngineViolation[] = [
      { itemIndex: 0, allowedPct: 10 },
      { itemIndex: 2, allowedPct: 5 },
    ];
    const result = validateFinalizable(doc, violations, noConcession, MANAGER, REGION_NAME, CURRENCY);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
    expect(result).toContain("item 3");
    expect(result).toContain("5%");
  });

  it("allows an ADMIN to finalize a document with discount-cap violations", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations, noConcession, ADMIN, REGION_NAME, CURRENCY)).toBeNull();
  });

  it("allows a DEVELOPER to finalize a document with discount-cap violations, same as an ADMIN", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations, noConcession, DEVELOPER, REGION_NAME, CURRENCY)).toBeNull();
  });

  it("returns null for a valid, finalizable document regardless of role", () => {
    const doc = baseDoc();
    expect(validateFinalizable(doc, noViolations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBeNull();
    expect(validateFinalizable(doc, noViolations, noConcession, ADMIN, REGION_NAME, CURRENCY)).toBeNull();
  });

  it("checks client and emptiness before violations, for both roles", () => {
    // No company AND violations present -> the client message wins, since
    // there's no point naming a discount problem on a document that isn't
    // even assigned to anyone yet. Applies even to an ADMIN, who would
    // otherwise sail past the violation check.
    const doc = baseDoc({ companyId: null });
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations, noConcession, MANAGER, REGION_NAME, CURRENCY)).toBe(
      "Select a client before finalizing"
    );
    expect(validateFinalizable(doc, violations, noConcession, ADMIN, REGION_NAME, CURRENCY)).toBe(
      "Select a client before finalizing"
    );
  });

  it("rejects a MANAGER finalizing a document whose whole-document concession exceeds the region cap", () => {
    // A manual price cut has no discountValue of its own, so `violations`
    // stays empty here — this is the case `documentConcession` alone must
    // catch (see the P0 spec: "if the price they're selling for is less
    // than the maximum discount that's allowed... it shouldn't allow them
    // to save the quote").
    const doc = baseDoc();
    const result = validateFinalizable(doc, noViolations, overCapConcession, MANAGER, REGION_NAME, CURRENCY);
    expect(result).toContain("34%");
    expect(result).toContain("10%");
    expect(result).toContain(REGION_NAME);
  });

  it("allows an ADMIN to finalize a document whose whole-document concession exceeds the region cap", () => {
    const doc = baseDoc();
    expect(
      validateFinalizable(doc, noViolations, overCapConcession, ADMIN, REGION_NAME, CURRENCY)
    ).toBeNull();
  });

  it("checks client and emptiness before the concession cap, for both roles", () => {
    const doc = baseDoc({ companyId: null });
    expect(validateFinalizable(doc, noViolations, overCapConcession, MANAGER, REGION_NAME, CURRENCY)).toBe(
      "Select a client before finalizing"
    );
    expect(validateFinalizable(doc, noViolations, overCapConcession, ADMIN, REGION_NAME, CURRENCY)).toBe(
      "Select a client before finalizing"
    );
  });
});
