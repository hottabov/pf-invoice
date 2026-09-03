"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import {
  productSchema,
  optionSchema,
  priceInputSchema,
  compatDiff,
  conflictGroupNameSchema,
} from "@/lib/validation/catalog";
import { IMAGE_URL_PATTERN } from "@/lib/uploads";
import { sanitizeIfHtml } from "@/lib/rich-text";

export type ActionResult = { error?: string };

// --- shared helpers ----------------------------------------------------

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result — good enough for a single-line banner in
 * these editors, which don't need per-field error placement. */
function flattenZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(
    (m): m is string => Boolean(m)
  );
  return messages.length > 0 ? messages.join(" ") : "Invalid input";
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const CODE_EXISTS_ERROR = "That code already exists — choose a different one.";

/** `Product.description` is now written by the `RichTextEditor`
 * (product-form.tsx), same HTML-storage story as `ContentBlock.body` — see
 * `sanitizeIfHtml`'s doc comment. `parsed.data.description` is `undefined`
 * when the field was left blank (see `descriptionSchema` in
 * validation/catalog.ts), which becomes `null` on the row exactly as before. */
function sanitizeProductDescription(description: string | undefined): string | null {
  return description === undefined ? null : sanitizeIfHtml(description);
}

function readProductForm(formData: FormData) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active"),
    sortOrder: formData.get("sortOrder"),
  };
}

function readOptionForm(formData: FormData) {
  return {
    ...readProductForm(formData),
    shortDescription: formData.get("shortDescription"),
    attributeSchema: formData.get("attributeSchema"),
  };
}

// --- products ----------------------------------------------------------

export async function createProduct(seriesId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = productSchema.safeParse(readProductForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const series = await db.series.findUnique({ where: { id: seriesId } });
  if (!series) {
    return { error: "Series not found" };
  }

  let created;
  try {
    created = await db.product.create({
      data: {
        code: parsed.data.code,
        seriesId: series.id,
        name: parsed.data.name,
        description: sanitizeProductDescription(parsed.data.description),
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${series.id}`);
  redirect(`/catalog/${series.id}/${created.id}`);
}

export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = productSchema.safeParse(readProductForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { series: true },
  });
  if (!existing) return { error: "Product not found" };

  try {
    await db.product.update({
      where: { id: productId },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        description: sanitizeProductDescription(parsed.data.description),
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  // The route is keyed by id, which never changes on an update, so unlike
  // the code-keyed revalidation this replaced there's no "old code path" /
  // "new code path" pair to worry about here — just the one URL (same
  // simplification `updateOption` made when its route moved to id).
  revalidatePath("/catalog");
  revalidatePath(`/catalog/${existing.series.id}`);
  revalidatePath(`/catalog/${existing.series.id}/${productId}`);
  redirect(`/catalog/${existing.series.id}/${productId}`);
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  await requireAdmin();

  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { series: true },
  });
  if (!existing) return { error: "Product not found" };

  const [referencedCount, referencedLineCount] = await Promise.all([
    db.documentItem.count({ where: { productId } }),
    db.documentLine.count({ where: { refId: productId, kind: "PRODUCT" } }),
  ]);
  if (referencedCount > 0 || referencedLineCount > 0) {
    return { error: "This product is used on one or more documents and can't be deleted." };
  }

  // Price rows cascade (Price.productId is onDelete: Cascade in the schema).
  await db.product.delete({ where: { id: productId } });

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${existing.series.id}`);
  redirect(`/catalog/${existing.series.id}`);
}

// --- options -------------------------------------------------------------

export async function createOption(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = optionSchema.safeParse(readOptionForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  let created;
  try {
    created = await db.option.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        shortDescription: parsed.data.shortDescription ?? null,
        // Omit rather than pass `null` on create: an optional Json column
        // just defaults to NULL when the field is left unset, and Prisma
        // rejects a literal `null` for Json fields (it wants
        // Prisma.DbNull/Prisma.JsonNull to disambiguate from JSON `null`).
        ...(parsed.data.attributeSchema !== null
          ? { attributeSchema: parsed.data.attributeSchema as Prisma.InputJsonValue }
          : {}),
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  revalidatePath("/catalog/options");
  redirect(`/catalog/options/${created.id}`);
}

export async function updateOption(optionId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = optionSchema.safeParse(readOptionForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const existing = await db.option.findUnique({ where: { id: optionId } });
  if (!existing) return { error: "Option not found" };

  try {
    await db.option.update({
      where: { id: optionId },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        shortDescription: parsed.data.shortDescription ?? null,
        // Here we *do* need to actively clear the column when the user
        // emptied the textarea, so use Prisma.DbNull instead of omitting.
        attributeSchema:
          parsed.data.attributeSchema === null
            ? Prisma.DbNull
            : (parsed.data.attributeSchema as Prisma.InputJsonValue),
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  // The route is keyed by id, which never changes on an update, so unlike
  // the product route above there's no "old code path" / "new code path"
  // pair to revalidate here — just the one URL.
  revalidatePath("/catalog/options");
  revalidatePath(`/catalog/options/${optionId}`);
  redirect(`/catalog/options/${optionId}`);
}

export async function deleteOption(optionId: string): Promise<ActionResult> {
  await requireAdmin();

  const existing = await db.option.findUnique({ where: { id: optionId } });
  if (!existing) return { error: "Option not found" };

  const referencedCount = await db.documentLine.count({ where: { refId: optionId } });
  if (referencedCount > 0) {
    return { error: "This option is used on one or more documents and can't be deleted." };
  }

  // Price, OptionCompatibility and OptionConflictGroupMember rows all
  // cascade (each onDelete: Cascade on its optionId relation in the
  // schema), so no orphaned group membership is left behind either.
  await db.option.delete({ where: { id: optionId } });

  revalidatePath("/catalog/options");
  redirect("/catalog/options");
}

// --- images --------------------------------------------------------------

/** Validates that a submitted image URL is either `null` (clear the image)
 * or exactly the `/api/files/<uuid>.<ext>` shape `saveUpload` produces —
 * never an arbitrary string, which would let an admin point `imageUrl` at
 * an unrelated path or external host. */
function parseImageUrl(url: string | null): { ok: true; value: string | null } | { ok: false } {
  if (url === null) return { ok: true, value: null };
  if (!IMAGE_URL_PATTERN.test(url)) return { ok: false };
  return { ok: true, value: url };
}

export async function updateProductImage(productId: string, url: string | null): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseImageUrl(url);
  if (!parsed.ok) return { error: "Invalid image URL" };

  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { series: true },
  });
  if (!existing) return { error: "Product not found" };

  await db.product.update({ where: { id: productId }, data: { imageUrl: parsed.value } });

  revalidatePath(`/catalog/${existing.series.id}/${productId}`);
  revalidatePath(`/catalog/${existing.series.id}`);
  return {};
}

export async function updateOptionImage(optionId: string, url: string | null): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseImageUrl(url);
  if (!parsed.ok) return { error: "Invalid image URL" };

  const existing = await db.option.findUnique({ where: { id: optionId } });
  if (!existing) return { error: "Option not found" };

  await db.option.update({ where: { id: optionId }, data: { imageUrl: parsed.value } });

  revalidatePath(`/catalog/options/${optionId}`);
  revalidatePath("/catalog/options");
  return {};
}

/** Sets (or clears, via `url: null`) a series' own catalog-card image
 * override. `null` isn't "no image" here -- it means "fall back to a
 * product image", see listSeriesWithCounts/getSeriesFallbackImageUrl in
 * src/lib/queries/catalog.ts -- but the persisted value and validation are
 * identical to updateProductImage/updateOptionImage above. */
export async function updateSeriesImage(seriesId: string, url: string | null): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseImageUrl(url);
  if (!parsed.ok) return { error: "Invalid image URL" };

  const existing = await db.series.findUnique({ where: { id: seriesId } });
  if (!existing) return { error: "Series not found" };

  await db.series.update({ where: { id: seriesId }, data: { imageUrl: parsed.value } });

  // The route is keyed by id, which is already the parameter this action
  // takes -- no need for the `existing` lookup's code to build the path.
  revalidatePath("/catalog");
  revalidatePath(`/catalog/${seriesId}`);
  return {};
}

// --- prices ----------------------------------------------------------------

export type PriceTarget = { productId: string; optionId?: never } | { optionId: string; productId?: never };

// A plain `"productId" in target` boolean doesn't let TypeScript narrow
// `target` at each later use site — only a real type-guard predicate,
// re-evaluated against the `target` expression itself, does that.
function isProductPriceTarget(
  target: PriceTarget
): target is { productId: string; optionId?: never } {
  return "productId" in target;
}

export async function upsertPrice(target: PriceTarget, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = priceInputSchema.safeParse({
    regionCode: formData.get("regionCode"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const region = await db.region.findUnique({ where: { code: parsed.data.regionCode } });
  if (!region) return { error: "Region not found" };

  if (parsed.data.amount === "") {
    // Empty amount clears the price row entirely.
    if (isProductPriceTarget(target)) {
      await db.price.deleteMany({ where: { productId: target.productId, regionId: region.id } });
    } else {
      await db.price.deleteMany({ where: { optionId: target.optionId, regionId: region.id } });
    }
  } else {
    const amount = new Prisma.Decimal(parsed.data.amount);
    if (isProductPriceTarget(target)) {
      await db.price.upsert({
        where: { productId_regionId: { productId: target.productId, regionId: region.id } },
        create: { productId: target.productId, regionId: region.id, amount, needsReview: false },
        update: { amount, needsReview: false },
      });
    } else {
      await db.price.upsert({
        where: { optionId_regionId: { optionId: target.optionId, regionId: region.id } },
        create: { optionId: target.optionId, regionId: region.id, amount, needsReview: false },
        update: { amount, needsReview: false },
      });
    }
  }

  if (isProductPriceTarget(target)) {
    // Both route segments are ids now, but `target` only carries the
    // product's -- the series' id still needs a lookup to build the path
    // (unlike the option branch below, where the route has just the one id
    // and `target` already carries it).
    const product = await db.product.findUnique({
      where: { id: target.productId },
      include: { series: true },
    });
    if (product) {
      revalidatePath(`/catalog/${product.series.id}/${product.id}`);
      revalidatePath(`/catalog/${product.series.id}`);
    }
  } else {
    revalidatePath(`/catalog/options/${target.optionId}`);
    revalidatePath("/catalog/options");
  }

  return {};
}

// --- option/series compatibility --------------------------------------

/**
 * Sets an option's series-level compatibility to exactly `seriesCodes`,
 * diffing against what's currently stored and only writing the delta.
 * Product-level compatibility rows (out of phase-3 scope) are left alone.
 * Unknown codes in `seriesCodes` are silently ignored (they simply don't
 * resolve to a series id and so are never added).
 */
export async function setOptionCompatibility(
  optionId: string,
  seriesCodes: string[]
): Promise<ActionResult> {
  await requireAdmin();

  const option = await db.option.findUnique({ where: { id: optionId } });
  if (!option) return { error: "Option not found" };

  const [existingCompat, matchedSeries] = await Promise.all([
    db.optionCompatibility.findMany({
      where: { optionId, seriesId: { not: null }, productId: null },
      include: { series: true },
    }),
    db.series.findMany({ where: { code: { in: seriesCodes } } }),
  ]);

  const currentCodes = existingCompat
    .map((c) => c.series?.code)
    .filter((code): code is string => Boolean(code));
  const submittedCodes = matchedSeries.map((s) => s.code);
  const { toAdd, toRemove } = compatDiff(currentCodes, submittedCodes);

  const seriesIdByCode = new Map(matchedSeries.map((s) => [s.code, s.id]));
  const removeIds = existingCompat
    .filter((c) => c.series && toRemove.includes(c.series.code))
    .map((c) => c.id);

  await db.$transaction([
    ...(removeIds.length > 0
      ? [db.optionCompatibility.deleteMany({ where: { id: { in: removeIds } } })]
      : []),
    ...toAdd.map((code) =>
      db.optionCompatibility.create({
        data: { optionId, seriesId: seriesIdByCode.get(code) },
      })
    ),
  ]);

  revalidatePath(`/catalog/options/${optionId}`);
  revalidatePath("/catalog/options");
  return {};
}

// --- option conflict groups ----------------------------------------------

/**
 * Creates a new, empty `OptionConflictGroup` and redirects to its editor,
 * where an admin adds members -- mirrors `createOption`'s
 * create-then-redirect-to-detail shape. A group with no members yet is
 * legal but inert (see the model comment in schema.prisma), so there's
 * nothing unsafe about creating it before any member is chosen.
 */
export async function createConflictGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = conflictGroupNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const created = await db.optionConflictGroup.create({ data: { name: parsed.data } });

  revalidatePath("/settings/option-conflict-groups");
  redirect(`/settings/option-conflict-groups/${created.id}`);
}

/** Renames a conflict group -- the only field its own editor form has. */
export async function updateConflictGroupName(
  groupId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = conflictGroupNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const existing = await db.optionConflictGroup.findUnique({ where: { id: groupId } });
  if (!existing) return { error: "Conflict group not found" };

  await db.optionConflictGroup.update({ where: { id: groupId }, data: { name: parsed.data } });

  revalidatePath("/settings/option-conflict-groups");
  revalidatePath(`/settings/option-conflict-groups/${groupId}`);
  return {};
}

/**
 * Deletes a conflict group. Unlike `deleteProduct`/`deleteOption`, there's
 * no "used on a document" guard here -- a group (and its membership rows)
 * is purely a catalogue-admin concept that no `DocumentLine` ever
 * references, so removing one only stops a future `setItemOptions` from
 * treating its former members as conflicting; it can never orphan or
 * invalidate an existing document (see the "existing documents" note on
 * `setItemOptions` in actions/documents.ts).
 */
export async function deleteConflictGroup(groupId: string): Promise<ActionResult> {
  await requireAdmin();

  const existing = await db.optionConflictGroup.findUnique({ where: { id: groupId } });
  if (!existing) return { error: "Conflict group not found" };

  // Membership rows cascade (OptionConflictGroupMember.groupId is
  // onDelete: Cascade).
  await db.optionConflictGroup.delete({ where: { id: groupId } });

  revalidatePath("/settings/option-conflict-groups");
  redirect("/settings/option-conflict-groups");
}

/**
 * Sets a conflict group's members to exactly `optionIds`, diffing against
 * what's currently stored (same `compatDiff` "hand over the full desired
 * set, let the action diff it" shape `setOptionCompatibility` above uses)
 * and only writing the delta. Unlike the old `setOptionConflicts` this
 * replaces, there's no pair-normalisation step and no self-conflict guard
 * to worry about -- a group's members are just a set, so "membership" has
 * no directionality and an option can't accidentally conflict with itself
 * by being listed once.
 *
 * Unknown ids in `optionIds` are silently ignored, mirroring
 * `setOptionCompatibility`'s handling of unknown series codes.
 */
export async function setConflictGroupMembers(
  groupId: string,
  optionIds: string[]
): Promise<ActionResult> {
  await requireAdmin();

  const group = await db.optionConflictGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Conflict group not found" };

  const [existingMembers, matchedOptions] = await Promise.all([
    db.optionConflictGroupMember.findMany({ where: { groupId }, select: { optionId: true } }),
    db.option.findMany({ where: { id: { in: optionIds } }, select: { id: true } }),
  ]);

  const currentIds = existingMembers.map((m) => m.optionId);
  const submittedIds = matchedOptions.map((o) => o.id);
  const { toAdd, toRemove } = compatDiff(currentIds, submittedIds);

  await db.$transaction([
    ...(toRemove.length > 0
      ? [db.optionConflictGroupMember.deleteMany({ where: { groupId, optionId: { in: toRemove } } })]
      : []),
    ...toAdd.map((optionId) => db.optionConflictGroupMember.create({ data: { groupId, optionId } })),
  ]);

  revalidatePath(`/settings/option-conflict-groups/${groupId}`);
  revalidatePath("/settings/option-conflict-groups");
  // Every affected option's own editor page shows this group in its
  // read-only "Conflict groups" summary -- revalidate each so it doesn't
  // show stale membership after a save here.
  for (const optionId of [...toAdd, ...toRemove]) {
    revalidatePath(`/catalog/options/${optionId}`);
  }
  return {};
}
