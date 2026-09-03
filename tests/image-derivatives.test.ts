import { describe, expect, it } from "vitest";
import {
  DERIVATIVE_WIDTHS,
  derivativeFilename,
  parseDerivativeWidth,
} from "@/lib/image-derivatives";

const UUID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

describe("parseDerivativeWidth", () => {
  it("accepts every generated width", () => {
    for (const w of DERIVATIVE_WIDTHS) {
      expect(parseDerivativeWidth(String(w))).toBe(w);
    }
  });

  it("returns null when no width was asked for", () => {
    // The quotation sheet/PDF path: no `?w=`, so the print-resolution
    // original is served.
    expect(parseDerivativeWidth(null)).toBeNull();
  });

  it("rejects widths outside the closed set", () => {
    // Every accepted width writes a file to disk, so an open range would let
    // a crawler fill the uploads volume with near-identical derivatives.
    expect(parseDerivativeWidth("65")).toBeNull();
    expect(parseDerivativeWidth("1")).toBeNull();
    expect(parseDerivativeWidth("4096")).toBeNull();
  });

  it("rejects non-numeric and malformed values", () => {
    expect(parseDerivativeWidth("")).toBeNull();
    expect(parseDerivativeWidth("64px")).toBeNull();
    expect(parseDerivativeWidth("abc")).toBeNull();
    expect(parseDerivativeWidth("-64")).toBeNull();
    expect(parseDerivativeWidth("NaN")).toBeNull();
  });
});

describe("derivativeFilename", () => {
  it("names a raster derivative after the original's uuid and width", () => {
    expect(derivativeFilename(`${UUID}.png`, 128)).toBe(`${UUID}-w128.webp`);
    expect(derivativeFilename(`${UUID}.jpg`, 64)).toBe(`${UUID}-w64.webp`);
    expect(derivativeFilename(`${UUID}.webp`, 256)).toBe(`${UUID}-w256.webp`);
  });

  it("keys the cache by the original's uuid, so widths never collide", () => {
    const a = derivativeFilename(`${UUID}.png`, 64);
    const b = derivativeFilename(`${UUID}.png`, 128);
    expect(a).not.toBe(b);
  });

  it("has no derivative for SVG", () => {
    // Vector art is resolution independent and already a few KB — resizing
    // it would only lose that.
    expect(derivativeFilename(`${UUID}.svg`, 128)).toBeNull();
  });

  it("refuses anything resolveUploadPath would refuse", () => {
    // Same guard as the originals: a traversal attempt or an unexpected
    // extension must never reach path.join.
    expect(derivativeFilename("../../etc/passwd", 128)).toBeNull();
    expect(derivativeFilename("a/b.png", 128)).toBeNull();
    expect(derivativeFilename("not-a-uuid.png", 128)).toBeNull();
    expect(derivativeFilename(`${UUID}.gif`, 128)).toBeNull();
    expect(derivativeFilename(`${UUID}`, 128)).toBeNull();
  });
});
