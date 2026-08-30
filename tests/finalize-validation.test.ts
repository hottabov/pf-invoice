import { describe, it, expect } from "vitest";
import { validateFinalizable, type FinalizableDocument } from "../src/lib/validation/finalize";
import type { EngineViolation } from "../src/lib/pricing";

const noViolations: EngineViolation[] = [];

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
    expect(validateFinalizable(doc, noViolations)).toBe("Select a client before finalizing");
  });

  it("rejects a document with zero items and zero document-level lines", () => {
    const doc = baseDoc({ items: [], lines: [] });
    expect(validateFinalizable(doc, noViolations)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("accepts a document with zero items but at least one document-level line", () => {
    const doc = baseDoc({ items: [], lines: [{ itemId: null }] });
    expect(validateFinalizable(doc, noViolations)).toBeNull();
  });

  it("ignores lines attached to an item when checking for document-level lines", () => {
    // A line with a non-null itemId is an item's own OPTION/PRODUCT line,
    // not a document-level "extra line" — it must not count toward the
    // "at least one line" fallback when there are zero items.
    const doc = baseDoc({ items: [], lines: [{ itemId: "item-1" }] });
    expect(validateFinalizable(doc, noViolations)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("rejects a document with discount-cap violations, naming item indexes and allowed pcts", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    const result = validateFinalizable(doc, violations);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
  });

  it("names every violating item when there is more than one", () => {
    const doc = baseDoc({ items: [{ id: "item-1" }, { id: "item-2" }] });
    const violations: EngineViolation[] = [
      { itemIndex: 0, allowedPct: 10 },
      { itemIndex: 2, allowedPct: 5 },
    ];
    const result = validateFinalizable(doc, violations);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
    expect(result).toContain("item 3");
    expect(result).toContain("5%");
  });

  it("returns null for a valid, finalizable document", () => {
    const doc = baseDoc();
    expect(validateFinalizable(doc, noViolations)).toBeNull();
  });

  it("checks client and emptiness before violations", () => {
    // No company AND violations present -> the client message wins, since
    // there's no point naming a discount problem on a document that isn't
    // even assigned to anyone yet.
    const doc = baseDoc({ companyId: null });
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations)).toBe("Select a client before finalizing");
  });
});
