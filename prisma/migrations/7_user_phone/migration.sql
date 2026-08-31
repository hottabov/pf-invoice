-- Prepared-by block (owner reference doc: "Prepared by: <manager name /
-- phone>, <email>") needs the author's phone number, which User never
-- carried before -- see getDocumentForBuilder's `author` include and
-- DocSheetPreparedBy in src/lib/sheet-data.ts. Optional (most users won't
-- set one), same nullable-text treatment as every other optional contact
-- field in this app (Contact.phone, Region.entityAddress, etc.).
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
