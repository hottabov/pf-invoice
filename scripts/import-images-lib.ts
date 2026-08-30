/**
 * Pure mapping/formatting layer for scripts/import-product-images.ts.
 *
 * No IO and no Prisma client here on purpose -- everything in this file is
 * a plain function of its inputs, so it can be unit tested without a
 * database or filesystem (see tests/import-images.test.ts). The script
 * itself is the IO shell: it reads the source PNGs, calls into this file
 * for the pure hashing/formatting logic, then writes files and Prisma
 * updates from the result. Mirrors the prisma/seed-lib.ts + prisma/seed.ts
 * split already used elsewhere in this repo.
 */
import { createHash } from "node:crypto";

/**
 * Series code -> filename under prisma/seed-data/product-images/. Every
 * product belonging to the series gets this same image (there's no
 * per-model photo in the source material, just one shot per product line).
 */
export const SERIES_IMAGES: Record<string, string> = {
  M: "m-series.png",
  XC: "x-calibre.png",
  L: "l-series.png",
  LNS: "leather-nesting.png",
  EF: "easyfeeder.png",
  FP: "fabricpro.png",
};

/**
 * Individual product code -> filename, for products that aren't covered by
 * SERIES_IMAGES (all currently SW-series software modules). Verified
 * against prisma/seed-data/catalog.json's SW series: every key below is an
 * exact `code` present there ("PTW(S)", "ANT-V5", "ANT-V6" etc. match
 * catalog.json byte-for-byte). "LS Convert" is the SW series' one other
 * product and is deliberately left unmapped (see UNMAPPED_IMAGE_FILES).
 */
export const PRODUCT_IMAGES: Record<string, string> = {
  PRA: "production-analyst.png",
  "PTW(S)": "pathworks.png",
  WPN: "pathworks.png",
  WPL: "pathworks.png",
  PDG: "pathworks.png",
  "ANT-V5": "pathworks.png",
  "ANT-V6": "pathworks.png",
  PTN: "pathworks.png",
  EDG: "pathworks.png",
};

/**
 * Source images under prisma/seed-data/product-images/ that exist but are
 * intentionally referenced by neither SERIES_IMAGES nor PRODUCT_IMAGES --
 * documentation only (surfaced in the import script's summary), not used
 * in any lookup:
 *  - fp-trolley.png / hdrf.png: no matching catalog series or product code.
 *  - Punchline (P series) and EasyLoader (EL series) have no source image
 *    at all.
 *  - "LS Convert" (SW series) has no source image at all.
 */
export const UNMAPPED_IMAGE_FILES = ["fp-trolley.png", "hdrf.png"];

/**
 * Every distinct image filename actually referenced by SERIES_IMAGES or
 * PRODUCT_IMAGES, sorted for deterministic output. Each is hashed/copied
 * exactly once regardless of how many series/products map to it (e.g.
 * pathworks.png is shared by 8 different SW product codes).
 */
export function distinctImageFiles(): string[] {
  return Array.from(new Set([...Object.values(SERIES_IMAGES), ...Object.values(PRODUCT_IMAGES)])).sort();
}

/**
 * Formats a 32-hex-char digest as a UUID-shaped string (8-4-4-4-12). This
 * is the exact shape src/lib/uploads.ts's (unexported) UPLOAD_FILENAME_PATTERN
 * requires -- `^[a-f0-9-]{36}\.(jpg|png|webp)$` -- once an extension is
 * appended: 32 hex chars + 4 dashes = 36 chars. Pure string slicing, no
 * validation that `hex` actually looks like a digest since its only caller
 * (md5UuidFilename) always passes a real md5 hexdigest (already lowercase
 * hex, same charset the pattern expects).
 */
export function formatMd5AsUuid(hex: string): string {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join(
    "-"
  );
}

/**
 * Deterministic, content-addressed filename for an imported product image:
 * md5(fileBuffer) formatted as a uuid, plus a ".png" extension (every
 * source file under prisma/seed-data/product-images/ is a PNG). The same
 * input bytes always produce the same filename, which is what makes
 * scripts/import-product-images.ts idempotent -- re-running it against the
 * same source files always resolves to the same uploads/ filename, so "does
 * this file already exist" is a reliable dedupe check across runs, and two
 * distinct source files never collide unless their bytes are identical.
 */
export function md5UuidFilename(buffer: Buffer): string {
  const hex = createHash("md5").update(buffer).digest("hex");
  return `${formatMd5AsUuid(hex)}.png`;
}
