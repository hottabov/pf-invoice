-- A manual unit price (John: "if I give it away for zero dollars... I give
-- them back zero dollars"; "increase the price of the machine by $10,000 and
-- give away $10,000 worth of options") needs the catalogue price preserved
-- alongside it, or the size of the concession -- and therefore the region
-- discount cap it must be checked against (Ross: "if the price they're
-- selling for is less than the maximum discount that's allowed... it
-- shouldn't allow them to save the quote") -- becomes uncomputable after the
-- fact. `unitPrice` on both tables keeps meaning "what the customer is
-- actually charged"; `listPrice` is the catalogue price at the moment the
-- row was added, read-only from the app's point of view.
--
-- Column names verified against prisma/migrations/0_init/migration.sql:
-- both DocumentItem.unitPrice and DocumentLine.unitPrice are DECIMAL(12,2).
ALTER TABLE "DocumentItem" ADD COLUMN "listPrice" DECIMAL(12,2);
ALTER TABLE "DocumentLine" ADD COLUMN "listPrice" DECIMAL(12,2);

-- Backfill every existing row so it reads as "no concession" -- a document
-- saved before this migration never had a hand-edited price, so its
-- catalogue price is exactly whatever unitPrice already is.
UPDATE "DocumentItem" SET "listPrice" = "unitPrice";
UPDATE "DocumentLine" SET "listPrice" = "unitPrice";
