-- Admin-overridable series card image for /catalog (owner: series cards
-- should show a product image; admin must be able to override it per
-- series) -- see Series.imageUrl in schema.prisma, listSeriesWithCounts in
-- src/lib/queries/catalog.ts (resolves to the first active product's
-- imageUrl when null), and updateSeriesImage in
-- src/lib/actions/catalog.ts. Nullable, defaults to NULL -- every existing
-- series falls back to its product image with no data migration needed.
ALTER TABLE "Series" ADD COLUMN "imageUrl" TEXT;
