import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildPatches, resolveForm } from "../src/lib/production-forms/resolve";
import { patchWorkbook } from "../src/lib/production-forms/xlsx-patch";
import { readTemplate } from "../src/lib/production-forms/render";
import type { FormContext } from "../src/lib/production-forms/types";

const ctx: FormContext = {
  distributorName: "Pathfinder Australia Pty Ltd",
  authorName: "Vadym H",
  company: {
    name: "Relaxvanguard",
    addressLines: ["12 Industrial Drive", "Dandenong South VIC 3175"],
    industry: "Automotive",
  },
  contact: { fullName: "John Smith", position: "Manager", phone: "+61 3 9999 0000", email: "j@e.com" },
  deliveryAddressLines: ["12 Industrial Drive"],
  softwareCodes: ["PTW(I)", "ANT-V6"],
  item: {
    id: "item1",
    code: "M5220",
    name: "M-Series",
    lineGroup: 1,
    spec: { ui: "+Y", knifeSize: "1.5x5.0", drills: { required: true, detail: "2 x 6mm" } },
    optionCodes: ["MTS", "ABR-M"],
    optionAttributes: { MTS: { metres: 14 } },
    optionQtys: [
      { code: "MTS", qty: 1 },
      { code: "ABR-M", qty: 1 },
    ],
  },
};

describe("production form pipeline", () => {
  it("produces a workbook carrying every expected value and tick", () => {
    const spec = resolveForm("M5220")!;
    const patched = patchWorkbook(readTemplate(spec.template), spec.sheetPath, buildPatches(spec, ctx));
    const xml = strFromU8(unzipSync(patched)[spec.sheetPath]);

    expect(xml).toContain("Pathfinder Australia Pty Ltd");
    expect(xml).toContain("Relaxvanguard");
    expect(xml).toContain("Automotive");
    expect(xml).toContain("2 x 6mm");
    expect(xml).toContain("14");

    for (const cell of ["J25", "J29", "J33", "J52", "F68", "D72", "J64"]) {
      expect(xml, `expected a tick in ${cell}`).toMatch(
        new RegExp(`<c r="${cell}"[^>]*t="inlineStr"><is><t[^>]*>X</t>`),
      );
    }
  });

  it("leaves untouched every box the quote did not ask for", () => {
    const spec = resolveForm("M5220")!;
    const patched = patchWorkbook(readTemplate(spec.template), spec.sheetPath, buildPatches(spec, ctx));
    const xml = strFromU8(unzipSync(patched)[spec.sheetPath]);

    // H25 is model M3, O25 is M10 -- neither was ordered.
    for (const cell of ["H25", "O25", "L25"]) {
      expect(xml).not.toMatch(new RegExp(`<c r="${cell}"[^>]*t="inlineStr"`));
    }
  });
});
