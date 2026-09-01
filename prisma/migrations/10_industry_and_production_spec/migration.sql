-- Production order forms (docs/specs/2026-09-01-production-order-forms-design.md).
--
-- Industry becomes a lookup table because the list is bulk-imported and
-- shared: one row per industry that every company references, so fixing an
-- imported typo fixes it everywhere. ON DELETE SET NULL so removing an
-- industry never blocks and never cascades into companies.
--
-- DocumentItem gains the two fields the order forms need but the price list
-- has no reason to carry: productionSpec (screen side, knife size, voltage,
-- drills, table sections) and lineGroup, which keeps the operator-screen
-- side consistent across a cutter and its spreaders. lineGroup defaults to 1
-- so every existing item reads as "the only line" with no data migration.
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

-- Application-level dedup (createIndustry in src/lib/actions/industries.ts)
-- compares normalized names before inserting, but that is check-then-act and
-- races: two people typing "automotive" and "Automotive" into the picker at
-- the same moment would both pass their own check. This index is the backstop
-- that makes the table's whole premise -- one row per industry, so fixing a
-- typo fixes it everywhere -- actually hold under concurrency. Expressed in
-- SQL rather than schema.prisma because Prisma cannot declare a functional
-- index; see the partial unique indexes on OptionCompatibility in
-- 0_init/migration.sql for the same pattern.
CREATE UNIQUE INDEX "Industry_name_lower_key" ON "Industry" (LOWER("name"));

ALTER TABLE "Company" ADD COLUMN "industryId" TEXT;

-- Supports the affected-company count shown before an industry rename
-- ("Used by 14 companies"), which counts Company rows by industryId.
CREATE INDEX "Company_industryId_idx" ON "Company"("industryId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_industryId_fkey"
    FOREIGN KEY ("industryId") REFERENCES "Industry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentItem" ADD COLUMN "productionSpec" JSONB,
ADD COLUMN "lineGroup" INTEGER NOT NULL DEFAULT 1;
