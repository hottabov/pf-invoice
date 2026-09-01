import { describe, it, expect } from "vitest";
import { COUNTRIES, countryName, isValidCountryCode, normalizeCountryInput, displayCountry } from "../src/lib/countries";

describe("COUNTRIES", () => {
  it("is sorted by name", () => {
    const names = COUNTRIES.map((c) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("contains a substantial number of ISO countries with 2-letter codes", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("includes Australia, the US, and the UK", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes).toContain("AU");
    expect(codes).toContain("US");
    expect(codes).toContain("GB");
  });
});

describe("isValidCountryCode", () => {
  it("accepts real ISO alpha-2 codes", () => {
    expect(isValidCountryCode("AU")).toBe(true);
    expect(isValidCountryCode("US")).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(isValidCountryCode("ZZ")).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
    expect(isValidCountryCode("au")).toBe(false); // case-sensitive
  });
});

describe("countryName", () => {
  it("returns the English name for a valid code", () => {
    expect(countryName("AU")).toBe("Australia");
  });

  it("returns undefined for an unknown code", () => {
    expect(countryName("ZZ")).toBeUndefined();
  });
});

describe("normalizeCountryInput", () => {
  it("passes an already-valid code straight through", () => {
    expect(normalizeCountryInput("AU")).toBe("AU");
    expect(normalizeCountryInput("au")).toBe("AU");
  });

  it("maps an exact official name (case-insensitive)", () => {
    expect(normalizeCountryInput("Australia")).toBe("AU");
    expect(normalizeCountryInput("australia")).toBe("AU");
  });

  it("maps common aliases", () => {
    expect(normalizeCountryInput("USA")).toBe("US");
    expect(normalizeCountryInput("United States")).toBe("US");
    expect(normalizeCountryInput("UK")).toBe("GB");
  });

  it("trims whitespace", () => {
    expect(normalizeCountryInput("  Australia  ")).toBe("AU");
  });

  it("returns null for unmappable input", () => {
    expect(normalizeCountryInput("Narnia")).toBeNull();
    expect(normalizeCountryInput("")).toBeNull();
    expect(normalizeCountryInput(null)).toBeNull();
    expect(normalizeCountryInput(undefined)).toBeNull();
  });
});

describe("displayCountry", () => {
  it("resolves an ISO code to its English name", () => {
    expect(displayCountry("AU")).toBe("Australia");
  });

  it("resolves a normalizable legacy free-text value", () => {
    expect(displayCountry("USA")).toBe("United States of America");
    expect(displayCountry("UK")).toBe("United Kingdom");
  });

  it("falls back to the raw value when it can't be mapped", () => {
    expect(displayCountry("Narnia")).toBe("Narnia");
  });

  it("returns null for empty/null/undefined input", () => {
    expect(displayCountry(null)).toBeNull();
    expect(displayCountry(undefined)).toBeNull();
    expect(displayCountry("")).toBeNull();
  });
});
