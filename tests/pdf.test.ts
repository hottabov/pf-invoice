import { describe, it, expect } from "vitest";
import { buildFooterHtml, pdfFilename, renderDocumentHtml, renderQuotationHtml } from "../src/lib/pdf";
import { buildItemBreakdown } from "../src/lib/sheet-data";
import type { DocSheetData } from "../src/lib/sheet-data";
import type { QuotationData } from "../src/lib/quotation-data";

// Pure/rendering bits of the PDF pipeline only — `htmlToPdf` and
// `fileImageResolver` need a live Gotenberg / real uploaded files
// respectively and are code-verified rather than exercised here (see the
// plan's Task C note: no live Gotenberg in this environment).

describe("buildFooterHtml", () => {
  it("sends a footer with the quote number and page numbers", () => {
    const footer = buildFooterHtml("Q-AU-2026-001");
    expect(footer).toContain("Q-AU-2026-001");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });

  it("falls back to 'Draft' when there is no document number yet", () => {
    const footer = buildFooterHtml(null);
    expect(footer).toContain("Draft");
  });

  it("HTML-escapes the document number rather than trusting its format", () => {
    const footer = buildFooterHtml('<script>alert(1)</script>');
    expect(footer).not.toContain("<script>alert(1)</script>");
    expect(footer).toContain("&lt;script&gt;");
  });
});

describe("pdfFilename", () => {
  it("uses the document number when present", () => {
    expect(pdfFilename("Q-AU-2026-001", "doc-1")).toBe("Q-AU-2026-001.pdf");
  });

  it("falls back to draft-<id> when there is no number yet", () => {
    expect(pdfFilename(null, "doc-1")).toBe("draft-doc-1.pdf");
  });

  it("sanitizes characters that could break a Content-Disposition header", () => {
    expect(pdfFilename('evil"; x=1\r\nSet-Cookie: y', "doc-1")).toBe(
      "evil_x_1_Set-Cookie_y.pdf"
    );
  });
});

function baseSheetData(overrides: Partial<DocSheetData> = {}): DocSheetData {
  return {
    title: "QUOTATION",
    isDraft: false,
    number: "Q-AU-2026-001",
    issueDate: "30/08/2026",
    validityDate: null,
    logo: null,
    entity: {
      name: "Pathfinder Cutting Systems",
      legalId: "ABN 123",
      address: "1 Example St",
      bankDetails: [],
      footerText: null,
    },
    client: null,
    delivery: null,
    items: [],
    extraLines: [],
    totals: {
      currency: "AUD",
      subtotal: "1000.00",
      discountMode: "PERCENT",
      discountValue: null,
      discountAmount: "0.00",
      taxName: "GST",
      taxRate: "10",
      taxAmount: "100.00",
      total: "1100.00",
    },
    showSignature: false,
    preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: null },
    notes: null,
    showItemPrices: true,
    showOptionPrices: true,
    ...overrides,
  };
}

describe("renderDocumentHtml", () => {
  it("wraps the sheet in a full standalone HTML document", async () => {
    const html = await renderDocumentHtml(baseSheetData());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<meta charSet="utf-8">');
    expect(html).toContain("@page{size:A4;margin:15mm}");
    expect(html).toContain("Pathfinder Cutting Systems");
    expect(html).toContain("Q-AU-2026-001");
    expect(html).toContain("1,100");
  });

  it("renders a multi-line entity address as one pq-entity-line div per line, not a literal newline", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        entity: {
          name: "Pathfinder Cutting Systems",
          legalId: "ABN 123",
          address: "12 Dib Court\nTullamarine, VIC 3043, Australia\nWeb: pathfindercut.com",
          bankDetails: [],
          footerText: null,
        },
      })
    );

    // Each address line lands in its own element rather than a single block
    // with an embedded "\n" (which HTML would collapse to a single space).
    expect(html).toContain('<div class="pq-entity-line">12 Dib Court</div>');
    expect(html).toContain('<div class="pq-entity-line">Tullamarine, VIC 3043, Australia</div>');
    expect(html).toContain('<div class="pq-entity-line">Web: pathfindercut.com</div>');
    expect(html).not.toContain("Dib Court\\n");
  });

  it("renders a compact 'Prepared by' line and, when present, notes before bank details", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: null },
        notes: "Please deliver to the loading dock.",
        entity: {
          name: "Pathfinder Cutting Systems",
          legalId: "ABN 123",
          address: "1 Example St",
          bankDetails: [{ label: "Bank", value: "ANZ" }],
          footerText: null,
        },
      })
    );

    expect(html).toContain("Prepared by: Jane Author");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("Please deliver to the loading dock.");
    // Notes appear before the bank details block in document order.
    expect(html.indexOf("Please deliver to the loading dock.")).toBeLessThan(html.indexOf("Bank Details"));
  });

  it("falls back to the author's email when no name is set, and omits notes entirely when unset", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({ preparedBy: { name: null, email: "noname@example.com", phone: null, avatar: null }, notes: null })
    );
    expect(html).toContain("Prepared by: noname@example.com");
    // No trailing " · email" when there's no name to pair it with.
    expect(html).not.toContain("Prepared by: noname@example.com ·");
    // The rendered notes *element* is absent (the embedded <style> block
    // always defines the .pq-notes-title selector regardless, so this
    // checks for the element's opening tag, not the bare class name).
    expect(html).not.toContain('class="pq-notes-title"');
  });

  it("renders the author's avatar under Prepared by when present", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: "data:image/jpeg;base64,AAAA" },
      })
    );
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(html).toContain('class="pq-prepared-by-avatar"');
  });

  it("renders no <img> for Prepared by when the author has no avatar", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({ preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: null } })
    );
    // The embedded <style> block always defines the .pq-prepared-by-avatar
    // selector regardless (same pattern as the .pq-notes-title check
    // above) — check for the element's opening tag, not the bare class name.
    expect(html).not.toContain('<img class="pq-prepared-by-avatar"');
    expect(html).not.toContain("<img");
  });
});

describe("renderDocumentHtml — item breakdown honours the price-display flags", () => {
  it("shows the base price separately from the combined total, gated by showItemPrices/showOptionPrices", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        showItemPrices: true,
        showOptionPrices: true,
        items: [
          baseDocSheetItem({
            code: "X-5180",
            unitPrice: "175000.00",
            total: "215425.00",
            lines: [{ id: "line-1", code: "MTS", name: "MTS", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
          }),
        ],
      })
    );
    // Base price and per-item subtotal both appear as their own figures —
    // this sheet used to print `item.total` only, leaving the base machine
    // price invisible (the bug this task fixes).
    expect(html).toContain("$175,000");
    expect(html).toContain('class="pq-item-subtotal-row"');
    expect(html).toContain("X-5180 subtotal");
    expect(html).toContain("$215,425");
  });

  it("still shows each option's code and description, same as the old hand-rolled OptionRow — the presenter dropped this, DocumentSheet has no Equipment Detail section to fall back on", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        showItemPrices: true,
        showOptionPrices: true,
        items: [
          baseDocSheetItem({
            code: "X-5180",
            unitPrice: "175000.00",
            total: "215425.00",
            lines: [
              {
                id: "line-1",
                code: "MTS",
                name: "Machine Transfer System",
                description: "Automated transfer of cut fabric off the table",
                qty: 1,
                unitPrice: "40425.00",
                lineTotal: "40425.00",
                image: null,
              },
            ],
          }),
        ],
      })
    );
    expect(html).toContain("MTS — Machine Transfer System");
    expect(html).toContain("Automated transfer of cut fabric off the table");
  });

  it("used to ignore the price-display flags entirely — now renders no item money when both are off", async () => {
    const html = await renderDocumentHtml(
      baseSheetData({
        showItemPrices: false,
        showOptionPrices: false,
        items: [
          baseDocSheetItem({
            code: "X-5180",
            unitPrice: "175000.00",
            total: "215425.00",
            lines: [{ id: "line-1", code: "MTS", name: "MTS", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
          }),
        ],
      })
    );
    expect(html).not.toContain("$175,000");
    expect(html).not.toContain("$215,425");
    expect(html).not.toContain("$40,425");
    expect(html).not.toContain('class="pq-item-subtotal-row"');
    // The document grand total is still shown regardless of the item-level
    // flags — those only gate the itemized per-item detail.
    expect(html).toContain("1,100");
  });
});

// --- renderQuotationHtml -----------------------------------------------------

function baseQuotationData(overrides: Partial<QuotationData> = {}): QuotationData {
  return {
    isDraft: false,
    number: "Q-AU-2026-001",
    issueDate: "30/08/2026",
    validityDate: null,
    logo: null,
    entity: {
      name: "Pathfinder Cutting Systems",
      legalId: "ABN 123",
      address: "1 Example St",
      bankDetails: [],
      footerText: null,
    },
    client: null,
    delivery: null,
    preparedBy: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null },
    notesHtml: null,
    machineSections: [],
    items: [],
    extraLines: [],
    totals: {
      currency: "AUD",
      subtotal: "1000.00",
      discountMode: "PERCENT",
      discountValue: null,
      discountAmount: "0.00",
      taxName: "GST",
      taxRate: "10",
      taxAmount: "100.00",
      total: "1100.00",
    },
    termsSections: [],
    conditionsSections: [],
    rsp: { agreementHtml: null, coverageRows: [] },
    showSignature: true,
    showItemPrices: true,
    showOptionPrices: true,
    ...overrides,
  };
}

// `breakdown` is derived via the same `buildItemBreakdown` helper
// `toSheetData` itself uses (rather than a hand-maintained fixture) so it
// never drifts out of sync with whatever `unitPrice`/`lines`/`total`/
// discount fields a test overrides — a caller can still override
// `breakdown` explicitly when a test wants to exercise a shape
// `buildItemBreakdown` wouldn't itself produce.
function baseDocSheetItem(overrides: Partial<QuotationData["items"][number]> = {}): QuotationData["items"][number] {
  const merged = {
    id: "item-1",
    code: "X-5180",
    name: "X-5180 Cutting System",
    description: null,
    unitPrice: "175000.00",
    discountMode: "PERCENT" as const,
    discountValue: null,
    total: "215425.00",
    image: null,
    lines: [],
    ...overrides,
  };
  return {
    ...merged,
    breakdown:
      overrides.breakdown ??
      buildItemBreakdown(
        {
          unitPrice: merged.unitPrice,
          discountMode: merged.discountMode,
          discountValue: merged.discountValue,
          discountAmount: "0.00",
          total: merged.total,
          lines: merged.lines,
        },
        true
      ),
  };
}

describe("renderQuotationHtml — header prepared for/by", () => {
  it("renders 'Prepared for' and 'Prepared by' as two columns", async () => {
    const data = baseQuotationData({
      client: {
        companyName: "Acme Pty Ltd",
        addressLines: ["1 Example Rd"],
        website: null,
        contactName: "John Client",
        contactEmail: null,
        contactPhone: null,
      },
      preparedBy: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null },
    });
    const html = await renderQuotationHtml(data);
    expect(html).toContain("Prepared for");
    expect(html).toContain("Acme Pty Ltd");
    expect(html).toContain("Prepared by");
    expect(html).toContain("Jane Author");
    expect(html).toContain("0400 000 000");
    expect(html).not.toContain("Bill To");
  });

  it("renders the author's avatar under Prepared by when present", async () => {
    const data = baseQuotationData({
      preparedBy: {
        name: "Jane Author",
        email: "jane@example.com",
        phone: "0400 000 000",
        avatar: "data:image/jpeg;base64,AAAA",
      },
    });
    const html = await renderQuotationHtml(data);
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(html).toContain('class="pq-prepared-by-avatar"');
  });

  it("renders no <img> for Prepared by when the author has no avatar", async () => {
    const data = baseQuotationData({
      preparedBy: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null },
    });
    const html = await renderQuotationHtml(data);
    // See the equivalent renderDocumentHtml test above — the embedded
    // <style> block always defines the class selector regardless.
    expect(html).not.toContain('<img class="pq-prepared-by-avatar"');
    expect(html).not.toContain("<img");
  });
});

describe("renderQuotationHtml — structural section price", () => {
  it("prints a structural price row for a blockless section", async () => {
    const data = baseQuotationData({
      machineSections: [
        {
          itemId: "item-1",
          sectionTitle: "L-320 Cutting System",
          titleBlockHtml: null,
          specSentence: "L-Series Cutting Machine with 320cm cutting width",
          sectionPrice: "$180,000",
          hasInlinePrice: false,
          baseRow: { code: "M5180", name: "M Series 5180", qty: 1, price: null },
          optionRows: [],
          lineSummary: baseDocSheetItem({ total: "180000.00" }),
        },
      ],
    });
    const html = await renderQuotationHtml(data);
    expect(html).toContain('<div class="pq-section-price">Price: $180,000</div>');
  });

  it("does not double-print the price for a section whose block already inlines it", async () => {
    const data = baseQuotationData({
      machineSections: [
        {
          itemId: "item-1",
          sectionTitle: "M5180 Cutting System",
          titleBlockHtml: "<p>Model M5180. <strong>Price: $175,000</strong></p>",
          specSentence: null,
          sectionPrice: "$175,000",
          hasInlinePrice: true,
          baseRow: { code: "M5180", name: "M Series 5180", qty: 1, price: null },
          optionRows: [],
          lineSummary: baseDocSheetItem(),
        },
      ],
    });
    const html = await renderQuotationHtml(data);
    expect(html).not.toContain('class="pq-section-price"');
    // The inline price from titleBlockHtml itself still renders exactly once.
    expect((html.match(/Price: \$175,000/g) ?? []).length).toBe(1);
  });
});

describe("renderQuotationHtml — investment summary: base price, options, subtotal, totals order", () => {
  it("shows the item's BASE unit price on the item row, not the lump-sum total", async () => {
    const data = baseQuotationData({
      items: [
        baseDocSheetItem({
          unitPrice: "175000.00",
          total: "215425.00",
          lines: [{ id: "line-1", code: "MTS", name: "Machine Transfer System", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
        }),
      ],
    });
    const html = await renderQuotationHtml(data);
    expect(html).toContain("$175,000");
  });

  it("shows each option's own code and description in the Investment Summary row itself, not just in Equipment Detail", async () => {
    const data = baseQuotationData({
      items: [
        baseDocSheetItem({
          code: "X-5180",
          unitPrice: "175000.00",
          total: "215425.00",
          lines: [
            {
              id: "line-1",
              code: "MTS",
              name: "Machine Transfer System",
              description: "Automated transfer of cut fabric off the table",
              qty: 1,
              unitPrice: "40425.00",
              lineTotal: "40425.00",
              image: null,
            },
          ],
        }),
      ],
    });
    const html = await renderQuotationHtml(data);
    const summaryStart = html.indexOf('class="pq-section pq-summary-section"');
    const summaryHtml = html.slice(summaryStart);

    expect(summaryStart).toBeGreaterThan(-1);
    expect(summaryHtml).toContain("MTS — Machine Transfer System");
    expect(summaryHtml).toContain("Automated transfer of cut fabric off the table");
  });

  it("adds a per-item subtotal row (base + options) only when the item has options", async () => {
    const withOptions = await renderQuotationHtml(
      baseQuotationData({
        items: [
          baseDocSheetItem({
            code: "X-5180",
            unitPrice: "175000.00",
            total: "215425.00",
            lines: [{ id: "line-1", code: "MTS", name: "MTS", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
          }),
        ],
      })
    );
    expect(withOptions).toContain('class="pq-item-subtotal-row"');
    expect(withOptions).toContain("X-5180 subtotal");
    expect(withOptions).toContain("$215,425");

    const withoutOptions = await renderQuotationHtml(
      baseQuotationData({ items: [baseDocSheetItem({ code: "X-5180", lines: [] })] })
    );
    // The embedded <style> block always defines the .pq-item-subtotal-row
    // selector regardless of whether any row uses it — assert on the
    // rendered element (its class *attribute*) rather than the bare
    // substring "subtotal", which the stylesheet text alone would satisfy.
    expect(withoutOptions).not.toContain('class="pq-item-subtotal-row"');
  });

  it("hides the per-item subtotal row when price display is off, even with options", async () => {
    const html = await renderQuotationHtml(
      baseQuotationData({
        showItemPrices: false,
        showOptionPrices: false,
        items: [
          baseDocSheetItem({
            code: "X-5180",
            lines: [{ id: "line-1", code: "MTS", name: "MTS", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
          }),
        ],
      })
    );
    expect(html).not.toContain('class="pq-item-subtotal-row"');
  });

  it("still shows the per-item subtotal when option prices are hidden but item prices are on", async () => {
    // showOptionPrices off (each option's own `lineTotal` in the breakdown
    // is null, exactly what `toSheetData` would produce — see
    // `buildItemBreakdown`), but showItemPrices on — the owner's rule: a
    // salesperson can hide the option-level detail and still show an
    // honest per-machine subtotal figure.
    const html = await renderQuotationHtml(
      baseQuotationData({
        showItemPrices: true,
        showOptionPrices: false,
        items: [
          baseDocSheetItem({
            code: "X-5180",
            unitPrice: "175000.00",
            total: "215425.00",
            lines: [{ id: "line-1", code: "MTS", name: "MTS", description: null, qty: 1, unitPrice: "40425.00", lineTotal: "40425.00", image: null }],
            breakdown: {
              qty: 1,
              basePrice: "175000.00",
              options: [{ name: "MTS", code: "MTS", description: null, qty: 1, lineTotal: null }],
              discount: null,
              subtotal: "215425.00",
            },
          }),
        ],
      })
    );
    expect(html).toContain('class="pq-item-subtotal-row"');
    expect(html).toContain("X-5180 subtotal");
    expect(html).toContain("$215,425");
    // The option's own price never appears — only its name/qty do.
    expect(html).not.toContain("$40,425");
  });

  it("renders the totals block (Subtotal/Tax/TOTAL) after the items table, at the bottom of the summary section", async () => {
    const data = baseQuotationData({ items: [baseDocSheetItem()] });
    const html = await renderQuotationHtml(data);

    const summaryStart = html.indexOf('class="pq-section pq-summary-section"');
    const itemsTableIdx = html.indexOf('class="pq-items"', summaryStart);
    const totalsIdx = html.indexOf('class="pq-totals"', summaryStart);
    const totalRowIdx = html.indexOf("TOTAL</span>", summaryStart);

    expect(summaryStart).toBeGreaterThan(-1);
    // Items table comes before the totals block, which comes before the
    // TOTAL row itself — Subtotal/Discount/Tax/TOTAL all render at the
    // bottom of the summary section, under the item+option rows, not above
    // them. The page-level "Total investment" banner (asserted separately)
    // is a different element entirely and stays at the very top of the page.
    expect(itemsTableIdx).toBeGreaterThan(-1);
    expect(totalsIdx).toBeGreaterThan(itemsTableIdx);
    expect(totalRowIdx).toBeGreaterThan(totalsIdx);
  });

  it("still shows the page-level Total investment banner above Equipment Detail, unaffected by the toggles", async () => {
    const data = baseQuotationData({
      machineSections: [
        {
          itemId: "item-1",
          sectionTitle: "Item",
          titleBlockHtml: null,
          specSentence: null,
          sectionPrice: null,
          hasInlinePrice: false,
          baseRow: { code: "M5180", name: "M Series 5180", qty: 1, price: null },
          optionRows: [],
          lineSummary: baseDocSheetItem(),
        },
      ],
    });
    const html = await renderQuotationHtml(data);
    const bannerIdx = html.indexOf("Total investment");
    const equipmentIdx = html.indexOf("Equipment Detail");
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(bannerIdx).toBeLessThan(equipmentIdx);
  });
});

describe("renderQuotationHtml — the machine heads its own options table", () => {
  const withBaseRow = (price: string | null, showOptionPrices: boolean) =>
    baseQuotationData({
      showOptionPrices,
      machineSections: [
        {
          itemId: "item-1",
          sectionTitle: "Item",
          titleBlockHtml: null,
          specSentence: null,
          sectionPrice: null,
          hasInlinePrice: false,
          baseRow: { code: "X-10180", name: "Pathfinder X-10180 Cutting System", qty: 1, price },
          optionRows: [
            {
              id: "line-1",
              icon: null,
              code: "AFP",
              name: "Automatic Foot Pressure",
              descriptionHtml: null,
              attributesLine: null,
              qty: 1,
              price: showOptionPrices ? "$1,560.00" : null,
            },
          ],
          lineSummary: baseDocSheetItem(),
        },
      ],
    });

  it("prints the machine as the first row, above its options", async () => {
    const html = await renderQuotationHtml(withBaseRow("$212,500.00", true));
    const machineIdx = html.indexOf("Pathfinder X-10180 Cutting System");
    const optionIdx = html.indexOf("Automatic Foot Pressure");
    expect(machineIdx).toBeGreaterThan(-1);
    expect(optionIdx).toBeGreaterThan(machineIdx);
    expect(html).toContain("$212,500.00");
  });

  it("hides the machine's price with the option prices, not separately", async () => {
    const html = await renderQuotationHtml(withBaseRow(null, false));
    // The row itself still renders — the customer sees what they are buying,
    // just not what each piece costs.
    expect(html).toContain("Pathfinder X-10180 Cutting System");
    expect(html).not.toContain("$212,500.00");
  });
});

describe("renderQuotationHtml — Notes section placement", () => {
  it("renders Notes after Equipment Detail and before Investment Summary", async () => {
    const data = baseQuotationData({
      notesHtml: "<p>Freeform remarks.</p>",
      machineSections: [
        {
          itemId: "item-1",
          sectionTitle: "Item",
          titleBlockHtml: null,
          specSentence: null,
          sectionPrice: null,
          hasInlinePrice: false,
          baseRow: { code: "M5180", name: "M Series 5180", qty: 1, price: null },
          optionRows: [],
          lineSummary: baseDocSheetItem(),
        },
      ],
    });
    const html = await renderQuotationHtml(data);
    const equipmentIdx = html.indexOf("Equipment Detail");
    const notesIdx = html.indexOf("Freeform remarks.");
    const summaryIdx = html.indexOf("Investment Summary");
    expect(equipmentIdx).toBeGreaterThan(-1);
    expect(notesIdx).toBeGreaterThan(equipmentIdx);
    expect(summaryIdx).toBeGreaterThan(notesIdx);
  });

  it("renders no Notes section at all when notesHtml is null", async () => {
    const html = await renderQuotationHtml(baseQuotationData({ notesHtml: null }));
    expect(html).not.toContain(">Notes<");
  });
});
