"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/authz";
import { isAdminRole } from "@/lib/roles";
import { companyWhereForUser, documentWhereForUser } from "@/lib/scope";
import {
  compatibilityOrFilter,
  findConflictingSelection,
  conflictPartnersByGroup,
} from "@/lib/catalog-compat";
import {
  capPct,
  computeTotals,
  concessionCapMessage,
  discountCents,
  markupCapMessage,
  toCents,
  type CommissionResult,
  type DocumentConcession,
  type EngineInput,
  type EngineViolation,
} from "@/lib/pricing";
import { isHtmlContent, sanitizeRichText } from "@/lib/rich-text";
import { catalogVisibilityUserId, isProductHidden } from "@/lib/catalog-visibility";
import { getHiddenCatalogIds } from "@/lib/queries/catalog-visibility";
import { getCommissionTiers } from "@/lib/queries/settings";
import { formatMoney } from "@/lib/format";
import {
  customLineSchema,
  deliveryTermsSchema,
  discountModeSchema,
  discountValueSchema,
  exceedsPercentCeiling,
  idSchema,
  isPermutation,
  itemDescriptionSchema,
  notesSchema,
  optionSelectionSchema,
  optionalIdSchema,
  priceDisplaySchema,
  reorderSchema,
  serialNumberSchema,
  unitPriceSchema,
  creditUnitPriceSchema,
  validityDaysSchema,
  type DiscountModeInput,
  type OptionSelectionInput,
} from "@/lib/validation/documents";

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
const NEGATIVE_SUBTOTAL_ERROR = "Discounts and trade-ins cannot exceed the value of the quote.";

/** Thrown inside a `db.$transaction(async (tx) => ...)` callback to abort
 * and roll it back when `recalcDocument` reports `negativeSubtotal` — see
 * the mutating actions below, each of which runs its entity write and the
 * recalc in the same transaction so a rejected save never leaves a
 * negative-subtotal line (or a stale total) committed. Never surfaced to a
 * caller directly; every site that can throw it catches it immediately and
 * maps it to `{ error: NEGATIVE_SUBTOTAL_ERROR }`. */
class NegativeSubtotalError extends Error {}

/** Thrown the same way as `NegativeSubtotalError` — to abort and roll back
 * a `db.$transaction` — when `recalcDocument` reports
 * `documentConcession.exceedsCap` for a MANAGER (an ADMIN is instead let
 * through with a `warning`, same role split `setItemDiscount` already gives
 * a per-item cap breach). Carries the ready-made message (see
 * `concessionCapMessage`) so the catch site at every call can surface it
 * directly, the same way every other error path here does. */
class ConcessionCapError extends Error {}

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

/** The subset of a Prisma client `recalcDocument` needs (just the `document`
 * delegate) — structurally satisfied by both the plain `db` singleton and
 * the `tx` handed to a `db.$transaction(async (tx) => ...)` callback, so
 * callers that need the recalc to roll back along with their own write (see
 * `NegativeSubtotalError` above) pass `tx`; callers that don't (e.g.
 * `finalizeDocument`, which only reads the returned violations) can omit it
 * and get the default `db`. */
type RecalcClient = { document: Prisma.TransactionClient["document"] };

/** A concession-free, uncapped placeholder for the (never actually
 * reachable in practice) "document not found" branch of `recalcDocument`
 * below — every real caller has already scope-checked the document exists
 * before calling this, so this value is never inspected for `exceedsCap`,
 * but `documentConcession` is typed as always-present on `RecalcResult`
 * (mirrors `PricingTotals.documentConcession`), so a concrete value is
 * needed either way. */
const NO_CONCESSION: DocumentConcession = {
  concession: "0.00",
  listValue: "0.00",
  effectivePct: 0,
  allowedPct: 100,
  exceedsCap: false,
  allowedMarkupPct: null,
  exceedsMarkupCap: false,
  parts: { documentDiscount: "0.00", itemDiscounts: "0.00", priceAdjustments: "0.00", tradeIns: "0.00" },
};

export type RecalcResult = {
  violations: EngineViolation[];
  negativeSubtotal: boolean;
  documentConcession: DocumentConcession;
  /** Pre-formatted "Concessions total ..." message (see
   * `concessionCapMessage`), present only when `documentConcession.exceedsCap`
   * — built here, not by each caller, since this is the one place that
   * already has the document's region name/currency loaded. */
  concessionMessage: string | null;
  /** Pre-formatted "This quote is priced ... above list" message (see
   * `markupCapMessage`) — the mirror of `concessionMessage` above, present
   * only when `documentConcession.exceedsMarkupCap`. */
  markupMessage: string | null;
  /** The salesperson's LIVE commission on this document — see
   * `CommissionResult`'s doc comment for the shape and the "null means
   * unconfigured" rule. Always the freshly-computed figure, even for a
   * FINAL document — `recalcDocument` never reads or writes the frozen
   * `Document.commission*` columns (see `finalizeDocument`,
   * src/lib/actions/finalize.ts); the builder's own read path
   * (`getDocumentForBuilder`, src/lib/queries/documents.ts) is what
   * chooses between this live figure (DRAFT) and the frozen one (FINAL). */
  commission: CommissionResult | null;
};

/**
 * Recomputes and persists a document's subtotal/taxAmount/total from its
 * current items, item lines and document-level lines, via the pure pricing
 * engine (src/lib/pricing.ts) — the single source of truth for every money
 * total. Every mutating action in this file ends by calling this, inside the
 * same `$transaction` as its own entity write when the mutation could ever
 * produce a negative subtotal (see `NegativeSubtotalError`'s doc comment and
 * every call site below). Returns the engine's discount-cap violations —
 * which `finalizeDocument` re-checks via `validateFinalizable`, since a
 * region's maxDiscountPct can be lowered after a discount was saved —
 * alongside `negativeSubtotal` and `documentConcession` (see
 * `recalcAndEnforce` below for how the two guardrails are actually
 * enforced, role-gated, by every mutating action's transaction);
 * this function itself never throws or refuses to persist — it's the
 * caller's job to inspect the result and decide whether to reject the save.
 * A missing document is treated as a no-op — the caller has already
 * scope-checked it before mutating.
 *
 * The discount cap fed to the engine is the document's region cap
 * (`Region.maxDiscountPct`) — the same value applied to every item, not a
 * per-item/series value (discount caps moved from Series to Region — see
 * `setItemDiscount` below).
 */
export async function recalcDocument(documentId: string, client: RecalcClient = db): Promise<RecalcResult> {
  const document = await client.document.findUnique({
    where: { id: documentId },
    include: {
      // `isCredit`/`noCommission` — see `EngineItem.isCredit`'s and
      // `EngineItem.isNoCommission`'s doc comments (src/lib/pricing.ts) for
      // why these flags (never the sign or size of a typed price) are what
      // drive the engine's credit/no-commission handling.
      items: { include: { lines: true, product: { select: { isCredit: true, noCommission: true } } } },
      lines: { where: { itemId: null } },
      region: true,
    },
  });
  if (!document) {
    return {
      violations: [],
      negativeSubtotal: false,
      documentConcession: NO_CONCESSION,
      concessionMessage: null,
      markupMessage: null,
      commission: null,
    };
  }

  // `Option.noCommission` is read live off the option, the same "joined,
  // never snapshotted" rule `EngineItem.isNoCommission`'s doc comment
  // describes — resolved here via one extra query for every OPTION line's
  // `refId` (a document-level extra line is always CUSTOM, never OPTION —
  // see the `LineKind` enum — so only item lines can ever need this). This
  // is what makes the persisted `subtotal`/`taxAmount`/`total` below (what
  // the customer is actually charged) respect the "a no-commission line
  // takes no discount" rule — without it, `EngineInput.items[].isNoCommission`/
  // `lines[].isNoCommission` would always read `false` here regardless of
  // the catalogue, and the discount-exclusion computeTotals now does would
  // never actually take effect on a saved document.
  const optionRefIds = Array.from(
    new Set(
      document.items
        .flatMap((item) => item.lines)
        .filter((line): line is (typeof document.lines)[number] & { refId: string } => line.kind === "OPTION" && line.refId !== null)
        .map((line) => line.refId)
    )
  );
  // Fetched alongside the option lookup (one round trip, not two) — the
  // admin-editable commission-rate table (`getCommissionTiers`,
  // src/lib/queries/settings.ts) needed to resolve `totals.commission`
  // below, same "null/empty means unconfigured" contract that function
  // documents.
  const [optionRows, commissionTiers] = await Promise.all([
    optionRefIds.length > 0
      ? db.option.findMany({ where: { id: { in: optionRefIds } }, select: { id: true, noCommission: true } })
      : Promise.resolve([]),
    getCommissionTiers(),
  ]);
  const optionNoCommissionMap = new Map(optionRows.map((o) => [o.id, o.noCommission]));

  const regionMaxDiscountPct = document.region.maxDiscountPct ? Number(document.region.maxDiscountPct) : null;
  const regionMaxMarkupPct = document.region.maxMarkupPct ? Number(document.region.maxMarkupPct) : null;
  const engineInput: EngineInput = {
    items: document.items.map((item) => ({
      unitPrice: Number(item.unitPrice),
      listPrice: item.listPrice !== null ? Number(item.listPrice) : null,
      discountMode: item.discountMode,
      discountValue: item.discountValue !== null ? item.discountValue.toString() : null,
      maxDiscountPct: regionMaxDiscountPct,
      isCredit: item.product?.isCredit ?? false,
      isNoCommission: item.product?.noCommission ?? false,
      lines: item.lines.map((line) => ({
        qty: line.qty,
        unitPrice: Number(line.unitPrice),
        listPrice: line.listPrice !== null ? Number(line.listPrice) : null,
        isNoCommission: line.refId !== null ? (optionNoCommissionMap.get(line.refId) ?? false) : false,
      })),
    })),
    extraLines: document.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    documentDiscountMode: document.discountMode,
    documentDiscountValue: document.discountValue !== null ? document.discountValue.toString() : null,
    regionMaxDiscountPct,
    regionMaxMarkupPct,
    // An Ex Works quote (collected at the factory door) is not a domestic
    // taxable supply, so its tax is zero — resolved here, the one place a
    // document's effective tax rate is computed, rather than scattered
    // across every reader of taxAmount/total. `document.taxRate` itself
    // (the region's nominal rate) is left untouched; only the rate actually
    // fed to the engine is overridden.
    taxRate: document.deliveryTerms === "EX_WORKS" ? 0 : Number(document.taxRate),
    commissionTiers,
  };

  const totals = computeTotals(engineInput);

  const concessionMessage = totals.documentConcession.exceedsCap
    ? concessionCapMessage(totals.documentConcession, document.region.name, document.currency)
    : null;
  const markupMessage = totals.documentConcession.exceedsMarkupCap
    ? markupCapMessage(totals.documentConcession, document.region.name, document.currency)
    : null;

  await client.document.update({
    where: { id: documentId },
    data: {
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
    },
  });

  return {
    violations: totals.violations,
    negativeSubtotal: totals.negativeSubtotal,
    documentConcession: totals.documentConcession,
    concessionMessage,
    markupMessage,
    commission: totals.commission,
  };
}

/**
 * Runs `recalcDocument` and enforces the two guardrails every mutating
 * action in this file shares, thrown as sentinel errors so the caller's
 * `db.$transaction` rolls back (mirrors the existing `NegativeSubtotalError`
 * pattern, extended here to `ConcessionCapError`):
 *
 *  - `negativeSubtotal` — unconditional, same as before this change.
 *  - `documentConcession.exceedsCap` — a MANAGER's save is rejected and
 *    rolled back (throws `ConcessionCapError`); an ADMIN's save proceeds,
 *    and the message comes back as `warning` for the caller to surface as a
 *    non-blocking toast — the same MANAGER-blocked/ADMIN-warned split
 *    `setItemDiscount`/`setDocumentDiscount` already give a per-item/
 *    per-document discount-cap breach (see their own doc comments), now
 *    applied to the aggregate whole-document figure instead. This is what
 *    actually closes the hole a manual price opens: `EngineViolation`
 *    (the per-item `%`/`AMOUNT` discount check) never fires for a price cut
 *    entered as a straight `unitPrice` edit with no `discountValue` set at
 *    all, so without this, a MANAGER could sell at any price no matter how
 *    far below list, cap or no cap.
 *  - `documentConcession.exceedsMarkupCap` — the mirror of `exceedsCap`
 *    above, for `Region.maxMarkupPct` (Ross: "he's got a minimum selling
 *    price. And a maximum selling price."): same MANAGER-rejected/
 *    ADMIN-warned split, via the same `ConcessionCapError`/`warning` path
 *    (see `markupCapMessage`). Mutually exclusive with `exceedsCap` in
 *    practice — a concession can't be simultaneously a discount and a
 *    markup — so this is checked as a separate `if`, not an `else if`, but
 *    only one of the two bodies below can ever actually run for a given
 *    document.
 *
 * Called by every mutating action below inside its own `db.$transaction`,
 * immediately after (or in place of) its old bare `recalcDocument` +
 * `negativeSubtotal` check.
 */
async function recalcAndEnforce(
  documentId: string,
  tx: RecalcClient,
  role: string
): Promise<{ warning?: string }> {
  const { negativeSubtotal, documentConcession, concessionMessage, markupMessage } = await recalcDocument(
    documentId,
    tx
  );
  if (negativeSubtotal) throw new NegativeSubtotalError();
  if (documentConcession.exceedsCap) {
    if (!isAdminRole(role)) throw new ConcessionCapError(concessionMessage!);
    return { warning: concessionMessage! };
  }
  if (documentConcession.exceedsMarkupCap) {
    if (!isAdminRole(role)) throw new ConcessionCapError(markupMessage!);
    return { warning: markupMessage! };
  }
  return {};
}

// --- draft lifecycle -----------------------------------------------------

/**
 * Creates a DRAFT quote and redirects straight into its builder — the
 * "New quote" button on /documents submits with no fields, so the draft
 * exists before a client is even picked (companyId stays null until
 * setDocumentClient). Region/currency/tax are snapshotted from the author's
 * own region, falling back to AU for an author with no region assigned yet.
 */
export async function createDraft(): Promise<void> {
  const session = await requireSession();

  const region = session.user.regionId
    ? await db.region.findUnique({ where: { id: session.user.regionId } })
    : null;
  const resolvedRegion = region ?? (await db.region.findUnique({ where: { code: FALLBACK_REGION_CODE } }));
  if (!resolvedRegion) {
    throw new Error("No region configured");
  }

  const created = await db.document.create({
    data: {
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
 * Items/lines cascade via `onDelete: Cascade` (schema.prisma).
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

  if (document.status === "FINAL" && !isAdminRole(session.user.role)) {
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
 *
 * When `contactId` is omitted/empty, the company's primary contact is
 * auto-assigned instead of leaving the document contact-less: `isPrimary`
 * first, else the first contact by the same ordering the client picker uses
 * (`isPrimary` desc, `firstName` asc — see `listClientPickerCompanies`), or
 * `null` if the company has no contacts at all. This is what lets the
 * builder's company select persist a usable contact in one step — the
 * explicit contact dropdown then still overrides it by passing a concrete
 * `contactId`.
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
  } else {
    const primaryContact = await db.contact.findFirst({
      where: { companyId: company.id },
      orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
    });
    resolvedContactId = primaryContact?.id ?? null;
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
 *
 * Also rejects a product hidden from the caller's own user id via
 * `CatalogVisibility` (directly, or because its whole series is hidden) —
 * the *server-side* half of catalogue visibility: the item picker
 * (`getItemPickerCatalog`) already never offers a hidden product, but this
 * is the actual gate, since a crafted request can call this action with any
 * `productCode` regardless of what the picker rendered. Same "Product not
 * found" message as a genuinely nonexistent code — a hidden product must
 * read as *absent*, not as a product that exists but is refused (Ross: "we
 * don't want him to even see the Excalibur", not "let him see it's there
 * and blocked"). An ADMIN always resolves to no hidden ids (see
 * `catalogVisibilityUserId`) and so is never affected by this check.
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

  const hiddenCatalogIds = await getHiddenCatalogIds(catalogVisibilityUserId(session.user));
  if (isProductHidden(product, hiddenCatalogIds)) return { error: "Product not found" };

  const price = product.prices[0];
  if (!price || price.needsReview) {
    return { error: `Price required for ${product.code} in ${document.region.code}` };
  }

  // Atomically read max sortOrder, create the item, and recompute totals in
  // a single transaction: an item's price is always positive so this can
  // never actually push the subtotal negative, but every mutation here goes
  // through the same guarded pattern (see `NegativeSubtotalError`) rather
  // than special-casing "safe" ones. Interactive transaction also still
  // ensures the aggregate(max) and create are not interleaved with other
  // writes.
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      const maxSortOrder = await tx.documentItem.aggregate({
        where: { documentId: document.id },
        _max: { sortOrder: true },
      });

      await tx.documentItem.create({
        data: {
          documentId: document.id,
          productId: product.id,
          sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
          code: product.code,
          name: product.name,
          description: product.description,
          unitPrice: price.amount,
          // Snapshot the catalogue price alongside unitPrice — a fresh item
          // starts identical to its list price (no concession) until a
          // salesperson hand-edits it via `setItemUnitPrice`.
          listPrice: price.amount,
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

      concessionWarning = (await recalcAndEnforce(document.id, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${document.id}`);
  return concessionWarning ? { warning: concessionWarning } : {};
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

  // Removing an item can reveal a negative subtotal (a trade-in extra line
  // that was previously offset by this item's price) — same guarded
  // transaction pattern as every other mutation here. Removing an item can
  // also *raise* the document's concession percentage (it shrinks
  // `listValue` while any remaining concession stays the same), so the cap
  // is re-checked here too.
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentItem.delete({ where: { id: item.id } });
      concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${item.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
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
 * unpriced, then conflicting — see `findConflictingSelection`) so the caller
 * always gets one actionable message. Delete+create happens in a single
 * transaction so a failed create can never leave an item with no options
 * where it had some a moment ago. Scoped through item -> document -> author
 * chain and DRAFT-only, like every other item mutation in this file.
 *
 * The conflict check only governs what this call is about to *write* — an
 * item that already carries two now-conflicting OPTION lines (saved before
 * the conflict existed, or before this rejection existed) keeps those lines
 * and its totals exactly as they are until the next `setItemOptions` call
 * for that item; nothing here re-validates existing `DocumentLine` rows on
 * read (recalc/totals work purely off what's already stored — see
 * `recalcAndEnforce`/`computeTotals`, neither of which touches
 * `OptionConflictGroup` at all). A save that resubmits the same two
 * conflicting codes unchanged is still a save, though, and is rejected
 * exactly like a brand-new one — the rule is "no new writes with a
 * conflicting pair", not "grandfather whatever was already there".
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
    let concessionWarning: string | undefined;
    try {
      await db.$transaction(async (tx) => {
        await tx.documentLine.deleteMany({ where: { itemId: item.id, kind: "OPTION" } });
        concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
      });
    } catch (error) {
      if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
      if (error instanceof ConcessionCapError) return { error: error.message };
      throw error;
    }
    revalidatePath(`/documents/${item.documentId}`);
    return concessionWarning ? { warning: concessionWarning } : {};
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
      // Every `OptionConflictGroup` this option belongs to -- see that
      // model's comment in schema.prisma. Only fetched for the *submitted*
      // options (this `where: { code: { in: codes } }` above) -- correct,
      // since `conflictPartnersByGroup` below only needs to know which
      // *submitted* options share a group with which other submitted
      // options, never who else (outside this submission) is in that group.
      conflictGroupMemberships: { select: { groupId: true } },
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

  const conflictsByCode = conflictPartnersByGroup(
    options.flatMap((option) =>
      option.conflictGroupMemberships.map((m) => ({ memberKey: option.code, groupId: m.groupId }))
    )
  );
  const conflictingPair = findConflictingSelection(codes, conflictsByCode);
  if (conflictingPair) {
    const [a, b] = conflictingPair;
    return { error: `${a} conflicts with ${b} — remove one before saving` };
  }

  // Delete+create+recalc all in one interactive transaction (previously
  // delete+create alone, as a batch `$transaction([...])`; folding the
  // recalc in means a failed create *or* a resulting negative subtotal both
  // roll back the whole thing, never leaving an item with no options where
  // it had some a moment ago, or a set of options committed that the
  // negative-subtotal guard should have rejected).
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentLine.deleteMany({ where: { itemId: item.id, kind: "OPTION" } });
      for (const [index, selection] of parsedSelections.data.entries()) {
        const option = optionByCode.get(selection.optionCode)!;
        const price = option.prices[0]!;
        await tx.documentLine.create({
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
            // Snapshot the catalogue price too — see setItemUnitPrice's
            // comment. A freshly (re)selected option always starts equal to
            // its list price; any prior manual edit to this option line is
            // gone anyway once selections are resaved (this whole-set
            // replace deletes and recreates every OPTION line).
            listPrice: price.amount,
            attributes: selection.attributes as Prisma.InputJsonValue | undefined,
            sortOrder: index,
          },
        });
      }
      concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${item.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
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
    imageUrl: formData.get("imageUrl"),
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

  // A negative unitPrice (a trade-in — see customLineSchema) can push the
  // document's subtotal below zero, and also counts toward the region
  // concession cap (see the doc comment on `computeTotals`, src/lib/pricing.ts);
  // create + recalc run in one transaction so a rejected save never leaves
  // the line committed with a stale total. `listPrice` is left null: a
  // custom line has no catalogue entry to snapshot one from.
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentLine.create({
        data: {
          documentId: document.id,
          itemId: null,
          kind: "CUSTOM",
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          qty: parsed.data.qty,
          unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
          imageUrl: parsed.data.imageUrl ?? null,
          // Same "image present -> show it" default as `addItem` gives a
          // product image: a custom line has no separate show/hide toggle
          // of its own, so attaching a photo is what turns this on.
          showImage: Boolean(parsed.data.imageUrl),
          sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        },
      });

      concessionWarning = (await recalcAndEnforce(document.id, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${document.id}`);
  return concessionWarning ? { warning: concessionWarning } : {};
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

  // Removing a positive extra line can reveal a negative subtotal (e.g. a
  // trade-in line elsewhere that this one was offsetting) — same guarded
  // transaction pattern as every other mutation here. It can also raise the
  // document's concession percentage (removing a positive extra line shrinks
  // `listValue`), so the cap is re-checked too.
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentLine.delete({ where: { id: line.id } });
      concessionWarning = (await recalcAndEnforce(line.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${line.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
}

// --- discounts (Task D, extended for mode+value in Task 6) ------------------

/** Renders a discount's value in its own mode's terms — "20%" or a
 * currency-formatted cash figure — for the cap-exceeded message below.
 * Never called with a `null` value (both call sites below only build the
 * message once `exceedsCap` is true, which already implies a non-null
 * value). */
function discountValueLabel(mode: DiscountModeInput, value: string, currency: string): string {
  return mode === "PERCENT" ? `${value}%` : formatMoney(value, currency);
}

/** Trims a computed cap-comparison percentage (see `capPct`) to a
 * display-friendly string (2dp, no trailing zeros) — an AMOUNT discount's
 * `effectivePct` returns a float that can carry floating-point noise (e.g.
 * `19.999999999999996`), which would look wrong printed straight into a
 * user-facing message. */
function formatEffectivePct(pct: number): string {
  return (Math.round(pct * 100) / 100).toString();
}

/**
 * Builds the region-cap-exceeded message shared by `setItemDiscount` and
 * `setDocumentDiscount`, always naming both figures the owner asked for: the
 * discount as entered (in its own mode) and the percentage of `scope` it
 * works out to — e.g. "A $20,000.00 discount is 20% of this item — above the
 * 10% limit for Australia." For a PERCENT discount the two figures are the
 * same number by construction, which is fine — the sentence still reads
 * correctly, just without new information the reader didn't already have.
 */
function discountCapMessage(
  mode: DiscountModeInput,
  value: string,
  effPct: number,
  cap: number,
  regionName: string,
  currency: string,
  scope: "item" | "quote"
): string {
  const valueLabel = discountValueLabel(mode, value, currency);
  return `A ${valueLabel} discount is ${formatEffectivePct(effPct)}% of this ${scope} — above the ${cap}% limit for ${regionName}.`;
}

/**
 * Sets (or, given an empty `value`, clears) an item's discount — a mode
 * ("PERCENT" | "AMOUNT") plus a value (see `DiscountMode` in
 * schema.prisma). The document's region cap (`Region.maxDiscountPct`,
 * admin-editable on /settings/regions — see `RegionForm`/`updateRegion`) is
 * enforced *before* persisting — unlike the pricing engine's own violation
 * reporting (which happily computes with whatever discount is already
 * stored and just flags it, see `EngineViolation`) — but ONLY for a
 * MANAGER: a save that exceeds the cap is refused outright for them, so a
 * violating discount is never actually written by a manager's save. An
 * ADMIN may exceed the cap; the save still succeeds but comes back with
 * `warning` set (rather than `error`) so the caller can surface a
 * non-blocking "exceeds cap" toast instead of rejecting the save. A region
 * with no cap configured (`maxDiscountPct` null) allows any discount for
 * either role.
 *
 * A cash (AMOUNT) discount is converted back to an *effective* percentage of
 * the item's own base (unit price + its option lines) before the cap check
 * — otherwise a manager blocked from a 15% discount could simply type the
 * equivalent dollar figure and bypass the cap entirely. A PERCENT discount
 * is compared to the cap using the typed value directly instead — see
 * `capPct` in src/lib/pricing.ts for why the two modes are compared
 * differently.
 *
 * That "item's own base" is narrowed the same way `computeTotals` narrows
 * it (see its "a no-commission line takes no discount" doc comment): the
 * item's own unitPrice is excluded when the item itself is flagged
 * `Product.noCommission`, and any OPTION line whose `Option.noCommission` is
 * set is excluded too. This has to match the engine's own `discountBaseCents`
 * exactly, not just approximate it — for a PERCENT discount it wouldn't
 * matter (`capPct`'s PERCENT branch reports the typed value regardless of
 * base either way), but for an AMOUNT discount the resolved cash amount is
 * clamped to whatever base it's checked against (`discountCents`), so
 * checking against the item's FULL price here while the engine later
 * resolves it against the smaller commissionable-only price would let a
 * MANAGER save a dollar discount that reads as comfortably under cap here
 * but concentrates entirely onto the smaller commissionable slice once
 * actually applied — silently a much bigger effective percentage discount
 * than what this check approved.
 */
export async function setItemDiscount(itemId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const parsedMode = discountModeSchema.safeParse(formData.get("mode"));
  if (!parsedMode.success) return { error: flattenZodError(parsedMode.error) };
  const parsedValue = discountValueSchema.safeParse(formData.get("value"));
  if (!parsedValue.success) return { error: flattenZodError(parsedValue.error) };

  if (exceedsPercentCeiling(parsedMode.data, parsedValue.data)) {
    return { error: "A percentage discount cannot exceed 100%." };
  }

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    include: {
      document: { include: { region: true } },
      lines: true,
      product: { select: { isCredit: true, noCommission: true } },
    },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  // A credit item (the TRADE-IN product) is already a negative line — a
  // discount on it is meaningless, and if entered by accident would
  // silently make the credit larger without the salesperson noticing. The
  // UI already hides the control for a credit item (see the `isCredit`
  // gate in `ItemBreakdownEditor`); this is the guard against a crafted
  // request that skips straight to the action.
  if (item.product?.isCredit && parsedValue.data !== null) {
    return { error: "A trade-in credit can't have a discount." };
  }

  const cap = item.document.region.maxDiscountPct ? Number(item.document.region.maxDiscountPct) : null;

  let warning: string | undefined;
  if (parsedValue.data !== null && cap !== null) {
    // Narrowed to the commissionable-only base — see this function's own
    // doc comment above for why this must mirror `computeTotals`'s
    // `discountBaseCents` exactly, not just the item's plain full price.
    const optionRefIds = item.lines
      .filter((line): line is (typeof item.lines)[number] & { refId: string } => line.kind === "OPTION" && line.refId !== null)
      .map((line) => line.refId);
    const optionRows =
      optionRefIds.length > 0
        ? await db.option.findMany({ where: { id: { in: optionRefIds } }, select: { id: true, noCommission: true } })
        : [];
    const optionNoCommissionMap = new Map(optionRows.map((o) => [o.id, o.noCommission]));
    const isItemNoCommission = item.product?.noCommission ?? false;

    const baseCents =
      (isItemNoCommission ? 0 : toCents(item.unitPrice.toString())) +
      item.lines.reduce((sum, line) => {
        const lineNoCommission = line.refId !== null ? (optionNoCommissionMap.get(line.refId) ?? false) : false;
        return lineNoCommission ? sum : sum + line.qty * toCents(line.unitPrice.toString());
      }, 0);
    const discount = discountCents(baseCents, parsedMode.data, parsedValue.data);
    const effPct = capPct(parsedMode.data, parsedValue.data, baseCents, discount);
    // Guarded on `baseCents > 0` the same way `computeTotals` guards its own
    // violation check: a wholly no-commission item's discount is inert
    // (resolves to 0 regardless of the typed value), so there's no actual
    // over-cap money movement here to block — see this function's own doc
    // comment.
    if (baseCents > 0 && effPct > cap) {
      const message = discountCapMessage(
        parsedMode.data,
        parsedValue.data,
        effPct,
        cap,
        item.document.region.name,
        item.document.currency,
        "item"
      );
      if (!isAdminRole(session.user.role)) {
        return { error: message };
      }
      warning = message;
    }
  }

  // A larger item discount can reveal a negative subtotal (e.g. against a
  // trade-in extra line elsewhere on the document) — same guarded
  // transaction pattern as every other mutation here. It's also the same
  // `recalcAndEnforce` guard as every other mutation, checking the
  // *whole-document* concession — distinct from (and in addition to) the
  // per-item cap check already done above.
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentItem.update({
        where: { id: item.id },
        data: {
          discountMode: parsedMode.data,
          discountValue: parsedValue.data === null ? null : new Prisma.Decimal(parsedValue.data),
        },
      });
      concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${item.documentId}`);
  const combinedWarning = warning ?? concessionWarning;
  return combinedWarning ? { warning: combinedWarning } : {};
}

// --- manual unit price ------------------------------------------------------
//
// The highest-risk half of this feature (see docs/specs -- the owners'
// framing: "if I give it away for zero dollars... I give them back zero
// dollars", "increase the price of the machine by $10,000 and then give
// away $10,000 worth of options -- we do that all the time"). A salesperson
// can hand-set the price of an item or an option line to anything from $0
// up, snapshotting the catalogue price alongside it the first time (see
// `listPrice` below) so `recalcAndEnforce`'s whole-document concession check
// can measure the concession afterwards -- that check is what actually
// closes Ross's hole ("if the price they're selling for is less than the
// maximum discount that's allowed... it shouldn't allow them to save the
// quote"): unlike `setItemDiscount`, neither action here does its own
// pre-check against a per-item cap, because a manual price has no
// percentage of its own to compare -- the document-level concession check
// inside `recalcAndEnforce` is the only guard, and it is not optional.

/**
 * Hand-sets a `DocumentItem`'s price -- the customer-facing "what they're
 * actually charged" figure, replacing the catalogue snapshot `addItem` wrote
 * originally. Accepts any non-negative value including `0` (John: "if I give
 * it away for zero dollars... I give them back zero dollars" -- a demo unit
 * really can be quoted at $0). The item's `listPrice` is snapshotted from
 * its *current* `unitPrice` the first time this is ever called on it (a
 * fresh item's `listPrice` already equals its `unitPrice` from `addItem`, so
 * this is a no-op then; it only matters for a pre-migration row backfilled
 * with `listPrice = unitPrice` -- either way, this action never overwrites
 * an already-recorded `listPrice`, so a second edit measures against the
 * original catalogue price, not the previous manual one).
 *
 * A CREDIT ITEM MAY BE TYPED WITH A MINUS SIGN: the item is queried before
 * the price is validated (unlike every other action in this file, which
 * validates first) specifically so that check can pick the right schema —
 * `creditUnitPriceSchema` (allows one leading `-`, then strips it) for a
 * credit item (`item.product?.isCredit`), plain `unitPriceSchema` (rejects a
 * negative outright) for an ordinary one. See `creditUnitPriceSchema`'s own
 * doc comment (src/lib/validation/documents.ts) for why the two behave
 * differently — the short version: a trade-in already reads as negative on
 * screen, so `-20000` is a reasonable mental model for it and not worth
 * interrupting the salesperson over, while a negative price on an ordinary
 * item is a plain data-entry mistake. Either way the STORED value is always
 * non-negative — the credit sign is applied only at render time, driven
 * entirely by `EngineItem.isCredit` (see src/lib/pricing.ts), never by what
 * was typed here.
 */
export async function setItemUnitPrice(itemId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true, unitPrice: true, listPrice: true, product: { select: { isCredit: true } } },
  });
  if (!item) return { error: NOT_FOUND_ERROR };

  const isCredit = item.product?.isCredit ?? false;
  const priceSchema = isCredit ? creditUnitPriceSchema : unitPriceSchema;
  const parsedValue = priceSchema.safeParse(formData.get("unitPrice"));
  if (!parsedValue.success) return { error: flattenZodError(parsedValue.error) };

  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentItem.update({
        where: { id: item.id },
        data: {
          unitPrice: new Prisma.Decimal(parsedValue.data),
          listPrice: item.listPrice ?? item.unitPrice,
        },
      });
      concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${item.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
}

/** Resets a `DocumentItem`'s price back to its own recorded `listPrice`
 * (a no-op, functionally, from the customer's point of view — the item's
 * concession simply goes back to zero). Exists as its own action, rather
 * than making the builder re-type the list figure into `setItemUnitPrice`,
 * because the UI shows the list price struck through specifically so a
 * single click can restore it. */
export async function resetItemUnitPrice(itemId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const item = await db.documentItem.findFirst({
    where: {
      id: parsedItemId.data,
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true, listPrice: true },
  });
  if (!item) return { error: NOT_FOUND_ERROR };
  if (item.listPrice === null) return {};

  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentItem.update({ where: { id: item.id }, data: { unitPrice: item.listPrice! } });
      concessionWarning = (await recalcAndEnforce(item.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${item.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
}

/** Hand-sets an OPTION `DocumentLine`'s price — same rules as
 * `setItemUnitPrice`, one level down. Deliberately matches only `kind:
 * "OPTION"` (never a CUSTOM/extra line, which already gets an arbitrary
 * price — including negative, for a trade-in — at creation via
 * `addCustomLine`, and has no catalogue price to snapshot a concession
 * against in the first place). */
export async function setLineUnitPrice(lineId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedLineId = idSchema.safeParse(lineId);
  if (!parsedLineId.success) return { error: NOT_FOUND_ERROR };

  const parsedValue = unitPriceSchema.safeParse(formData.get("unitPrice"));
  if (!parsedValue.success) return { error: flattenZodError(parsedValue.error) };

  const line = await db.documentLine.findFirst({
    where: {
      id: parsedLineId.data,
      kind: "OPTION",
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true, unitPrice: true, listPrice: true },
  });
  if (!line) return { error: NOT_FOUND_ERROR };

  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentLine.update({
        where: { id: line.id },
        data: {
          unitPrice: new Prisma.Decimal(parsedValue.data),
          listPrice: line.listPrice ?? line.unitPrice,
        },
      });
      concessionWarning = (await recalcAndEnforce(line.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${line.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
}

/** Resets an OPTION `DocumentLine`'s price back to its own recorded
 * `listPrice` — see `resetItemUnitPrice`'s doc comment, same reasoning one
 * level down. */
export async function resetLineUnitPrice(lineId: string): Promise<ActionResult> {
  const session = await requireSession();

  const parsedLineId = idSchema.safeParse(lineId);
  if (!parsedLineId.success) return { error: NOT_FOUND_ERROR };

  const line = await db.documentLine.findFirst({
    where: {
      id: parsedLineId.data,
      kind: "OPTION",
      document: { status: "DRAFT", ...documentWhereForUser(session.user) },
    },
    select: { id: true, documentId: true, listPrice: true },
  });
  if (!line) return { error: NOT_FOUND_ERROR };
  if (line.listPrice === null) return {};

  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.documentLine.update({ where: { id: line.id }, data: { unitPrice: line.listPrice! } });
      concessionWarning = (await recalcAndEnforce(line.documentId, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${line.documentId}`);
  return concessionWarning ? { warning: concessionWarning } : {};
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
 * Sets the serial number of the machine a credit item (today: the TRADE-IN
 * product) is taking in trade. `DocumentItem.serialNumber` exists for every
 * item but is not editable anywhere else in the builder — it's opened up
 * here specifically so a salesperson can record which physical machine was
 * traded, alongside `setItemDescription` below recording its model. Purely
 * a record-keeping field — it doesn't affect pricing, so like
 * `setItemShowImage` there's no `recalcDocument` call.
 */
export async function setItemSerialNumber(itemId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const parsed = serialNumberSchema.safeParse(formData.get("serialNumber"));
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

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
    data: { serialNumber: parsed.data },
  });

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}

/**
 * Edits an item's own `description` — normally just a snapshot of the
 * catalogue product's description taken at `addItem` time and never
 * touched again. For a credit item (the TRADE-IN product) this field
 * carries the trade-in terms text, and the salesperson needs to append the
 * traded-in machine's model to it — hence making it editable here,
 * specifically for credit items (see the `isCredit`-gated UI in
 * `items-list.tsx`). Purely descriptive — no `recalcDocument` call.
 */
export async function setItemDescription(itemId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedItemId = idSchema.safeParse(itemId);
  if (!parsedItemId.success) return { error: NOT_FOUND_ERROR };

  const parsed = itemDescriptionSchema.safeParse(formData.get("description"));
  if (!parsed.success) return { error: flattenZodError(parsed.error) };

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
    data: { description: parsed.data },
  });

  revalidatePath(`/documents/${item.documentId}`);
  return {};
}

/**
 * Sets (or clears) the document-level discount — same mode + value shape as
 * `setItemDiscount`, enforced against the same region cap (this used to be
 * uncapped at the document level; it now shares the exact same
 * MANAGER-blocked/ADMIN-warned enforcement as an item discount).
 *
 * A cash (AMOUNT) discount is converted back to an effective percentage of
 * the document's own subtotal before the cap check, same reasoning (and the
 * same `capPct` helper) as `setItemDiscount`. The subtotal used starts from
 * the document's already-persisted `subtotal` column (items + extra lines,
 * computed by the last `recalcDocument`) — this action never touches
 * items/lines, so that figure is already exactly right — but then has every
 * no-commission item/line's charged amount subtracted out of it, and every
 * credit item's (`isCredit`) charged magnitude added back in, mirroring
 * `computeTotals`'s own `documentDiscountBaseCents` exactly (see its "a
 * discount must not erode a trade-in" doc comment for the credit half, and
 * "a no-commission line takes no discount" for the other) so this pre-check
 * is comparing against the exact same base the engine will actually resolve
 * the discount against. Skipping either narrowing (comparing against the
 * plain, un-narrowed subtotal instead) would have the same AMOUNT-mode
 * under/over-reporting problem `setItemDiscount`'s own doc comment describes
 * one level down.
 */
export async function setDocumentDiscount(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedMode = discountModeSchema.safeParse(formData.get("mode"));
  if (!parsedMode.success) return { error: flattenZodError(parsedMode.error) };
  const parsedValue = discountValueSchema.safeParse(formData.get("value"));
  if (!parsedValue.success) return { error: flattenZodError(parsedValue.error) };

  if (exceedsPercentCeiling(parsedMode.data, parsedValue.data)) {
    return { error: "A percentage discount cannot exceed 100%." };
  }

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
    include: {
      region: true,
      // Only needed to narrow the cap check's base below (see this
      // function's own doc comment) — `product`/lines' `refId` are read to
      // find every no-commission item/line's charged amount and every
      // credit item's charged amount, the same "joined live" rule
      // `computeTotals`'s inputs already follow.
      items: { include: { lines: true, product: { select: { isCredit: true, noCommission: true } } } },
    },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const cap = document.region.maxDiscountPct ? Number(document.region.maxDiscountPct) : null;

  let warning: string | undefined;
  if (parsedValue.data !== null && cap !== null) {
    const optionRefIds = document.items
      .flatMap((item) => item.lines)
      .filter((line): line is (typeof document.items)[number]["lines"][number] & { refId: string } => line.kind === "OPTION" && line.refId !== null)
      .map((line) => line.refId);
    const optionRows =
      optionRefIds.length > 0
        ? await db.option.findMany({ where: { id: { in: optionRefIds } }, select: { id: true, noCommission: true } })
        : [];
    const optionNoCommissionMap = new Map(optionRows.map((o) => [o.id, o.noCommission]));

    // Mirrors `computeTotals`'s `documentDiscountBaseCents` term-for-term:
    // a no-commission item/line's charged amount is subtracted out (it takes
    // no discount), and a credit item's charged magnitude is added back in
    // (a discount must not erode a trade-in — see `computeTotals`'s doc
    // comment) — `document.subtotal` is already net of every credit item
    // (see `recalcDocument`), so without adding it back here the cap check
    // would compare against the same too-small, trade-in-eroded base the
    // engine itself no longer uses.
    let noCommissionChargedCents = 0;
    let creditChargedCents = 0;
    for (const item of document.items) {
      const itemUnitPriceCents = toCents(item.unitPrice.toString());
      if (item.product?.isCredit) {
        // A credit item is never itself discounted (refused above, in this
        // same action, and hidden in the builder), so its full charged
        // amount — unitPrice plus any lines, though it should never carry
        // any in practice — is exactly its magnitude in `document.subtotal`.
        creditChargedCents +=
          itemUnitPriceCents + item.lines.reduce((sum, line) => sum + line.qty * toCents(line.unitPrice.toString()), 0);
        continue;
      }
      if (item.product?.noCommission) noCommissionChargedCents += itemUnitPriceCents;
      for (const line of item.lines) {
        const lineNoCommission = line.refId !== null ? (optionNoCommissionMap.get(line.refId) ?? false) : false;
        if (lineNoCommission) noCommissionChargedCents += line.qty * toCents(line.unitPrice.toString());
      }
    }

    const subtotalCents = toCents(document.subtotal.toString()) + creditChargedCents - noCommissionChargedCents;
    const discount = discountCents(subtotalCents, parsedMode.data, parsedValue.data);
    const effPct = capPct(parsedMode.data, parsedValue.data, subtotalCents, discount);
    // Guarded on `subtotalCents > 0` the same way `computeTotals`'s own
    // violation check is — see `setItemDiscount`'s equivalent guard.
    if (subtotalCents > 0 && effPct > cap) {
      const message = discountCapMessage(
        parsedMode.data,
        parsedValue.data,
        effPct,
        cap,
        document.region.name,
        document.currency,
        "quote"
      );
      if (!isAdminRole(session.user.role)) {
        return { error: message };
      }
      warning = message;
    }
  }

  // The document-level discount is applied *after* `negativeSubtotal` is
  // computed (see computeTotals — the flag reflects the pre-discount
  // subtotal), so this can never actually trigger the guard on its own; the
  // same transaction pattern is still used for consistency with every other
  // mutation here, and as a defensive backstop should that ever change.
  // `recalcAndEnforce`'s concession-cap check, unlike `negativeSubtotal`,
  // *does* directly cover this discount (it's one of the terms summed into
  // `concession` — see computeTotals) — a document discount alone can be
  // enough to push the whole-document figure over the region cap even when
  // it stays under the per-discount check above (that one compares only this
  // discount's own percentage; the concession check sums every source at
  // once).
  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          discountMode: parsedMode.data,
          discountValue: parsedValue.data === null ? null : new Prisma.Decimal(parsedValue.data),
        },
      });
      concessionWarning = (await recalcAndEnforce(document.id, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${document.id}`);
  const combinedWarning = warning ?? concessionWarning;
  return combinedWarning ? { warning: combinedWarning } : {};
}

// --- price display toggles (quotation-first) --------------------------------

/**
 * Sets both quotation pricing-display toggles at once (the builder UI always
 * submits the pair together — see `PriceDisplayToggles` — so there's no
 * partial-update variant like the item discount fields have). Purely a
 * display flag pair, same as `setItemShowImage`: they never affect
 * `subtotal`/`taxAmount`/`total`, so there's no `recalcDocument` call here.
 * DRAFT-only and scoped like every other document mutation in this file.
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

// --- notes (Task: free-text notes) ------------------------------------------

/**
 * Sets (or, given a blank body, clears) `Document.notes` — the builder's
 * freeform Notes section (HTML from the `RichTextEditor`, or legacy markdown
 * for a row a pre-migration editor saved and nobody has re-opened since;
 * rendered on both the quotation sheet and the plain document sheet via
 * `renderStoredRichText` — see `QuotationData.notesHtml`/
 * `DocSheetData.notes`). HTML content is allowlist-sanitized before it ever
 * reaches the database (`sanitizeRichText`) — the read-side `renderStoredRichText`
 * sanitizes again defensively, but the write boundary is the one place that
 * actually stops something unwanted from being persisted at all. DRAFT-only
 * and scoped like every other document mutation in this file; purely a
 * display field, so unlike `setItemDiscount`/`setDocumentDiscount` there's
 * no `recalcDocument` call here (mirrors `setItemShowImage`/
 * `setPriceDisplay`).
 */
export async function setDocumentNotes(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedNotes = notesSchema.safeParse(formData.get("notes"));
  if (!parsedNotes.success) return { error: flattenZodError(parsedNotes.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  const notes =
    parsedNotes.data !== null && isHtmlContent(parsedNotes.data) ? sanitizeRichText(parsedNotes.data) : parsedNotes.data;

  await db.document.update({
    where: { id: document.id },
    data: { notes },
  });

  revalidatePath(`/documents/${document.id}`);
  return {};
}

// --- validity (per-quote override) ------------------------------------------

/**
 * Sets (or, given a blank value, clears) `Document.validityDays` — a
 * per-quote override of the org-wide "quote.validityDays" setting (see
 * `getQuoteValidityDays`, src/lib/queries/settings.ts). A salesperson uses
 * this when a particular customer's capex approval process runs longer than
 * the usual window (owner: "I'll give you eight [weeks]" in place of the
 * default). `validityDaysSchema` allows any value 1..365 — the 30-day norm
 * enforced elsewhere is a UI-level warning, not a hard cap here, since a
 * genuinely slower approval process is a legitimate reason to exceed it and
 * the discount cap already covers the case where money is actually at risk.
 * Clearing the field back to blank reverts the document to the org-wide
 * default at finalize time (see `finalizeDocument`'s
 * `document.validityDays ?? (await getQuoteValidityDays())` fallback).
 * DRAFT-only and scoped like every other document mutation in this file;
 * purely a display/finalize-time field, so — like `setItemShowImage`/
 * `setPriceDisplay`/`setDocumentNotes` — there's no `recalcDocument` call
 * here.
 */
export async function setValidityDays(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedValidityDays = validityDaysSchema.safeParse(formData.get("validityDays"));
  if (!parsedValidityDays.success) return { error: flattenZodError(parsedValidityDays.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  await db.document.update({
    where: { id: document.id },
    data: { validityDays: parsedValidityDays.data },
  });

  revalidatePath(`/documents/${document.id}`);
  return {};
}

// --- delivery terms (Ex Works carries no GST) -------------------------------

/**
 * Sets `Document.deliveryTerms` — DELIVERED (the default) or EX_WORKS, an
 * export sale collected at the factory door, which is not a domestic taxable
 * supply (the meeting question left unanswered: "What if there's no GST? If
 * it's Ex Works?"). Unlike the purely-display fields above (`setItemShowImage`/
 * `setPriceDisplay`/`setDocumentNotes`/`setValidityDays`), this one *does*
 * change what's owed — `recalcDocument` resolves an EX_WORKS document's
 * effective tax rate to zero (see its own doc comment) — so this follows the
 * same guarded-transaction + `recalcAndEnforce` pattern as every
 * money-affecting mutation in this file, even though toggling terms alone can
 * never itself trip `negativeSubtotal` or either concession cap (both are
 * computed pre-tax) — same "no special-casing a 'safe' mutation" reasoning
 * `addItem`'s own comment gives. DRAFT-only and scoped like every other
 * document mutation here.
 */
export async function setDeliveryTerms(documentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSession();

  const parsedDocumentId = idSchema.safeParse(documentId);
  if (!parsedDocumentId.success) return { error: NOT_FOUND_ERROR };

  const parsedTerms = deliveryTermsSchema.safeParse(formData.get("deliveryTerms"));
  if (!parsedTerms.success) return { error: flattenZodError(parsedTerms.error) };

  const document = await db.document.findFirst({
    where: { id: parsedDocumentId.data, status: "DRAFT", ...documentWhereForUser(session.user) },
  });
  if (!document) return { error: NOT_FOUND_ERROR };

  let concessionWarning: string | undefined;
  try {
    await db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: document.id }, data: { deliveryTerms: parsedTerms.data } });
      concessionWarning = (await recalcAndEnforce(document.id, tx, session.user.role)).warning;
    });
  } catch (error) {
    if (error instanceof NegativeSubtotalError) return { error: NEGATIVE_SUBTOTAL_ERROR };
    if (error instanceof ConcessionCapError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/documents/${document.id}`);
  return concessionWarning ? { warning: concessionWarning } : {};
}
