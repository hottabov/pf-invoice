import { describe, it, expect } from "vitest";
import { resolveSpecImage, SCREEN_SIDES, SPEC_IMAGE_FIELDS } from "../src/lib/production-forms/spec-images";

// Pure module — no @/lib/db import, so this never needs DATABASE_URL set,
// same discipline as tests/table-sections.test.ts.

describe("resolveSpecImage", () => {
  it("returns the right image for each value when both are uploaded", () => {
    const images = { "+Y": "/api/files/plus-y.jpg", "-Y": "/api/files/minus-y.jpg" };
    expect(resolveSpecImage(images, "+Y")).toBe("/api/files/plus-y.jpg");
    expect(resolveSpecImage(images, "-Y")).toBe("/api/files/minus-y.jpg");
  });

  it("falls back to null (the placeholder trigger) when the value has no uploaded image", () => {
    const images = { "+Y": "/api/files/plus-y.jpg" }; // "-Y" never uploaded
    expect(resolveSpecImage(images, "-Y")).toBeNull();
  });

  it("falls back to null when nothing at all has been uploaded for this field", () => {
    expect(resolveSpecImage({}, "+Y")).toBeNull();
    expect(resolveSpecImage({}, "-Y")).toBeNull();
  });

  it("does not confuse one value's image with another's", () => {
    const images = { "+Y": "/api/files/plus-y.jpg", "-Y": "/api/files/minus-y.jpg" };
    expect(resolveSpecImage(images, "+Y")).not.toBe(images["-Y"]);
  });
});

describe("SPEC_IMAGE_FIELDS", () => {
  it("wires up exactly one field today — screenSide, with both dropdown values", () => {
    expect(SPEC_IMAGE_FIELDS).toHaveLength(1);
    expect(SPEC_IMAGE_FIELDS[0].field).toBe("screenSide");
    expect(SPEC_IMAGE_FIELDS[0].values).toEqual(SCREEN_SIDES);
  });

  it("SCREEN_SIDES matches the dropdown's own two values", () => {
    expect(SCREEN_SIDES).toEqual(["+Y", "-Y"]);
  });
});
