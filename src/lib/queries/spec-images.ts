import { db } from "@/lib/db";

// Reads for the admin-managed `SpecImage` table (see that model's doc
// comment in schema.prisma) — one row per (field, value) pair, e.g.
// field "screenSide", value "+Y"/"-Y". Kept as its own module for the same
// reason src/lib/queries/conflict-groups.ts is: a small settings-area
// concern, not something the catalogue/builder query needs to carry.

/** `value -> imageUrl` for every uploaded diagram on one `field` — e.g.
 * `getSpecImages("screenSide")` -> `{ "+Y": "/api/files/a.jpg" }` when only
 * "+Y" has been uploaded. A `value` with no entry here simply has no
 * diagram yet; callers (see `resolveSpecImage`) fall back to a placeholder
 * rather than treating a missing key as an error. Rendered directly as the
 * stored `/api/files/<name>` URL — unlike the quotation PDF pipeline, the
 * builder page these feed is an already-authenticated browser tab, so no
 * `ImageResolver` step is needed (same reasoning as every other in-app
 * catalogue thumbnail). */
export type SpecImageMap = Record<string, string>;

export async function getSpecImages(field: string): Promise<SpecImageMap> {
  const rows = await db.specImage.findMany({ where: { field }, select: { value: true, imageUrl: true } });
  return Object.fromEntries(rows.map((row) => [row.value, row.imageUrl]));
}

/** One `SpecImage` row's admin-facing shape, for the Settings → Catalogue
 * list page — `imageUrl` is `null` when nothing's been uploaded for this
 * value yet (there is no row), a legal state the page renders as an empty
 * `ImageUpload` dropzone. */
export type SpecImageListItem = {
  value: string;
  imageUrl: string | null;
};

/**
 * Every `value` a `field` is known to have (`knownValues`, e.g. `SCREEN_SIDES`
 * from production-spec-editor.tsx), joined with whatever's actually been
 * uploaded — always one row per known value, in the order given, so the
 * admin page can render a fixed set of upload slots regardless of what's
 * been filled in yet, rather than only showing rows that already have an
 * image.
 */
export async function listSpecImages(field: string, knownValues: readonly string[]): Promise<SpecImageListItem[]> {
  const map = await getSpecImages(field);
  return knownValues.map((value) => ({ value, imageUrl: map[value] ?? null }));
}
