/**
 * Imports product images: copies each distinct source PNG under
 * prisma/seed-data/product-images/ into the uploads directory (content-
 * addressed by md5, matching src/lib/uploads.ts's saveUpload naming
 * convention) and points the matching catalog Products' `imageUrl` at the
 * resulting `/api/files/<name>` URL.
 *
 * Mapping lives in scripts/import-images-lib.ts (pure, unit tested):
 *  - SERIES_IMAGES: every product in a whole series gets that series'
 *    image (M, XC, L, LNS, EF, FP -- one photo per product line).
 *  - PRODUCT_IMAGES: individual SW-series software modules that share
 *    PathWorks' screenshot, plus Production Analyst's own image. Every
 *    code was verified against prisma/seed-data/catalog.json's SW series
 *    at write time -- see that file's doc comment.
 * Deliberately unmapped, by design (no catalog code / no useful
 * stand-alone image): Punchline (P series), EasyLoader (EL series),
 * "LS Convert", and the fp-trolley.png / hdrf.png source images.
 *
 * Idempotent:
 *  - Filenames are content-addressed, so re-running never duplicates a
 *    file under uploadsDir() (skipped once it exists).
 *  - A product's imageUrl is only ever set once it's null, so a manually
 *    changed or cleared image is never clobbered by a re-run -- pass
 *    --force to overwrite regardless.
 *
 * Usage:
 *   npm run images:import [-- --dry] [-- --force]
 *   tsx scripts/import-product-images.ts [--dry] [--force]
 *
 * --dry    Print the plan (files that would be copied, products that would
 *          be updated) without writing anything to disk or the database.
 * --force  Overwrite imageUrl even on a product that already has one.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  SERIES_IMAGES,
  PRODUCT_IMAGES,
  UNMAPPED_IMAGE_FILES,
  distinctImageFiles,
  md5UuidFilename,
} from "./import-images-lib";

const SOURCE_DIR = path.resolve(__dirname, "..", "prisma", "seed-data", "product-images");

type Target = { code: string; imageUrl: string; via: string };

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const force = args.includes("--force");

  // Imported only now (not at module scope) so `--dry`/`--force` parsing
  // above can't accidentally be skipped by an early DB/env failure --
  // mirrors scripts/create-user.ts's "import db module only after
  // validation" convention.
  const { db } = await import("../src/lib/db");
  const { uploadsDir, IMAGE_URL_PATTERN } = await import("../src/lib/uploads");

  const destDir = uploadsDir();
  if (!dry) await mkdir(destDir, { recursive: true });

  // 1) Hash + copy every distinct source image exactly once.
  const filenameBySource = new Map<string, string>();
  for (const sourceFile of distinctImageFiles()) {
    const sourcePath = path.join(SOURCE_DIR, sourceFile);
    if (!existsSync(sourcePath)) {
      // A mapped source file missing from the vendored product-images/
      // directory is an environment/setup problem, not a data mismatch --
      // fail loudly rather than silently skip every product that needed it.
      throw new Error(`mapped source image not found: ${sourcePath}`);
    }

    const buffer = await readFile(sourcePath);
    const filename = md5UuidFilename(buffer);
    filenameBySource.set(sourceFile, filename);

    const destPath = path.join(destDir, filename);
    const alreadyExists = existsSync(destPath);
    if (dry) {
      console.log(`[dry] ${sourceFile} -> ${filename}${alreadyExists ? " (already in uploads)" : ""}`);
      continue;
    }
    if (alreadyExists) continue;
    await copyFile(sourcePath, destPath);
    console.log(`copied ${sourceFile} -> ${filename}`);
  }

  // 2) Resolve every mapped series/product code to its target imageUrl. A
  // Map (not a plain array) so a code reachable through two different
  // mappings with conflicting images is caught rather than silently
  // applying whichever happened to run last.
  const targetByCode = new Map<string, Target>();
  function addTarget(code: string, imageUrl: string, via: string) {
    const existing = targetByCode.get(code);
    if (existing && existing.imageUrl !== imageUrl) {
      console.warn(
        `warning: product "${code}" is reachable via both ${existing.via} and ${via} with different images -- keeping ${existing.via}`
      );
      return;
    }
    targetByCode.set(code, { code, imageUrl, via });
  }

  for (const [seriesCode, sourceFile] of Object.entries(SERIES_IMAGES)) {
    const filename = filenameBySource.get(sourceFile);
    if (!filename) continue; // unreachable: distinctImageFiles() always covers every mapping value

    const series = await db.series.findUnique({
      where: { code: seriesCode },
      include: { products: { select: { code: true } } },
    });
    if (!series) {
      console.warn(`warning: series code "${seriesCode}" (from SERIES_IMAGES) not found in catalog -- mapping mismatch, skipped`);
      continue;
    }
    if (series.products.length === 0) {
      console.warn(`warning: series "${seriesCode}" has no products -- nothing to update for it`);
    }
    for (const product of series.products) {
      addTarget(product.code, `/api/files/${filename}`, `series ${seriesCode}`);
    }
  }

  for (const [productCode, sourceFile] of Object.entries(PRODUCT_IMAGES)) {
    const filename = filenameBySource.get(sourceFile);
    if (!filename) continue; // unreachable, see above
    addTarget(productCode, `/api/files/${filename}`, "product code");
  }

  // 3) Apply -- one product at a time so "already has an image" is a
  // per-product skip, not all-or-nothing.
  let updated = 0;
  let skippedHasImage = 0;
  let skippedMissingProduct = 0;
  const mismatchedCodes: string[] = [];

  for (const target of Array.from(targetByCode.values()).sort((a, b) => a.code.localeCompare(b.code))) {
    if (!IMAGE_URL_PATTERN.test(target.imageUrl)) {
      // Defensive only -- md5UuidFilename always produces a matching shape.
      throw new Error(`internal error: built imageUrl "${target.imageUrl}" doesn't match IMAGE_URL_PATTERN`);
    }

    const product = await db.product.findUnique({ where: { code: target.code } });
    if (!product) {
      skippedMissingProduct++;
      mismatchedCodes.push(target.code);
      console.warn(`warning: product code "${target.code}" (${target.via}) not found in catalog -- skipped`);
      continue;
    }

    if (product.imageUrl !== null && !force) {
      skippedHasImage++;
      console.log(`skip (already has an image): ${target.code}`);
      continue;
    }

    if (dry) {
      console.log(`[dry] would set ${target.code}.imageUrl = ${target.imageUrl}`);
      updated++;
      continue;
    }

    await db.product.update({ where: { id: product.id }, data: { imageUrl: target.imageUrl } });
    updated++;
    console.log(`updated ${target.code} -> ${target.imageUrl}`);
  }

  console.log(`\nImport summary${dry ? " (dry run -- nothing written)" : ""}`);
  console.log("================");
  console.log(`  updated:              ${updated}`);
  console.log(`  skipped (has image):  ${skippedHasImage}`);
  console.log(`  skipped (no product): ${skippedMissingProduct}`);
  if (mismatchedCodes.length) console.log(`  mismatched codes:     ${mismatchedCodes.join(", ")}`);
  console.log(`  unmapped by design:   ${UNMAPPED_IMAGE_FILES.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
