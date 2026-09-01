-- A custom extra line has no catalogue entry to inherit an image from, so it
-- carries its own. Option lines keep using the catalogue image.
ALTER TABLE "DocumentLine" ADD COLUMN "imageUrl" TEXT;
