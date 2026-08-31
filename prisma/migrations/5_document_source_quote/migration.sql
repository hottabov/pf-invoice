-- "Create invoice" from an approved QUOTE (owner: sales approve quote ->
-- invoice without re-entry -- see createInvoiceFromQuote in
-- src/lib/actions/documents.ts): a self-referencing, nullable FK from the
-- new INVOICE back to the QUOTE it was copied from. ON DELETE SET NULL (not
-- CASCADE/RESTRICT) so deleting the source quote -- only ever possible while
-- it's still a DRAFT, see deleteDraft -- never blocks and never cascades
-- into the invoice(s) it already produced; they just lose the backlink.
ALTER TABLE "Document" ADD COLUMN "sourceQuoteId" TEXT;

CREATE INDEX "Document_sourceQuoteId_idx" ON "Document"("sourceQuoteId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
