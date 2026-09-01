import { describe, it, expect } from "vitest";
import { columnIndex, splitRef } from "../src/lib/production-forms/cell-ref";

describe("columnIndex", () => {
  it("maps A to 1", () => expect(columnIndex("A")).toBe(1));
  it("maps Z to 26", () => expect(columnIndex("Z")).toBe(26));
  it("maps AA to 27", () => expect(columnIndex("AA")).toBe(27));
  it("maps AZ to 52", () => expect(columnIndex("AZ")).toBe(52));
  it("orders G before M", () => expect(columnIndex("G")).toBeLessThan(columnIndex("M")));
  it("orders Z before AA", () => expect(columnIndex("Z")).toBeLessThan(columnIndex("AA")));
});

describe("splitRef", () => {
  it("splits a single-letter reference", () => {
    expect(splitRef("G8")).toEqual({ col: "G", colIndex: 7, row: 8 });
  });

  it("splits a two-letter reference", () => {
    expect(splitRef("AA108")).toEqual({ col: "AA", colIndex: 27, row: 108 });
  });

  it("throws on a malformed reference", () => {
    expect(() => splitRef("8G")).toThrow();
  });
});
