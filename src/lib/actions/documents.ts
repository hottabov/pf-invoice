"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { companyWhereForUser, documentWhereForUser } from "@/lib/scope";
import { computeTotals, type EngineInput, type EngineViolation } from "@/lib/pricing";
import { documentTypeSchema, idSchema, optionalIdSchema, type DocumentTypeInput } from "@/lib/validation/documents";

export type ActionResult = { error?: string };

const NOT_FOUND_ERROR = "Not found";
const FALLBACK_REGION_CODE = "AU";

// --- recalculation --------------------------------------------------------

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
