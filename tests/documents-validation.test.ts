import { describe, it, expect } from "vitest";
import { documentTypeSchema, idSchema, optionalIdSchema } from "../src/lib/validation/documents";

describe("documentTypeSchema", () => {
  it("accepts QUOTE", () => {
    expect(documentTypeSchema.safeParse("QUOTE").success).toBe(true);
  });

  it("accepts INVOICE", () => {
    expect(documentTypeSchema.safeParse("INVOICE").success).toBe(true);
  });

  it("rejects an unknown type", () => {
    expect(documentTypeSchema.safeParse("RECEIPT").success).toBe(false);
  });

  it("rejects a lowercase type", () => {
    expect(documentTypeSchema.safeParse("quote").success).toBe(false);
  });

  it("rejects a missing value", () => {
    expect(documentTypeSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("idSchema", () => {
  it("accepts a cuid-shaped id", () => {
    expect(idSchema.safeParse("cldz9x1a30000abcd1234efgh").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = idSchema.safeParse("  cldz9x1a30000abcd1234efgh  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("cldz9x1a30000abcd1234efgh");
  });

  it("rejects an empty string", () => {
    expect(idSchema.safeParse("").success).toBe(false);
  });

  it("rejects an id shorter than 10 characters", () => {
    expect(idSchema.safeParse("short").success).toBe(false);
  });

  it("rejects an id longer than 40 characters", () => {
    expect(idSchema.safeParse("a".repeat(41)).success).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(idSchema.safeParse(12345).success).toBe(false);
  });
});

describe("optionalIdSchema", () => {
  it("accepts a valid id", () => {
    const result = optionalIdSchema.safeParse("cldz9x1a30000abcd1234efgh");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("cldz9x1a30000abcd1234efgh");
  });

  it("collapses undefined to undefined", () => {
    const result = optionalIdSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses null to undefined", () => {
    const result = optionalIdSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses an empty string to undefined", () => {
    const result = optionalIdSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("collapses a whitespace-only string to undefined", () => {
    const result = optionalIdSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it("rejects an invalid non-empty id", () => {
    expect(optionalIdSchema.safeParse("short").success).toBe(false);
  });
});
