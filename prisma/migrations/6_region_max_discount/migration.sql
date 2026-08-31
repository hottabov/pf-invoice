-- Discount caps move from Series (per-product-line) to Region (owner spec:
-- "USA 15%, Australia 10; don't surface in the catalog") -- see
-- Region.maxDiscountPct in schema.prisma and the enforcement switch in
-- setItemDiscount/setDocumentDiscount (src/lib/actions/documents.ts).
-- Series.maxDiscountPct is left in place (now unused) rather than dropped --
-- no destructive migration for a column that might still hold admin-entered
-- data.
ALTER TABLE "Region" ADD COLUMN "maxDiscountPct" DECIMAL(5,2);
