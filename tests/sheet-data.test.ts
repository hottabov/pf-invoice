import { describe, it, expect } from "vitest";
import {
  buildItemBreakdown,
  dedupeDescription,
  formatBankDetails,
  toSheetData,
  type ToSheetDataDoc,
  type ToSheetItemInput,
  type ToSheetCompanyInput,
} from "../src/lib/sheet-data";
import { formatMoney } from "../src/lib/format";

function baseCompany(overrides: Partial<ToSheetCompanyInput> = {}): ToSheetCompanyInput {
  return {
    name: "Acme Pty Ltd",
    street: null,
    city: null,
    state: null,
    postcode: null,
    country: null,
    website: null,
    hasDeliveryAddress: false,
    deliveryStreet: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryPostcode: null,
    deliveryCountry: null,
    deliveryContactName: null,
    deliveryPhone: null,
    ...overrides,
  };
}

// Pure mapper — this file imports nothing from src/lib/queries/documents.ts
// or @/lib/db (see sheet-data.ts's header comment for why), so it never
// needs DATABASE_URL set, same as tests/finalize-validation.test.ts.

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
    ...overrides,
  };
}

describe("toSheetData — FINAL vs DRAFT entity source", () => {
  it("uses live region fields for a DRAFT (no entitySnapshot yet)", () => {
    const doc = baseDoc({ status: "DRAFT", entitySnapshot: null });
    const sheet = toSheetData(doc);

    expect(sheet.isDraft).toBe(true);
    expect(sheet.entity.name).toBe("Live Region Entity");
    expect(sheet.entity.legalId).toBe("ABN 111");
    expect(sheet.entity.address).toBe("1 Live St");
    expect(sheet.entity.footerText).toBe("Live footer");
  });

  it("prefers the frozen entitySnapshot over live region fields for a FINAL document", () => {
    const doc = baseDoc({
      status: "FINAL",
      number: "Q-AU-2026-001",
      // Deliberately different from the "live" entityName/entityAddress/etc.
      // above — if the mapper ever regressed to reading the live fields for
      // a FINAL doc, these assertions would catch it immediately.
      entitySnapshot: {
        entityName: "Frozen Snapshot Entity",
        entityLegalId: "ABN 999",
        entityAddress: "9 Frozen Ave",
        bankDetails: { bank: "Frozen Bank" },
        logoUrl: "/api/files/frozen-logo.png",
        footerText: "Frozen footer",
      },
    });
    const sheet = toSheetData(doc);

    expect(sheet.isDraft).toBe(false);
    expect(sheet.entity.name).toBe("Frozen Snapshot Entity");
    expect(sheet.entity.legalId).toBe("ABN 999");
    expect(sheet.entity.address).toBe("9 Frozen Ave");
    expect(sheet.entity.footerText).toBe("Frozen footer");
    expect(sheet.entity.bankDetails).toEqual([{ label: "Bank", value: "Frozen Bank" }]);
    expect(sheet.logo).toBe("/api/files/frozen-logo.png");
  });

  it("falls back to live region fields when a FINAL document's entitySnapshot is malformed", () => {
    // Defensive case: `entitySnapshot` is an opaque Json column with no
    // compile-time shape guarantee — a hand-edited or corrupted row must
    // never crash the renderer.
    const doc = baseDoc({ status: "FINAL", number: "Q-AU-2026-002", entitySnapshot: { garbage: true } });
    const sheet = toSheetData(doc);

    expect(sheet.entity.name).toBe("Live Region Entity");
  });

  it("ignores entitySnapshot for a DRAFT even if one is somehow present", () => {
    const doc = baseDoc({
      status: "DRAFT",
      entitySnapshot: { entityName: "Should Be Ignored", entityLegalId: null, entityAddress: null, bankDetails: null, logoUrl: null, footerText: null },
    });
    const sheet = toSheetData(doc);

    expect(sheet.entity.name).toBe("Live Region Entity");
  });
});

describe("toSheetData — validity date", () => {
  it("falls back to the org default validityDays for a quote with none of its own set (not yet finalized)", () => {
    const doc = baseDoc({
      validityDays: null,
      defaultValidityDays: 7,
      issueDate: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(toSheetData(doc).validityDate).toBe("06/09/2026");
  });

  it("is issueDate + validityDays, formatted DD/MM/YYYY, for a finalized quote", () => {
    const doc = baseDoc({
      status: "FINAL",
      number: "Q-AU-2026-001",
      issueDate: new Date("2026-08-30T00:00:00.000Z"),
      validityDays: 7,
    });
    const sheet = toSheetData(doc);

    expect(sheet.issueDate).toBe("30/08/2026");
    expect(sheet.validityDate).toBe("06/09/2026");
  });

  it("titles every document QUOTATION", () => {
    const data = toSheetData(baseDoc());
    expect(data.title).toBe("QUOTATION");
  });

  it("always shows the signature block", () => {
    const data = toSheetData(baseDoc());
    expect(data.showSignature).toBe(true);
  });
});

describe("toSheetData — client block", () => {
  it("is null when the document has no company yet", () => {
    expect(toSheetData(baseDoc({ company: null })).client).toBeNull();
  });

  it("builds address lines from the company's separate street/city/state/postcode/country fields", () => {
    const doc = baseDoc({
      company: baseCompany({
        name: "Acme Pty Ltd",
        street: "1 Example Rd",
        city: "Tullamarine",
        state: "VIC",
        postcode: "3043",
        country: "AU",
        website: "acme.example",
      }),
      contact: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "0400 000 000" },
    });
    const sheet = toSheetData(doc);

    expect(sheet.client).not.toBeNull();
    expect(sheet.client?.companyName).toBe("Acme Pty Ltd");
    expect(sheet.client?.addressLines).toEqual(["1 Example Rd", "Tullamarine, VIC, 3043", "Australia"]);
    expect(sheet.client?.website).toBe("acme.example");
    expect(sheet.client?.contactName).toBe("Jane Doe");
    expect(sheet.client?.contactEmail).toBe("jane@example.com");
    expect(sheet.client?.contactPhone).toBe("0400 000 000");
  });

  it("renders a legacy free-text country verbatim when it can't be normalized", () => {
    const doc = baseDoc({
      company: baseCompany({ street: "1 Example Rd", country: "Narnia" }),
    });
    expect(toSheetData(doc).client?.addressLines).toEqual(["1 Example Rd", "Narnia"]);
  });

  it("omits missing address fields instead of rendering empty lines", () => {
    const doc = baseDoc({
      company: baseCompany({ name: "No Address Co" }),
    });
    expect(toSheetData(doc).client?.addressLines).toEqual([]);
  });
});

describe("toSheetData — delivery address block", () => {
  it("is null when the document has no company yet", () => {
    expect(toSheetData(baseDoc({ company: null })).delivery).toBeNull();
  });

  it("is null when the company has no distinct delivery address", () => {
    const doc = baseDoc({ company: baseCompany({ hasDeliveryAddress: false }) });
    expect(toSheetData(doc).delivery).toBeNull();
  });

  it("builds the delivery block from the company's delivery* fields, with country displayed by name", () => {
    const doc = baseDoc({
      company: baseCompany({
        hasDeliveryAddress: true,
        deliveryStreet: "2 Factory Rd",
        deliveryCity: "Melbourne",
        deliveryState: "VIC",
        deliveryPostcode: "3000",
        deliveryCountry: "AU",
        deliveryContactName: "Sam Rivera",
        deliveryPhone: "+61393383471",
      }),
    });
    const sheet = toSheetData(doc);

    expect(sheet.delivery).not.toBeNull();
    expect(sheet.delivery?.addressLines).toEqual(["2 Factory Rd", "Melbourne, VIC, 3000", "Australia"]);
    expect(sheet.delivery?.contactName).toBe("Sam Rivera");
    expect(sheet.delivery?.phone).toBe("+61393383471");
  });
});

describe("toSheetData — items and lines", () => {
  it("carries the item discount mode and value through untouched, null when unset", () => {
    const withDiscount = toSheetData(
      baseDoc({ items: [baseItem({ discountMode: "PERCENT", discountValue: "15" })] })
    );
    expect(withDiscount.items[0].discountMode).toBe("PERCENT");
    expect(withDiscount.items[0].discountValue).toBe("15");

    const withAmount = toSheetData(
      baseDoc({ items: [baseItem({ discountMode: "AMOUNT", discountValue: "20000.00" })] })
    );
    expect(withAmount.items[0].discountMode).toBe("AMOUNT");
    expect(withAmount.items[0].discountValue).toBe("20000.00");

    const withoutDiscount = toSheetData(baseDoc({ items: [baseItem({ discountValue: null })] }));
    expect(withoutDiscount.items[0].discountValue).toBeNull();
  });

  it("computes each option line's lineTotal as qty * unitPrice", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            { id: "line-1", code: "OPT-1", name: "Extra shelf", description: null, qty: 3, unitPrice: "25.50" },
          ],
        }),
      ],
    });
    const sheet = toSheetData(doc);
    expect(sheet.items[0].lines[0].lineTotal).toBe("76.50");
  });

  it("computes extra (document-level) line totals the same way", () => {
    const doc = baseDoc({
      extraLines: [{ id: "extra-1", code: null, name: "Delivery", description: null, qty: 2, unitPrice: "50" }],
    });
    expect(toSheetData(doc).extraLines[0].lineTotal).toBe("100.00");
  });

  it("only shows an item image when showImage is true AND an imageUrl is present", () => {
    const noFlag = toSheetData(baseDoc({ items: [baseItem({ showImage: false, imageUrl: "/api/files/a.jpg" })] }));
    expect(noFlag.items[0].image).toBeNull();

    const noUrl = toSheetData(baseDoc({ items: [baseItem({ showImage: true, imageUrl: null })] }));
    expect(noUrl.items[0].image).toBeNull();

    const both = toSheetData(baseDoc({ items: [baseItem({ showImage: true, imageUrl: "/api/files/a.jpg" })] }));
    expect(both.items[0].image).toBe("/api/files/a.jpg");
  });

  it("runs a shown image through the caller-supplied resolver", () => {
    const doc = baseDoc({ items: [baseItem({ showImage: true, imageUrl: "/api/files/a.jpg" })] });
    const sheet = toSheetData(doc, (url) => `data:image/jpeg;base64,RESOLVED(${url})`);
    expect(sheet.items[0].image).toBe("data:image/jpeg;base64,RESOLVED(/api/files/a.jpg)");
  });

  it("hides the image when the resolver declines to produce one", () => {
    const doc = baseDoc({ items: [baseItem({ showImage: true, imageUrl: "/api/files/missing.jpg" })] });
    const sheet = toSheetData(doc, () => undefined);
    expect(sheet.items[0].image).toBeNull();
  });

  it("only shows an extra line's image when showImage is true AND an imageUrl is present", () => {
    const noFlag = toSheetData(
      baseDoc({
        extraLines: [
          { id: "extra-1", code: null, name: "Trade-in", description: null, qty: 1, unitPrice: "-500", showImage: false, imageUrl: "/api/files/a.jpg" },
        ],
      })
    );
    expect(noFlag.extraLines[0].image).toBeNull();

    const noUrl = toSheetData(
      baseDoc({
        extraLines: [
          { id: "extra-1", code: null, name: "Trade-in", description: null, qty: 1, unitPrice: "-500", showImage: true, imageUrl: null },
        ],
      })
    );
    expect(noUrl.extraLines[0].image).toBeNull();

    const both = toSheetData(
      baseDoc({
        extraLines: [
          { id: "extra-1", code: null, name: "Trade-in", description: null, qty: 1, unitPrice: "-500", showImage: true, imageUrl: "/api/files/a.jpg" },
        ],
      })
    );
    expect(both.extraLines[0].image).toBe("/api/files/a.jpg");
  });
});

describe("toSheetData — a $0 manual price prints, it is not swallowed as absent", () => {
  // John: "if I give it away for zero dollars... I give them back zero
  // dollars" — the customer has to be able to see they did not pay for it,
  // which means a $0 line must render "$0", never nothing.
  it("carries a $0 item price through to unitPrice/total exactly, not null or omitted", () => {
    const sheet = toSheetData(baseDoc({ items: [baseItem({ unitPrice: "0.00", total: "0.00" })] }));
    const item = sheet.items[0];
    expect(item.unitPrice).toBe("0.00");
    expect(item.total).toBe("0.00");
    expect(item.breakdown.basePrice).toBe("0.00");
    expect(item.breakdown.subtotal).toBe("0.00");
  });

  it("formats a $0 item total as the literal string \"$0\" (formatMoney is never gated by truthiness of the amount)", () => {
    const sheet = toSheetData(baseDoc({ items: [baseItem({ unitPrice: "0.00", total: "0.00" })] }));
    const item = sheet.items[0];
    // Every renderer (document-sheet.tsx, quotation-sheet.tsx,
    // items-list.tsx) gates a price on an explicit boolean/null check
    // (showPrices, itemPriceVisible, lineTotal !== null) — never on the
    // amount's own truthiness — so this must print "$0", not an empty cell.
    expect(formatMoney(item.total, sheet.totals.currency)).toBe("$0");
    expect(formatMoney(item.breakdown.basePrice, sheet.totals.currency)).toBe("$0");
  });

  it("formats a $0 option line the same way", () => {
    const sheet = toSheetData(
      baseDoc({
        items: [
          baseItem({
            lines: [{ id: "line-1", code: "OPT-1", name: "Free upgrade", description: null, qty: 1, unitPrice: "0.00" }],
          }),
        ],
      })
    );
    const line = sheet.items[0].lines[0];
    expect(line.lineTotal).toBe("0.00");
    expect(formatMoney(line.lineTotal, sheet.totals.currency)).toBe("$0");
  });

  it("buildItemBreakdown never treats a $0 basePrice/option lineTotal as absent (null)", () => {
    const breakdown = buildItemBreakdown(
      baseItem({
        unitPrice: "0.00",
        total: "0.00",
        lines: [{ id: "line-1", code: "OPT-1", name: "Free upgrade", description: null, qty: 1, unitPrice: "0.00" }],
      }),
      true // showOptionPrices
    );
    expect(breakdown.basePrice).toBe("0.00");
    expect(breakdown.basePrice).not.toBeNull();
    expect(breakdown.options[0].lineTotal).toBe("0.00");
    expect(breakdown.options[0].lineTotal).not.toBeNull();
  });
});

describe("dedupeDescription", () => {
  it("passes null straight through", () => {
    expect(dedupeDescription("EasyLoader 2020", null)).toBeNull();
  });

  it("drops a description that exactly equals the name", () => {
    expect(dedupeDescription("EasyLoader 2020", "EasyLoader 2020")).toBeNull();
  });

  it("drops a description that is a substring of the name", () => {
    expect(dedupeDescription("EasyLoader 2020 Heavy Duty Winch", "EasyLoader 2020")).toBeNull();
  });

  it("drops a name that is a substring of the description", () => {
    expect(dedupeDescription("EasyLoader 2020", "EasyLoader 2020 Heavy Duty Winch")).toBeNull();
  });

  it("keeps a description that is genuinely distinct from the name", () => {
    expect(dedupeDescription("EasyLoader 2020", "Ships with mounting bracket")).toBe(
      "Ships with mounting bracket"
    );
  });
});

describe("toSheetData — item/line description dedupe", () => {
  it("omits the item description when it duplicates the item name", () => {
    const doc = baseDoc({ items: [baseItem({ name: "EasyLoader 2020", description: "EasyLoader 2020" })] });
    expect(toSheetData(doc).items[0].description).toBeNull();
  });

  it("keeps a genuinely distinct item description", () => {
    const doc = baseDoc({
      items: [baseItem({ name: "EasyLoader 2020", description: "Ships with mounting bracket" })],
    });
    expect(toSheetData(doc).items[0].description).toBe("Ships with mounting bracket");
  });

  it("omits an option line description when it duplicates the line name", () => {
    const doc = baseDoc({
      items: [
        baseItem({
          lines: [
            { id: "line-1", code: "OPT-1", name: "Extra shelf", description: "Extra shelf", qty: 1, unitPrice: "25" },
          ],
        }),
      ],
    });
    expect(toSheetData(doc).items[0].lines[0].description).toBeNull();
  });
});

describe("toSheetData — totals passthrough", () => {
  it("passes the document totals straight through", () => {
    const doc = baseDoc({
      subtotal: "1000.00",
      discountMode: "PERCENT",
      discountValue: "10",
      discountAmount: "100.00",
      taxAmount: "90.00",
      total: "990.00",
      currency: "USD",
      taxName: "Sales Tax",
      taxRate: "0",
    });
    const sheet = toSheetData(doc);
    expect(sheet.totals).toEqual({
      currency: "USD",
      subtotal: "1000.00",
      discountMode: "PERCENT",
      discountValue: "10",
      discountAmount: "100.00",
      taxName: "Sales Tax",
      taxRate: "0",
      taxAmount: "90.00",
      total: "990.00",
      deliveryTerms: "DELIVERED",
    });
  });

  it("carries deliveryTerms straight through, DELIVERED or EX_WORKS", () => {
    expect(toSheetData(baseDoc({ deliveryTerms: "DELIVERED" })).totals.deliveryTerms).toBe("DELIVERED");
    expect(toSheetData(baseDoc({ deliveryTerms: "EX_WORKS" })).totals.deliveryTerms).toBe("EX_WORKS");
  });
});

describe("toSheetData — preparedBy / notes", () => {
  it("maps the document author straight through to preparedBy", () => {
    const doc = baseDoc({
      author: { name: "Jane Author", email: "jane@example.com", phone: "0400 000 000", avatar: null },
    });
    const sheet = toSheetData(doc);
    expect(sheet.preparedBy).toEqual({
      name: "Jane Author",
      email: "jane@example.com",
      phone: "0400 000 000",
      avatar: null,
    });
  });

  it("carries a null author name/phone through untouched", () => {
    const doc = baseDoc({ author: { name: null, email: "noname@example.com", phone: null, avatar: null } });
    const sheet = toSheetData(doc);
    expect(sheet.preparedBy).toEqual({ name: null, email: "noname@example.com", phone: null, avatar: null });
  });

  it("resolves the author's avatar through resolveImage, like the logo", () => {
    const doc = baseDoc({
      author: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: "/api/files/a.jpg" },
    });
    const sheet = toSheetData(doc, (url) => `data:image/jpeg;base64,RESOLVED(${url})`);
    expect(sheet.preparedBy.avatar).toBe("data:image/jpeg;base64,RESOLVED(/api/files/a.jpg)");
  });

  it("renders no avatar when the author has none", () => {
    const doc = baseDoc({ author: { name: "Jane Author", email: "jane@example.com", phone: null, avatar: null } });
    const sheet = toSheetData(doc);
    expect(sheet.preparedBy.avatar).toBeNull();
  });

  it("passes notes through untouched, null when unset", () => {
    expect(toSheetData(baseDoc({ notes: "Freeform remarks" })).notes).toBe("Freeform remarks");
    expect(toSheetData(baseDoc({ notes: null })).notes).toBeNull();
  });
});

describe("toSheetData — validityDate default fallback", () => {
  it("uses the org default when validityDays is null", () => {
    const doc = baseDoc({
      status: "DRAFT",
      validityDays: null,
      defaultValidityDays: 7,
      issueDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(toSheetData(doc).validityDate).toBe("08/01/2026");
  });

  it("uses the document's own validityDays when set, ignoring the default", () => {
    const doc = baseDoc({
      status: "DRAFT",
      validityDays: 30,
      defaultValidityDays: 7,
      issueDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(toSheetData(doc).validityDate).toBe("31/01/2026");
  });

  it("the two produce different dates for the same issueDate", () => {
    const withDefault = toSheetData(
      baseDoc({ validityDays: null, defaultValidityDays: 7, issueDate: new Date("2026-01-01T00:00:00.000Z") })
    ).validityDate;
    const withOwnValue = toSheetData(
      baseDoc({ validityDays: 30, defaultValidityDays: 7, issueDate: new Date("2026-01-01T00:00:00.000Z") })
    ).validityDate;
    expect(withDefault).not.toBe(withOwnValue);
  });
});

describe("formatBankDetails", () => {
  it("joins each row as 'Label: value', one per line, in order", () => {
    const text = formatBankDetails([
      { label: "Bank", value: "ANZ Westfield" },
      { label: "BSB", value: "013 442" },
      { label: "Account No.", value: "4405 63886" },
    ]);
    expect(text).toBe("Bank: ANZ Westfield\nBSB: 013 442\nAccount No.: 4405 63886");
  });

  it("returns an empty string for no rows", () => {
    expect(formatBankDetails([])).toBe("");
  });

  it("shares the same label mapping toSheetData uses for entity.bankDetails", () => {
    const doc = baseDoc({ bankDetails: { bank: "Live Bank", bsb: "000 000", accountNo: "111 111" } });
    const sheet = toSheetData(doc);
    expect(formatBankDetails(sheet.entity.bankDetails)).toBe("Bank: Live Bank\nBSB: 000 000\nAccount No.: 111 111");
  });
});
