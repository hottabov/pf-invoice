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
    expect(missingRequirements(resolveForm("M5220")!, {})).toEqual(["ui", "knifeSize", "drills"]);
  });

  it("reports drills when they are required with no detail", () => {
    const spec = { ui: "+Y", knifeSize: "1.5x5.0", drills: { required: true, detail: "" } };
    expect(missingRequirements(resolveForm("M5220")!, spec)).toEqual(["drills"]);
  });
});
