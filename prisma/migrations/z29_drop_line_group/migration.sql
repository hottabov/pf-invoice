-- Production lines are gone.
--
-- `lineGroup` existed for one purpose: to say which machines stood together,
-- so that setting an operator screen side on one could set it on the rest.
-- The owner has since found the case that defeats it -- a cutter's screen on
-- one side while the conveyor and FabricPro controls face the other -- so the
-- side is now offered to the rest of the quote and the manager decides. With
-- that, nothing reads the column: it never reached a printed form, a price,
-- or the customer's quote.
ALTER TABLE "DocumentItem" DROP COLUMN "lineGroup";
