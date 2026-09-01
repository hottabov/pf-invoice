import { describe, it, expect } from "vitest";
import { pdfFilename, renderDocumentHtml, renderQuotationHtml } from "../src/lib/pdf";
import type { DocSheetData } from "../src/lib/sheet-data";
import type { QuotationData } from "../src/lib/quotation-data";

// Pure/rendering bits of the PDF pipeline only — `htmlToPdf` and
// `fileImageResolver` need a live Gotenberg / real uploaded files
// respectively and are code-verified rather than exercised here (see the
// plan's Task C note: no live Gotenberg in this environment).

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
    preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null },
    notes: null,
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
        preparedBy: { name: "Jane Author", email: "jane@example.com", phone: null },
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
      baseSheetData({ preparedBy: { name: null, email: "noname@example.com", phone: null }, notes: null })
    );
    expect(html).toContain("Prepared by: noname@example.com");
    // No trailing " · email" when there's no name to pair it with.
    expect(html).not.toContain("Prepared by: noname@example.com ·");
    // The rendered notes *element* is absent (the embedded <style> block
    // always defines the .pq-notes-title selector regardless, so this
    // checks for the element's opening tag, not the bare class name).
    expect(html).not.toContain('class="pq-notes-title"');
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
    preparedBy: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000" },
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

function baseDocSheetItem(overrides: Partial<QuotationData["items"][number]> = {}): QuotationData["items"][number] {
  return {
    id: "item-1",
    code: "X-5180",
    name: "X-5180 Cutting System",
    description: null,
    unitPrice: "175000.00",
    discountMode: "PERCENT",
    discountValue: null,
    total: "215425.00",
    image: null,
    lines: [],
    ...overrides,
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
      preparedBy: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000" },
    });
    const html = await renderQuotationHtml(data);
    expect(html).toContain("Prepared for");
    expect(html).toContain("Acme Pty Ltd");
    expect(html).toContain("Prepared by");
    expect(html).toContain("Jane Author");
    expect(html).toContain("0400 000 000");
    expect(html).not.toContain("Bill To");
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
