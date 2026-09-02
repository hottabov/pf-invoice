import { describe, it, expect } from "vitest";
import { unitLengthMetres, formatMetres } from "@/lib/option-length";

describe("unitLengthMetres", () => {
  it("reads the section length off the EasyLoader options that are sold by the metre", () => {
    expect(unitLengthMetres("Additional 1.2M lengths")).toBe(1.2);
    expect(unitLengthMetres("Static table 1.2M lengths")).toBe(1.2);
    expect(unitLengthMetres("Electrical Busbar Per 1.2M Used for Fabric Pro automatic spreader.")).toBe(1.2);
    expect(unitLengthMetres("Travel Platform support rail. Per 1.2m")).toBe(1.2);
  });

  it("ignores a measurement that is a specification, not a unit of sale", () => {
    // No "per"/"length" context: these describe the product, and multiplying
    // them by the quantity would be nonsense.
    expect(unitLengthMetres("Computer controlled cutting machine - 180cm cutting width")).toBeNull();
    expect(unitLengthMetres("Edge sealer Static- clip on blanking panel 800mm width")).toBeNull();
    expect(unitLengthMetres("Drag Knife. Maximum cutting depth 7mm")).toBeNull();
  });

  it("does not mistake millimetres for metres even in a per-unit name", () => {
    expect(unitLengthMetres("Busbar per 800mm section")).toBeNull();
  });

  it("returns null for an ordinary option", () => {
    expect(unitLengthMetres("Automatic Foot Pressure")).toBeNull();
  });
});

describe("formatMetres", () => {
  it("drops trailing zeros so a whole number of metres reads as one", () => {
    expect(formatMetres(1.2 * 5)).toBe("6 m");
  });

  it("keeps a fractional total", () => {
    expect(formatMetres(1.2 * 4)).toBe("4.8 m");
  });

  it("absorbs binary floating-point drift", () => {
    // 1.2 * 3 is 3.5999999999999996 in IEEE 754.
    expect(formatMetres(1.2 * 3)).toBe("3.6 m");
  });
});
