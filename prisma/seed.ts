/**
 * Idempotent DB seed: loads prisma/seed-data/catalog.json and upserts
 * Regions, Series, Products, Options, AU Prices and Option<->Series
 * compatibility. Safe to run repeatedly — every write is an upsert (or an
 * existence check before create, where Prisma's composite-key upsert can't
 * express a partial-unique-with-NULL constraint).
 *
 * Run:  npm run db:seed
 *
 * All mapping logic (catalog -> flat payloads) lives in prisma/seed-lib.ts
 * as pure functions so it can be unit tested without a database; this file
 * is the IO shell that turns those payloads into Prisma calls.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import catalogData from "./seed-data/catalog.json";
import contentBlocksData from "./seed-data/content-blocks.json";
import {
  type Catalog,
  type ContentBlocksJson,
  REGIONS,
  mapSeries,
  mapProducts,
  mapOptions,
  mapPrices,
  mapCompatibility,
  mapContentBlocks,
} from "./seed-lib";

const catalog = catalogData as Catalog;
const contentBlocksJson = contentBlocksData as ContentBlocksJson;

/**
 * Option codes retired by the EasyLoader/EasyFeeder/Software reclassification
 * fix: these sheets' rows were originally (incorrectly) extracted entirely as
 * options, leaving their series with 0 products. They're now products (see
 * scripts/extract-catalog.ts), so any pre-existing Option row seeded under
 * the old code must be removed -- otherwise it lingers alongside its new
 * product-equivalent, duplicating the item in the catalog UI.
 *
 * Exact old codes, as they existed in prisma/seed-data/catalog.json before
 * this fix (captured from the pre-change catalog, not regenerated):
 *  - the 2 EasyLoader drive-module options -> now products EL-2020 / EL-2420
 *  - the 3 EasyFeeder options -> now products EF-2020 / EF-2420 / EF-4030
 *  - the 10 Software options (incl. PRA-SW) -> now SW-series products of the
 *    same codes (PRA-SW's SW-sheet counterpart is now product code "PRA";
 *    L-Series' differently-priced "PRA-L" option is unaffected and stays).
 */
const RETIRED_OPTION_CODES: string[] = [
  // EasyLoader drive modules -> products EL-2020 / EL-2420.
  "EL-2020 Drive Module (first 1.2M)",
  "EL-2420 Drive Module (first 1.2M)",
  // EasyFeeder -> products EF-2020 / EF-2420 / EF-4030.
  "EasyFeeder- 2020",
  "EasyFeeder- 2420",
  "EasyFeeder- 4030",
  // Software -> products of the same codes.
  "ANT-V5",
  "ANT-V6",
  "EDG",
  "LS Convert",
  "PDG",
  "PRA-SW",
  "PTN",
  "PTW(S)",
  "WPL",
  "WPN",
];

async function main() {
  // Import db module only after dotenv has loaded DATABASE_URL.
  const { db } = await import("../src/lib/db");

  // 1. Regions
  const regionIdByCode = new Map<string, string>();
  for (const r of REGIONS) {
    const region = await db.region.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        currency: r.currency,
        taxName: r.taxName,
        taxRate: r.taxRate,
        entityName: r.entityName,
        entityLegalId: r.entityLegalId ?? null,
        entityAddress: r.entityAddress ?? null,
        bankDetails: r.bankDetails ?? undefined,
      },
      create: {
        code: r.code,
        name: r.name,
        currency: r.currency,
        taxName: r.taxName,
        taxRate: r.taxRate,
        entityName: r.entityName,
        entityLegalId: r.entityLegalId,
        entityAddress: r.entityAddress,
        bankDetails: r.bankDetails,
      },
    });
    regionIdByCode.set(r.code, region.id);
  }

  // 2. Series
  const seriesIdByCode = new Map<string, string>();
  for (const s of mapSeries(catalog)) {
    const series = await db.series.upsert({
      where: { code: s.code },
      update: { name: s.name, maxDiscountPct: s.maxDiscountPct, sortOrder: s.sortOrder },
      create: { code: s.code, name: s.name, maxDiscountPct: s.maxDiscountPct, sortOrder: s.sortOrder },
    });
    seriesIdByCode.set(s.code, series.id);
  }

  // 3. Retire options reclassified as products (or otherwise removed) by
  // this catalog revision -- see RETIRED_OPTION_CODES above. Only delete an
  // option if no DocumentLine snapshot still references it; a document that
  // already used the option keeps working as-is, and the stale option row
  // is left in place (skipped + warned) rather than breaking that document's
  // history. Price and OptionCompatibility rows cascade on Option delete.
  let retiredCount = 0;
  for (const code of RETIRED_OPTION_CODES) {
    const existing = await db.option.findUnique({ where: { code } });
    if (!existing) continue; // never seeded under this code (e.g. fresh DB) -- nothing to retire
    const refCount = await db.documentLine.count({ where: { refId: existing.id, kind: "OPTION" } });
    if (refCount > 0) {
      console.warn(
        `seed: retired option "${code}" is still referenced by ${refCount} document line(s) -- skipped, not deleted`
      );
      continue;
    }
    await db.option.delete({ where: { id: existing.id } });
    retiredCount++;
  }

  // 4. Rename legacy "XC-####" product codes to "X-####" (the X-Calibre
  // product-code prefix changed from "XC-" to "X-" -- see
  // scripts/extract-catalog.ts; the series code itself stays "XC"). Existing
  // DBs (local and the future VPS) may already contain products seeded under
  // the old "XC-####" codes, and some may already be referenced by
  // DocumentItems (e.g. a finalized quote) -- those rows can never be
  // deleted, and duplicating them under the new code is unacceptable, so
  // this renames the code string in place instead. Renaming (rather than
  // delete+recreate) preserves the product's id and every relation to it
  // (DocumentItems, Prices, OptionCompatibility, etc). If a product already
  // exists under the target "X-####" code (shouldn't happen — codes are
  // unique and this migration only ever needs to run once per row), the
  // update hits the unique-code constraint (P2002); log a warning and skip
  // rather than crashing the whole seed run.
  let renamedXCount = 0;
  const legacyXCProducts = await db.product.findMany({
    where: { code: { startsWith: "XC-" } },
  });
  for (const product of legacyXCProducts) {
    const match = /^XC-(\d+)$/.exec(product.code);
    if (!match) continue; // not a plain "XC-####" code -- leave untouched
    const newCode = `X-${match[1]}`;
    try {
      await db.product.update({
        where: { id: product.id },
        data: { code: newCode },
      });
      renamedXCount++;
    } catch (e) {
      const isDuplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isDuplicate) throw e;
      console.warn(
        `seed: cannot rename product "${product.code}" -> "${newCode}" -- a product with code "${newCode}" already exists; skipped`
      );
    }
  }

  // 5. Products
  const productIdByCode = new Map<string, string>();
  for (const p of mapProducts(catalog)) {
    const seriesId = seriesIdByCode.get(p.seriesCode);
    if (!seriesId) throw new Error(`seed: product ${p.code} references unknown series ${p.seriesCode}`);
    const product = await db.product.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description, seriesId, sortOrder: p.sortOrder },
      create: { code: p.code, name: p.name, description: p.description, seriesId, sortOrder: p.sortOrder },
    });
    productIdByCode.set(p.code, product.id);
  }

  // 6. Options
  const optionIdByCode = new Map<string, string>();
  for (const o of mapOptions(catalog)) {
    const option = await db.option.upsert({
      where: { code: o.code },
      update: { name: o.name, shortDescription: o.shortDescription, sortOrder: o.sortOrder },
      create: { code: o.code, name: o.name, shortDescription: o.shortDescription, sortOrder: o.sortOrder },
    });
    optionIdByCode.set(o.code, option.id);
  }

  // 7. Prices (AU only — the other regions have no pricing data yet)
  let priceCount = 0;
  for (const price of mapPrices(catalog, "AU")) {
    const regionId = regionIdByCode.get(price.regionCode);
    if (!regionId) throw new Error(`seed: price references unknown region ${price.regionCode}`);

    if (price.kind === "product") {
      const productId = productIdByCode.get(price.code);
      if (!productId) throw new Error(`seed: price references unknown product ${price.code}`);
      await db.price.upsert({
        where: { productId_regionId: { productId, regionId } },
        update: { amount: price.amount, needsReview: price.needsReview },
        create: { productId, regionId, amount: price.amount, needsReview: price.needsReview },
      });
    } else {
      const optionId = optionIdByCode.get(price.code);
      if (!optionId) throw new Error(`seed: price references unknown option ${price.code}`);
      await db.price.upsert({
        where: { optionId_regionId: { optionId, regionId } },
        update: { amount: price.amount, needsReview: price.needsReview },
        create: { optionId, regionId, amount: price.amount, needsReview: price.needsReview },
      });
    }
    priceCount++;
  }

  // 8. Option <-> Series/Product compatibility. Each row is series-level
  // (seriesId set, productId null) or product-level (productId set, seriesId
  // null) — never both, mirroring the two partial unique indexes in
  // schema.prisma. Both are partial ("WHERE the other column IS NULL"), so
  // Prisma's composite-key `upsert` (which can't target a NULL member)
  // doesn't apply either way — check for an existing row first, then create
  // if absent, same pattern for both branches.
  let compatCount = 0;
  for (const c of mapCompatibility(catalog)) {
    const optionId = optionIdByCode.get(c.optionCode);
    if (!optionId) {
      throw new Error(`seed: compatibility references unknown option ${c.optionCode}`);
    }

    const where =
      c.seriesCode !== undefined
        ? (() => {
            const seriesId = seriesIdByCode.get(c.seriesCode);
            if (!seriesId) {
              throw new Error(`seed: compatibility references unknown series ${c.seriesCode} (option ${c.optionCode})`);
            }
            return { optionId, seriesId, productId: null as string | null };
          })()
        : (() => {
            const productId = productIdByCode.get(c.productCode);
            if (!productId) {
              throw new Error(`seed: compatibility references unknown product ${c.productCode} (option ${c.optionCode})`);
            }
            return { optionId, seriesId: null as string | null, productId };
          })();

    const existing = await db.optionCompatibility.findFirst({ where });
    if (!existing) {
      try {
        await db.optionCompatibility.create({ data: where });
      } catch (e) {
        // Two concurrent/duplicate seed runs can both pass the findFirst
        // check above and then race on the create -- the loser hits the
        // relevant partial unique index (optionId, seriesId) WHERE productId
        // IS NULL, or (optionId, productId) WHERE seriesId IS NULL, as a
        // P2002 unique-constraint violation. That's the same "already
        // compatible" outcome the findFirst branch above no-ops on, so treat
        // it the same way instead of failing the whole seed run. Any other
        // error is a genuine problem and must still propagate.
        const isDuplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (!isDuplicate) throw e;
      }
    }
    compatCount++;
  }

  // 9. Content blocks -- one regionId:null "default" row per key from
  // prisma/seed-data/content-blocks.json. Create if the key has never been
  // seeded before; if a default row already exists, leave it entirely alone
  // (never overwrite title/body/sortOrder) so an admin's edits made via
  // /settings/content always win over re-running the seed. Like
  // OptionCompatibility above, ContentBlock's @@unique([key, regionId]) can't
  // stop two regionId:null rows for the same key at the Postgres level
  // (NULL is never equal to NULL for uniqueness purposes), so this checks
  // first via findFirst rather than a composite-key upsert, and tolerates a
  // P2002 from a concurrent/duplicate seed run the same way compatibility
  // rows do.
  let contentBlockCreated = 0;
  let contentBlockSkipped = 0;
  for (const block of mapContentBlocks(contentBlocksJson)) {
    const existing = await db.contentBlock.findFirst({
      where: { key: block.key, regionId: null },
    });
    if (existing) {
      contentBlockSkipped++;
      continue;
    }
    try {
      await db.contentBlock.create({
        data: {
          key: block.key,
          regionId: null,
          title: block.title,
          body: block.body,
          sortOrder: block.sortOrder,
        },
      });
      contentBlockCreated++;
    } catch (e) {
      const isDuplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isDuplicate) throw e;
      contentBlockSkipped++;
    }
  }

  console.log("seed: done");
  console.log(`  regions:        ${regionIdByCode.size}`);
  console.log(`  series:         ${seriesIdByCode.size}`);
  console.log(`  retired options: ${retiredCount}`);
  console.log(`  renamed XC->X products: ${renamedXCount}`);
  console.log(`  products:       ${productIdByCode.size}`);
  console.log(`  options:        ${optionIdByCode.size}`);
  console.log(`  prices:         ${priceCount}`);
  console.log(`  compatibility:  ${compatCount}`);
  console.log(`  content blocks: ${contentBlockCreated} created, ${contentBlockSkipped} skipped (already seeded)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
