"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { productSchema, optionSchema, priceInputSchema, compatDiff } from "@/lib/validation/catalog";
import { IMAGE_URL_PATTERN } from "@/lib/uploads";

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

export async function createProduct(seriesCode: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = productSchema.safeParse(readProductForm(formData));
  if (!parsed.success) {
    return { error: flattenZodError(parsed.error) };
  }

  const series = await db.series.findUnique({ where: { code: seriesCode } });
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
        description: parsed.data.description ?? null,
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${encodeURIComponent(series.code)}`);
  redirect(`/catalog/${encodeURIComponent(series.code)}/${encodeURIComponent(created.code)}`);
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
        description: parsed.data.description ?? null,
        active: parsed.data.active,
        sortOrder: parsed.data.sortOrder,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: CODE_EXISTS_ERROR };
    throw error;
  }

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${encodeURIComponent(existing.series.code)}`);
  revalidatePath(`/catalog/${encodeURIComponent(existing.series.code)}/${encodeURIComponent(existing.code)}`);
  if (parsed.data.code !== existing.code) {
    revalidatePath(
      `/catalog/${encodeURIComponent(existing.series.code)}/${encodeURIComponent(parsed.data.code)}`
    );
  }
  redirect(
    `/catalog/${encodeURIComponent(existing.series.code)}/${encodeURIComponent(parsed.data.code)}`
  );
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
  revalidatePath(`/catalog/${encodeURIComponent(existing.series.code)}`);
  redirect(`/catalog/${encodeURIComponent(existing.series.code)}`);
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
  redirect(`/catalog/options/${encodeURIComponent(created.code)}`);
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

  revalidatePath("/catalog/options");
  revalidatePath(`/catalog/options/${encodeURIComponent(existing.code)}`);
  if (parsed.data.code !== existing.code) {
    revalidatePath(`/catalog/options/${encodeURIComponent(parsed.data.code)}`);
  }
  redirect(`/catalog/options/${encodeURIComponent(parsed.data.code)}`);
}

export async function deleteOption(optionId: string): Promise<ActionResult> {
  await requireAdmin();

  const existing = await db.option.findUnique({ where: { id: optionId } });
  if (!existing) return { error: "Option not found" };

  const referencedCount = await db.documentLine.count({ where: { refId: optionId } });
  if (referencedCount > 0) {
    return { error: "This option is used on one or more documents and can't be deleted." };
  }

  // Price and OptionCompatibility rows cascade (both onDelete: Cascade on
  // their optionId relation in the schema).
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

  revalidatePath(`/catalog/${encodeURIComponent(existing.series.code)}/${encodeURIComponent(existing.code)}`);
  revalidatePath(`/catalog/${encodeURIComponent(existing.series.code)}`);
  return {};
}

export async function updateOptionImage(optionId: string, url: string | null): Promise<ActionResult> {
  await requireAdmin();

  const parsed = parseImageUrl(url);
  if (!parsed.ok) return { error: "Invalid image URL" };

  const existing = await db.option.findUnique({ where: { id: optionId } });
  if (!existing) return { error: "Option not found" };

  await db.option.update({ where: { id: optionId }, data: { imageUrl: parsed.value } });

  revalidatePath(`/catalog/options/${encodeURIComponent(existing.code)}`);
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

  revalidatePath("/catalog");
  revalidatePath(`/catalog/${encodeURIComponent(existing.code)}`);
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
    const product = await db.product.findUnique({
      where: { id: target.productId },
      include: { series: true },
    });
    if (product) {
      revalidatePath(`/catalog/${encodeURIComponent(product.series.code)}/${encodeURIComponent(product.code)}`);
      revalidatePath(`/catalog/${encodeURIComponent(product.series.code)}`);
    }
  } else {
    const option = await db.option.findUnique({ where: { id: target.optionId } });
    if (option) {
      revalidatePath(`/catalog/options/${encodeURIComponent(option.code)}`);
      revalidatePath("/catalog/options");
    }
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

  revalidatePath(`/catalog/options/${encodeURIComponent(option.code)}`);
  revalidatePath("/catalog/options");
  return {};
}
