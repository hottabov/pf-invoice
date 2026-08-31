-- Quotation-first price display toggles (owner spec): a QUOTE's grand total
-- is always shown to the client regardless of these flags -- they only gate
-- the per-item/per-option detail in the investment summary. Meaningless for
-- an INVOICE (which always shows full detail) but kept on every Document row
-- rather than a QUOTE-only table, same reasoning as every other per-document
-- display flag (e.g. DocumentItem.showImage) in this schema.
ALTER TABLE "Document" ADD COLUMN "showItemPrices" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "showOptionPrices" BOOLEAN NOT NULL DEFAULT false;
