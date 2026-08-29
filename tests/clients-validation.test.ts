import { describe, it, expect } from "vitest";
import { companySchema, contactSchema } from "../src/lib/validation/clients";

describe("companySchema", () => {
  const base = {
    name: "Acme Landscaping",
    street: "1 Example St",
    city: "Sydney",
    state: "NSW",
    postcode: "2000",
    country: "Australia",
    taxId: "64 072 458 667",
    notes: "Prefers email contact.",
    regionCode: "AU",
  };

  it("accepts a fully populated valid company", () => {
    const result = companySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts a company with only name and regionCode", () => {
    const result = companySchema.safeParse({ name: "Acme", regionCode: "AU" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.street).toBeUndefined();
      expect(result.data.city).toBeUndefined();
    }
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(companySchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    expect(companySchema.safeParse({ ...base, name: "A".repeat(201) }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(companySchema.safeParse({ regionCode: "AU" }).success).toBe(false);
  });

  it("treats a missing/null optional field as absent, not an error", () => {
    const result = companySchema.safeParse({ ...base, street: null, notes: undefined });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.street).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it("collapses an empty-string optional field to undefined", () => {
    const result = companySchema.safeParse({ ...base, city: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.city).toBeUndefined();
  });

  it("rejects a street over 120 characters", () => {
    expect(companySchema.safeParse({ ...base, street: "A".repeat(121) }).success).toBe(false);
  });

  it("rejects a postcode over 20 characters", () => {
    expect(companySchema.safeParse({ ...base, postcode: "A".repeat(21) }).success).toBe(false);
  });

  it("rejects a taxId over 50 characters", () => {
    expect(companySchema.safeParse({ ...base, taxId: "A".repeat(51) }).success).toBe(false);
  });

  it("rejects notes over 2000 characters", () => {
    expect(companySchema.safeParse({ ...base, notes: "A".repeat(2001) }).success).toBe(false);
  });

  describe("regionCode", () => {
    it("requires a regionCode", () => {
      expect(companySchema.safeParse({ name: "Acme" }).success).toBe(false);
    });

    it("uppercases a lowercase region code", () => {
      const result = companySchema.safeParse({ ...base, regionCode: "au" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.regionCode).toBe("AU");
    });

    it("accepts a 3-letter region code", () => {
      expect(companySchema.safeParse({ ...base, regionCode: "usa" }).success).toBe(true);
    });

    it("rejects a region code that isn't 2-3 letters", () => {
      for (const regionCode of ["A", "ABCD", "A1", ""]) {
        expect(companySchema.safeParse({ ...base, regionCode }).success, regionCode).toBe(false);
      }
    });
  });
});

describe("contactSchema", () => {
  const base = {
    firstName: "Jamie",
    lastName: "Smith",
    email: "jamie@example.com",
    phone: "0400 000 000",
    position: "Site Manager",
    isPrimary: "on",
  };

  it("accepts a fully populated valid contact", () => {
    const result = contactSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isPrimary).toBe(true);
  });

  it("accepts a contact with only a first name", () => {
    const result = contactSchema.safeParse({ firstName: "Jamie", isPrimary: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastName).toBeUndefined();
      expect(result.data.email).toBeUndefined();
      expect(result.data.isPrimary).toBe(false);
    }
  });

  it("rejects a missing first name", () => {
    expect(contactSchema.safeParse({ ...base, firstName: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...base, firstName: undefined }).success).toBe(false);
  });

  it("rejects a first name over 80 characters", () => {
    expect(contactSchema.safeParse({ ...base, firstName: "A".repeat(81) }).success).toBe(false);
  });

  it("rejects a last name over 80 characters", () => {
    expect(contactSchema.safeParse({ ...base, lastName: "A".repeat(81) }).success).toBe(false);
  });

  it("rejects an invalid email address", () => {
    expect(contactSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("treats a missing/empty email as absent, not an error", () => {
    for (const email of [null, undefined, ""]) {
      const result = contactSchema.safeParse({ ...base, email });
      expect(result.success, JSON.stringify(email)).toBe(true);
      if (result.success) expect(result.data.email).toBeUndefined();
    }
  });

  it("rejects a phone over 40 characters", () => {
    expect(contactSchema.safeParse({ ...base, phone: "1".repeat(41) }).success).toBe(false);
  });

  it("rejects a position over 80 characters", () => {
    expect(contactSchema.safeParse({ ...base, position: "A".repeat(81) }).success).toBe(false);
  });

  describe("isPrimary coercion", () => {
    it('coerces the raw FormData "on" value to true', () => {
      const result = contactSchema.safeParse({ ...base, isPrimary: "on" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrimary).toBe(true);
    });

    it("coerces a missing/null value (unchecked checkbox) to false", () => {
      const result = contactSchema.safeParse({ ...base, isPrimary: null });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrimary).toBe(false);
    });

    it("coerces an actual boolean straight through", () => {
      const result = contactSchema.safeParse({ ...base, isPrimary: true });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrimary).toBe(true);
    });
  });
});
