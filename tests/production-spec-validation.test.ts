import { describe, it, expect } from "vitest";
import {
  mSeriesSpecSchema,
  easyLoaderSpecSchema,
  fabricProSpecSchema,
  missingKeys,
} from "../src/lib/validation/production-spec";

const validMSeries = {
  ui: "+Y",
  knifeSize: "1.5x5.0",
  drills: { required: true, detail: "2 x 6mm" },
};

describe("mSeriesSpecSchema", () => {
  it("accepts a complete spec", () => {
    expect(mSeriesSpecSchema.safeParse(validMSeries).success).toBe(true);
  });

  it("defaults the screen side to -Y when omitted, so an untouched panel still prints the standard", () => {
    const withoutUi = { knifeSize: validMSeries.knifeSize, drills: validMSeries.drills };
    const result = mSeriesSpecSchema.safeParse(withoutUi);
    expect(result.success).toBe(true);
    expect(result.success && result.data.ui).toBe("-Y");
  });

  it("rejects an unknown screen side", () => {
    expect(mSeriesSpecSchema.safeParse({ ...validMSeries, ui: "+X" }).success).toBe(false);
  });

  it("rejects an unknown knife size", () => {
    expect(mSeriesSpecSchema.safeParse({ ...validMSeries, knifeSize: "9x9" }).success).toBe(false);
  });

  it("accepts drills declared as not required with no detail", () => {
    const result = mSeriesSpecSchema.safeParse({
      ...validMSeries,
      drills: { required: false, detail: "" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects drills required with an empty detail", () => {
    const result = mSeriesSpecSchema.safeParse({
      ...validMSeries,
      drills: { required: true, detail: "   " },
    });
    expect(result.success).toBe(false);
  });

  it("caps special notes at the width measured in the spike", () => {
    expect(mSeriesSpecSchema.safeParse({ ...validMSeries, specialNotes: "x".repeat(28) }).success).toBe(true);
    expect(mSeriesSpecSchema.safeParse({ ...validMSeries, specialNotes: "x".repeat(29) }).success).toBe(false);
  });

  it("caps the drill detail at the width measured in the spike", () => {
    const detail = (length: number) => ({
      ...validMSeries,
      drills: { required: true, detail: "x".repeat(length) },
    });
    expect(mSeriesSpecSchema.safeParse(detail(22)).success).toBe(true);
    expect(mSeriesSpecSchema.safeParse(detail(23)).success).toBe(false);
  });
});

describe("easyLoaderSpecSchema", () => {
  it("accepts up to three table sections", () => {
    const result = easyLoaderSpecSchema.safeParse({
      ui: "-Y",
      usage: "onload",
      sections: [
        { lengthM: 2.4, surface: "static" },
        { lengthM: 2.4, surface: "conveyor" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a fourth table section", () => {
    const result = easyLoaderSpecSchema.safeParse({
      ui: "-Y",
      usage: "onload",
      sections: new Array(4).fill({ lengthM: 1.2, surface: "static" }),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than four roll-feed distances", () => {
    const result = easyLoaderSpecSchema.safeParse({
      ui: "-Y",
      usage: "offload",
      sections: [{ lengthM: 1.2, surface: "static" }],
      rollFeed: { qty: 5, distancesMm: [1, 2, 3, 4, 5] },
    });
    expect(result.success).toBe(false);
  });

  it("defaults screen side to -Y and usage to onload, and sections to an undivided table, when parsing an empty spec", () => {
    const result = easyLoaderSpecSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ ui: "-Y", usage: "onload", sections: [] });
  });

  it("no longer accepts paperRollHolder or crate -- they moved to the quote as options", () => {
    // Zod 4 objects default to "strip" mode: unknown keys are dropped rather
    // than rejected, so a spec saved before this change still parses -- it
    // just loses the two fields nobody reads anymore.
    const result = easyLoaderSpecSchema.safeParse({
      ui: "-Y",
      usage: "onload",
      sections: [],
      paperRollHolder: true,
      crate: true,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("paperRollHolder");
    expect(result.success && result.data).not.toHaveProperty("crate");
  });
});

describe("fabricProSpecSchema", () => {
  it("accepts a minimal spec", () => {
    expect(fabricProSpecSchema.safeParse({ ui: "+Y", travelPlatform: true }).success).toBe(true);
  });

  it("defaults the screen side to -Y when omitted", () => {
    const result = fabricProSpecSchema.safeParse({ travelPlatform: true });
    expect(result.success).toBe(true);
    expect(result.success && result.data.ui).toBe("-Y");
  });
});

describe("missingKeys", () => {
  it("reports nothing when every required key is present", () => {
    expect(missingKeys(validMSeries, ["ui", "knifeSize", "drills"])).toEqual([]);
  });

  it("reports an absent key", () => {
    expect(missingKeys({ ui: "+Y" }, ["ui", "knifeSize"])).toEqual(["knifeSize"]);
  });

  it("reports every key when the spec is null", () => {
    expect(missingKeys(null, ["ui", "knifeSize"])).toEqual(["ui", "knifeSize"]);
  });

  it("treats drills required with a blank detail as missing", () => {
    const spec = { ui: "+Y", knifeSize: "1.5x5.0", drills: { required: true, detail: "" } };
    expect(missingKeys(spec, ["drills"])).toEqual(["drills"]);
  });

  it("treats drills required=false as satisfied", () => {
    const spec = { drills: { required: false, detail: "" } };
    expect(missingKeys(spec, ["drills"])).toEqual([]);
  });

  it("treats an empty sections array as missing", () => {
    expect(missingKeys({ sections: [] }, ["sections"])).toEqual(["sections"]);
  });
});
