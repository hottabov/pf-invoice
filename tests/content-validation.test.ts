import { describe, it, expect } from "vitest";
import { contentBlockSchema, regionCodeSchema, CONTENT_KEY_REGEX } from "../src/lib/validation/content";

describe("CONTENT_KEY_REGEX", () => {
  it("accepts every real key shape used in content-blocks.json", () => {
    for (const key of [
      "terms.delivery",
      "option.OFD",
      "software.pathworks-i",
      "software.WPN-panel",
      "equipment.fabric-master",
      "conditions.1",
      "rsp.agreement",
      "machine.m-series",
    ]) {
      expect(CONTENT_KEY_REGEX.test(key), `expected "${key}" to match`).toBe(true);
    }
  });

  it("rejects keys shorter than 2 characters", () => {
    expect(CONTENT_KEY_REGEX.test("a")).toBe(false);
  });

  it("rejects keys longer than 60 characters", () => {
    expect(CONTENT_KEY_REGEX.test("a".repeat(61))).toBe(false);
  });

  it("accepts a key at exactly the 60 character bound", () => {
    expect(CONTENT_KEY_REGEX.test("a".repeat(60))).toBe(true);
  });

  it("rejects keys with spaces or other punctuation", () => {
    for (const key of ["terms delivery", "terms/delivery", "terms_delivery", "terms.delivery!"]) {
      expect(CONTENT_KEY_REGEX.test(key), `expected "${key}" to be rejected`).toBe(false);
    }
  });
});

describe("contentBlockSchema", () => {
  const base = {
    key: "terms.delivery",
    title: "Delivery",
    body: "Included in sale price.",
    sortOrder: "3",
  };

  it("accepts a valid block and coerces sortOrder to a number", () => {
    const result = contentBlockSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Delivery");
      expect(result.data.sortOrder).toBe(3);
    }
  });

  it("rejects an invalid key", () => {
    const result = contentBlockSchema.safeParse({ ...base, key: "bad key!" });
    expect(result.success).toBe(false);
  });

  it("collapses a missing/blank title to undefined", () => {
    for (const title of [undefined, null, "", "   "]) {
      const result = contentBlockSchema.safeParse({ ...base, title });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.title).toBeUndefined();
    }
  });

  it("rejects a title over 200 characters", () => {
    const result = contentBlockSchema.safeParse({ ...base, title: "A".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    const result = contentBlockSchema.safeParse({ ...base, body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a body over 20000 characters", () => {
    const result = contentBlockSchema.safeParse({ ...base, body: "A".repeat(20001) });
    expect(result.success).toBe(false);
  });

  it("accepts a body at exactly the 20000 character bound", () => {
    const result = contentBlockSchema.safeParse({ ...base, body: "A".repeat(20000) });
    expect(result.success).toBe(true);
  });

  it("accepts a body with markdown and {{placeholder}} tokens", () => {
    const result = contentBlockSchema.safeParse({
      ...base,
      body: "## Heading\n\n- Item one\n- Item two ({{token}})\n",
    });
    expect(result.success).toBe(true);
  });

  it("defaults a missing/blank sortOrder to 0", () => {
    for (const sortOrder of [undefined, null, ""]) {
      const result = contentBlockSchema.safeParse({ ...base, sortOrder });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sortOrder).toBe(0);
    }
  });

  it("rejects a negative sortOrder", () => {
    const result = contentBlockSchema.safeParse({ ...base, sortOrder: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer sortOrder", () => {
    const result = contentBlockSchema.safeParse({ ...base, sortOrder: "1.5" });
    expect(result.success).toBe(false);
  });
});

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

  it("rejects an empty code", () => {
    expect(regionCodeSchema.safeParse("").success).toBe(false);
  });
});
