import { describe, it, expect } from "vitest";
import {
  validateFinalizable,
  validateEasyLoaderSections,
  type FinalizableDocument,
  type FinalizableItem,
  type FinalizerRole,
} from "../src/lib/validation/finalize";
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

function elItem(overrides: Partial<FinalizableItem> = {}): FinalizableItem {
  return {
    code: "EL-2420",
    productionSpec: { ui: "-Y", usage: "onload", sections: [] },
    lines: [],
    ...overrides,
  };
}

describe("validateEasyLoaderSections", () => {
  // There is no role parameter here at all: unlike the discount-cap check
  // above, this rule has no ADMIN override (see the function's header
  // comment) -- every test below applies equally regardless of who is
  // finalizing.

  it("blocks an EasyLoader sold with no table length at all", () => {
    const result = validateEasyLoaderSections([elItem()]);
    expect(result).toContain("EL-2420");
    expect(result).toMatch(/before finalizing/i);
  });

  it("accepts an EasyLoader with no sections when the whole table was sold as one undivided run", () => {
    const item = elItem({
      lines: [{ kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", qty: 6 }],
    });
    expect(validateEasyLoaderSections([item])).toBeNull();
  });

  it("accepts a layout whose sections reconcile with what was sold", () => {
    const item = elItem({
      productionSpec: { sections: [{ lengthM: 2.4, surface: "conveyor" }] },
      lines: [{ kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", qty: 2 }],
    });
    expect(validateEasyLoaderSections([item])).toBeNull();
  });

  it("blocks a layout whose sections disagree with what was sold, naming the item code", () => {
    const item = elItem({
      productionSpec: { sections: [{ lengthM: 1.2, surface: "conveyor" }] },
      lines: [{ kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", qty: 2 }],
    });
    const result = validateEasyLoaderSections([item]);
    expect(result).toContain("EL-2420");
  });

  it("blocks a layout with the surfaces swapped even though the total matches", () => {
    const item = elItem({
      productionSpec: { sections: [{ lengthM: 2.4, surface: "static" }] },
      lines: [{ kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", qty: 2 }],
    });
    expect(validateEasyLoaderSections([item])).not.toBeNull();
  });

  it("ignores a non-EasyLoader item regardless of what its productionSpec contains", () => {
    const item: FinalizableItem = {
      code: "M5220",
      productionSpec: { sections: [{ lengthM: 999, surface: "conveyor" }] },
      lines: [],
    };
    expect(validateEasyLoaderSections([item])).toBeNull();
  });

  it("checks every EasyLoader item on the document, not just the first", () => {
    const good = elItem({
      lines: [{ kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", qty: 3 }],
    });
    const bad = elItem({ code: "EL-2020" }); // no table length at all
    expect(validateEasyLoaderSections([good, bad])).toContain("EL-2020");
  });

  it("ignores option lines that are not OPTION kind or carry no code", () => {
    const item = elItem({
      lines: [
        { kind: "PRODUCT", code: "EL-2420 Additional 1.2M lengths", qty: 99 },
        { kind: "OPTION", code: null, qty: 99 },
      ],
    });
    // Neither line counts toward the table sold, so this is still "no table
    // length at all" -- proof the filter in validateEasyLoaderSections is
    // doing its job rather than accidentally counting everything.
    expect(validateEasyLoaderSections([item])).not.toBeNull();
  });
});
