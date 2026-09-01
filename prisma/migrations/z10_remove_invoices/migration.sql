-- Invoicing is done by the accountant in their own system; this tool only
-- issues quotes. Every invoice row, the quote->invoice backlink, and the
-- document-type discriminator go together.

DELETE FROM "Document" WHERE "type" = 'INVOICE';
DELETE FROM "NumberSequence" WHERE "docType" = 'INVOICE';

ALTER TABLE "Document" DROP CONSTRAINT "Document_sourceQuoteId_fkey";
DROP INDEX "Document_sourceQuoteId_idx";
ALTER TABLE "Document" DROP COLUMN "sourceQuoteId";

DROP INDEX "NumberSequence_regionCode_docType_year_key";
ALTER TABLE "NumberSequence" DROP COLUMN "docType";
CREATE UNIQUE INDEX "NumberSequence_regionCode_year_key"
  ON "NumberSequence"("regionCode", "year");

ALTER TABLE "Document" DROP COLUMN "type";
DROP TYPE "DocumentType";
