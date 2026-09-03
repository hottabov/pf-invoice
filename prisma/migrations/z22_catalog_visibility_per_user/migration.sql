-- Catalogue visibility is now scoped by individual user, not by region.
-- Shipped region-scoped in z17_catalog_visibility, but the owner corrected
-- the requirement: two salespeople in the same region can need different
-- catalogues ("є менеджер А і менеджер Б в USA... А не може продавати
-- X-Calibre... Наразі візабіліті налаштовано на регіон, а потрібно на
-- менеджера. Регіон тут ні до чого" -- there's manager A and manager B in
-- the USA, A can't sell the X-Calibre, visibility is currently set up per
-- region but needs to be per manager, region has nothing to do with it).
-- Region-as-default-with-per-user-exceptions was considered and rejected by
-- the owner in favour of per-user only -- see the CatalogVisibility model's
-- own doc comment in schema.prisma.
--
-- The table ships empty (z17_catalog_visibility never seeded rows, and the
-- feature never saw real production use), so there is no data to migrate --
-- only the shape changes. Recreated outright rather than altered in place
-- (same "supersede, don't amend" approach z21_option_conflict_groups took
-- for OptionConflict), which also makes this migration idempotent
-- regardless of whether z17_catalog_visibility has actually been applied
-- yet in the target database:
--   * already applied -- DROP TABLE IF EXISTS removes the region-scoped
--     table, then this recreates it userId-scoped.
--   * not yet applied -- z17 still runs first (migrations always apply in
--     order) and creates the region-scoped table; DROP TABLE IF EXISTS then
--     immediately removes it and this recreates it userId-scoped.
-- Either way the database ends up with exactly one CatalogVisibility table,
-- keyed on userId.
DROP TABLE IF EXISTS "CatalogVisibility";

-- Table/column shape otherwise unchanged from z17_catalog_visibility --
-- same id/optional-seriesId/optional-productId columns, same
-- @@unique([..., seriesId, productId]) shape, same ON DELETE CASCADE on
-- every FK (a hidden row means nothing once its user or its series/product
-- no longer exists) -- only regionId/Region is now userId/User.
CREATE TABLE "CatalogVisibility" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seriesId" TEXT,
    "productId" TEXT,

    CONSTRAINT "CatalogVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVisibility_userId_seriesId_productId_key" ON "CatalogVisibility"("userId", "seriesId", "productId");

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVisibility" ADD CONSTRAINT "CatalogVisibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
