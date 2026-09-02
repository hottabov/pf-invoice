-- Export sale collected at the factory door (Ex Works) is not a domestic
-- taxable supply -- the meeting question left unanswered ("What if there's
-- no GST? If it's Ex Works?") needs a document-level flag so the quote can
-- show no tax without a hand-edited tax rate. Defaults to DELIVERED so
-- every existing document keeps its current (taxed) behaviour.
--
-- Table/column style verified against prisma/migrations/0_init/migration.sql
-- (the "Document" table, the DocumentStatus enum + "status" column pattern)
-- and z12_discount_mode/migration.sql (CREATE TYPE ... ; ALTER TABLE
-- "Document" ADD COLUMN ... NOT NULL DEFAULT ...).
CREATE TYPE "DeliveryTerms" AS ENUM ('DELIVERED', 'EX_WORKS');

ALTER TABLE "Document" ADD COLUMN "deliveryTerms" "DeliveryTerms" NOT NULL DEFAULT 'DELIVERED';
