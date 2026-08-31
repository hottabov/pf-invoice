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
  isPermutation,
  optionSelectionSchema,
  optionalIdSchema,
  priceDisplaySchema,
  reorderSchema,
  type DocumentTypeInput,
  type OptionSelectionInput,
} from "@/lib/validation/documents";
import { buildInvoiceCopyPayload, type QuoteForCopy } from "@/lib/invoice-from-quote";

/**
 * `warning` is set on an otherwise-successful save that an ADMIN pushed
 * through over a rule a MANAGER would have been blocked by (currently just
 * `setItemDiscount` exceeding a series' cap — see its own comment) — the
 * caller shows it as a non-blocking toast rather than the inline `error`
 * treatment, since the save itself did succeed.
 */
export type ActionResult = { error?: string; warning?: string };

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

/**
 * Permanently deletes a document of any status, from the /documents list.
 * Items/lines cascade via `onDelete: Cascade` (schema.prisma); any invoice
 * that was copied *from* this document as a source quote keeps existing —
 * `Document.sourceQuoteId` is `onDelete: SetNull`, so deleting a quote only
 * clears that back-reference on its invoice(s), never blocks the delete or
 * cascades into them.
 *
 * Scoped like every other action here (`documentWhereForUser`: a MANAGER
 * only ever finds their own documents, an ADMIN finds any), plus one extra
 * rule this action alone enforces: a FINAL document — one that was issued a
 * permanent, never-reused number (see numbering.ts) — may only be deleted by
 * an ADMIN, regardless of who authored it. A DRAFT has no such restriction
 * beyond the usual scope check.
 */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedId = idSchema.safeParse(documentId);
  if (!parsedId.success) return { error: NOT_FOUND_ERROR };

  const document = await db.document.findFirst({
    where: { id: parsedId.data, ...documentWhereForUser(session.user) },
    select: { id: true, status: true },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  if (document.status === "FINAL" && session.user.role !== "ADMIN") {
    return { error: "Only an admin can delete a finalized document" };
  }

  await db.document.delete({ where: { id: document.id } });

  revalidatePath("/documents");
  return {};
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
      // Quotation-first default (behavior change): a newly added item with a
      // product image starts with its image already switched on for display
      // — the owner's quotes almost always show it (full-width, right under
      // the product title — see quotation-sheet.tsx), so requiring an extra
      // manual toggle on every single item added defeats the point. Still
      // author-togglable afterwards via `setItemShowImage`, and a product
      // with no image simply has nothing to default on (`false` either way).
      showImage: Boolean(product.imageUrl),
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

/**
 * Reorders a draft's items to match `orderedItemIds`, writing each item's
 * new `sortOrder` as its index in that array. `orderedItemIds` must be a
 * permutation of the document's own item ids (same set, no dupes, none
 * missing, none foreign) — checked via `isPermutation` against the item ids
 * actually loaded under `documentWhereForUser` scope, so a foreign or
 * stale id can never sneak an item from another document into this one's
 * order, and a client that lost track of an item (e.g. a stale tab) gets
 * rejected instead of silently dropping it. Every `documentItem.update` in
 * the list runs in one `$transaction` so a partial reorder is never
 * persisted. No totals recompute — reordering never changes what's owed
 * (see `recalcDocument`'s callers elsewhere in this file, all of which
 * mutate price-affecting state, unlike this action).
 */
export async function reorderItems(documentId: string, orderedItemIds: string[]): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedOrder = reorderSchema.safeParse(orderedItemIds);
  if (!parsedOrder.success) return { error: flattenZodError(parsedOrder.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
    include: { items: { select: { id: true } } },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const actualItemIds = document.items.map((item) => item.id);
  if (!isPermutation(parsedOrder.data, actualItemIds)) {
    return { error: "Item list doesn't match — refresh and try again" };
  }

  await db.$transaction(
    parsedOrder.data.map((itemId, index) =>
      db.documentItem.update({ where: { id: itemId }, data: { sortOrder: index } })
    )
  );

  revalidatePath(`/documents/${document.id}`);
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
 * The item's series cap (`Series.maxDiscountPct`, admin-editable on
 * /catalog — see `updateSeriesMaxDiscount`) is enforced *before* persisting
 * — unlike the pricing engine's own violation reporting (which happily
 * computes with whatever percentage is already stored and just flags it,
 * see `EngineViolation`) — but ONLY for a MANAGER: a save that exceeds the
 * cap is refused outright for them, so a violating discount is never
 * actually written by a manager's save. An ADMIN may exceed the cap; the
 * save still succeeds but comes back with `warning` set (rather than
 * `error`) so the caller can surface a non-blocking "exceeds cap" toast
 * instead of rejecting the save. A series with no cap configured
 * (`maxDiscountPct` null) allows any 0..100 discount for either role.
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
  const exceedsCap = parsedPct.data !== null && cap !== null && parsedPct.data > cap;

  let warning: string | undefined;
  if (exceedsCap) {
    const seriesName = item.product?.series.name ?? "this series";
    if (session.user.role !== "ADMIN") {
      return { error: `Max discount for ${seriesName} is ${cap}%` };
    }
    warning = `Exceeds series cap of ${cap}%`;
  }

  await db.documentItem.update({
    where: { id: item.id },
    data: { discountPct: parsedPct.data === null ? null : new Prisma.Decimal(parsedPct.data) },
  });

  await recalcDocument(item.documentId);

  revalidatePath(`/documents/${item.documentId}`);
  return warning ? { warning } : {};
}

/**
 * Toggles whether an item's product image is shown on the rendered
 * document (sheet/PDF — see `toSheetData`'s `showImage && imageUrl` check
 * in src/lib/sheet-data.ts). Scoped through the item -> document chain like
 * `setItemDiscount`, DRAFT-only, same as every other item mutation in this
 * file. Purely a display flag — it doesn't affect pricing, so unlike
 * `setItemDiscount`/`setItemOptions` there's no `recalcDocument` call here.
 */
export async function setItemShowImage(itemId: string, show: boolean): Promise<ActionResult> {
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

  await db.documentItem.update({
    where: { id: item.id },
    data: { showImage: show },
  });

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

// --- price display toggles (quotation-first) --------------------------------

/**
 * Sets both quotation pricing-display toggles at once (the builder UI always
 * submits the pair together — see `PriceDisplayToggles` — so there's no
 * partial-update variant like the item discount fields have). Purely a
 * display flag pair, same as `setItemShowImage`: they never affect
 * `subtotal`/`taxAmount`/`total`, so there's no `recalcDocument` call here.
 * DRAFT-only and scoped like every other document mutation in this file —
 * meaningful only for a QUOTE in practice (the builder only renders the
 * toggle card for one), but not type-gated here since an INVOICE simply
 * never reads these flags back (see `toSheetData`, which the plain
 * document/invoice sheet keeps using unconditionally).
 */
export async function setPriceDisplay(documentId: string, input: unknown): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedInput = priceDisplaySchema.safeParse(input);
  if (!parsedInput.success) return { error: flattenZodError(parsedInput.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  await db.document.update({
    where: { id: document.id },
    data: {
      showItemPrices: parsedInput.data.showItemPrices,
      showOptionPrices: parsedInput.data.showOptionPrices,
    },
  });

  revalidatePath(`/documents/${document.id}`);
  return {};
}

// --- create invoice from quote -----------------------------------------------

/**
 * Copies an approved QUOTE straight into a new DRAFT INVOICE — the owner's
 * "sales approves the quote, invoice without re-entry" workflow. Loads the
 * QUOTE scoped to the caller (any status; there's no reason to forbid this
 * from a still-DRAFT quote, though the button is only prominent once it's
 * FINAL — see the builder page), maps it through the pure
 * `buildInvoiceCopyPayload` (src/lib/invoice-from-quote.ts) for the actual
 * copy-shape decisions, then persists it in two steps inside one
 * transaction: create the document with its items nested (that relation
 * *is* the immediate parent-child link Prisma can auto-wire), then a second
 * `createMany` for every line once the new item ids exist — item lines need
 * both `documentId` *and* `itemId`, and `documentId` isn't derivable from
 * the item-nesting path alone (same two-step shape `setItemOptions` already
 * uses for a single item, just batched here across every item at once).
 * Items are correlated to their new copy by `sortOrder`, which
 * `buildInvoiceCopyPayload` preserves unchanged and which is unique per
 * document — insertion order of a nested `create: [...]` isn't a contract
 * Prisma guarantees, so this never assumes the returned array matches input
 * order. On success, redirects straight into the new invoice's builder
 * (like `createDraft`); returns `{ error }` and doesn't navigate anywhere
 * otherwise.
 */
export async function createInvoiceFromQuote(quoteId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedQuoteId = idSchema.safeParse(quoteId);
  if (!parsedQuoteId.success) return { error: NOT_FOUND_ERROR };

  const quote = await db.document.findFirst({
    where: { id: parsedQuoteId.data, type: "QUOTE", ...documentWhereForUser(session.user) },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      },
      lines: { where: { itemId: null }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quote) return { error: NOT_FOUND_ERROR };

  const quoteForCopy: QuoteForCopy = {
    id: quote.id,
    companyId: quote.companyId,
    contactId: quote.contactId,
    regionId: quote.regionId,
    currency: quote.currency,
    taxName: quote.taxName,
    taxRate: quote.taxRate.toString(),
    discountPct: quote.discountPct?.toString() ?? null,
    notes: quote.notes,
    showItemPrices: quote.showItemPrices,
    showOptionPrices: quote.showOptionPrices,
    items: quote.items.map((item) => ({
      productId: item.productId,
      sortOrder: item.sortOrder,
      code: item.code,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice.toString(),
      discountPct: item.discountPct?.toString() ?? null,
      serialNumber: item.serialNumber,
      showImage: item.showImage,
      imageUrl: item.imageUrl,
      lines: item.lines.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        code: line.code,
        name: line.name,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice.toString(),
        attributes: line.attributes,
        showImage: line.showImage,
        sortOrder: line.sortOrder,
      })),
    })),
    lines: quote.lines.map((line) => ({
      kind: line.kind,
      refId: line.refId,
      code: line.code,
      name: line.name,
      description: line.description,
      qty: line.qty,
      unitPrice: line.unitPrice.toString(),
      attributes: line.attributes,
      showImage: line.showImage,
      sortOrder: line.sortOrder,
    })),
  };

  const payload = buildInvoiceCopyPayload(quoteForCopy);

  const created = await db.$transaction(async (tx) => {
    const invoice = await tx.document.create({
      data: {
        type: payload.document.type,
        status: payload.document.status,
        authorId: session.user.id,
        companyId: payload.document.companyId,
        contactId: payload.document.contactId,
        regionId: payload.document.regionId,
        currency: payload.document.currency,
        taxName: payload.document.taxName,
        taxRate: new Prisma.Decimal(payload.document.taxRate),
        discountPct: payload.document.discountPct !== null ? new Prisma.Decimal(payload.document.discountPct) : null,
        notes: payload.document.notes,
        showItemPrices: payload.document.showItemPrices,
        showOptionPrices: payload.document.showOptionPrices,
        sourceQuoteId: payload.document.sourceQuoteId,
        items: {
          create: payload.items.map((item) => ({
            productId: item.productId,
            sortOrder: item.sortOrder,
            code: item.code,
            name: item.name,
            description: item.description,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            discountPct: item.discountPct !== null ? new Prisma.Decimal(item.discountPct) : null,
            serialNumber: item.serialNumber,
            showImage: item.showImage,
            imageUrl: item.imageUrl,
          })),
        },
      },
      include: { items: true },
    });

    const newItemIdBySortOrder = new Map(invoice.items.map((item) => [item.sortOrder, item.id]));

    const itemLineRows: Prisma.DocumentLineCreateManyInput[] = payload.items.flatMap((item) => {
      const newItemId = newItemIdBySortOrder.get(item.sortOrder);
      // Defensive only — every payload item was just created above with this
      // exact sortOrder, so it's always found in practice.
      if (!newItemId) return [];
      return item.lines.map((line) => ({
        documentId: invoice.id,
        itemId: newItemId,
        kind: line.kind,
        refId: line.refId,
        code: line.code,
        name: line.name,
        description: line.description,
        qty: line.qty,
        unitPrice: new Prisma.Decimal(line.unitPrice),
        attributes: line.attributes as Prisma.InputJsonValue | undefined,
        showImage: line.showImage,
        sortOrder: line.sortOrder,
      }));
    });

    const extraLineRows: Prisma.DocumentLineCreateManyInput[] = payload.extraLines.map((line) => ({
      documentId: invoice.id,
      itemId: null,
      kind: line.kind,
      refId: line.refId,
      code: line.code,
      name: line.name,
      description: line.description,
      qty: line.qty,
      unitPrice: new Prisma.Decimal(line.unitPrice),
      attributes: line.attributes as Prisma.InputJsonValue | undefined,
      showImage: line.showImage,
      sortOrder: line.sortOrder,
    }));

    if (itemLineRows.length > 0 || extraLineRows.length > 0) {
      await tx.documentLine.createMany({ data: [...itemLineRows, ...extraLineRows] });
    }

    return invoice;
  });

  await recalcDocument(created.id);

  revalidatePath("/documents");
  redirect(`/documents/${created.id}`);
}
