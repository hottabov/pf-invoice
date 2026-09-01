/**
 * Bulk-imports industries from a newline-separated file. Upserts by
 * normalized name so re-running is safe and never creates a near-duplicate
 * of a row a user already added by hand through the picker.
 *
 * Usage: npx tsx scripts/import-industries.ts industries.txt
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { industryNameSchema, normalizeIndustryName } from "../src/lib/validation/industries";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/import-industries.ts <file>");
    process.exit(1);
  }

  // Imported only now (not at module scope) so the usage check above can't
  // be skipped by an early DB/env failure -- Prisma 7 requires an explicit
  // driver adapter (see src/lib/db.ts), so a bare `new PrismaClient()` at
  // module scope throws before main() even runs. Mirrors
  // scripts/create-user.ts and scripts/import-product-images.ts.
  const { db } = await import("../src/lib/db");

  const existing = await db.industry.findMany();
  const seen = new Map(existing.map((row) => [normalizeIndustryName(row.name), row.name]));

  let created = 0;
  let skipped = 0;
  let invalid = 0;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw.trim()) continue;

    const parsed = industryNameSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`skipping invalid name: ${JSON.stringify(raw)}`);
      invalid += 1;
      continue;
    }

    const key = normalizeIndustryName(parsed.data);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }

    await db.industry.create({ data: { name: parsed.data } });
    seen.set(key, parsed.data);
    created += 1;
  }

  console.log(`created ${created}, already present ${skipped}, invalid ${invalid}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
