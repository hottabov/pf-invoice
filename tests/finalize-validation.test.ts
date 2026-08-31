import { describe, it, expect } from "vitest";
import { validateFinalizable, type FinalizableDocument, type FinalizerRole } from "../src/lib/validation/finalize";
import type { EngineViolation } from "../src/lib/pricing";

const noViolations: EngineViolation[] = [];
const MANAGER: FinalizerRole = "MANAGER";
const ADMIN: FinalizerRole = "ADMIN";

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
    expect(validateFinalizable(doc, noViolations, MANAGER)).toBe("Select a client before finalizing");
  });

  it("rejects a document with zero items and zero document-level lines", () => {
    const doc = baseDoc({ items: [], lines: [] });
    expect(validateFinalizable(doc, noViolations, MANAGER)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("accepts a document with zero items but at least one document-level line", () => {
    const doc = baseDoc({ items: [], lines: [{ itemId: null }] });
    expect(validateFinalizable(doc, noViolations, MANAGER)).toBeNull();
  });

  it("ignores lines attached to an item when checking for document-level lines", () => {
    // A line with a non-null itemId is an item's own OPTION/PRODUCT line,
    // not a document-level "extra line" — it must not count toward the
    // "at least one line" fallback when there are zero items.
    const doc = baseDoc({ items: [], lines: [{ itemId: "item-1" }] });
    expect(validateFinalizable(doc, noViolations, MANAGER)).toBe(
      "Add at least one item or line before finalizing"
    );
  });

  it("rejects a MANAGER finalizing a document with discount-cap violations, naming item indexes and allowed pcts", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    const result = validateFinalizable(doc, violations, MANAGER);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
  });

  it("names every violating item when there is more than one", () => {
    const doc = baseDoc({ items: [{ id: "item-1" }, { id: "item-2" }] });
    const violations: EngineViolation[] = [
      { itemIndex: 0, allowedPct: 10 },
      { itemIndex: 2, allowedPct: 5 },
    ];
    const result = validateFinalizable(doc, violations, MANAGER);
    expect(result).toContain("item 1");
    expect(result).toContain("10%");
    expect(result).toContain("item 3");
    expect(result).toContain("5%");
  });

  it("allows an ADMIN to finalize a document with discount-cap violations", () => {
    const doc = baseDoc();
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations, ADMIN)).toBeNull();
  });

  it("returns null for a valid, finalizable document regardless of role", () => {
    const doc = baseDoc();
    expect(validateFinalizable(doc, noViolations, MANAGER)).toBeNull();
    expect(validateFinalizable(doc, noViolations, ADMIN)).toBeNull();
  });

  it("checks client and emptiness before violations, for both roles", () => {
    // No company AND violations present -> the client message wins, since
    // there's no point naming a discount problem on a document that isn't
    // even assigned to anyone yet. Applies even to an ADMIN, who would
    // otherwise sail past the violation check.
    const doc = baseDoc({ companyId: null });
    const violations: EngineViolation[] = [{ itemIndex: 0, allowedPct: 10 }];
    expect(validateFinalizable(doc, violations, MANAGER)).toBe("Select a client before finalizing");
    expect(validateFinalizable(doc, violations, ADMIN)).toBe("Select a client before finalizing");
  });
});
