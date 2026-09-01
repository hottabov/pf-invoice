-- A discount is now a mode plus a value. Storing a mode rather than two
-- nullable columns makes "both set and disagreeing" unrepresentable.
CREATE TYPE "DiscountMode" AS ENUM ('PERCENT', 'AMOUNT');

ALTER TABLE "Document" RENAME COLUMN "discountPct" TO "discountValue";
ALTER TABLE "Document" ALTER COLUMN "discountValue" TYPE DECIMAL(12,2);
ALTER TABLE "Document" ADD COLUMN "discountMode" "DiscountMode" NOT NULL DEFAULT 'PERCENT';

ALTER TABLE "DocumentItem" RENAME COLUMN "discountPct" TO "discountValue";
ALTER TABLE "DocumentItem" ALTER COLUMN "discountValue" TYPE DECIMAL(12,2);
ALTER TABLE "DocumentItem" ADD COLUMN "discountMode" "DiscountMode" NOT NULL DEFAULT 'PERCENT';
