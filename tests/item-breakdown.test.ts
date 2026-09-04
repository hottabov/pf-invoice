import { describe, it, expect } from "vitest";
import { toSheetData, type ToSheetDataDoc, type ToSheetItemInput } from "../src/lib/sheet-data";

// Pure mapper — same no-DATABASE_URL discipline as tests/sheet-data.test.ts
// (see that file's header comment). Fixture conventions are deliberately
// reused/mirrored from there rather than reinvented.

function baseItem(overrides: Partial<ToSheetItemInput> = {}): ToSheetItemInput {
  return {
    id: "item-1",
    code: "EL-2020",
    name: "EasyLoader 2020",
    description: null,
    unitPrice: "1000.00",
    discountMode: "PERCENT",
    discountValue: null,
    discountAmount: "0.00",
    total: "1000.00",
    imageUrl: null,
    showImage: false,
    lines: [],
    isCredit: false,
    ...overrides,
  };
}

function baseDoc(overrides: Partial<ToSheetDataDoc> = {}): ToSheetDataDoc {
  return {
    status: "DRAFT",
    number: null,
    issueDate: new Date("2026-08-30T00:00:00.000Z"),
    validityDays: null,
    defaultValidityDays: 7,
    currency: "AUD",
    taxName: "GST",
    taxRate: "10",
    deliveryTerms: "DELIVERED",
    entitySnapshot: null,
    entityName: "Live Region Entity",
    entityLegalId: "ABN 111",
    entityAddress: "1 Live St",
    bankDetails: { bank: "Live Bank", bsb: "000 000", accountNo: "111 111" },
    logoUrl: null,
    footerText: "Live footer",
    discountMode: "PERCENT",
    discountValue: null,
    subtotal: "1000.00",
    discountAmount: "0.00",
    taxAmount: "100.00",
    total: "1100.00",
    company: null,
    contact: null,
    items: [],
    extraLines: [],
    author: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: null },
    notes: null,
    showItemPrices: true,
    showOptionPrices: true,
    heroImageUrl: null,
    ...overrides,
  };
}

describe("toSheetData — item.breakdown", () => {
  it("carries the base price separately from the subtotal", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          unitPrice: "175000.00",
          total: "186000.00",
          lines: [
            {
              id: "line-1",
              code: "OPT-1",
              name: "Winch upgrade",
              description: null,
              qty: 1,
              unitPrice: "11000.00",
            },
          ],
        }),
      ],
    });
    const sheet = toSheetData(doc);
    const breakdown = sheet.items[0].breakdown;

    expect(breakdown.basePrice).toBe("175000.00");
    expect(breakdown.subtotal).toBe("186000.00");
  });

  it("negates a credit item's base price to match its already-negative total (isCredit: true)", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          code: "TRADE-IN",
          unitPrice: "20000.00", // typed positive, per Product.isCredit's design
          total: "-20000.00", // already signed by the pricing engine (see getDocumentForBuilder)
          isCredit: true,
        }),
      ],
    });
    const breakdown = toSheetData(doc).items[0].breakdown;
    expect(breakdown.basePrice).toBe("-20000.00");
    expect(breakdown.subtotal).toBe("-20000.00");
  });

  it("always reports qty 1 for a product line", () => {
    const doc = baseDoc({ items: [baseItem()] });
    expect(toSheetData(doc).items[0].breakdown.qty).toBe(1);
  });

  it("nulls every option's lineTotal when option prices are hidden, but keeps the subtotal", () => {
    const doc = baseDoc({
      showOptionPrices: false,
      items: [
        baseItem({
          unitPrice: "175000.00",
          total: "186000.00",
          lines: [
            {
              id: "line-1",
              code: "OPT-1",
              name: "Winch upgrade",
              description: null,
              qty: 1,
              unitPrice: "11000.00",
            },
            {
              id: "line-2",
              code: "OPT-2",
              name: "Extra shelf",
              description: null,
              qty: 3,
              unitPrice: "25.50",
            },
          ],
        }),
      ],
    });
    const breakdown = toSheetData(doc).items[0].breakdown;

    expect(breakdown.options).toHaveLength(2);
    expect(breakdown.options.every((option) => option.lineTotal === null)).toBe(true);
    expect(breakdown.subtotal).toBe("186000.00");
  });

  it("resolves a fixed (AMOUNT) discount to its cash figure", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          discountMode: "AMOUNT",
          discountValue: "6000.00",
          discountAmount: "6000.00",
        }),
      ],
    });
    const breakdown = toSheetData(doc).items[0].breakdown;

    expect(breakdown.discount).toEqual({ mode: "AMOUNT", value: "6000.00", amount: "6000.00" });
  });

  it("reports both the typed percentage and the resolved cash amount for a PERCENT discount", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          unitPrice: "1000.00",
          discountMode: "PERCENT",
          discountValue: "10",
          discountAmount: "100.00",
          total: "900.00",
        }),
      ],
    });
    const breakdown = toSheetData(doc).items[0].breakdown;

    expect(breakdown.discount).toEqual({ mode: "PERCENT", value: "10", amount: "100.00" });
  });

  it("reports no discount when the item has none set", () => {
    const doc = baseDoc({ items: [baseItem({ discountValue: null })] });
    expect(toSheetData(doc).items[0].breakdown.discount).toBeNull();
  });

  it("carries each option's own code and (deduped) description through, same as an item's own", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            {
              id: "line-1",
              code: "OPT-1",
              name: "Winch upgrade",
              description: "Heavy-duty electric winch, 2000kg capacity",
              qty: 1,
              unitPrice: "11000.00",
            },
            {
              id: "line-2",
              code: "OPT-2",
              name: "Extra shelf",
              description: "Extra shelf", // redundant with name — deduped to null
              qty: 1,
              unitPrice: "25.50",
            },
            {
              id: "line-3",
              code: null,
              name: "No-code option",
              description: null,
              qty: 1,
              unitPrice: "10.00",
            },
          ],
        }),
      ],
    });
    const options = toSheetData(doc).items[0].breakdown.options;

    expect(options[0]).toMatchObject({
      code: "OPT-1",
      description: "Heavy-duty electric winch, 2000kg capacity",
    });
    expect(options[1]).toMatchObject({ code: "OPT-2", description: null });
    expect(options[2]).toMatchObject({ code: null, description: null });
  });
});
