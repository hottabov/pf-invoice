import { describe, it, expect } from "vitest";
import { pdfFilename, renderDocumentHtml } from "../src/lib/pdf";
import type { DocSheetData } from "../src/lib/sheet-data";

// Pure/rendering bits of the PDF pipeline only — `htmlToPdf` and
// `fileImageResolver` need a live Gotenberg / real uploaded files
// respectively and are code-verified rather than exercised here (see the
// plan's Task C note: no live Gotenberg in this environment).

describe("pdfFilename", () => {
  it("uses the document number when present", () => {
    expect(pdfFilename("INV-AU-2026-001", "doc-1")).toBe("INV-AU-2026-001.pdf");
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
    type: "INVOICE",
    title: "INVOICE",
    isDraft: false,
    number: "INV-AU-2026-001",
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
    items: [],
    extraLines: [],
    totals: {
      currency: "AUD",
      subtotal: "1000.00",
      discountPct: null,
      discountAmount: "0.00",
      taxName: "GST",
      taxRate: "10",
      taxAmount: "100.00",
      total: "1100.00",
    },
    showSignature: false,
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
    expect(html).toContain("INV-AU-2026-001");
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
});
