-- A salesperson earns no commission on this product/option -- e.g. the
-- North America price list's "no discount/commission on Installation/
-- Training". Read live off the joined Product/Option at commission-compute
-- time (see EngineItem.isNoCommission / EngineItemLine.isNoCommission in
-- src/lib/pricing.ts), not snapshotted onto DocumentItem/DocumentLine, the
-- same live-join rule Product.isCredit already follows (migration
-- z16_product_is_credit) -- so correcting the flag in the catalogue is
-- reflected on every quote read afterwards, not just new ones.
--
-- NOT NULL with a `false` default, so every existing product/option (and
-- every row inserted by an older client mid-deploy) is unaffected -- same
-- "unset/existing changes nothing" contract every boolean column addition in
-- this app follows (see z16_product_is_credit's own migration.sql).
ALTER TABLE "Product" ADD COLUMN "noCommission" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Option" ADD COLUMN "noCommission" BOOLEAN NOT NULL DEFAULT false;
