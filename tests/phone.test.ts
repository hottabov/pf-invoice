import { describe, it, expect } from "vitest";
import { validatePhone } from "../src/lib/phone";

describe("validatePhone", () => {
  it("accepts an empty/blank value as ok with null e164/national", () => {
    for (const raw of ["", "   ", null, undefined]) {
      const result = validatePhone(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.e164).toBeNull();
        expect(result.national).toBeNull();
      }
    }
  });

  it("validates a full AU number with explicit country code", () => {
    const result = validatePhone("+61 3 9338 3471");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.e164).toBe("+61393383471");
      expect(result.national).toBe("(03) 9338 3471");
    }
  });

  it("validates a full US number with explicit country code", () => {
    const result = validatePhone("+1 317 349 0002");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.e164).toBe("+13173490002");
    }
  });

  it("validates a national-format number given a defaultRegion", () => {
    const result = validatePhone("03 9338 3471", "AU");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.e164).toBe("+61393383471");
    }
  });

  it("rejects an obviously invalid short number", () => {
    const result = validatePhone("12345");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/valid phone number/i);
    }
  });

  it("rejects garbage input", () => {
    const result = validatePhone("not a phone number at all");
    expect(result.ok).toBe(false);
  });
});
