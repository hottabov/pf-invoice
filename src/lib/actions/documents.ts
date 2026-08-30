"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { companyWhereForUser, documentWhereForUser } from "@/lib/scope";
import { compatibilityOrFilter } from "@/lib/catalog-compat";
import { computeTotals, type EngineInput, type EngineViolation } from "@/lib/pricing";
import {
  customLineSchema,
  discountPctSchema,
  documentTypeSchema,
  idSchema,
  optionSelectionSchema,
  optionalIdSchema,
  type DocumentTypeInput,
  type OptionSelectionInput,
} from "@/lib/validation/documents";

export type ActionResult = { error?: string };

const NOT_FOUND_ERROR = "Not found";
const FALLBACK_REGION_CODE = "AU";

/** Join every zod issue message (form-level + field-level) into one string
 * for a plain `{ error }` result — same helper as actions/catalog.ts, kept
 * local here to avoid a cross-file dependency between the two action
 * modules for one tiny function. */
function flattenZodError(error: z.ZodError): string {
  const flat = error.flatten();
  const messages = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(
    (m): m is string => Boolean(m)
  );
  return messages.length > 0 ? messages.join(" ") : "Invalid input";
}

// --- recalculation --------------------------------------------------------

// NOTE: callers currently ignore the returned violations. Phase 5 finalize MUST
// check them (a series' maxDiscountPct can be lowered after an item discount was
// saved) and refuse to finalize a document with violations.
/**
 * Recomputes and persists a document's subtotal/taxAmount/total from its
 * current items, item lines and document-level lines, via the pure pricing
 * engine (src/lib/pricing.ts) — the single source of truth for every money
 * total. Every mutating action in this file ends by calling this. Returns
 * the engine's discount-cap violations (if any) so a caller that just
 * changed a discount can decide whether to reject the save; callers that
 * can't produce a violation (adding/removing an item or line) can ignore
 * the return value. A missing document is treated as a no-op — the caller
 * has already scope-checked it before mutating.
 */
export async function recalcDocument(documentId: string): Promise<EngineViolation[]> {
  const document = await db.document.findUnique({
    where: { id: documentId },
    include: {
      items: {
        include: {
          lines: true,
          product: { include: { series: true } },
        },
      },
      lines: { where: { itemId: null } },
    },
  });
  if (!document) return [];

  const engineInput: EngineInput = {
    items: document.items.map((item) => ({
      unitPrice: Number(item.unitPrice),
      discountPct: item.discountPct !== null ? Number(item.discountPct) : null,
      maxDiscountPct: item.product?.series.maxDiscountPct
        ? Number(item.product.series.maxDiscountPct)
        : null,
      lines: item.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    })),
    extraLines: document.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    documentDiscountPct: document.discountPct !== null ? Number(document.discountPct) : null,
    taxRate: Number(document.taxRate),
  };

  const totals = computeTotals(engineInput);

  await db.document.update({
    where: { id: documentId },
    data: {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
    },
  });

  return totals.violations;
}

// --- draft lifecycle -----------------------------------------------------

/**
 * Creates a DRAFT document and redirects straight into its builder — the
 * "New quote"/"New invoice" buttons on /documents bind `type` and submit
 * with no other fields, so the draft exists before a client is even
 * picked (companyId stays null until setDocumentClient). Region/currency/
 * tax are snapshotted from the author's own region, falling back to AU for
 * an author with no region assigned yet.
 */
export async function createDraft(type: DocumentTypeInput): Promise<void> {
  const session = await requireSession();

  const parsedType = documentTypeSchema.safeParse(type);
  if (!parsedType.success) {
    throw new Error("Invalid document type");
  }

  const region = session.user.regionId
    ? await db.region.findUnique({ where: { id: session.user.regionId } })
    : null;
  const resolvedRegion = region ?? (await db.region.findUnique({ where: { code: FALLBACK_REGION_CODE } }));
  if (!resolvedRegion) {
    throw new Error("No region configured");
  }

  const created = await db.document.create({
    data: {
      type: parsedType.data,
      status: "DRAFT",
      authorId: session.user.id,
      regionId: resolvedRegion.id,
      currency: resolvedRegion.currency,
      taxName: resolvedRegion.taxName,
      taxRate: resolvedRegion.taxRate,
    },
  });

  revalidatePath("/documents");
  redirect(`/documents/${created.id}`);
}

/** Deletes a DRAFT document (items/lines cascade — see schema). Scoped to
 * the caller and restricted to DRAFT status: a FINAL document is never
 * deletable through this action. */
export async function deleteDraft(documentId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedId = idSchema.safeParse(documentId);
  if (!parsedId.success) return { error: NOT_FOUND_ERROR };

  const existing = await db.document.findFirst({
    where: { id: parsedId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!existing) return { error: NOT_FOUND_ERROR };

  await db.document.delete({ where: { id: existing.id } });

  revalidatePath("/documents");
  redirect("/documents");
}

// --- client step -----------------------------------------------------------

/**
 * Sets (or changes) a draft's client company and, optionally, a contact at
 * that company. Both are re-verified against the caller's scope/relationship
 * here — never trust a companyId/contactId submitted from the client as-is:
 * the company must satisfy `companyWhereForUser`, and the contact (if any)
 * must actually belong to that company. Only DRAFT documents are editable.
 */
export async function setDocumentClient(
  documentId: string,
  companyId: string,
  contactId?: string | null
): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  const parsedCompanyId = idSchema.safeParse(companyId);
  const parsedContactId = optionalIdSchema.safeParse(contactId ?? undefined);
  if (!parsedDocumentId.success || !parsedCompanyId.success || !parsedContactId.success) {
    return { error: "Invalid input" };
  }

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const company = await db.company.findFirst({
    where: { id: parsedCompanyId.data, ...companyWhereForUser(session.user) },
  });
  if (!company) return { error: "Company not found" };

  let resolvedContactId: string | null = null;
  if (parsedContactId.data) {
    const contact = await db.contact.findFirst({
      where: { id: parsedContactId.data, companyId: company.id },
    });
    if (!contact) return { error: "Contact not found" };
    resolvedContactId = contact.id;
  }

  await db.document.update({
    where: { id: document.id },
    data: { companyId: company.id, contactId: resolvedContactId },
  });

  revalidatePath(`/documents/${document.id}`);
  return {};
}

// --- items -----------------------------------------------------------------

/**
 * Adds a product to a draft as a new DocumentItem, snapshotting its
 * code/name/description/price/image at the moment it's added (later catalog
 * edits never retroactively change an existing document — see schema
 * comments on DocumentItem). Requires a usable price (a Price row that
 * exists and isn't `needsReview`) for the document's own region; otherwise
 * returns an error naming the product and region rather than silently
 * adding a $0 line.
 */
export async function addItem(documentId: string, productCode: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };
  const code = productCode.trim();
  if (!code) return { error: "Product not found" };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
    include: { region: true },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const product = await db.product.findUnique({
    where: { code },
    include: { prices: { where: { regionId: document.regionId } } },
  });
  if (!product) return { error: "Product not found" };

  const price = product.prices[0];
  if (!price || price.needsReview) {
    return { error: `Price required for ${product.code} in ${document.region.code}` };
  }

  const maxSortOrder = await db.documentItem.aggregate({
    where: { documentId: document.id },
    _max: { sortOrder: true },
  });

  await db.documentItem.create({
    data: {
      documentId: document.id,
      productId: product.id,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      code: product.code,
      name: product.name,
      description: product.description,
      unitPrice: price.amount,
      imageUrl: product.imageUrl,
    },
  });

  await recalcDocument(document.id);

  revalidatePath(`/documents/${document.id}`);
  return {};
}

/** Removes an item (and its lines, via cascade) from a draft. Scoped
 * through the item -> document -> author chain, not just the item id, so a
 * foreign item id can never be deleted by guessing/enumerating ids. */
export async function removeItem(itemId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  await db.documentItem.delete({ where: { id: item.id } });

  await recalcDocument(item.documentId);

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}

// --- item options (Task D) --------------------------------------------------

const MAX_OPTION_SELECTIONS = 100;

/**
 * Replaces an item's OPTION lines with exactly `selections`, preserving
 * selection order as `sortOrder`. Every option code must (a) resolve to a
 * real, active-or-not `Option` row, (b) be compatible with the item —
 * either via a series-level `OptionCompatibility` row (matching the item's
 * product's series) or a product-level one (matching the item's product
 * directly, e.g. EasyLoader accessories scoped to EL-2020 — see
 * `compatibilityOrFilter`) — and (c) carry a usable price (exists, not
 * `needsReview`) in the *document's* region — otherwise
 * nothing is written at all and the offending codes are named in the
 * returned error, checked in that order (unknown, then incompatible, then
 * unpriced) so the caller always gets one actionable message. Delete+create
 * happens in a single transaction so a failed create can never leave an
 * item with no options where it had some a moment ago. Scoped through
 * item -> document -> author chain and DRAFT-only, like every other item
 * mutation in this file.
 */
export async function setItemOptions(
  itemId: string,
  selections: OptionSelectionInput[]
): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  if (!Array.isArray(selections) || selections.length > MAX_OPTION_SELECTIONS) {
    return { error: "Invalid selection" };
  }
  const parsedSelections = z.array(optionSelectionSchema).safeParse(selections);
  if (!parsedSelections.success) return { error: flattenZodError(parsedSelections.error) };

  const codes = parsedSelections.data.map((s) => s.optionCode);
  if (new Set(codes).size !== codes.length) {
    return { error: "Each option can only be selected once" };
  }

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    include: { document: true, product: { include: { series: true } } },
  });
  if (!item) return { error: NOT_FOUND_ERROR };
  if (!item.product) return { error: "This item has no product to attach options to" };

  if (codes.length === 0) {
    await db.documentLine.deleteMany({ where: { itemId: item.id, kind: "OPTION" } });
    await recalcDocument(item.documentId);
    revalidatePath(`/documents/${item.documentId}`);
    return {};
  }

  // item.product is checked truthy above, so both its id and seriesId
  // (a required field on Product) are always available here — the OR filter
  // is never null in practice, but the `?? []` keeps the type honest.
  const compatOr = compatibilityOrFilter(item.product.id, item.product.seriesId) ?? [];
  const options = await db.option.findMany({
    where: { code: { in: codes } },
    include: {
      prices: { where: { regionId: item.document.regionId } },
      compat: { where: { OR: compatOr } },
    },
  });
  const optionByCode = new Map(options.map((o) => [o.code, o]));

  const missingCodes: string[] = [];
  const incompatibleCodes: string[] = [];
  const unpricedCodes: string[] = [];
  for (const code of codes) {
    const option = optionByCode.get(code);
    if (!option) {
      missingCodes.push(code);
      continue;
    }
    if (option.compat.length === 0) {
      incompatibleCodes.push(code);
      continue;
    }
    const price = option.prices[0];
    if (!price || price.needsReview) {
      unpricedCodes.push(code);
    }
  }

  if (missingCodes.length > 0) {
    return { error: `Unknown option code(s): ${missingCodes.join(", ")}` };
  }
  if (incompatibleCodes.length > 0) {
    return {
      error: `Not compatible with ${item.product.series.name}: ${incompatibleCodes.join(", ")}`,
    };
  }
  if (unpricedCodes.length > 0) {
    return { error: `Price required for: ${unpricedCodes.join(", ")}` };
  }

  await db.$transaction([
    db.documentLine.deleteMany({ where: { itemId: item.id, kind: "OPTION" } }),
    ...parsedSelections.data.map((selection, index) => {
      const option = optionByCode.get(selection.optionCode)!;
      const price = option.prices[0]!;
      return db.documentLine.create({
        data: {
          documentId: item.documentId,
          itemId: item.id,
          kind: "OPTION",
          refId: option.id,
          code: option.code,
          name: option.name,
          description: option.shortDescription,
          qty: selection.qty,
          unitPrice: price.amount,
          attributes: selection.attributes as Prisma.InputJsonValue | undefined,
          sortOrder: index,
        },
      });
    }),
  ]);

  await recalcDocument(item.documentId);

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}

// --- extra lines (Task D) ---------------------------------------------------

/**
 * Adds a freeform document-level line (e.g. "Delivery", "Install") — always
 * `kind: CUSTOM` with `itemId: null` — appended after every existing
 * document-level line. Scoped to the caller's own DRAFT document.
 */
export async function addCustomLine(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsed = customLineSchema.safeParse({
    name: formData.get("name"),
    qty: formData.get("qty"),
    unitPrice: formData.get("unitPrice"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const maxSortOrder = await db.documentLine.aggregate({
    where: { documentId: document.id, itemId: null },
    _max: { sortOrder: true },
  });

  await db.documentLine.create({
    data: {
      documentId: document.id,
      itemId: null,
      kind: "CUSTOM",
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      qty: parsed.data.qty,
      unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  await recalcDocument(document.id);

  revalidatePath(`/documents/${document.id}`);
  return {};
}

/**
 * Removes a document-level CUSTOM line (an "extra line" like delivery).
 * Scoped through line -> document -> author chain, and deliberately matches
 * only a document-level CUSTOM line (`itemId: null`, `kind: "CUSTOM"`) — an
 * item's OPTION lines are replaced as a whole set via `setItemOptions`,
 * never deleted one at a time through this action.
 */
export async function removeLine(lineId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedLineId = idSchema.safeParse(lineId);
  if (!parsedLineId.success) return { error: NOT_FOUND_ERROR };

  const line = await db.documentLine.findFirst({
    where: {
      id: parsedLineId.data,
      itemId: null,
      kind: "CUSTOM",
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true },
  });
  if (!line) return { error: NOT_FOUND_ERROR };

  await db.documentLine.delete({ where: { id: line.id } });

  await recalcDocument(line.documentId);

  revalidatePath(`/documents/${line.documentId}`);
  return {};
}

// --- discounts (Task D) -----------------------------------------------------

/**
 * Sets (or, given an empty `pct`, clears) an item's discount percentage.
 * The item's series cap (`Series.maxDiscountPct`) is enforced *before*
 * persisting: unlike the pricing engine's own violation reporting (which
 * happily computes with whatever percentage is already stored and just
 * flags it — see EngineViolation), this action refuses the save outright
 * when the requested pct exceeds the cap, so a violating discount is never
 * actually written for a new save. A series with no cap configured
 * (`maxDiscountPct` null) allows any 0..100 discount.
 */
export async function setItemDiscount(itemId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const parsedPct = discountPctSchema.safeParse(formData.get("pct"));
  if (!parsedPct.success) return { error: flattenZodError(parsedPct.error) };

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    include: { product: { include: { series: true } } },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  const cap = item.product?.series.maxDiscountPct ? Number(item.product.series.maxDiscountPct) : null;
  if (parsedPct.data !== null && cap !== null && parsedPct.data > cap) {
    const seriesName = item.product?.series.name ?? "this series";
    return { error: `Max discount for ${seriesName} is ${cap}%` };
  }

  await db.documentItem.update({
    where: { id: item.id },
    data: { discountPct: parsedPct.data === null ? null : new Prisma.Decimal(parsedPct.data) },
  });

  await recalcDocument(item.documentId);

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}

/**
 * Sets (or clears) the document-level discount percentage. There's no cap
 * at the document level — only item discounts are bounded by their
 * series' `maxDiscountPct`.
 */
export async function setDocumentDiscount(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedPct = discountPctSchema.safeParse(formData.get("pct"));
  if (!parsedPct.success) return { error: flattenZodError(parsedPct.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  await db.document.update({
    where: { id: document.id },
    data: { discountPct: parsedPct.data === null ? null : new Prisma.Decimal(parsedPct.data) },
  });

  await recalcDocument(document.id);

  revalidatePath(`/documents/${document.id}`);
  return {};
}
