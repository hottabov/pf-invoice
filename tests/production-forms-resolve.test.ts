import { describe, it, expect } from "vitest";
import {
  resolveForm,
  specSchemaForCode,
  buildPatches,
  missingRequirements,
  unmatchedOptionCodes,
} from "../src/lib/production-forms/resolve";
import type { FormContext, FormItem } from "../src/lib/production-forms/types";

function item(overrides: Partial<FormItem> = {}): FormItem {
  return {
    id: "item1",
    code: "M5220",
    name: "M-Series",
    lineGroup: 1,
    spec: { ui: "+Y", knifeSize: "1.5x5.0", drills: { required: false, detail: "" } },
    optionCodes: [],
    optionAttributes: {},
    optionQtys: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<FormContext> = {}): FormContext {
  return {
    distributorName: "Pathfinder Australia Pty Ltd",
    authorName: "Vadym H",
    company: { name: "Relaxvanguard", addressLines: ["12 Industrial Dr"], industry: "Automotive" },
    contact: { fullName: "John Smith", position: "Manager", phone: "+61", email: "j@example.com" },
    deliveryAddressLines: ["12 Industrial Dr"],
    softwareCodes: [],
    item: item(),
    ...overrides,
  };
}

describe("resolveForm", () => {
  it("matches every M-Series code", () => {
    for (const code of ["M3180", "M5220", "M7300", "M10390"]) {
      expect(resolveForm(code)?.id).toBe("m-series");
    }
  });

  it("does not match a software product", () => {
    expect(resolveForm("PTW(I)")).toBeNull();
  });

  it("does not match an unknown code", () => {
    expect(resolveForm("NOPE-1")).toBeNull();
  });
});

describe("specSchemaForCode", () => {
  it("returns the M-Series schema for an M-Series code", () => {
    expect(specSchemaForCode("M5220")).toBeDefined();
  });

  it("returns null for a code with no form", () => {
    expect(specSchemaForCode("SERVICE")).toBeNull();
  });
});

describe("buildPatches", () => {
  it("ticks the model and width boxes for the item code", () => {
    const patches = buildPatches(resolveForm("M5220")!, ctx());
    const cells = patches.map((p) => p.cell);
    expect(cells).toContain("J25");
    expect(cells).toContain("J29");
    expect(cells).not.toContain("H25");
  });

  it("writes X into every tick cell", () => {
    const patches = buildPatches(resolveForm("M5220")!, ctx());
    expect(patches.find((p) => p.cell === "J25")?.value).toBe("X");
  });

  it("ticks a suffixed catalog option against its base-code box", () => {
    const patches = buildPatches(
      resolveForm("M5220")!,
      ctx({ item: item({ optionCodes: ["ABR-M", "HDC-M"] }) }),
    );
    const cells = patches.map((p) => p.cell);
    expect(cells).toContain("J52");
    expect(cells).toContain("F52");
  });

  it("ticks PathWorks modules only alongside the integrated PathWorks", () => {
    const withIntegrated = buildPatches(
      resolveForm("M5220")!,
      ctx({ softwareCodes: ["PTW(I)", "ANT-V6"] }),
    ).map((p) => p.cell);
    expect(withIntegrated).toContain("J64");

    const withStandalone = buildPatches(
      resolveForm("M5220")!,
      ctx({ softwareCodes: ["PTW(S)", "ANT-V6"] }),
    ).map((p) => p.cell);
    expect(withStandalone).not.toContain("J64");
  });

  it("omits value cells whose source is empty", () => {
    const patches = buildPatches(
      resolveForm("M5220")!,
      ctx({ company: { name: "Relaxvanguard", addressLines: [], industry: null } }),
    );
    const cells = patches.map((p) => p.cell);
    expect(cells).not.toContain("H14");
    expect(cells).not.toContain("H21");
  });

  it("writes an option attribute as a string", () => {
    const patches = buildPatches(
      resolveForm("M5220")!,
      ctx({ item: item({ optionCodes: ["MTS"], optionAttributes: { MTS: { metres: 14 } } }) }),
    );
    expect(patches.find((p) => p.cell === "M73")?.value).toBe("14");
  });
});

describe("unmatchedOptionCodes", () => {
  it("reports nothing when every option has a box", () => {
    const context = ctx({ item: item({ optionCodes: ["ABR-M", "HDC-M", "MTS"] }) });
    expect(unmatchedOptionCodes(resolveForm("M5220")!, context)).toEqual([]);
  });

  it("reports an option the form has no box for", () => {
    const context = ctx({ item: item({ optionCodes: ["ABR-M", "EDS-500"] }) });
    expect(unmatchedOptionCodes(resolveForm("M5220")!, context)).toEqual(["EDS-500"]);
  });

  it("does not treat a tick driven by the production spec as covering an option", () => {
    const context = ctx({ item: item({ optionCodes: ["1.0mm dia punch"] }) });
    expect(unmatchedOptionCodes(resolveForm("M5220")!, context)).toEqual(["1.0mm dia punch"]);
  });
});

describe("missingRequirements", () => {
  it("reports nothing for a complete spec", () => {
    expect(missingRequirements(resolveForm("M5220")!, item().spec)).toEqual([]);
  });

  it("reports every requirement when the spec is empty", () => {
    // "ui" is not among them: screenSideSchema defaults to -Y, so it can
    // never be missing.
    expect(missingRequirements(resolveForm("M5220")!, {})).toEqual(["knifeSize", "drills"]);
  });

  it("reports drills when they are required with no detail", () => {
    const spec = { ui: "+Y", knifeSize: "1.5x5.0", drills: { required: true, detail: "" } };
    expect(missingRequirements(resolveForm("M5220")!, spec)).toEqual(["drills"]);
  });
});

describe("EasyLoader form", () => {
  const elItem = {
    id: "i", code: "EL-2420", name: "EasyLoader 2420", lineGroup: 1,
    spec: { ui: "-Y", usage: "onload", sections: [{ lengthM: 2.4, surface: "static" }] },
    optionCodes: [], optionAttributes: {}, optionQtys: [],
  };

  it("matches EasyLoader codes only", () => {
    expect(resolveForm("EL-2420")?.id).toBe("easyloader");
    expect(resolveForm("EF-2420")?.id).not.toBe("easyloader");
  });

  it("ticks the printed width box for a standard model", () => {
    const cells = buildPatches(resolveForm("EL-2420")!, ctx({ item: elItem as never })).map((p) => p.cell);
    expect(cells).toContain("I33");
    expect(cells).not.toContain("I35");
  });

  it("ticks Custom and rewrites the label for a non-standard width", () => {
    const item = { ...elItem, code: "EL-3220", spec: { ...elItem.spec, customWidthMm: 3220 } };
    const patches = buildPatches(resolveForm("EL-3220")!, ctx({ item: item as never }));
    expect(patches.find((p) => p.cell === "I35")?.value).toBe("X");
    expect(patches.find((p) => p.cell === "J35")?.value).toContain("3220mm");
  });

  it("writes each table section length and surface", () => {
    const item = {
      ...elItem,
      spec: {
        ...elItem.spec,
        sections: [
          { lengthM: 2.4, surface: "static" },
          { lengthM: 1.2, surface: "conveyor" },
        ],
      },
    };
    const patches = buildPatches(resolveForm("EL-2420")!, ctx({ item: item as never }));
    expect(patches.find((p) => p.cell === "I43")?.value).toBe("2.4");
    expect(patches.find((p) => p.cell === "I45")?.value).toBe("X");
    expect(patches.find((p) => p.cell === "I47")?.value).toBe("1.2");
    expect(patches.find((p) => p.cell === "K49")?.value).toBe("X");
  });

  it("requires only usage -- screen side defaults and an empty section list means one undivided table", () => {
    expect(missingRequirements(resolveForm("EL-2420")!, {})).toEqual(["usage"]);
  });

  it("ticks the roll holder box from the option, regardless of the width-specific catalog code", () => {
    // EL-2020's code carries a stray "#" that EL-2420's does not -- matching
    // on "Roll Holder" avoids depending on that inconsistency.
    const withStray = { ...elItem, optionCodes: ["EL-2020 #ST620-2020 Roll Holder- Used to dispense perforated underlay paper. Mounted rear of EasyLoader on lower leg."] };
    const withoutStray = { ...elItem, optionCodes: ["EL-2420 ST620-2420 Roll Holder- Used to dispense perforated underlay paper. Mounted rear of EasyLoader on lower leg."] };
    expect(buildPatches(resolveForm("EL-2420")!, ctx({ item: withStray as never })).map((p) => p.cell)).toContain("D69");
    expect(buildPatches(resolveForm("EL-2420")!, ctx({ item: withoutStray as never })).map((p) => p.cell)).toContain("D69");
  });

  it("ticks the crate box from the Crate-EL option", () => {
    const item = { ...elItem, optionCodes: ["Crate-EL"] };
    const cells = buildPatches(resolveForm("EL-2420")!, ctx({ item: item as never })).map((p) => p.cell);
    expect(cells).toContain("D71");
  });

  it("does not report the crate or roll holder as unmapped options", () => {
    const item = {
      ...elItem,
      optionCodes: ["Crate-EL", "EL-2420 ST620-2420 Roll Holder- Used to dispense perforated underlay paper. Mounted rear of EasyLoader on lower leg."],
    };
    expect(unmatchedOptionCodes(resolveForm("EL-2420")!, ctx({ item: item as never }))).toEqual([]);
  });

  it("prints the total table length at M54 from the options actually sold", () => {
    const item = {
      ...elItem,
      optionQtys: [
        { code: "EL-2420 Additional 1.2M lengths", qty: 6 },
        { code: "EL-2420 Static table 1.2M lengths", qty: 2 },
      ],
    };
    const patches = buildPatches(resolveForm("EL-2420")!, ctx({ item: item as never }));
    expect(patches.find((p) => p.cell === "M54")?.value).toBe("Total Table is 9.6 m");
  });

  it("omits the M54 total when nothing was sold", () => {
    const patches = buildPatches(resolveForm("EL-2420")!, ctx({ item: elItem as never }));
    expect(patches.find((p) => p.cell === "M54")).toBeUndefined();
  });
});

describe("FabricPro form", () => {
  const fpItem = {
    id: "i", code: "FP-220", name: "FabricPro 220", lineGroup: 1,
    spec: { ui: "+Y", travelPlatform: true, railLengthM: 6 },
    optionCodes: [], optionAttributes: {}, optionQtys: [],
  };

  it("matches FP models but not the trolley", () => {
    expect(resolveForm("FP-220")?.id).toBe("fabricpro");
    expect(resolveForm("FP-TROLLEY")).toBeNull();
  });

  it("ticks the model, screen side and travel platform", () => {
    const cells = buildPatches(resolveForm("FP-220")!, ctx({ item: fpItem as never })).map((p) => p.cell);
    expect(cells).toEqual(expect.arrayContaining(["J27", "O41", "J44", "J46"]));
  });

  it("writes the travel rail length", () => {
    const patches = buildPatches(resolveForm("FP-220")!, ctx({ item: fpItem as never }));
    expect(patches.find((p) => p.cell === "N46")?.value).toBe("6");
  });

  it("requires nothing -- screen side defaults to -Y", () => {
    expect(missingRequirements(resolveForm("FP-220")!, {})).toEqual([]);
  });
});

describe("coversOptions", () => {
  const elItem = {
    id: "i", code: "EL-2420", name: "EasyLoader 2420", lineGroup: 1,
    spec: { ui: "-Y", usage: "onload", sections: [] },
    optionCodes: ["EL-2420 Additional 1.2M lengths", "EL-2420 Static table 1.2M lengths"],
    optionQtys: [
      { code: "EL-2420 Additional 1.2M lengths", qty: 6 },
      { code: "EL-2420 Static table 1.2M lengths", qty: 2 },
    ],
    optionAttributes: {},
  };

  it("does not report the table length options as unmatched", () => {
    // They have no tick of their own -- the section rows and the printed
    // total are how the form states them -- so without coversOptions they
    // would be printed again on the Additional items sheet.
    const context = ctx({ item: elItem as never });
    expect(unmatchedOptionCodes(resolveForm("EL-2420")!, context)).toEqual([]);
  });

  it("still reports an option the form genuinely has no place for", () => {
    const item = { ...elItem, optionCodes: [...elItem.optionCodes, "EDS-500"] };
    const context = ctx({ item: item as never });
    expect(unmatchedOptionCodes(resolveForm("EL-2420")!, context)).toEqual(["EDS-500"]);
  });
});
