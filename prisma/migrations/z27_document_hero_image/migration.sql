-- The quotation's setup image (owner: a photo/render of the whole
-- configuration -- cutter, table, spreader together -- usually already
-- produced in SketchUp and shown to the customer before the quote is drawn
-- up). One per quote, not per item -- see the column's own doc comment in
-- schema.prisma. A stored `/api/files/<name>` URL, same shape as every other
-- image column; NULL means no image has been uploaded, in which case the
-- printed quotation renders nothing at all for it.
ALTER TABLE "Document" ADD COLUMN "heroImageUrl" TEXT;
