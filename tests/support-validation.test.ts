import { describe, it, expect } from "vitest";
import { supportSubjectSchema, supportBodySchema, supportMessageSchema } from "@/lib/validation/support";

describe("supportSubjectSchema", () => {
  it("requires a non-blank subject", () => {
    expect(supportSubjectSchema.safeParse("").success).toBe(false);
    expect(supportSubjectSchema.safeParse("   ").success).toBe(false);
  });

  it("trims a valid subject", () => {
    const result = supportSubjectSchema.safeParse("  Prices are wrong  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Prices are wrong");
  });

  it("rejects a subject over 150 characters", () => {
    expect(supportSubjectSchema.safeParse("a".repeat(151)).success).toBe(false);
  });

  it("accepts a subject at exactly 150 characters", () => {
    expect(supportSubjectSchema.safeParse("a".repeat(150)).success).toBe(true);
  });
});

describe("supportBodySchema", () => {
  it("requires a non-blank message", () => {
    expect(supportBodySchema.safeParse("").success).toBe(false);
    expect(supportBodySchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a message over 5000 characters", () => {
    expect(supportBodySchema.safeParse("a".repeat(5001)).success).toBe(false);
  });

  it("accepts a message at exactly 5000 characters", () => {
    expect(supportBodySchema.safeParse("a".repeat(5000)).success).toBe(true);
  });
});

describe("supportMessageSchema", () => {
  it("accepts a fully populated valid submission", () => {
    const result = supportMessageSchema.safeParse({
      subject: "Prices are wrong",
      body: "The X-Calibre series shows AUD for a US company.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a submission missing either field", () => {
    expect(supportMessageSchema.safeParse({ subject: "Only a subject" }).success).toBe(false);
    expect(supportMessageSchema.safeParse({ body: "Only a body" }).success).toBe(false);
    expect(supportMessageSchema.safeParse({}).success).toBe(false);
  });
});
