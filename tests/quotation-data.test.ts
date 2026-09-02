import { describe, it, expect } from "vitest";
import {
  buildQuotationData,
  dedupeOptionCode,
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
    discountMode: "PERCENT",
    discountValue: null,
    discountAmount: "0.00",
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
    status: "DRAFT",
    number: null,
    issueDate: new Date("2026-08-30T00:00:00.000Z"),
    validityDays: 30,
    defaultValidityDays: 7,
    currency: "AUD",
    taxName: "GST",
    taxRate: "10",
    deliveryTerms: "DELIVERED",
    entitySnapshot: null,
    entityName: "Pathfinder Australia Pty Ltd",
    entityLegalId: "ABN 64 072 458 667",
    entityAddress: "12 Did Ct, Tullamarine Vic. 3043, Australia",
    bankDetails: { bank: "ANZ Westfield", bsb: "013 442", accountNo: "4405 63886" },
    logoUrl: null,
    footerText: null,
    discountMode: "PERCENT",
    discountValue: null,
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
    author: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null },
    notes: null,
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

  it("substitutes {{basePrice}} with the machine's own price, distinct from the combined {{price}} total", () => {
    const basePriceBlock: ContentBlockRow = {
      key: "machine.m-series",
      regionId: null,
      title: "M-Series",
      body: "Base: {{basePrice}}\n\nTotal: {{price}}",
      sortOrder: 1,
    };
    const doc = baseDoc({
      showItemPrices: true,
      showOptionPrices: false,
      items: [baseItem({ unitPrice: "175000.00", total: "180000.00" })],
    });
    const data = buildQuotationData(doc, [basePriceBlock]);
    // {{basePrice}} resolves to the bare machine price (175000), while the
    // pre-existing {{price}} keeps meaning the combined subtotal (180000,
    // incl. the option) — so catalogue templates that already reference
    // {{price}} keep working unchanged.
    expect(data.machineSections[0].titleBlockHtml).toContain("Base: $175,000");
    expect(data.machineSections[0].titleBlockHtml).toContain("Total: $180,000");
  });

  it("strips the {{basePrice}} line (never a blank) when both price-display toggles are off", () => {
    const basePriceBlock: ContentBlockRow = {
      key: "machine.m-series",
      regionId: null,
      title: "M-Series",
      body: "Model {{model}}.\n\nBase: {{basePrice}}",
      sortOrder: 1,
    };
    const doc = baseDoc({
      showItemPrices: false,
      showOptionPrices: false,
      items: [baseItem({ code: "M450" })],
    });
    const data = buildQuotationData(doc, [basePriceBlock]);
    expect(data.machineSections[0].titleBlockHtml).not.toContain("Base");
    expect(data.machineSections[0].titleBlockHtml).not.toContain("____");
    expect(data.machineSections[0].titleBlockHtml).toContain("Model M450");
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

  it("resolves OPTION lines to option blocks using line attributes, falls back for lines with no match", () => {
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
              imageUrl: null,
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
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    const rows = data.machineSections[0].optionRows;
    // Both lines land as rows in the ONE unified table — a matched block and
    // an unmatched code no longer render through two different code paths.
    expect(rows).toHaveLength(2);
    expect(rows[0].descriptionHtml).toContain("Travel 4m over 2 tables");
    // A line whose code matches no option.* block is never silently
    // dropped — it still gets its own row in the same table (owner: "no
    // selected option may be silently omitted").
    expect(rows[1]).toMatchObject({
      code: "ZZZ-NOPE",
      name: "Unknown option",
      qty: 1,
    });
  });

  it("no selected option is ever omitted: 3 options (1 with a block, 2 without) all appear in the one unified table", () => {
    const doc = baseDoc({
      showOptionPrices: true,
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
              imageUrl: null,
            },
            {
              id: "line-2",
              kind: "OPTION",
              code: "UNMATCHED-1",
              name: "First unmatched option",
              description: null,
              qty: 2,
              unitPrice: "570.00",
              attributes: null,
              imageUrl: null,
            },
            {
              id: "line-3",
              kind: "OPTION",
              code: null,
              name: "Second unmatched option",
              description: null,
              qty: 1,
              unitPrice: "100.00",
              attributes: { colour: "Blue" },
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    const rows = data.machineSections[0].optionRows;

    // All 3 selected options are accounted for, in line order, in the one
    // unified table — none silently dropped just because its code didn't
    // resolve to an option.* content block.
    expect(rows.map((r) => r.name)).toEqual([
      "Machine Transfer System",
      "First unmatched option",
      "Second unmatched option",
    ]);
    expect(rows).toHaveLength(3);

    // The matched-block row still renders its block body as descriptionHtml,
    // and — unlike the old optionBlocksHtml, which never showed a price at
    // all — now gets the same price column every row gets (gated by
    // showOptionPrices, same as before).
    expect(rows[0].descriptionHtml).toContain("Travel 4m over 2 tables");
    expect(rows[0].price).toBe("$5,000");

    // qty >1 and price (gated by showOptionPrices) both surface on an
    // unmatched row.
    expect(rows[1].qty).toBe(2);
    expect(rows[1].price).toBe("$1,140");
    // Attribute values surface too, when present, as one flattened line.
    expect(rows[2].attributesLine).toBe("colour: Blue");
    expect(rows[2].code).toBeNull();
  });

  it("hides option row prices when showOptionPrices is off", () => {
    const doc = baseDoc({
      showOptionPrices: false,
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              kind: "OPTION",
              code: "UNMATCHED",
              name: "Unmatched option",
              description: null,
              qty: 1,
              unitPrice: "100.00",
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].optionRows[0].price).toBeNull();
  });

  it("carries qty onto a matched-block option row (for the table's qty column)", () => {
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
              qty: 3,
              unitPrice: "5000.00",
              attributes: { metres: 4, tables: 2 },
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    expect(data.machineSections[0].optionRows[0].qty).toBe(3);
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

// --- buildQuotationData: sectionTitle — every section gets a heading -------
//
// Root cause of the owner-reported missing headings: `titleBlockHtml` used
// to be the ONLY thing quotation-sheet.tsx rendered for a matched block, and
// whether that carried a visible heading depended entirely on whether the
// block's own markdown BODY happened to start with a "##" line.
// machine.m-series's real seed body did (coincidentally, since it also
// repeated the model in its own template); equipment.easy-loader,
// equipment.fabric-pro, software.pathworks-s/-i and equipment.punchline
// never did, so those sections rendered with no heading at all — and a
// blockless item (e.g. L-Series) only got one via the separate auto-summary
// fallback path. `sectionTitle` replaces all of that with one computation
// that always runs, for every section, block or no block.
describe("buildQuotationData — sectionTitle", () => {
  // Owner rule change: a matched block's STATIC title (no {{placeholder}} at
  // all, like machineBlock's plain "M-Series") is never trusted as the
  // heading any more, even though a block matched — this is what let a
  // generic content-block title (e.g. "Easy-Loader #1") leak onto the sheet
  // as if it were that specific item's name. Only a DYNAMIC title (one that
  // references a placeholder, e.g. "Pathfinder {{model}} Cutting System" —
  // see the next test) still gets used, substituted.
  it("ignores a matched content block's static title, always uses the item's own name instead", () => {
    const data = buildQuotationData(baseDoc({ items: [baseItem({ code: "M450" })] }), [machineBlock]);
    expect(data.machineSections[0].sectionTitle).toBe("M5180 Cutting System");
  });

  it("substitutes placeholders in the block's title (e.g. {{model}}), same vars as the body", () => {
    const modelTitleBlock: ContentBlockRow = {
      key: "machine.m-series",
      regionId: null,
      title: "Pathfinder {{model}} Cutting System",
      body: "Model {{model}}.",
      sortOrder: 1,
    };
    const data = buildQuotationData(baseDoc({ items: [baseItem({ code: "X-5180", seriesCode: "X" })] }), [
      modelTitleBlock,
    ]);
    expect(data.machineSections[0].sectionTitle).toBe("Pathfinder X-5180 Cutting System");
  });

  it("falls back to the item's name when no content block matches the product", () => {
    const doc = baseDoc({ items: [baseItem({ seriesCode: "EF", code: "EF-100", name: "EF-100 Accessory" })] });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].sectionTitle).toBe("EF-100 Accessory");
  });

  it("falls back to the item's name for a blockless series (e.g. L-Series)", () => {
    const doc = baseDoc({ items: [baseItem({ code: "L-320", seriesCode: "L", name: "L-320 Cutting System" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].sectionTitle).toBe("L-320 Cutting System");
  });

  it("falls back to the item's name when the matched block has a title but no body-matching text (null title)", () => {
    const noTitleBlock: ContentBlockRow = {
      key: "machine.m-series",
      regionId: null,
      title: null,
      body: "Model {{model}}.",
      sortOrder: 1,
    };
    const doc = baseDoc({ items: [baseItem({ name: "M5180 Cutting System" })] });
    const data = buildQuotationData(doc, [noTitleBlock]);
    expect(data.machineSections[0].sectionTitle).toBe("M5180 Cutting System");
  });

  it("falls back to the item's name when the title's only content is an unresolved placeholder", () => {
    const unresolvedTitleBlock: ContentBlockRow = {
      key: "machine.m-series",
      regionId: null,
      title: "{{rspUnitCost}}",
      body: "Model {{model}}.",
      sortOrder: 1,
    };
    const doc = baseDoc({ items: [baseItem({ name: "M5180 Cutting System" })] });
    const data = buildQuotationData(doc, [unresolvedTitleBlock]);
    expect(data.machineSections[0].sectionTitle).toBe("M5180 Cutting System");
  });
});

// --- dedupeOptionCode — the unified options table's duplicate-label fix ----
//
// Owner-reported duplicates in the old rendering: "1.0mm dia punch — 1.0mm
// dia punch" (code === name) and "Drills included 2301071-7-10 —
// 2301071-7-10" (code embedded as a suffix of name) — both are option rows
// whose code carries no information the name doesn't already show.
describe("dedupeOptionCode", () => {
  it("returns null when code and name are identical", () => {
    expect(dedupeOptionCode("1.0mm dia punch", "1.0mm dia punch")).toBeNull();
  });

  it("returns null when name embeds code as a suffix (owner repro: drills)", () => {
    expect(dedupeOptionCode("2301071-7-10", "Drills included 2301071-7-10")).toBeNull();
  });

  it("returns null when code embeds name (the reverse containment)", () => {
    expect(dedupeOptionCode("ABR-M Full Name", "ABR-M")).toBeNull();
  });

  it("returns the code unchanged when it's genuinely distinct from the name", () => {
    expect(dedupeOptionCode("MTS", "Machine Transfer System")).toBe("MTS");
  });

  it("returns null for a null code", () => {
    expect(dedupeOptionCode(null, "Some option")).toBeNull();
  });
});

// --- buildQuotationData: unified options table ------------------------------

describe("buildQuotationData — unified options table (QuotationOptionRow)", () => {
  it("resolves a matched option's imageUrl through the same resolver as item images (icon flow: query -> data -> sheet)", () => {
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
              attributes: null,
              imageUrl: "/api/files/mts-icon.png",
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock], {
      resolveImage: (url) => `resolved:${url}`,
    });
    expect(data.machineSections[0].optionRows[0].icon).toBe("resolved:/api/files/mts-icon.png");
  });

  it("leaves icon null when the line carries no imageUrl", () => {
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
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    expect(data.machineSections[0].optionRows[0].icon).toBeNull();
  });

  it("dedupes the row's own code when it's redundant with its name", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              kind: "OPTION",
              code: "ZZZ-NOPE", // no option.* block matches (see mtsBlock's key)
              name: "ZZZ-NOPE",
              description: null,
              qty: 1,
              unitPrice: "0.00",
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].optionRows[0]).toMatchObject({ code: null, name: "ZZZ-NOPE" });
  });

  it("falls back to the line's own (deduped) description when no option.* block matches", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              kind: "OPTION",
              code: "UNMATCHED",
              name: "Unmatched option",
              description: "A short freeform description",
              qty: 1,
              unitPrice: "0.00",
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].optionRows[0].descriptionHtml).toContain("A short freeform description");
  });

  it("descriptionHtml is null when there's no block AND the line's description is redundant with its name", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              kind: "OPTION",
              code: "UNMATCHED",
              name: "Unmatched option",
              description: "Unmatched option", // identical to name -> deduped away
              qty: 1,
              unitPrice: "0.00",
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].optionRows[0].descriptionHtml).toBeNull();
  });

  it("flattens attributes to one 'key: value · key: value' line, null when there are none", () => {
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
              imageUrl: null,
            },
            {
              id: "line-2",
              kind: "OPTION",
              code: "UNMATCHED",
              name: "Unmatched option",
              description: null,
              qty: 1,
              unitPrice: "0.00",
              attributes: null,
              imageUrl: null,
            },
          ],
        }),
      ],
    });
    const data = buildQuotationData(doc, [machineBlock, mtsBlock]);
    const rows = data.machineSections[0].optionRows;
    expect(rows[0].attributesLine).toBe("metres: 4 · tables: 2");
    expect(rows[1].attributesLine).toBeNull();
  });

  it("gates every row's price on showOptionPrices, including a matched-block row (previously never priced)", () => {
    const line: QuotationItemInput["lines"][number] = {
      id: "line-1",
      kind: "OPTION",
      code: "MTS",
      name: "Machine Transfer System",
      description: null,
      qty: 2,
      unitPrice: "500.00",
      attributes: null,
      imageUrl: null,
    };

    const off = buildQuotationData(baseDoc({ showOptionPrices: false, items: [baseItem({ lines: [line] })] }), [
      machineBlock,
      mtsBlock,
    ]);
    expect(off.machineSections[0].optionRows[0].price).toBeNull();

    const on = buildQuotationData(baseDoc({ showOptionPrices: true, items: [baseItem({ lines: [line] })] }), [
      machineBlock,
      mtsBlock,
    ]);
    expect(on.machineSections[0].optionRows[0].price).toBe("$1,000");
  });
});

// --- buildQuotationData: structural section price (owner: every item
// section must show its price) ---------------------------------------------
//
// Root cause of the owner-reported missing prices: EL-2020/PTW(I)/FP-180's
// content blocks never carried a "Price: {{price}}" line the way
// machine.m-series's did, so those sections showed no price at all.
// `sectionPrice`/`hasInlinePrice` make the price structural for every
// section, while still avoiding a double print for a block (like
// machine.m-series) that already inlines its own price line.
describe("buildQuotationData — sectionPrice / hasInlinePrice", () => {
  it("exposes sectionPrice (item total incl. options) when a price toggle is on", () => {
    const doc = baseDoc({ showItemPrices: true, items: [baseItem({ total: "180000.00" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].sectionPrice).toBe("$180,000");
  });

  it("is null when both price-display toggles are off", () => {
    const doc = baseDoc({ showItemPrices: false, showOptionPrices: false });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].sectionPrice).toBeNull();
  });

  it("is visible when only showOptionPrices is on (implies item totals visible)", () => {
    const doc = baseDoc({ showItemPrices: false, showOptionPrices: true, items: [baseItem({ total: "175000.00" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].sectionPrice).toBe("$175,000");
  });

  it("hasInlinePrice is true for a matched block whose raw body references {{price}} (machine.m-series)", () => {
    const doc = baseDoc({ items: [baseItem({ code: "M450" })] });
    const data = buildQuotationData(doc, [machineBlock]);
    expect(data.machineSections[0].hasInlinePrice).toBe(true);
  });

  it("hasInlinePrice is false for a matched block with no {{price}} token (e.g. equipment.easy-loader)", () => {
    const elBlock: ContentBlockRow = {
      key: "equipment.easy-loader",
      regionId: null,
      title: "Easy-Loader",
      body: "Automates fabric loading.",
      sortOrder: 1,
    };
    const doc = baseDoc({ items: [baseItem({ code: "EL-2020", seriesCode: "EL" })] });
    const data = buildQuotationData(doc, [elBlock]);
    expect(data.machineSections[0].hasInlinePrice).toBe(false);
    // sectionPrice is still exposed structurally even though showItemPrices
    // is off in this fixture's baseDoc default — hasInlinePrice is
    // independent of whether the price is actually visible.
  });

  it("hasInlinePrice is false for a blockless section (e.g. L-Series)", () => {
    const doc = baseDoc({ items: [baseItem({ code: "L-320", seriesCode: "L" })] });
    const data = buildQuotationData(doc, []);
    expect(data.machineSections[0].hasInlinePrice).toBe(false);
    expect(data.machineSections[0].titleBlockHtml).toBeNull();
  });
});

// --- buildQuotationData: preparedBy / notesHtml -----------------------------

describe("buildQuotationData — preparedBy / notesHtml", () => {
  it("passes the document author through as preparedBy", () => {
    const doc = baseDoc({ author: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null } });
    const data = buildQuotationData(doc, []);
    expect(data.preparedBy).toEqual({
      name: "Jane Author",
      email: "jane@example.com",
      phone: "0400 000 000",
      avatar: null,
    });
  });

  it("renders notes to HTML via renderMarkdown when present", () => {
    const doc = baseDoc({ notes: "**Important:** handle with care." });
    const data = buildQuotationData(doc, []);
    expect(data.notesHtml).toContain("<strong>Important:</strong>");
  });

  it("is null when there are no notes", () => {
    const doc = baseDoc({ notes: null });
    const data = buildQuotationData(doc, []);
    expect(data.notesHtml).toBeNull();
  });
});
