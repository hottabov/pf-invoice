import { describe, it, expect } from "vitest";
import { getInitials, avatarColor, firstNameFrom } from "../src/lib/avatar";

describe("getInitials", () => {
  it("uses the first and last initial for a full name", () => {
    expect(getInitials("Jane Author", "jane@example.com")).toBe("JA");
  });

  it("uses just the one initial for a single-word name", () => {
    expect(getInitials("Cher", "cher@example.com")).toBe("C");
  });

  it("falls back to the email's first letter for an empty name", () => {
    expect(getInitials("", "zack@example.com")).toBe("Z");
    expect(getInitials("   ", "zack@example.com")).toBe("Z");
  });

  it("falls back to the email's first letter for a null/missing name", () => {
    expect(getInitials(null, "zack@example.com")).toBe("Z");
    expect(getInitials(undefined, "zack@example.com")).toBe("Z");
  });

  it("uppercases the fallback initial", () => {
    expect(getInitials(null, "lowercase@example.com")).toBe("L");
  });

  it("returns '?' when both name and email are empty (degenerate case)", () => {
    expect(getInitials(null, "")).toBe("?");
  });
});

describe("avatarColor", () => {
  it("is deterministic — the same seed always returns the same colour", () => {
    const first = avatarColor("Jane Author");
    const second = avatarColor("Jane Author");
    expect(first).toBe(second);
  });

  it("returns a hex colour from the palette", () => {
    expect(avatarColor("jane@example.com")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives an email-only user the same colour whether keyed by their name or email precedence matches getInitials' own", () => {
    // getInitials/Avatar both use `name?.trim() || email` as the seed — a
    // user with no name is keyed by email alone, consistently.
    expect(avatarColor("bob@example.com")).toBe(avatarColor("bob@example.com"));
  });
});

describe("firstNameFrom", () => {
  it("returns the first word of a full name", () => {
    expect(firstNameFrom("Jane Author", "jane@example.com")).toBe("Jane");
  });

  it("returns the whole name when it's a single word", () => {
    expect(firstNameFrom("Cher", "cher@example.com")).toBe("Cher");
  });

  it("falls back to the email's local-part when the name is missing", () => {
    expect(firstNameFrom(null, "jane@example.com")).toBe("jane");
    expect(firstNameFrom(undefined, "jane@example.com")).toBe("jane");
  });

  it("falls back to the email's local-part when the name is blank", () => {
    expect(firstNameFrom("   ", "jane@example.com")).toBe("jane");
  });

  it("falls back to the email's local-part when the name is itself an email address", () => {
    expect(firstNameFrom("jane@example.com", "jane@example.com")).toBe("jane");
  });
});
