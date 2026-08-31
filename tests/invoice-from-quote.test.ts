import { describe, it, expect } from "vitest";
import { buildInvoiceCopyPayload, type QuoteCopyItem, type QuoteCopyLine, type QuoteForCopy } from "../src/lib/invoice-from-quote";

// Pure module — no @/lib/db import (see invoice-from-quote.ts's header
// comment), so this never needs DATABASE_URL set, same as
// tests/quotation-data.test.ts and tests/sheet-data.test.ts.

function baseLine(overrides: Partial<QuoteCopyLine> = {}): QuoteCopyLine {
  return {
    kind: "OPTION",
    refId: "clopt00000000000000000001",
    code: "MTS",
    name: "Machine Transfer System",
    description: null,
    qty: 1,
    unitPrice: "5000.00",
    attributes: { metres: 4 },
    showImage: false,
    sortOrder: 0,
    ...overrides,
  };
}

function baseItem(overrides: Partial<QuoteCopyItem> = {}): QuoteCopyItem {
  return {
    productId: "clprod0000000000000000001",
    sortOrder: 0,
    code: "M5180",
    name: "M5180 Cutting System",
    description: "Full spec cutting system",
    unitPrice: "175000.00",
    discountPct: "10",
    serialNumber: "SN-001",
    showImage: true,
    imageUrl: "/api/files/m5180.jpg",
    lines: [baseLine()],
    ...overrides,
  };
}

function baseQuote(overrides: Partial<QuoteForCopy> = {}): QuoteForCopy {
  return {
    id: "cldoc00000000000000000001",
    companyId: "clcompany000000000000001",
    contactId: "clcontact000000000000001",
    regionId: "clregion0000000000000001",
    currency: "AUD",
    taxName: "GST",
    taxRate: "10",
    discountPct: null,
    notes: "Handle with care",
    showItemPrices: true,
    showOptionPrices: false,
    items: [baseItem()],
    lines: [
      baseLine({
        kind: "CUSTOM",
        refId: null,
        code: null,
        name: "Delivery",
        unitPrice: "500.00",
        sortOrder: 0,
      }),
    ],
    ...overrides,
  };
}

describe("buildInvoiceCopyPayload", () => {
  it("sets type INVOICE and status DRAFT regardless of the source quote's own status", () => {
    const payload = buildInvoiceCopyPayload(baseQuote());
    expect(payload.document.type).toBe("INVOICE");
    expect(payload.document.status).toBe("DRAFT");
  });

  it("sets sourceQuoteId to the source quote's id", () => {
    const payload = buildInvoiceCopyPayload(baseQuote({ id: "cldoc00000000000000000099" }));
    expect(payload.document.sourceQuoteId).toBe("cldoc00000000000000000099");
  });

  it("carries over the quote's business/pricing/catalog fields as-is", () => {
    const quote = baseQuote({
      companyId: "clcompany000000000000009",
      contactId: "clcontact000000000000009",
      regionId: "clregion0000000000000009",
      currency: "USD",
      taxName: "Sales Tax",
      taxRate: "7.25",
      discountPct: "5",
      notes: "Rush order",
      showItemPrices: false,
      showOptionPrices: true,
    });
    const payload = buildInvoiceCopyPayload(quote);
    expect(payload.document).toMatchObject({
      companyId: "clcompany000000000000009",
      contactId: "clcontact000000000000009",
      regionId: "clregion0000000000000009",
      currency: "USD",
      taxName: "Sales Tax",
      taxRate: "7.25",
      discountPct: "5",
      notes: "Rush order",
      showItemPrices: false,
      showOptionPrices: true,
    });
  });

  it("never sets authorId — that's the caller's own session, not a copied field", () => {
    const payload = buildInvoiceCopyPayload(baseQuote());
    expect(payload.document).not.toHaveProperty("authorId");
  });

  it("copies every item with its own catalog snapshot fields", () => {
    const payload = buildInvoiceCopyPayload(
      baseQuote({ items: [baseItem({ code: "X-450", name: "X-Calibre 450" }), baseItem({ code: "M999", sortOrder: 1 })] })
    );
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({ code: "X-450", name: "X-Calibre 450" });
    expect(payload.items[1]).toMatchObject({ code: "M999", sortOrder: 1 });
  });

  it("copies each item's own OPTION lines under it", () => {
    const payload = buildInvoiceCopyPayload(
      baseQuote({
        items: [
          baseItem({
            lines: [baseLine({ code: "MTS" }), baseLine({ code: "HFV", refId: "clopt00000000000000000002" })],
          }),
        ],
      })
    );
    expect(payload.items[0].lines).toHaveLength(2);
    expect(payload.items[0].lines.map((l) => l.code)).toEqual(["MTS", "HFV"]);
  });

  it("copies document-level lines into extraLines, separate from item lines", () => {
    const payload = buildInvoiceCopyPayload(
      baseQuote({ lines: [baseLine({ kind: "CUSTOM", code: null, name: "Install", unitPrice: "1200.00" })] })
    );
    expect(payload.extraLines).toHaveLength(1);
    expect(payload.extraLines[0]).toMatchObject({ kind: "CUSTOM", name: "Install", unitPrice: "1200.00" });
  });

  it("strips ids — no item or line in the payload carries an id from the source quote", () => {
    const payload = buildInvoiceCopyPayload(baseQuote());
    for (const item of payload.items) {
      expect(item).not.toHaveProperty("id");
      for (const line of item.lines) {
        expect(line).not.toHaveProperty("id");
      }
    }
    for (const line of payload.extraLines) {
      expect(line).not.toHaveProperty("id");
    }
    expect(payload.document).not.toHaveProperty("id");
  });

  it("returns an empty items/extraLines array for a quote with none", () => {
    const payload = buildInvoiceCopyPayload(baseQuote({ items: [], lines: [] }));
    expect(payload.items).toEqual([]);
    expect(payload.extraLines).toEqual([]);
  });
});
