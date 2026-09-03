-- Options that conflict with each other (John: we sell a knife of a certain
-- length that only fits a machine with a certain cut height -- a longer
-- knife would just break the machine). One row per UNORDERED pair of
-- options that must never both appear on the same item -- physical
-- incompatibility has no direction, so this is deliberately not a
-- directional table.
--
-- Table shape verified against "OptionCompatibility" in
-- prisma/migrations/0_init/migration.sql, the closest existing shape: same
-- id/optionId columns and cascade-on-delete-of-Option idea. It differs from
-- OptionCompatibility in two ways that both follow from being a pair of
-- options rather than an option-to-series-or-product link: (a) both id
-- columns are required (never optional/either-or), and (b) both foreign
-- keys cascade (OptionCompatibility's seriesId/productId are ON DELETE SET
-- NULL, but a half-conflict pointing at nothing is meaningless, so this
-- follows CatalogVisibility's ON DELETE CASCADE precedent instead -- see
-- prisma/migrations/z17_catalog_visibility/migration.sql).
--
-- Stored symmetrically: every row is normalised, at the point it's written
-- (see normalizeConflictPair in src/lib/validation/catalog.ts), so the
-- lower option id is always optionAId and the higher is always optionBId.
-- A conflict entered from either option's editor therefore always resolves
-- to the same single row, and the unique index below can actually catch a
-- duplicate entered from the other side -- a directional table (or one
-- without normalisation) would let an admin enter the pair from option A's
-- side, and B's editor would show no conflict at all.
--
-- No seed data ships with this table -- ships empty and changes nothing
-- until an admin adds a row (see the OptionConflict model comment in
-- schema.prisma).
CREATE TABLE "OptionConflict" (
    "id" TEXT NOT NULL,
    "optionAId" TEXT NOT NULL,
    "optionBId" TEXT NOT NULL,

    CONSTRAINT "OptionConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Normalised-pair uniqueness -- see the table comment above. This alone is
-- what makes "entered from either side, still one row" actually true: every
-- writer normalises before insert, so the same logical pair can never reach
-- this index in both orders.
CREATE UNIQUE INDEX "OptionConflict_optionAId_optionBId_key" ON "OptionConflict"("optionAId", "optionBId");

-- A row must never pair an option with itself -- the application layer
-- guards this first (normalizeConflictPair refuses a self-pair before it
-- ever reaches the database), and this CHECK is the cheap second line of
-- defence the database can express directly. (Prisma 7.10.0 has no
-- `checkConstraints` preview feature, so this constraint exists only here,
-- not in schema.prisma -- see the model comment there.)
ALTER TABLE "OptionConflict" ADD CONSTRAINT "OptionConflict_not_self" CHECK ("optionAId" <> "optionBId");

-- AddForeignKey
ALTER TABLE "OptionConflict" ADD CONSTRAINT "OptionConflict_optionAId_fkey" FOREIGN KEY ("optionAId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionConflict" ADD CONSTRAINT "OptionConflict_optionBId_fkey" FOREIGN KEY ("optionBId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
