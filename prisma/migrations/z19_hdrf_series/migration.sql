-- HDRF (Heavy Duty Roll Feeder) split out of the EasyFeeder ("EF") series
-- into its own catalogue series. Owner decision: the source price list
-- (RAW/Price List North America (01-06-2026).xlsx) gives HDRF its own sheet,
-- it has its own product image (hdrf.png), and it's a different machine, not
-- an EasyFeeder variant. Mirrors prisma/seed-data/catalog.json's new "HDRF"
-- series entry (see the comment on MANUAL_PRODUCTS.HDRF in
-- scripts/extract-catalog.ts for the full "why"). Trade-in stays exactly
-- where it is, under "SVC" (Service) -- not touched by this migration at
-- all.
--
-- Option-compatibility analysis (verified against catalog.json, and pinned
-- by tests/catalog.test.ts's "no option is compatibleSeries-scoped to EF"
-- test): zero options in the catalog are attached to the EF series at
-- series level -- the EasyFeeder sheet contributes no options at all (see
-- extractEasyFeeder in scripts/extract-catalog.ts, always returns
-- `options: []`). So there was never an EF-series-level option that HDRF
-- was implicitly riding on. The only options that ever applied to
-- HDRF-180/220/320 -- their three wooden-crate options ("HDRF-180/220/320
-- Crate- Wooden Crate for transport") -- are already product-scoped
-- (OptionCompatibility.productId, not seriesId; see MANUAL_OPTIONS in
-- scripts/extract-catalog.ts), so they move automatically with their
-- products via the UPDATE below and need no new OptionCompatibility rows
-- here. Nothing silently disappears for HDRF.
--
-- Idempotent: safe to run against a DB that still has the old structure
-- (HDRF-180/220/320 nested inside the EF series), a DB that was already
-- migrated by hand, or a fresh DB seeded straight from the corrected
-- catalog.json (HDRF products already on their own series). Both steps
-- below are guarded (WHERE NOT EXISTS / a no-op WHERE clause) so re-running
-- this file is always safe.

-- 1. Insert the HDRF series if it doesn't already exist. sortOrder is a
-- placeholder (EF's own sortOrder + 1, or 0 if EF is somehow absent) --
-- prisma/seed.ts's series upsert always overwrites Series.sortOrder from
-- catalog.json's array position on the next seed run, so the exact value
-- here only matters cosmetically until then.
INSERT INTO "Series" ("id", "code", "name", "maxDiscountPct", "sortOrder")
SELECT
  gen_random_uuid()::text,
  'HDRF',
  'Heavy Duty Roll Feeder',
  NULL,
  COALESCE((SELECT "sortOrder" FROM "Series" WHERE "code" = 'EF'), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM "Series" WHERE "code" = 'HDRF');

-- 2. Re-point the three HDRF products at the new series instead of EF.
-- Product.seriesId is NOT NULL / ON DELETE RESTRICT (see
-- prisma/migrations/0_init/migration.sql) -- this only ever updates the FK
-- value in place, never deletes or recreates the product, so every existing
-- Price, OptionCompatibility, DocumentItem and DocumentLine reference to
-- HDRF-180/220/320 is completely unaffected. No-ops (0 rows) on a DB where
-- these products don't exist yet, or already point at the HDRF series.
UPDATE "Product"
SET "seriesId" = (SELECT "id" FROM "Series" WHERE "code" = 'HDRF')
WHERE "code" IN ('HDRF-180', 'HDRF-220', 'HDRF-320')
  AND "seriesId" IS DISTINCT FROM (SELECT "id" FROM "Series" WHERE "code" = 'HDRF');
