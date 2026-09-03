-- Supersedes z20_option_conflict, not amended: that migration's
-- OptionConflict stored one row per UNORDERED PAIR of options that could
-- never both appear on the same item. The owner clarified the real case is
-- three or more mutually exclusive options ("Це може бути 3 і більше опцій
-- які між собою не сумісні" -- "This can be 3 or more options that are
-- incompatible with each other"), and a pairwise table can only express
-- that as a clique -- three mutually exclusive options need three pairwise
-- rows, five need ten, and an admin who enters nine of those ten leaves a
-- half-conflict in the catalogue with no way for the schema to catch it.
--
-- This migration replaces OptionConflict with a named group
-- (OptionConflictGroup) plus its membership rows
-- (OptionConflictGroupMember): an option either is or isn't a member, full
-- stop, so "two options conflict" becomes "they share at least one group"
-- -- see both models' comments in schema.prisma. z20_option_conflict itself
-- is left in place, unedited (the owner may already have applied it) --
-- OptionConflict shipped empty (no seed data, and per the owner's own words
-- above, no concrete pairs existed yet to enter), so dropping it here loses
-- no data, only a mechanism being replaced by a better one.
DROP TABLE "OptionConflict";

-- Table/column shape verified against "OptionCompatibility" in
-- prisma/migrations/0_init/migration.sql -- same id/name-or-relation-column
-- shape as that table's own id/optionId pairing.
CREATE TABLE "OptionConflictGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "OptionConflictGroup_pkey" PRIMARY KEY ("id")
);

-- One row per (group, option) membership. Verified against
-- "OptionCompatibility" in prisma/migrations/0_init/migration.sql for the
-- same id/two-required-relation-columns/@@unique shape used below.
CREATE TABLE "OptionConflictGroupMember" (
    "id"       TEXT NOT NULL,
    "groupId"  TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "OptionConflictGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- An option can't be added to the same group twice, but nothing stops it
-- belonging to several different groups at once -- see the
-- OptionConflictGroup model comment in schema.prisma.
CREATE UNIQUE INDEX "OptionConflictGroupMember_groupId_optionId_key" ON "OptionConflictGroupMember"("groupId", "optionId");

-- AddForeignKey
-- Both FKs cascade on delete (like CatalogVisibility, unlike
-- OptionCompatibility's ON DELETE SET NULL): a membership row means nothing
-- once either its group or its option no longer exists, so removing either
-- must never leave an orphaned row behind.
ALTER TABLE "OptionConflictGroupMember" ADD CONSTRAINT "OptionConflictGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionConflictGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionConflictGroupMember" ADD CONSTRAINT "OptionConflictGroupMember_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
