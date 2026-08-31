import { describe, it, expect } from "vitest";
import {
  buildQuotationData,
  OMIT,
  optionBlockKey,
  productBlockKey,
  resolveBlocks,
  substitutePlaceholders,
  type ContentBlockRow,
  type QuotationDataDoc,
  type QuotationItemInput,
} from "../src/lib/quotation-data";

// Pure module — no @/lib/db import (see quotation-data.ts's header comment),
// so this never needs DATABASE_URL set, same as tests/sheet-data.test.ts.

describe("resolveBlocks — precedence", () => {
  const blocks: ContentBlockRow[] = [
    { key: "terms.delivery", regionId: null, title: "Delivery", body: "Default delivery body", sortOrder: 1 },
    { key: "terms.delivery", regionId: "region-us", title: "Delivery (US)", body: "US delivery body", sortOrder: 1 },
    { key: "terms.warranty", regionId: null, title: "Warranty", body: "Default warranty body", sortOrder: 2 },
  ];

  it("uses the default (regionId: null) row when the region has no override", () => {
    const resolved = resolveBlocks(blocks, "region-au");
    expect(resolved.get("terms.delivery")?.body).toBe("Default delivery body");
    expect(resolved.get("terms.warranty")?.body).toBe("Default warranty body");
  });

  it("prefers a region-specific override over the default for the same key", () => {
    const resolved = resolveBlocks(blocks, "region-us");
    expect(resolved.get("terms.delivery")?.body).toBe("US delivery body");
    // Unrelated key still falls back to its default.
    expect(resolved.get("terms.warranty")?.body).toBe("Default warranty body");
  });

  it("ignores a different region's override entirely", () => {
    const resolved = resolveBlocks(blocks, "region-uk");
    expect(resolved.get("terms.delivery")?.body).toBe("Default delivery body");
  });
});

describe("optionBlockKey — fallback", () => {
  it("returns the exact key first for a code with no series suffix", () => {
    expect(optionBlockKey("MTS")).toEqual(["option.MTS"]);
  });

  it("tries the exact code, then the series-suffix-stripped code", () => {
    expect(optionBlockKey("ABR-M")).toEqual(["option.ABR-M", "option.ABR"]);
  });

  it("strips only the trailing segment after the last dash", () => {
    expect(optionBlockKey("ABR-FP")).toEqual(["option.ABR-FP", "option.ABR"]);
  });

  it("does not duplicate a candidate when stripping yields the same key", () => {
    // A dash at position 0 (lastIndexOf > 0 guard) never strips.
    expect(optionBlockKey("-M")).toEqual(["option.-M"]);
  });

  // FM180 ("Fabric Master") was retired (not sold anymore, owner decision)
  // and the equipment.fabric-master special-case fallback removed along with
  // it -- see optionBlockKey's doc comment in src/lib/quotation-data.ts. A
  // code with an "FM" prefix is no longer treated specially at all.
  it("does not add an equipment.fabric-master fallback for FM-prefixed codes (special case removed)", () => {
    expect(optionBlockKey("FM180")).toEqual(["option.FM180"]);
    expect(optionBlockKey("FM-220")).toEqual(["option.FM-220", "option.FM"]);
  });
});

describe("productBlockKey", () => {
  it("maps M and X series to machine.m-series", () => {
    expect(productBlockKey("M5180", "M")).toBe("machine.m-series");
    expect(productBlockKey("X-450", "X")).toBe("machine.m-series");
  });

  it("maps EL to equipment.easy-loader and FP to equipment.fabric-pro", () => {
    expect(productBlockKey("EL-2020", "EL")).toBe("equipment.easy-loader");
    expect(productBlockKey("FP-180", "FP")).toBe("equipment.fabric-pro");
  });

  it("maps P to equipment.punchline", () => {
    expect(productBlockKey("P-180", "P")).toBe("equipment.punchline");
  });

  it("maps SW by (S)/(I) suffix, else null", () => {
    expect(productBlockKey("PTW(S)", "SW")).toBe("software.pathworks-s");
    expect(productBlockKey("PTW(I)", "SW")).toBe("software.pathworks-i");
    expect(productBlockKey("PTW", "SW")).toBeNull();
  });

  it("returns null for EF (no matching block) and unknown series", () => {
    expect(productBlockKey("EF-100", "EF")).toBeNull();
    expect(productBlockKey("X-1", null)).toBeNull();
  });
});

describe("substitutePlaceholders", () => {
  it("replaces a known token", () => {
    expect(substitutePlaceholders("Model M{{model}}", { model: "450" })).toBe("Model M450");
  });

  it("replaces multiple distinct tokens in one body", () => {
    expect(substitutePlaceholders("{{a}} and {{b}}", { a: "1", b: "2" })).toBe("1 and 2");
  });

  // --- line-strip rule (owner: raw "____" blanks are never acceptable —
  // fields must fill themselves in automatically; anything this module
  // genuinely can't fill in disappears entirely, one whole line at a time,
  // rather than leaving a fill-in-the-blank marker) -----------------------

  it("strips the entire body when its only line is unresolved", () => {
    expect(substitutePlaceholders("Cost: {{rspUnitCost}}", {})).toBe("");
  });

  it("strips only the line containing an unresolved token, keeping the rest", () => {
    const result = substitutePlaceholders("Line one\nCost: {{rspUnitCost}}\nLine three", {});
    expect(result).toBe("Line one\nLine three");
  });

  it("treats an empty-string value as unresolved too (strips its line)", () => {
    const result = substitutePlaceholders("Keep this\nValue: {{x}}", { x: "" });
    expect(result).toBe("Keep this");
  });

  it("strips a line containing an explicitly OMIT-ed token", () => {
    const result = substitutePlaceholders("Keep this\nPrice: {{price}}\nAlso keep", { price: OMIT });
    expect(result).toBe("Keep this\nAlso keep");
  });

  it("does not strip a line whose token resolved to a non-empty value", () => {
    const result = substitutePlaceholders("Price: {{price}}\nOther line", { price: "$100" });
    expect(result).toBe("Price: $100\nOther line");
  });

  it("passes a multi-line resolved value through as multiple output lines (e.g. bankDetails)", () => {
    const result = substitutePlaceholders("Before\n{{bankDetails}}\nAfter", {
      bankDetails: "Bank: ANZ Westfield\nBSB: 013 442",
    });
    expect(result).toBe("Before\nBank: ANZ Westfield\nBSB: 013 442\nAfter");
  });

  it("strips a line only when it still contains an unresolved token after substituting the rest of it", () => {
    // A line can carry both a resolved and an unresolved token — any single
    // unresolved token strips the whole line, not just its own token.
    const result = substitutePlaceholders("{{known}} plus {{unknown}}\nSafe line", { known: "1" });
    expect(result).toBe("Safe line");
  });
});

// --- buildQuotationData: light integration coverage -------------------------

function baseItem(overrides: Partial<QuotationItemInput> = {}): QuotationItemInput {
  return {
    id: "item-1",
    code: "M5180",
    name: "M5180 Cutting System",
    description: null,
    unitPrice: "175000.00",
    discountPct: null,
    total: "175000.00",
    imageUrl: null,
    showImage: false,
    serialNumber: null,
    seriesCode: "M",
    specs: { cutHeightCm: 18, cutWidthCm: 180 },
    lines: [],
    ...overrides,
  };
}

function baseDoc(overrides: Partial<QuotationDataDoc> = {}): QuotationDataDoc {
  return {
    type: "QUOTE",
    status: "DRAFT",
    number: null,
    issueDate: new Date("2026-08-30T00:00:00.000Z"),
    validityDays: 30,
    currency: "AUD",
    taxName: "GST",
    taxRate: "10",
    entitySnapshot: null,
    entityName: "Pathfinder Australia Pty Ltd",
    entityLegalId: "ABN 64 072 458 667",
    entityAddress: "12 Did Ct, Tullamarine Vic. 3043, Australia",
    bankDetails: { bank: "ANZ Westfield", bsb: "013 442", accountNo: "4405 63886" },
    logoUrl: null,
    footerText: null,
    discountPct: null,
    subtotal: "175000.00",
    discountAmount: "0.00",
    taxAmount: "17500.00",
    total: "192500.00",
    company: null,
    contact: null,
    extraLines: [],
    regionId: "region-au",
    items: [baseItem()],
    showItemPrices: false,
    showOptionPrices: false,
    ...overrides,
  };
}

// `{{price}}` deliberately lives on its own line/paragraph (blank line
// before it) — mirrors the real machine.m-series seed body's own
// "**Price: {{price}}**" paragraph (see prisma/seed-data/content-blocks.json)
// so hiding the price strips only that one line, never the model/height/
// width line above it.
const machineBlock: ContentBlockRow = {
  key: "machine.m-series",
  regionId: null,
  title: "M-Series",
  body: "Model {{model}}. Height {{cutHeightCm}}cm, width {{cutWidthCm}}cm.\n\nPrice: {{price}}",
  sortOrder: 1,
};

const mtsBlock: ContentBlockRow = {
  key: "option.MTS",
  regionId: null,
  title: "MTS",
  body: "Travel {{metres}}m over {{tables}} tables.",
  sortOrder: 2,
};

const termsBlock: ContentBlockRow = {
  key: "terms.payment",
  regionId: null,
  title: "Payment",
  body: "EFT details:\n\n{{bankDetails}}",
  sortOrder: 3,
};

const conditionsBlock: ContentBlockRow = {
  key: "conditions.1",
  regionId: null,
  title: "Sales Price",
  body: "Prices are ex-works.",
  sortOrder: 4,
};

const rspAgreementBlock: ContentBlockRow = {
  key: "rsp.agreement",
  regionId: null,
  title: "RSP",
  body: "Remote support program.",
  sortOrder: 5,
};

describe("buildQuotationData — machine spec parsing", () => {
  it("derives cutHeightCm/cutWidthCm from the product code, overriding stored specs", () => {
    // M3390 parses to 3cm height / 390cm width per the code — this must win
    // over the (deliberately different/stale) specs field to prove code
    // parsing is authoritative, not just a fallback.
    const doc = baseDoc({
      items: [baseItem({ code: "M3390", seriesCode: "M", specs: { cutHeightCm: 99, cutWidthCm: 99 } })],
    });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].titleBlockHtml).toContain("Height 3cm, width 390cm");
  });

  it("falls back to the stored specs field when the code doesn't parse", () => {
    const doc = baseDoc({
      items: [baseItem({ code: "M999", seriesCode: "M", specs: { cutHeightCm: 7, cutWidthCm: 220 } })],
    });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].titleBlockHtml).toContain("Height 7cm, width 220cm");
  });

  it("exposes specSentence on the machine section for a parseable M-Series code", () => {
    const doc = baseDoc({ items: [baseItem({ code: "M3390", seriesCode: "M" })] });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].specSentence).toBe(
      "M-Series Cutting Machine, 3cm compressed lay height, 390cm cutting width"
    );
  });

  it("exposes specSentence for an L-Series code even with no matching content block", () => {
    const doc = baseDoc({ items: [baseItem({ code: "L-320", seriesCode: "L", name: "L-320 Cutting System" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].specSentence).toBe("L-Series Cutting Machine with 320cm cutting width");
    // No `machine.*`/etc. content block covers L-Series at all — verify the
    // blockless-item case still surfaces a real spec sentence rather than
    // being left null/blank.
    expect(data.machineSections[0].titleBlockHtml).toBeNull();
  });

  it("leaves specSentence null for a non-spec-encoding series (e.g. software)", () => {
    const doc = baseDoc({ items: [baseItem({ code: "PTW(S)", seriesCode: "SW", name: "PathWorks" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].specSentence).toBeNull();
  });
});

describe("buildQuotationData", () => {
  it("resolves a machine title block with substituted vars", () => {
    // `model` is substituted with the raw `item.code` (e.g. "M5180") as-is —
    // the real machine.m-series seed template (see
    // prisma/seed-data/content-blocks.json) uses a bare "{{model}}" (no
    // hardcoded "M" prefix), so a full product code renders correctly with
    // no doubled "M". This fixture's own block body mirrors that shape.
    const data = buildQuotationData(baseDoc({ items: [baseItem({ code: "M450" })] }), [machineBlock]);
    expect(data.machineSections).toHaveLength(1);
    expect(data.machineSections[0].titleBlockHtml).toContain("Model M450");
    expect(data.machineSections[0].titleBlockHtml).toContain("Height 18cm, width 180cm");
  });

  it("leaves titleBlockHtml null when no block matches the product", () => {
    const doc = baseDoc({ items: [baseItem({ seriesCode: "EF", code: "EF-100" })] });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].titleBlockHtml).toBeNull();
  });

  it("strips the entire Price line (never a blank) when both price-display toggles are off", () => {
    // code "M450" deliberately doesn't match the M/X code pattern (see
    // machine-specs.ts) so height/width fall back to the item's stored
    // `specs` (18/180) — same fixture shape as the "resolves a machine title
    // block" test above — keeping this test's height/width assertion
    // independent of code-parsing behaviour.
    const doc = baseDoc({
      showItemPrices: false,
      showOptionPrices: false,
      items: [baseItem({ code: "M450" })],
    });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].titleBlockHtml).not.toContain("Price");
    expect(data.machineSections[0].titleBlockHtml).not.toContain("____");
    // The rest of the block (a separate line) still renders untouched.
    expect(data.machineSections[0].titleBlockHtml).toContain("Height 18cm, width 180cm");
  });

  it("substitutes the item's TOTAL (incl. options), currency-formatted, when showItemPrices is on", () => {
    const doc = baseDoc({
      showItemPrices: true,
      showOptionPrices: false,
      items: [baseItem({ unitPrice: "175000.00", total: "180000.00" })],
    });
    const data = buildQuotationData(doc, [machineBlock]);
    // Uses the pricing engine's per-item TOTAL (180000, incl. an option),
    // not the bare unit price (175000) — and formatted via formatMoney, not
    // a raw decimal string.
    expect(data.machineSections[0].titleBlockHtml).toContain("Price: $180,000");
    expect(data.machineSections[0].titleBlockHtml).not.toContain("175000");
  });

  it("substitutes the real price when only showOptionPrices is on (implies item prices visible)", () => {
    const doc = baseDoc({ showItemPrices: false, showOptionPrices: true });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].titleBlockHtml).toContain("Price: $175,000");
  });

  it("passes both price-display toggles through onto the returned QuotationData", () => {
    const doc = baseDoc({ showItemPrices: true, showOptionPrices: false });
    const data = buildQuotationData(doc, []);
    expect(data.showItemPrices).toBe(true);
    expect(data.showOptionPrices).toBe(false);
  });

  it("resolves OPTION lines to option blocks using line attributes, skips lines with no match", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              kind: "OPTION",
              code: "MTS",
              name: "Machine Transfer System",
              description: null,
              qty: 1,
              unitPrice: "5000.00",
              attributes: { metres: 4, tables: 2 },
            },
            {
              id: "line-2",
              kind: "OPTION",
              code: "ZZZ-NOPE",
              name: "Unknown option",
              description: null,
              qty: 1,
              unitPrice: "0.00",
              attributes: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    expect(data.machineSections[0].optionBlocksHtml).toHaveLength(1);
    expect(data.machineSections[0].optionBlocksHtml[0].bodyHtml).toContain("Travel 4m over 2 tables");
  });

  it("substitutes bankDetails into terms blocks and sorts terms/conditions by sortOrder", () => {
    const data = buildQuotationData(baseDoc(), [termsBlock, conditionsBlock]);
    expect(data.termsSections).toHaveLength(1);
    // Multi-line: each bank field (bank/bsb/accountNo, per baseDoc's fixture)
    // renders as its own line, not squashed onto one.
    expect(data.termsSections[0].bodyHtml).toContain("Bank: ANZ Westfield");
    expect(data.termsSections[0].bodyHtml).toContain("BSB: 013 442");
    expect(data.termsSections[0].bodyHtml).toContain("Account No.: 4405 63886");
    expect(data.conditionsSections).toHaveLength(1);
    expect(data.conditionsSections[0].key).toBe("conditions.1");
  });

  it("auto-fills the standard-terms defaults (deliveryWeeks/installationDays/trainingDays/warrantyMonths)", () => {
    const deliveryBlock: ContentBlockRow = {
      key: "terms.delivery",
      regionId: null,
      title: "Delivery",
      body: "Included in sale price. (Estimated {{deliveryWeeks}} weeks.)",
      sortOrder: 6,
    };
    const scheduleBlock: ContentBlockRow = {
      key: "terms.schedule",
      regionId: null,
      title: "Schedule",
      body: "- Installation approx. {{installationDays}} days.\n- Operator training approx. {{trainingDays}} days.",
      sortOrder: 7,
    };
    const warrantyBlock: ContentBlockRow = {
      key: "terms.warranty",
      regionId: null,
      title: "Warranty",
      body: "{{warrantyMonths}}-month parts warranty.",
      sortOrder: 8,
    };
    const data = buildQuotationData(baseDoc(), [deliveryBlock, scheduleBlock, warrantyBlock]);
    const bodies = data.termsSections.map((t) => t.bodyHtml).join("\n");
    // None of these are wired up from any per-document source today — every
    // one must come from the auto-fill default, with no "____"/stripped line.
    expect(bodies).toContain("Estimated 14 weeks");
    expect(bodies).toContain("Installation approx. 2 days");
    expect(bodies).toContain("Operator training approx. 3 days");
    expect(bodies).toContain("12-month parts warranty");
  });

  it("still line-strips a genuinely-unknown terms token (e.g. rspYear2Cost) with no default", () => {
    const rspTermsBlock: ContentBlockRow = {
      key: "terms.rsp",
      regionId: null,
      title: "RSP",
      body: "Customer agrees to 2nd year RSP.\n\n- 1st Year: 100% discount.\n- 2nd Year: {{rspYear2Cost}} + GST.",
      sortOrder: 9,
    };
    const data = buildQuotationData(baseDoc(), [rspTermsBlock]);
    expect(data.termsSections[0].bodyHtml).toContain("1st Year: 100% discount");
    expect(data.termsSections[0].bodyHtml).not.toContain("2nd Year");
    expect(data.termsSections[0].bodyHtml).not.toContain("____");
  });

  it("builds an RSP coverage row per item with a 'TBA' unit cost (table cell, not a markdown line — never '____')", () => {
    const doc = baseDoc({ items: [baseItem({ name: "M5180 Cutting System", serialNumber: "SN-001" })] });
    const data = buildQuotationData(doc, [rspAgreementBlock]);
    expect(data.rsp.agreementHtml).toContain("Remote support program");
    expect(data.rsp.coverageRows).toEqual([{ name: "M5180 Cutting System", serialNumber: "SN-001", rspUnitCost: "TBA" }]);
  });

  it("blanks serialNumber when unset rather than rendering null", () => {
    const data = buildQuotationData(baseDoc(), []);
    expect(data.rsp.coverageRows[0].serialNumber).toBe("");
  });

  it("includes items from every machine series (M, X, L, P, LNS)", () => {
    const doc = baseDoc({
      items: [
        baseItem({ id: "i-m", name: "M item", seriesCode: "M" }),
        baseItem({ id: "i-xc", name: "X item", seriesCode: "X" }),
        baseItem({ id: "i-l", name: "L item", seriesCode: "L" }),
        baseItem({ id: "i-p", name: "P item", seriesCode: "P" }),
        baseItem({ id: "i-lns", name: "LNS item", seriesCode: "LNS" }),
      ],
    });
    const data = buildQuotationData(doc, []);
    expect(data.rsp.coverageRows.map((r) => r.name)).toEqual(["M item", "X item", "L item", "P item", "LNS item"]);
  });

  it("excludes a non-machine-series item with no serial number (e.g. an option/accessory/software item)", () => {
    const doc = baseDoc({
      items: [baseItem({ name: "Easy-Loader", seriesCode: "EL", serialNumber: null })],
    });
    const data = buildQuotationData(doc, []);
    expect(data.rsp.coverageRows).toEqual([]);
  });

  it("includes a non-machine-series item when it has a serial number", () => {
    const doc = baseDoc({
      items: [baseItem({ name: "Fabric Master", seriesCode: null, serialNumber: "SN-FM-1" })],
    });
    const data = buildQuotationData(doc, []);
    expect(data.rsp.coverageRows).toEqual([{ name: "Fabric Master", serialNumber: "SN-FM-1", rspUnitCost: "TBA" }]);
  });
});
