import { describe, it, expect } from "vitest";
import { SECTION_UNIT_M, tableLengthsFromOptions, reconcileSections } from "../src/lib/production-forms/table-sections";

const opts = (conveyor: number, staticQty: number) => [
  ...(conveyor ? [{ code: "EL-2420 Additional 1.2M lengths", qty: conveyor }] : []),
  ...(staticQty ? [{ code: "EL-2420 Static table 1.2M lengths", qty: staticQty }] : []),
];

describe("tableLengthsFromOptions", () => {
  it("counts conveyor units from the Additional option", () => {
    expect(tableLengthsFromOptions(opts(6, 0))).toEqual({ conveyorUnits: 6, staticUnits: 0, totalM: 7.2 });
  });

  it("counts static units from the Static table option", () => {
    expect(tableLengthsFromOptions(opts(0, 2))).toEqual({ conveyorUnits: 0, staticUnits: 2, totalM: 2.4 });
  });

  it("counts both", () => {
    expect(tableLengthsFromOptions(opts(6, 2))).toEqual({ conveyorUnits: 6, staticUnits: 2, totalM: 9.6 });
  });

  it("matches the option regardless of which EasyLoader width prefixes it", () => {
    expect(tableLengthsFromOptions([{ code: "EL-2020 Additional 1.2M lengths", qty: 3 }]).conveyorUnits).toBe(3);
    expect(tableLengthsFromOptions([{ code: "EL-4030 Static table 1.2M lengths", qty: 1 }]).staticUnits).toBe(1);
  });

  it("ignores unrelated options", () => {
    expect(tableLengthsFromOptions([{ code: "Crate-EL", qty: 1 }])).toEqual({ conveyorUnits: 0, staticUnits: 0, totalM: 0 });
  });

  it("does not confuse the busbar's per-1.2M option for a table length", () => {
    const busbar = [{ code: "EL-2420 Electrical Busbar Per 1.2M Used for Fabric Pro automatic spreader.", qty: 4 }];
    expect(tableLengthsFromOptions(busbar)).toEqual({ conveyorUnits: 0, staticUnits: 0, totalM: 0 });
  });
});

describe("reconcileSections", () => {
  const sold = { conveyorUnits: 6, staticUnits: 2, totalM: 9.6 };

  it("accepts a layout matching both surfaces", () => {
    const result = reconcileSections(sold, [
      { lengthM: 4.8, surface: "conveyor" },
      { lengthM: 2.4, surface: "conveyor" },
      { lengthM: 2.4, surface: "static" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("reports the shortfall per surface", () => {
    const result = reconcileSections(sold, [{ lengthM: 4.8, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.remaining).toEqual({ conveyorUnits: 2, staticUnits: 2 });
  });

  it("rejects a layout whose total matches but whose surfaces are swapped", () => {
    const result = reconcileSections(sold, [
      { lengthM: 7.2, surface: "static" },
      { lengthM: 2.4, surface: "conveyor" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("reports an over-allocation as a negative remainder", () => {
    const result = reconcileSections(sold, [{ lengthM: 12, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.remaining.conveyorUnits).toBeLessThan(0);
  });

  it("rejects a section length that is not a multiple of 1.2", () => {
    const result = reconcileSections(sold, [{ lengthM: 5.0, surface: "conveyor" }]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/multiple of 1.2/i);
  });

  it("rejects an EasyLoader sold with no table length at all", () => {
    const result = reconcileSections({ conveyorUnits: 0, staticUnits: 0, totalM: 0 }, []);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/no table length/i);
  });

  it("accepts no sections when nothing is split and everything is one surface", () => {
    const result = reconcileSections({ conveyorUnits: 6, staticUnits: 0, totalM: 7.2 }, []);
    expect(result.ok).toBe(true);
  });

  it("tolerates floating point, since 1.2 is not exact in binary", () => {
    const result = reconcileSections({ conveyorUnits: 3, staticUnits: 0, totalM: 3.5999999 }, [
      { lengthM: 1.2, surface: "conveyor" },
      { lengthM: 1.2, surface: "conveyor" },
      { lengthM: 1.2, surface: "conveyor" },
    ]);
    expect(result.ok).toBe(true);
  });
});
