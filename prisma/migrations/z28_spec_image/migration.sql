-- Admin-managed diagrams for a discrete production-spec choice (owner: show
-- an image instead of a bare "+Y"/"-Y" dropdown value, so it isn't lost on a
-- reader whose English isn't first). `(field, value)` binds one image to one
-- exact spec answer -- see the model's own doc comment in schema.prisma.
-- Deliberately generic (not a single `screenSideImageUrl` column) so a future
-- discrete spec choice (knife size, voltage) reuses this table under a new
-- `field` with no further migration -- only "screenSide" is wired up today.
CREATE TABLE "SpecImage" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecImage_field_value_key" ON "SpecImage"("field", "value");
