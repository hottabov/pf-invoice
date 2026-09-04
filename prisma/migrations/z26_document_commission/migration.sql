-- Freezes a salesperson's commission at finalize time -- see
-- finalizeDocument (src/lib/actions/finalize.ts), which writes all three
-- columns together alongside entitySnapshot. Before FINAL, the builder
-- always computes commission live (getDocumentForBuilder,
-- src/lib/queries/documents.ts); once FINAL, it reads these columns
-- instead, so a later edit to the commission-tier table never rewrites
-- what an already-issued quote is recorded as having paid out.
--
-- All three nullable, and always written/read together: a DRAFT document
-- (or a FINAL one issued before this migration) has never had commission
-- frozen, and a document finalized while no commission-tier table was
-- configured (CommissionResult's "null means unconfigured, never $0.00"
-- rule -- src/lib/pricing.ts) freezes all three as NULL too, preserving
-- that same distinction rather than collapsing it to a misleading 0.
ALTER TABLE "Document" ADD COLUMN "commissionAmount" DECIMAL(12,2);
ALTER TABLE "Document" ADD COLUMN "commissionRatePct" DECIMAL(5,2);
ALTER TABLE "Document" ADD COLUMN "commissionBase" DECIMAL(12,2);
