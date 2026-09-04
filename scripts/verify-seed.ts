import "dotenv/config";

/**
 * Proves the seed actually reached the database intact: run `db:seed`, then
 * run this. Used by CI (.github/workflows/deploy.yml) after migrate + seed.
 *
 * Every expected number is derived from the seed's own inputs rather than
 * written down here. A literal count would be a second source of truth for a
 * number that changes every time the catalogue does, and it drifted exactly
 * that way once already: removing Punchline and adding the trade-in product
 * updated the seed and its tests but not the checker, so a deploy failed on a
 * stale 67.
 *
 * This replaces a 60-line CommonJS script that lived inline in the workflow
 * YAML. That script could not `require` seed-lib.ts (TypeScript), which is why
 * its region count had to stay a literal; running under tsx removes the
 * limitation, so regions are derived too.
 */
async function main() {
  const [{ REGIONS }, catalog, { db }] = await Promise.all([
    import("../prisma/seed-lib"),
    import("../prisma/seed-data/catalog.json").then((m) => m.default),
    import("../src/lib/db"),
  ]);

  const expected = {
    regions: REGIONS.length,
    series: catalog.series.length,
    products: catalog.series.reduce((n, s) => n + s.products.length, 0),
  };

  const [regions, series, products] = await Promise.all([
    db.region.count(),
    db.series.count(),
    db.product.count(),
  ]);
  const actual = { regions, series, products };

  console.log(`expected: ${JSON.stringify(expected)}`);
  console.log(`actual:   ${JSON.stringify(actual)}`);

  const mismatches = (Object.keys(expected) as (keyof typeof expected)[]).filter(
    (k) => expected[k] !== actual[k],
  );
  if (mismatches.length) {
    console.error(`FAIL: mismatch on ${mismatches.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("OK: seed counts match the seed's own inputs");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { db } = await import("../src/lib/db");
    await db.$disconnect();
  });
