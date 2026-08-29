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
import {
  type Catalog,
  REGIONS,
  mapSeries,
  mapProducts,
  mapOptions,
  mapPrices,
  mapCompatibility,
} from "./seed-lib";

const catalog = catalogData as Catalog;

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

  // 3. Products
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

  // 4. Options
  const optionIdByCode = new Map<string, string>();
  for (const o of mapOptions(catalog)) {
    const option = await db.option.upsert({
      where: { code: o.code },
      update: { name: o.name, shortDescription: o.shortDescription, sortOrder: o.sortOrder },
      create: { code: o.code, name: o.name, shortDescription: o.shortDescription, sortOrder: o.sortOrder },
    });
    optionIdByCode.set(o.code, option.id);
  }

  // 5. Prices (AU only — the other regions have no pricing data yet)
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

  // 6. Option <-> Series compatibility. The (optionId, seriesId) partial
  // unique index only applies WHERE productId IS NULL, so Prisma's
  // composite-key `upsert` (which can't target a NULL member) doesn't
  // apply here — check for an existing row first, then create if absent.
  let compatCount = 0;
  for (const c of mapCompatibility(catalog)) {
    const optionId = optionIdByCode.get(c.optionCode);
    const seriesId = seriesIdByCode.get(c.seriesCode);
    if (!optionId || !seriesId) {
      throw new Error(`seed: compatibility references unknown option/series ${c.optionCode}/${c.seriesCode}`);
    }
    const existing = await db.optionCompatibility.findFirst({
      where: { optionId, seriesId, productId: null },
    });
    if (!existing) {
      try {
        await db.optionCompatibility.create({ data: { optionId, seriesId, productId: null } });
      } catch (e) {
        // Two concurrent/duplicate seed runs can both pass the findFirst
        // check above and then race on the create -- the loser hits the
        // partial unique index (optionId, seriesId) WHERE productId IS NULL
        // as a P2002 unique-constraint violation. That's the same "already
        // compatible" outcome the findFirst branch above no-ops on, so treat
        // it the same way instead of failing the whole seed run. Any other
        // error is a genuine problem and must still propagate.
        const isDuplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (!isDuplicate) throw e;
      }
    }
    compatCount++;
  }

  console.log("seed: done");
  console.log(`  regions:       ${regionIdByCode.size}`);
  console.log(`  series:        ${seriesIdByCode.size}`);
  console.log(`  products:      ${productIdByCode.size}`);
  console.log(`  options:       ${optionIdByCode.size}`);
  console.log(`  prices:        ${priceCount}`);
  console.log(`  compatibility: ${compatCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
