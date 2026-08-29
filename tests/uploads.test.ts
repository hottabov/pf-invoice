import { describe, it, expect } from "vitest";
import path from "path";
import { resolveUploadPath, IMAGE_URL_PATTERN, uploadsDir, sniffImageType } from "../src/lib/uploads";

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

describe("sniffImageType", () => {
  it("recognizes a JPEG by its FF D8 FF magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageType(buf)).toBe("jpg");
  });

  it("recognizes a PNG by its 89 50 4E 47 0D 0A 1A 0A signature", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffImageType(buf)).toBe("png");
  });

  it("recognizes a WebP by its RIFF....WEBP signature", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // chunk size, irrelevant to sniffing
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(sniffImageType(buf)).toBe("webp");
  });

  it("returns null for a buffer that matches no known signature", () => {
    expect(sniffImageType(Buffer.from("<html><body>not an image</body></html>"))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for a buffer that's too short to contain any signature", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it("does not misidentify a GIF (GIF89a) as any allowed type", () => {
    expect(sniffImageType(Buffer.from("GIF89a", "ascii"))).toBeNull();
  });

  it("does not misidentify an SVG/XML payload relabeled as an image", () => {
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg></svg>', "ascii"))).toBeNull();
  });

  it("rejects a buffer that has RIFF but not WEBP at offset 8 (e.g. a WAV file)", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WAVE", "ascii"),
    ]);
    expect(sniffImageType(buf)).toBeNull();
  });
});
