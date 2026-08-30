import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  formatMd5AsUuid,
  md5UuidFilename,
  distinctImageFiles,
  SERIES_IMAGES,
  PRODUCT_IMAGES,
} from "../scripts/import-images-lib";

// Same shape scripts/import-product-images.ts relies on: src/lib/uploads.ts's
// (unexported) UPLOAD_FILENAME_PATTERN. Duplicated here rather than imported
// since it isn't exported -- kept in sync manually, same as that module's own
// IMAGE_URL_PATTERN comment describes for its sibling.
const UPLOAD_FILENAME_PATTERN = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

describe("formatMd5AsUuid", () => {
  it("inserts dashes at the 8-4-4-4-12 boundaries", () => {
    const hex = "0123456789abcdeffedcba9876543210";
    // 32 hex chars in, 36-char uuid-shaped string out.
    expect(formatMd5AsUuid(hex.slice(0, 32))).toBe("01234567-89ab-cdef-fedc-ba9876543210");
  });

  it("produces a 36-character string from a 32-character digest", () => {
    const hex = "d41d8cd98f00b204e9800998ecf8427e"; // md5("")
    const uuid = formatMd5AsUuid(hex);
    expect(uuid).toHaveLength(36);
    expect(uuid).toBe("d41d8cd9-8f00-b204-e980-0998ecf8427e");
  });
});

describe("md5UuidFilename", () => {
  it("matches the upload-serving filename pattern (uuid + .png)", () => {
    const filename = md5UuidFilename(Buffer.from("hello world"));
    expect(filename).toMatch(UPLOAD_FILENAME_PATTERN);
    expect(filename.endsWith(".png")).toBe(true);
  });

  it("is deterministic: same bytes always produce the same filename", () => {
    const buf = Buffer.from("the quick brown fox");
    expect(md5UuidFilename(buf)).toBe(md5UuidFilename(Buffer.from(buf))); // fresh copy, same bytes
  });

  it("produces different filenames for different content", () => {
    expect(md5UuidFilename(Buffer.from("a"))).not.toBe(md5UuidFilename(Buffer.from("b")));
  });

  it("matches manually computing md5 and formatting it", () => {
    const buf = Buffer.from("PathQuote product image");
    const expectedHex = createHash("md5").update(buf).digest("hex");
    expect(md5UuidFilename(buf)).toBe(`${formatMd5AsUuid(expectedHex)}.png`);
  });
});

describe("distinctImageFiles", () => {
  it("returns every image filename referenced by SERIES_IMAGES or PRODUCT_IMAGES, deduplicated", () => {
    const files = distinctImageFiles();
    const expectedSet = new Set([...Object.values(SERIES_IMAGES), ...Object.values(PRODUCT_IMAGES)]);
    expect(new Set(files)).toEqual(expectedSet);
    // pathworks.png is shared by 8 PRODUCT_IMAGES codes -- must appear once.
    expect(files.filter((f) => f === "pathworks.png")).toHaveLength(1);
  });

  it("is sorted", () => {
    const files = distinctImageFiles();
    expect(files).toEqual([...files].sort());
  });
});
