import { describe, it, expect } from "vitest";
import { buildFormContexts, companyAddressLines } from "../src/lib/production-forms/context";

const baseDocument = {
  id: "doc1",
  number: "Q-AU-2026-001",
  entitySnapshot: { entityName: "Pathfinder Australia Pty Ltd" },
  region: { entityName: "Pathfinder Australia Pty Ltd" },
  author: { name: "Vadym H" },
  company: {
    name: "Relaxvanguard",
    street: "12 Industrial Drive",
    city: "Dandenong South",
    state: "VIC",
    postcode: "3175",
    country: "AU",
    deliverySameAsMain: true,
    deliveryStreet: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryPostcode: null,
    deliveryCountry: null,
    industry: { name: "Automotive" },
  },
  contact: { firstName: "John", lastName: "Smith", position: "Manager", phone: "+61 3", email: "j@e.com" },
  items: [
    {
      id: "item1",
      code: "M5220",
      name: "M-Series",
      lineGroup: 1,
      productionSpec: { ui: "+Y" },
      lines: [
        { kind: "OPTION", code: "MTS", name: "Machine Transfer System", qty: 1, attributes: { metres: 14 } },
        { kind: "OPTION", code: "ABR-M", name: "Air Brush", qty: 1, attributes: null },
      ],
    },
    {
      id: "item2",
      code: "PTW(I)",
      name: "PathWorks Integrated",
      lineGroup: 1,
      productionSpec: null,
      lines: [],
    },
  ],
  lines: [],
};

describe("companyAddressLines", () => {
  it("joins city, state and postcode onto one line", () => {
    expect(companyAddressLines(baseDocument.company)).toEqual([
      "12 Industrial Drive",
      "Dandenong South VIC 3175",
      "Australia",
    ]);
  });

  it("skips absent parts rather than leaving gaps", () => {
    const lines = companyAddressLines({ ...baseDocument.company, state: null, postcode: null });
    expect(lines).toEqual(["12 Industrial Drive", "Dandenong South", "Australia"]);
  });
});

describe("buildFormContexts", () => {
  it("builds one context per item that has a form", () => {
    const contexts = buildFormContexts(baseDocument as never);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].item.code).toBe("M5220");
  });

  it("takes the distributor from the frozen entity snapshot", () => {
    expect(buildFormContexts(baseDocument as never)[0].distributorName).toBe(
      "Pathfinder Australia Pty Ltd",
    );
  });

  it("falls back to the live region entity when there is no snapshot", () => {
    const doc = { ...baseDocument, entitySnapshot: null };
    expect(buildFormContexts(doc as never)[0].distributorName).toBe("Pathfinder Australia Pty Ltd");
  });

  it("collects option codes and attributes onto the item", () => {
    const item = buildFormContexts(baseDocument as never)[0].item;
    expect(item.optionCodes).toEqual(["MTS", "ABR-M"]);
    expect(item.optionAttributes["MTS"]).toEqual({ metres: 14 });
  });

  it("pairs each option code with its sold quantity", () => {
    const item = buildFormContexts(baseDocument as never)[0].item;
    expect(item.optionQtys).toEqual([
      { code: "MTS", qty: 1 },
      { code: "ABR-M", qty: 1 },
    ]);
  });

  it("carries a quantity greater than one through, not just presence", () => {
    const doc = {
      ...baseDocument,
      items: [
        {
          ...baseDocument.items[0],
          lines: [
            { kind: "OPTION", code: "EL-2420 Additional 1.2M lengths", name: "Additional 1.2M lengths", qty: 6, attributes: null },
          ],
        },
        baseDocument.items[1],
      ],
    };
    const item = buildFormContexts(doc as never)[0].item;
    expect(item.optionQtys).toEqual([{ code: "EL-2420 Additional 1.2M lengths", qty: 6 }]);
  });

  it("exposes items without a form as software codes", () => {
    expect(buildFormContexts(baseDocument as never)[0].softwareCodes).toContain("PTW(I)");
  });

  it("reuses the main address as delivery when they are the same", () => {
    const ctx = buildFormContexts(baseDocument as never)[0];
    expect(ctx.deliveryAddressLines).toEqual(ctx.company.addressLines);
  });
});
