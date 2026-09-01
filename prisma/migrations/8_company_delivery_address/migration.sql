-- Delivery address on Company (owner: "client office is not always the
-- manufacturing site; delivery address matters") -- see Company's delivery*
-- fields in schema.prisma, the "Same as main address" checkbox in
-- company-form.tsx, and the sheets' new "Delivery address" block (see
-- toSheetData in src/lib/sheet-data.ts). `deliverySameAsMain` defaults
-- true so every existing company (which has no separate delivery address)
-- reads as "same as main" with no data migration needed. The delivery*
-- columns themselves default to NULL, same nullable-free-text treatment as
-- every other optional address field on this table (street/city/state/
-- postcode/country).
ALTER TABLE "Company" ADD COLUMN     "deliveryCity" TEXT,
ADD COLUMN     "deliveryContactName" TEXT,
ADD COLUMN     "deliveryCountry" TEXT,
ADD COLUMN     "deliveryNotes" TEXT,
ADD COLUMN     "deliveryPhone" TEXT,
ADD COLUMN     "deliveryPostcode" TEXT,
ADD COLUMN     "deliverySameAsMain" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryState" TEXT,
ADD COLUMN     "deliveryStreet" TEXT;
