import { describe, it, expect } from "vitest";
import {
  deriveEasyLoaderOptions,
  derivedEasyLoaderCodes,
  elOptionCode,
  isDerivedEasyLoaderOption,
  layoutTotals,
  modulesIn,
  unitsToM,
  MAX_SECTIONS,
  type Section,
} from "../src/lib/production-forms/table-sections";

const conveyor = (modules: number): Section => ({ lengthM: unitsToM(modules), surface: "conveyor" });
const staticRun = (modules: number): Section => ({ lengthM: unitsToM(modules), surface: "static" });

describe("unitsToM", () => {
  it("keeps one decimal digit rather than a float's tail", () => {
    // 6 * 1.2 is 7.199999999999999 in binary floating point.
    expect(unitsToM(6)).toBe(7.2);
    expect(unitsToM(11)).toBe(13.2);
  });
});

describe("modulesIn", () => {
  it("counts a length back to whole modules", () => {
    expect(modulesIn(conveyor(5))).toBe(5);
    expect(modulesIn(staticRun(1))).toBe(1);
  });

  it("survives a length assembled by repeated addition", () => {
    // What five separate +1.2 clicks used to leave behind.
    expect(modulesIn({ lengthM: 1.2 + 1.2 + 1.2 + 1.2 + 1.2, surface: "conveyor" })).toBe(5);
  });

  it("treats an empty section as no modules", () => {
    expect(modulesIn({ lengthM: 0, surface: "conveyor" })).toBe(0);
  });
});

describe("layoutTotals", () => {
  it("gives each conveyor run its own drive module", () => {
    const totals = layoutTotals([conveyor(5), conveyor(5)]);
    expect(totals.driveModules).toBe(2);
    expect(totals.conveyorModules).toBe(8);
  });

  it("gives a static run no drive module at all", () => {
    const totals = layoutTotals([staticRun(3)]);
    expect(totals.driveModules).toBe(0);
    expect(totals.staticModules).toBe(3);
  });

  it("counts a single-module conveyor run as just its drive", () => {
    const totals = layoutTotals([conveyor(1)]);
    expect(totals.driveModules).toBe(1);
    expect(totals.conveyorModules).toBe(0);
  });

  it("ignores a section with no modules", () => {
    const totals = layoutTotals([conveyor(2), { lengthM: 0, surface: "conveyor" }]);
    expect(totals.driveModules).toBe(1);
    expect(totals.totalModules).toBe(2);
  });

  it("is empty for a table with no sections", () => {
    expect(layoutTotals([])).toMatchObject({ totalModules: 0, totalM: 0, driveModules: 0 });
  });
});

// The owner's own worked example, kept whole: two conveyor runs of five
// modules each and one static module. It is the specification for how a
// drawn table becomes money, so it is asserted end to end rather than only
// in pieces.
describe("the owner's worked example", () => {
  const sections = [conveyor(5), conveyor(5), staticRun(1)];

  it("totals 13.2 m across 11 modules", () => {
    const totals = layoutTotals(sections);
    expect(totals.totalModules).toBe(11);
    expect(totals.totalM).toBe(13.2);
  });

  it("prices as 2 drive, 8 conveyor and 1 static", () => {
    expect(deriveEasyLoaderOptions("EL-2420", sections, false)).toEqual([
      { optionCode: "EL-2420 Drive Module (first 1.2M)", qty: 2 },
      { optionCode: "EL-2420 Additional 1.2M lengths", qty: 8 },
      { optionCode: "EL-2420 Static table 1.2M lengths", qty: 1 },
    ]);
  });

  it("adds a busbar and a rail per module when a FabricPro runs the table", () => {
    const derived = deriveEasyLoaderOptions("EL-2420", sections, true);
    expect(derived).toContainEqual({
      optionCode: "EL-2420 Electrical Busbar Per 1.2M Used for Fabric Pro automatic spreader.",
      qty: 11,
    });
    expect(derived).toContainEqual({
      optionCode: "EL-2420 Travel Platform support rail. Per 1.2m",
      qty: 11,
    });
  });
});

describe("deriveEasyLoaderOptions", () => {
  it("writes no row at all for a kind the table has none of", () => {
    const codes = deriveEasyLoaderOptions("EL-2020", [conveyor(2)], false).map((d) => d.optionCode);
    expect(codes).not.toContain("EL-2020 Static table 1.2M lengths");
  });

  it("prices nothing for an empty table", () => {
    expect(deriveEasyLoaderOptions("EL-2020", [], true)).toEqual([]);
  });

  it("scopes every code to the item's own width", () => {
    const derived = deriveEasyLoaderOptions("EL-3220", [conveyor(2), staticRun(1)], true);
    for (const { optionCode } of derived) {
      expect(optionCode.startsWith("EL-3220 "), optionCode).toBe(true);
    }
  });
});

describe("derived option codes", () => {
  it("recognises every kind the builder writes", () => {
    for (const code of derivedEasyLoaderCodes("EL-2420")) {
      expect(isDerivedEasyLoaderOption("EL-2420", code), code).toBe(true);
    }
  });

  it("leaves the manager's own accessories alone", () => {
    // The roll holder, sync feature and crate are picked by hand and must
    // survive a redraw of the table.
    for (const code of [
      "EL-2420 Syncronisation Feature (same speed sync with cutter)",
      "Crate-EL",
      "EL-2420 ST620-2420 Roll Holder- Used to dispense perforated underlay paper. Mounted rear of EasyLoader on lower leg.",
    ]) {
      expect(isDerivedEasyLoaderOption("EL-2420", code), code).toBe(false);
    }
  });

  it("does not claim another width's option", () => {
    expect(isDerivedEasyLoaderOption("EL-2420", elOptionCode("EL-2020", "drive"))).toBe(false);
  });
});

describe("MAX_SECTIONS", () => {
  it("is four, per the owner", () => {
    expect(MAX_SECTIONS).toBe(4);
  });
});
