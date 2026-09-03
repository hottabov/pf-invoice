-- Punchline retired from the catalogue entirely -- not deactivated, hard
-- deleted (owner: "не продаємо, видаляємо з каталогу взагалі. Видали
-- Punchline разом з його опціями" -- "we don't sell it, delete it from the
-- catalogue altogether; delete Punchline along with its options"). Mirrors
-- prisma/seed-data/catalog.json, which no longer has a "P" series at all
-- (see scripts/extract-catalog.ts's comment above extractSoftware for why
-- the series is dropped at extraction rather than extracted-and-filtered).
--
-- Scope: the "P" series (Series.code = 'P'), its two products (P-180,
-- P-220), and their one option (Crate-P, the only Option whose
-- OptionCompatibility ties it to series "P" or either product -- verified
-- against catalog.json before this migration was written; there is no
-- Punchline-specific install/service option). Price rows for all three
-- would cascade automatically on Product/Option delete (Price.productId and
-- Price.optionId are both ON DELETE CASCADE -- see the AddForeignKey
-- statements in prisma/migrations/0_init/migration.sql), and Crate-P's
-- OptionCompatibility row cascades the same way via optionId -- both are
-- still deleted explicitly below so this migration reads as the complete
-- list of what's removed, not an implicit side effect. Any CatalogVisibility
-- row hiding series "P" or either product for some region (see migration
-- z17_catalog_visibility) cascades away too (also ON DELETE CASCADE) with no
-- statement needed here at all.
--
-- Safety: There are no real quotes in production today, so this hard delete
-- is safe to run as-is. It still fails loudly rather than silently losing
-- data if that has changed by the time this runs -- DocumentItem.productId
-- is ON DELETE SET NULL (not CASCADE or RESTRICT), which would otherwise
-- quietly sever a real quote's own item from its product; DocumentLine.refId
-- (the OPTION/PRODUCT line snapshot's back-reference, e.g. an added Crate-P
-- line, or a document-level PRODUCT line pointing straight at P-180/P-220)
-- isn't a real foreign key at all, so the database would never catch a
-- reference through it on its own. The DO block below checks both
-- explicitly and raises before anything is deleted; the whole file runs in
-- one transaction (Prisma's default), so a raised exception here leaves the
-- database completely untouched rather than partially cleaned up.
DO $$
DECLARE
  item_refs integer;
  line_refs integer;
BEGIN
  SELECT count(*) INTO item_refs
  FROM "DocumentItem"
  WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "code" IN ('P-180', 'P-220'));

  IF item_refs > 0 THEN
    RAISE EXCEPTION
      'Cannot retire Punchline: % DocumentItem row(s) still reference P-180/P-220. Resolve those quotes first.',
      item_refs;
  END IF;

  SELECT count(*) INTO line_refs
  FROM "DocumentLine"
  WHERE ("kind" = 'PRODUCT' AND "refId" IN (SELECT "id" FROM "Product" WHERE "code" IN ('P-180', 'P-220')))
     OR ("kind" = 'OPTION' AND "refId" IN (SELECT "id" FROM "Option" WHERE "code" = 'Crate-P'));

  IF line_refs > 0 THEN
    RAISE EXCEPTION
      'Cannot retire Punchline: % DocumentLine row(s) still reference P-180/P-220 or Crate-P. Resolve those quotes first.',
      line_refs;
  END IF;
END $$;

-- Price rows (explicit -- see the cascade note above for why this isn't
-- strictly required, kept anyway so the delete list here is complete).
DELETE FROM "Price" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "code" IN ('P-180', 'P-220'));
DELETE FROM "Price" WHERE "optionId" IN (SELECT "id" FROM "Option" WHERE "code" = 'Crate-P');

-- Crate-P's compatibility row (explicit, same cascade note as above).
DELETE FROM "OptionCompatibility" WHERE "optionId" IN (SELECT "id" FROM "Option" WHERE "code" = 'Crate-P');

-- The option, the two products, then the series -- Product.seriesId is ON
-- DELETE RESTRICT (see prisma/migrations/0_init/migration.sql), so the
-- series must go last or this statement order itself would fail loudly.
DELETE FROM "Option" WHERE "code" = 'Crate-P';
DELETE FROM "Product" WHERE "code" IN ('P-180', 'P-220');
DELETE FROM "Series" WHERE "code" = 'P';

-- The "equipment.punchline" content block (prisma/seed-data/content-blocks.json,
-- see quotation-data.ts's productBlockKey) has nothing left to render for --
-- no Punchline product can exist to look it up by series "P" anymore.
-- Content, not billing data, so no DocumentItem/DocumentLine-style guard
-- above; regionId is unconstrained (drops both the seed's own regionId:null
-- default row and any per-region override an admin made via /settings/content).
DELETE FROM "ContentBlock" WHERE "key" = 'equipment.punchline';
