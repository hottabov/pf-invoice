-- Draft-first builder (Phase 4 Task C): a Document is created immediately as
-- a DRAFT, before a client is picked, so `companyId` can no longer be
-- NOT NULL. The existing `Document_companyId_fkey` foreign key (added in
-- 0_init, ON DELETE RESTRICT) is untouched -- only the NULL-ability changes.
-- Finalizing a document (Phase 5) will require companyId to be set again,
-- enforced in application code rather than at the schema level.
ALTER TABLE "Document" ALTER COLUMN "companyId" DROP NOT NULL;
