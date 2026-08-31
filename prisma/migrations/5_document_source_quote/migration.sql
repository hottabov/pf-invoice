-- "Create invoice" from an approved QUOTE (owner: sales approve quote ->
-- invoice without re-entry -- see createInvoiceFromQuote in
-- src/lib/actions/documents.ts): a self-referencing, nullable FK from the
-- new INVOICE back to the QUOTE it was copied from. ON DELETE SET NULL (not
-- CASCADE/RESTRICT) so deleting the source quote never blocks and never cascades
-- into the invoice(s) it already produced; they just lose the backlink. Quote
-- deletion is allowed by deleteDocument (DRAFT by anyone, FINAL by ADMIN only),
-- and the SET NULL constraint handles both cases.
ALTER TABLE "Document" ADD COLUMN "sourceQuoteId" TEXT;

CREATE INDEX "Document_sourceQuoteId_idx" ON "Document"("sourceQuoteId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
