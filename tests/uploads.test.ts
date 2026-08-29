import { describe, it, expect } from "vitest";
import path from "path";
import { resolveUploadPath, IMAGE_URL_PATTERN, uploadsDir } from "../src/lib/uploads";

const VALID_NAME = "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789.jpg";

describe("resolveUploadPath", () => {
  it("accepts a valid uuid.jpg name and resolves it under uploadsDir()", () => {
    const result = resolveUploadPath(VALID_NAME);
    expect(result).toBe(path.resolve(uploadsDir(), VALID_NAME));
  });

  it("accepts valid uuid.png and uuid.webp names", () => {
    expect(resolveUploadPath("a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789.png")).not.toBeNull();
    expect(resolveUploadPath("a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789.webp")).not.toBeNull();
  });

  it("rejects a path-traversal attempt", () => {
    expect(resolveUploadPath("../x")).toBeNull();
  });

  it("rejects a name containing a path separator", () => {
    expect(resolveUploadPath("a/b.jpg")).toBeNull();
  });

  it("rejects an uppercase name", () => {
    expect(resolveUploadPath(VALID_NAME.toUpperCase())).toBeNull();
  });

  it("rejects an unsupported extension", () => {
    expect(resolveUploadPath("a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789.gif")).toBeNull();
  });

  it("rejects a name that isn't 36 characters before the extension", () => {
    expect(resolveUploadPath("short.jpg")).toBeNull();
  });

  it("rejects a missing extension", () => {
    expect(resolveUploadPath("a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(resolveUploadPath("")).toBeNull();
  });
});

describe("IMAGE_URL_PATTERN", () => {
  it("accepts a well-formed /api/files/<uuid>.<ext> url for each allowed extension", () => {
    for (const ext of ["jpg", "png", "webp"]) {
      expect(IMAGE_URL_PATTERN.test(`/api/files/${VALID_NAME.slice(0, -3)}${ext}`)).toBe(true);
    }
  });

  it("rejects a path-traversal attempt", () => {
    expect(IMAGE_URL_PATTERN.test("/api/files/../../etc/passwd")).toBe(false);
  });

  it("rejects an absolute or external URL", () => {
    expect(IMAGE_URL_PATTERN.test(`https://evil.example/${VALID_NAME}`)).toBe(false);
  });

  it("rejects a missing /api/files/ prefix", () => {
    expect(IMAGE_URL_PATTERN.test(VALID_NAME)).toBe(false);
  });

  it("rejects an uppercase name", () => {
    expect(IMAGE_URL_PATTERN.test(`/api/files/${VALID_NAME.toUpperCase()}`)).toBe(false);
  });

  it("rejects an unsupported extension", () => {
    expect(IMAGE_URL_PATTERN.test("/api/files/a1b2c3d4-e5f6-4789-a0b1-c2d3e4f56789.gif")).toBe(
      false
    );
  });

  it("rejects an empty string", () => {
    expect(IMAGE_URL_PATTERN.test("")).toBe(false);
  });
});
