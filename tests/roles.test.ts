import { describe, it, expect } from "vitest";
import { isAdminRole } from "../src/lib/roles";

describe("isAdminRole", () => {
  it("returns true for ADMIN", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("returns true for DEVELOPER", () => {
    expect(isAdminRole("DEVELOPER")).toBe(true);
  });

  it("returns false for MANAGER", () => {
    expect(isAdminRole("MANAGER")).toBe(false);
  });

  it("returns false for null/undefined/an unrecognised role", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole("SOMETHING_ELSE")).toBe(false);
  });
});
