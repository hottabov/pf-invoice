-- Per-distributor catalogue visibility (Ross, on a reseller not yet cleared
-- to sell the Excalibur X series: "we don't want him to even see the
-- Excalibur"). One row per (region x series-or-product) pair that is
-- HIDDEN -- see the CatalogVisibility model comment in schema.prisma for
-- why hidden rows (not visible rows) are what's stored: a region with no
-- rows here sees the whole catalogue, so neither a new region nor a new
-- product ever needs seeding to stay visible.
--
-- Table/column shape verified against "OptionCompatibility" in
-- prisma/migrations/0_init/migration.sql -- same id/optional-seriesId/
-- optional-productId columns, same @@unique([..., seriesId, productId])
-- shape (there: OptionCompatibility_optionId_seriesId_productId_key; here:
-- regionId in place of optionId).
--
-- Unlike OptionCompatibility's seriesId/productId FKs (ON DELETE SET NULL),
-- every FK here is ON DELETE CASCADE: a hidden row means nothing once its
-- region or its series/product no longer exists, so removing either must
-- never leave an orphaned row behind.
CREATE TABLE "CatalogVisibility" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "seriesId" TEXT,
    "productId" TEXT,

    CONSTRAINT "CatalogVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVisibility_regionId_seriesId_productId_key" ON "CatalogVisibility"("regionId", "seriesId", "productId");

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
