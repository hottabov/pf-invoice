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
 *
 * Three independent things are mapped here, all imported/applied by the
 * same script:
 *  - SERIES_IMAGES / PRODUCT_IMAGES: per-series and per-product photos under
 *    prisma/seed-data/product-images/ -> Product.imageUrl.
 *  - ICON_OPTION_TARGETS / ICON_PRODUCT_TARGETS: per-option icons under
 *    prisma/seed-data/option-icons/ -> Option.imageUrl (primary intent) and,
 *    for a few codes, also Product.imageUrl (bonus, only-if-null).
 *  - The region brand logo under prisma/seed-data/brand/ -> every Region's
 *    logoUrl (only-if-null) -- that one's a single fixed file, not a map, so
 *    it's handled directly in the import script with no lib helper.
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
 * SERIES_IMAGES. Verified against prisma/seed-data/catalog.json: every key
 * below is an exact `code` present there. Most are SW-series software
 * modules sharing PathWorks' screenshot or Production Analyst's own image
 * ("PTW(S)", "ANT-V5", "ANT-V6" etc. match catalog.json byte-for-byte);
 * FP-TROLLEY and HDRF are the two hand-authored manual products (see
 * MANUAL_PRODUCTS in scripts/extract-catalog.ts), each with its own
 * standalone photo. "LS Convert" is the SW series' one other product and
 * is deliberately left unmapped (see UNMAPPED_IMAGE_FILES).
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
  "FP-TROLLEY": "fp-trolley.png",
  HDRF: "hdrf.png",
};

/**
 * Source images under prisma/seed-data/product-images/ that exist but are
 * intentionally referenced by neither SERIES_IMAGES nor PRODUCT_IMAGES --
 * documentation only (surfaced in the import script's summary), not used
 * in any lookup:
 *  - Punchline (P series) and EasyLoader (EL series) have no source image
 *    at all.
 *  - "LS Convert" (SW series) has no source image at all.
 */
export const UNMAPPED_IMAGE_FILES: string[] = [];

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
 * Icon base code (matches prisma/seed-data/option-icons/<code-lowercased>.png,
 * e.g. "ABR" -> abr.png) -> catalog Option codes whose `imageUrl` this icon
 * should fill. Same only-if-null-unless---force rule as PRODUCT_IMAGES above
 * applies when the import script applies these. Every option code below was
 * verified present in prisma/seed-data/catalog.json's `options[].code` list
 * at the time this map was written; scripts/import-product-images.ts also
 * re-checks this at runtime (warns, doesn't crash, on a mismatch).
 */
export const ICON_OPTION_TARGETS: Record<string, string[]> = {
  ABR: ["ABR-M", "ABR-L"],
  AFP: ["AFP"],
  APM: ["APM-M", "APM-L"],
  BCR: ["BCR-M", "BCR-L"],
  DR2: ["DR2"],
  DRG: ["DRG-1", "DRG-2", "DRG-3"],
  HDC: ["HDC-M", "HDC-L"],
  HFV: ["HFV-M", "HFV-L"],
  IJP: ["IJP"],
  IKA: ["IKA"],
  MRK: ["MRK"],
  MTS: ["MTS", "MTS- additional travel p/Metre"],
  OFD: ["OFD-M", "OFD-L"],
  OFJ: ["OFJ"],
  OFP: ["OFP-M", "OFP-L"],
  PRA: ["PRA-L"],
  PRM: ["PRM-M", "PRM-L"],
  PTW: ["PTW"],
};

/**
 * Same icon base code -> catalog Product codes, for the handful of icons
 * that ALSO double as a product image. This is bonus coverage on top of the
 * option icons above, not the primary intent -- the only-if-null rule means
 * it mostly no-ops: ANT-V5, ANT-V6 and PTW(S) already got pathworks.png from
 * PRODUCT_IMAGES (see that map's doc comment), so in a normal (non---force)
 * run only "LS Convert" -- previously in UNMAPPED_IMAGE_FILES, now filled by
 * the LSC icon -- actually changes. --force lets an icon image win over an
 * existing PRODUCT_IMAGES image for these codes; this map is applied after
 * PRODUCT_IMAGES by the import script, so under --force the icon wins.
 */
export const ICON_PRODUCT_TARGETS: Record<string, string[]> = {
  ANT: ["ANT-V5", "ANT-V6"],
  PRA: ["PRA"],
  PTW: ["PTW(S)"],
  LSC: ["LS Convert"],
};

/**
 * Icon base codes present under prisma/seed-data/option-icons/ that are
 * deliberately unmapped -- no catalog option or product code identified for
 * them. Surfaced in the import script's summary (logged as skipped), not
 * used in any lookup or copied to uploads.
 */
export const UNMAPPED_ICONS: string[] = ["JTP"];

/**
 * Every distinct icon base code referenced by ICON_OPTION_TARGETS or
 * ICON_PRODUCT_TARGETS, sorted for deterministic output. Each corresponding
 * <code-lowercased>.png file is hashed/copied exactly once regardless of how
 * many option/product codes map to it (e.g. PRA and PTW each feed both an
 * option and a product target).
 */
export function distinctIconCodes(): string[] {
  return Array.from(new Set([...Object.keys(ICON_OPTION_TARGETS), ...Object.keys(ICON_PRODUCT_TARGETS)])).sort();
}

/** Filename under prisma/seed-data/option-icons/ for a given icon base code. */
export function iconFilename(code: string): string {
  return `${code.toLowerCase()}.png`;
}

/**
 * Every catalog Option code targeted by ICON_OPTION_TARGETS, flattened (not
 * deduplicated -- a duplicate here is exactly what findDuplicateOptionTargets
 * below flags as a bug). Used by the import script's startup sanity check
 * against prisma/seed-data/catalog.json.
 */
export function allIconOptionCodes(): string[] {
  return Object.values(ICON_OPTION_TARGETS).flat();
}

/**
 * Option codes that appear under more than one icon in ICON_OPTION_TARGETS
 * -- i.e. a mapping bug, since every option should get its image from
 * exactly one icon. Returns the duplicated codes (empty when the map is
 * well-formed); scripts/import-product-images.ts's addTarget-style conflict
 * handling for products doesn't apply to options, so this is how the option
 * map's well-formedness is checked instead (see tests/import-images.test.ts).
 */
export function findDuplicateOptionTargets(): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const codes of Object.values(ICON_OPTION_TARGETS)) {
    for (const code of codes) {
      if (seen.has(code)) dupes.push(code);
      else seen.add(code);
    }
  }
  return dupes;
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
