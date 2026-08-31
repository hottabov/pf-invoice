import { describe, it, expect } from "vitest";
import {
  regionCodeSchema,
  currencyCodeSchema,
  regionNameSchema,
  taxNameSchema,
  taxRateSchema,
  entityNameSchema,
  entityLegalIdSchema,
  entityAddressSchema,
  footerTextSchema,
  bankDetailsRecordSchema,
  bankDetailsSchema,
  createRegionSchema,
  updateRegionSchema,
} from "../src/lib/validation/regions";

describe("regionCodeSchema", () => {
  it("normalizes a lowercase code to uppercase", () => {
    const result = regionCodeSchema.safeParse("au");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("AU");
  });

  it("accepts 2- and 3-letter codes", () => {
    expect(regionCodeSchema.safeParse("AU").success).toBe(true);
    expect(regionCodeSchema.safeParse("USA").success).toBe(true);
  });

  it("rejects a code with digits", () => {
    expect(regionCodeSchema.safeParse("A1").success).toBe(false);
  });

  it("rejects a code with 1 or 4+ letters", () => {
    expect(regionCodeSchema.safeParse("A").success).toBe(false);
    expect(regionCodeSchema.safeParse("ABCD").success).toBe(false);
  });

  it("rejects a blank code", () => {
    expect(regionCodeSchema.safeParse("").success).toBe(false);
  });
});

describe("currencyCodeSchema", () => {
  it("normalizes a lowercase code to uppercase", () => {
    const result = currencyCodeSchema.safeParse("aud");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("AUD");
  });

  it("accepts exactly 3 letters", () => {
    expect(currencyCodeSchema.safeParse("USD").success).toBe(true);
  });

  it("rejects 2 or 4 letters", () => {
    expect(currencyCodeSchema.safeParse("US").success).toBe(false);
    expect(currencyCodeSchema.safeParse("USDD").success).toBe(false);
  });

  it("rejects digits", () => {
    expect(currencyCodeSchema.safeParse("US1").success).toBe(false);
  });
});

describe("regionNameSchema", () => {
  it("accepts a normal name", () => {
    expect(regionNameSchema.safeParse("Australia").success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(regionNameSchema.safeParse("A").success).toBe(false);
  });

  it("rejects a name over 200 characters", () => {
    expect(regionNameSchema.safeParse("A".repeat(201)).success).toBe(false);
  });
});

describe("taxNameSchema", () => {
  it("accepts a normal tax name", () => {
    expect(taxNameSchema.safeParse("GST").success).toBe(true);
  });

  it("rejects an empty tax name", () => {
    expect(taxNameSchema.safeParse("").success).toBe(false);
  });

  it("accepts a tax name at exactly the 40 character bound", () => {
    expect(taxNameSchema.safeParse("A".repeat(40)).success).toBe(true);
  });

  it("rejects a tax name over 40 characters", () => {
    expect(taxNameSchema.safeParse("A".repeat(41)).success).toBe(false);
  });
});

describe("taxRateSchema", () => {
  it("accepts a whole number rate", () => {
    expect(taxRateSchema.safeParse("10").success).toBe(true);
  });

  it("accepts a rate with up to 2 decimal places", () => {
    expect(taxRateSchema.safeParse("10.5").success).toBe(true);
    expect(taxRateSchema.safeParse("10.55").success).toBe(true);
  });

  it("accepts 0", () => {
    expect(taxRateSchema.safeParse("0").success).toBe(true);
  });

  it("accepts the upper bound 99.99", () => {
    expect(taxRateSchema.safeParse("99.99").success).toBe(true);
  });

  it("rejects a rate over 99.99", () => {
    expect(taxRateSchema.safeParse("100").success).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    expect(taxRateSchema.safeParse("10.555").success).toBe(false);
  });

  it("rejects a negative rate", () => {
    expect(taxRateSchema.safeParse("-1").success).toBe(false);
  });

  it("rejects a non-numeric value", () => {
    expect(taxRateSchema.safeParse("ten").success).toBe(false);
  });
});

describe("entityNameSchema", () => {
  it("accepts a normal entity name", () => {
    expect(entityNameSchema.safeParse("Pathfinder Australia Pty Ltd").success).toBe(true);
  });

  it("rejects an empty entity name", () => {
    expect(entityNameSchema.safeParse("").success).toBe(false);
  });

  it("rejects an entity name over 200 characters", () => {
    expect(entityNameSchema.safeParse("A".repeat(201)).success).toBe(false);
  });
});

describe("optional entity/footer fields", () => {
  it("collapses missing/blank entityLegalId to undefined", () => {
    for (const value of [undefined, null, "", "   "]) {
      const result = entityLegalIdSchema.safeParse(value);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeUndefined();
    }
  });

  it("rejects entityLegalId over 100 characters", () => {
    expect(entityLegalIdSchema.safeParse("A".repeat(101)).success).toBe(false);
  });

  it("rejects entityAddress over 400 characters", () => {
    expect(entityAddressSchema.safeParse("A".repeat(401)).success).toBe(false);
  });

  it("rejects footerText over 2000 characters", () => {
    expect(footerTextSchema.safeParse("A".repeat(2001)).success).toBe(false);
  });

  it("accepts footerText at exactly the 2000 character bound", () => {
    expect(footerTextSchema.safeParse("A".repeat(2000)).success).toBe(true);
  });
});

describe("bankDetailsRecordSchema", () => {
  it("accepts an empty record", () => {
    expect(bankDetailsRecordSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a normal record", () => {
    expect(bankDetailsRecordSchema.safeParse({ "Account name": "Pathfinder", BSB: "123-456" }).success).toBe(
      true
    );
  });

  it("accepts exactly 12 keys", () => {
    const obj = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`Key ${i}`, "value"]));
    expect(bankDetailsRecordSchema.safeParse(obj).success).toBe(true);
  });

  it("rejects more than 12 keys", () => {
    const obj = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`Key ${i}`, "value"]));
    expect(bankDetailsRecordSchema.safeParse(obj).success).toBe(false);
  });

  it("rejects a key over 40 characters", () => {
    expect(bankDetailsRecordSchema.safeParse({ ["A".repeat(41)]: "value" }).success).toBe(false);
  });

  it("accepts a key at exactly 40 characters", () => {
    expect(bankDetailsRecordSchema.safeParse({ ["A".repeat(40)]: "value" }).success).toBe(true);
  });

  it("rejects a value over 120 characters", () => {
    expect(bankDetailsRecordSchema.safeParse({ Key: "A".repeat(121) }).success).toBe(false);
  });

  it("accepts a value at exactly 120 characters", () => {
    expect(bankDetailsRecordSchema.safeParse({ Key: "A".repeat(120) }).success).toBe(true);
  });

  it("rejects a non-string value", () => {
    expect(bankDetailsRecordSchema.safeParse({ Key: 123 }).success).toBe(false);
  });
});

describe("bankDetailsSchema", () => {
  it("collapses missing/blank input to null", () => {
    for (const value of [undefined, null, "", "   "]) {
      const result = bankDetailsSchema.safeParse(value);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBeNull();
    }
  });

  it("parses valid JSON into a record", () => {
    const result = bankDetailsSchema.safeParse(JSON.stringify({ BSB: "123-456" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ BSB: "123-456" });
  });

  it("rejects invalid JSON", () => {
    expect(bankDetailsSchema.safeParse("{not json").success).toBe(false);
  });

  it("rejects JSON that isn't an object (e.g. an array)", () => {
    expect(bankDetailsSchema.safeParse(JSON.stringify(["a", "b"])).success).toBe(false);
  });

  it("rejects a JSON object with more than 12 keys", () => {
    const obj = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`Key ${i}`, "value"]));
    expect(bankDetailsSchema.safeParse(JSON.stringify(obj)).success).toBe(false);
  });
});

describe("createRegionSchema", () => {
  const base = {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    taxName: "GST",
    taxRate: "10.00",
    entityName: "Pathfinder Australia Pty Ltd",
    entityLegalId: "ABN 64 072 458 667",
    entityAddress: "1 Example St, Sydney",
    footerText: "Thanks for your business.",
    bankDetails: JSON.stringify({ BSB: "123-456" }),
    maxDiscountPct: "10",
    active: "on",
  };

  it("accepts a fully populated valid submission", () => {
    const result = createRegionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("AU");
      expect(result.data.active).toBe(true);
      expect(result.data.bankDetails).toEqual({ BSB: "123-456" });
      expect(result.data.maxDiscountPct).toBe(10);
    }
  });

  it("treats a missing/blank maxDiscountPct as no cap (null)", () => {
    const withoutCap = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== "maxDiscountPct")
    );
    const result = createRegionSchema.safeParse(withoutCap);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.maxDiscountPct).toBeNull();

    const blank = createRegionSchema.safeParse({ ...base, maxDiscountPct: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.maxDiscountPct).toBeNull();
  });

  it("rejects a maxDiscountPct above 100", () => {
    expect(createRegionSchema.safeParse({ ...base, maxDiscountPct: "101" }).success).toBe(false);
  });

  it("accepts omitted optional fields", () => {
    const result = createRegionSchema.safeParse({
      ...base,
      entityLegalId: "",
      entityAddress: "",
      footerText: "",
      bankDetails: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityLegalId).toBeUndefined();
      expect(result.data.bankDetails).toBeNull();
    }
  });

  it("treats a missing active checkbox as false", () => {
    const rest = Object.fromEntries(Object.entries(base).filter(([key]) => key !== "active"));
    const result = createRegionSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.active).toBe(false);
  });

  it("rejects an invalid code", () => {
    expect(createRegionSchema.safeParse({ ...base, code: "A1" }).success).toBe(false);
  });

  it("rejects an invalid tax rate", () => {
    expect(createRegionSchema.safeParse({ ...base, taxRate: "100" }).success).toBe(false);
  });
});

describe("updateRegionSchema", () => {
  const base = {
    name: "Australia",
    currency: "AUD",
    taxName: "GST",
    taxRate: "10.00",
    entityName: "Pathfinder Australia Pty Ltd",
    entityLegalId: "",
    entityAddress: "",
    footerText: "",
    bankDetails: "",
    maxDiscountPct: "15",
    active: "on",
  };

  it("has no `code` field at all", () => {
    expect("code" in updateRegionSchema.shape).toBe(false);
  });

  it("accepts a fully populated valid submission", () => {
    expect(updateRegionSchema.safeParse(base).success).toBe(true);
  });

  it("ignores an extraneous code field rather than erroring", () => {
    const result = updateRegionSchema.safeParse({ ...base, code: "US" });
    expect(result.success).toBe(true);
    if (result.success) expect((result.data as Record<string, unknown>).code).toBeUndefined();
  });
});
