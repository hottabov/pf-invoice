import { describe, it, expect } from "vitest";
import { parseMachineSpecs, machineSpecSentence } from "../src/lib/machine-specs";

// Pure module — no @/lib/db import, so this never needs DATABASE_URL set,
// same as tests/quotation-data.test.ts.

describe("parseMachineSpecs — M/X-Calibre", () => {
  it("parses a bare 'M' prefix code (M3390 -> 3cm height, 390cm width)", () => {
    expect(parseMachineSpecs("M", "M3390")).toEqual({ heightCm: 3, widthCm: 390 });
  });

  it("parses a 2-digit height (M10180 -> 10cm height, 180cm width)", () => {
    expect(parseMachineSpecs("M", "M10180")).toEqual({ heightCm: 10, widthCm: 180 });
  });

  it("parses a dashed 'X-' prefix code (X-3180 -> 3cm height, 180cm width)", () => {
    expect(parseMachineSpecs("XC", "X-3180")).toEqual({ heightCm: 3, widthCm: 180 });
  });

  it("parses a dashed 'X-' code with a 2-digit height (X-10390 -> 10cm height, 390cm width)", () => {
    expect(parseMachineSpecs("XC", "X-10390")).toEqual({ heightCm: 10, widthCm: 390 });
  });
});

describe("parseMachineSpecs — L-Series", () => {
  it("parses L-320 to width only (no height in the code)", () => {
    expect(parseMachineSpecs("L", "L-320")).toEqual({ widthCm: 320 });
  });

  it("parses a 2-digit width with the F variant suffix (L-180F -> 180cm width)", () => {
    expect(parseMachineSpecs("L", "L-180F")).toEqual({ widthCm: 180 });
  });

  it("parses a 3-digit width with the F variant suffix (L-320F -> 320cm width)", () => {
    expect(parseMachineSpecs("L", "L-320F")).toEqual({ widthCm: 320 });
  });
});

describe("parseMachineSpecs — invalid / unrecognised", () => {
  it("returns null for a code that doesn't match its series' width set (M999)", () => {
    expect(parseMachineSpecs("M", "M999")).toBeNull();
  });

  it("returns null for a series with no spec-encoding scheme (P-180)", () => {
    expect(parseMachineSpecs("P", "P-180")).toBeNull();
  });

  it("returns null for an unrecognised series code (EL-2020)", () => {
    expect(parseMachineSpecs("EL", "EL-2020")).toBeNull();
  });

  it("returns null for a null series code", () => {
    expect(parseMachineSpecs(null, "M3390")).toBeNull();
  });
});

describe("machineSpecSentence", () => {
  it("builds the M-Series sentence with both height and width", () => {
    expect(machineSpecSentence("M-Series", "M", "M3390")).toBe(
      "M-Series Cutting Machine, 3cm compressed lay height, 390cm cutting width"
    );
  });

  it("builds the X-Calibre sentence with both height and width", () => {
    expect(machineSpecSentence("X-Calibre", "XC", "X-3180")).toBe(
      "X-Calibre Cutting Machine, 3cm compressed lay height, 180cm cutting width"
    );
  });

  it("builds the L-Series sentence with width only", () => {
    expect(machineSpecSentence("L-Series", "L", "L-320")).toBe("L-Series Cutting Machine with 320cm cutting width");
  });

  it("builds the L-Series sentence for an F-variant code (variant not shown, width unaffected)", () => {
    expect(machineSpecSentence("L-Series", "L", "L-320F")).toBe("L-Series Cutting Machine with 320cm cutting width");
  });

  it("returns null when the underlying code doesn't parse (M999)", () => {
    expect(machineSpecSentence("M-Series", "M", "M999")).toBeNull();
  });

  it("returns null for a non-spec-encoding series (Punchline P-180)", () => {
    expect(machineSpecSentence("Punchline", "P", "P-180")).toBeNull();
  });

  it("returns null for an unrecognised series (EL-2020)", () => {
    expect(machineSpecSentence("Easy-Loader", "EL", "EL-2020")).toBeNull();
  });
});
