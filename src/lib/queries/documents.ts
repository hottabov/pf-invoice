import type { DocumentStatus, LineKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { companyWhereForUser, documentWhereForUser, type ScopeUser } from "@/lib/scope";
import { listProductsBySeries, listSeriesWithCounts } from "@/lib/queries/catalog";
import { computeTotals, type DocumentConcession, type EngineInput } from "@/lib/pricing";
import { compatibilityOrFilter } from "@/lib/catalog-compat";
import { getQuoteValidityDays } from "@/lib/queries/settings";

// --- list -------------------------------------------------------------

export type DocumentListItem = {
  id: string;
  status: DocumentStatus;
  number: string | null;
  companyName: string | null;
  total: string;
  currency: string;
  updatedAt: Date;
};

/**
 * Documents visible to `user` (all for ADMIN, own-only for MANAGER, via
 * `documentWhereForUser`), optionally narrowed by a case-insensitive search
 * on the client company's name, newest-edited first. A document with no
 * client yet (`companyId` is null pre-Task-D-finalize) never matches a
 * non-empty `q`.
 */
export async function listDocuments(
  user: ScopeUser,
  params: { q?: string } = {}
): Promise<DocumentListItem[]> {
  const { q } = params;

  const where: NonNullable<Parameters<typeof db.document.findMany>[0]>["where"] = {
    ...documentWhereForUser(user),
  };

  if (q && q.trim()) {
    where.company = { name: { contains: q.trim(), mode: "insensitive" } };
  }

  const documents = await db.document.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      number: true,
      total: true,
      currency: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });

  return documents.map((d) => ({
    id: d.id,
    status: d.status,
    number: d.number,
    companyName: d.company?.name ?? null,
    total: d.total.toString(),
    currency: d.currency,
    updatedAt: d.updatedAt,
  }));
}

// --- builder detail ----------------------------------------------------

export type BuilderContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
};

export type BuilderCompany = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  /** Resolved server-side as `!deliverySameAsMain` AND at least one
   * delivery* field is actually set — see `toSheetData`'s
   * `ToSheetCompanyInput.hasDeliveryAddress`, which this feeds directly
   * (structurally — `BuilderCompany` satisfies that type without either
   * file importing the other). Lets both the builder and the sheets skip
   * rendering a "different delivery address" block for a company that has
   * the flag off, or on but with nothing actually filled in. */
  hasDeliveryAddress: boolean;
  deliveryStreet: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPostcode: string | null;
  deliveryCountry: string | null;
  deliveryContactName: string | null;
  deliveryPhone: string | null;
  contacts: BuilderContact[];
};

export type BuilderLine = {
  id: string;
  kind: LineKind;
  code: string | null;
  name: string;
  description: string | null;
  qty: number;
  unitPrice: string;
  /** `DocumentLine.listPrice` — the catalogue price at the moment this line
   * was added, or `null` for a CUSTOM line (no catalogue entry to snapshot
   * one from) or a pre-migration OPTION row that predates this column. Feeds
   * the builder's "list price struck through" hint next to a hand-edited
   * OPTION line's price (see `LineUnitPriceField`) — never rendered on a
   * customer-facing sheet (see src/lib/sheet-data.ts, which never reads this
   * field at all). */
  listPrice: string | null;
  /** `DocumentLine.attributes` (e.g. `{ metres: 4 }`) as stored — only
   * meaningful on OPTION lines whose option has an `attributeSchema`; loosely
   * typed since it's opaque JSON round-tripped straight from the option
   * editor into storage and back. */
  attributes: Record<string, string | number> | null;
  sortOrder: number;
  /** For an OPTION line: `Option.imageUrl`, resolved by `refId` against the
   * catalog (see `getDocumentForBuilder`'s `optionImageMap`) — not a
   * snapshot column on `DocumentLine` itself, so this always reflects the
   * option's *current* catalog image, same live-lookup treatment
   * `listCompatibleOptions` gives the options editor's own icons. `null` for
   * an OPTION with no `refId` or no catalog image set. Feeds
   * `QuotationLineInput.imageUrl` (src/lib/quotation-data.ts) for the
   * quotation's unified options table.
   *
   * For a CUSTOM (document-level extra) line: `DocumentLine.imageUrl`
   * itself — a trade-in or bought-in item's own photo, since it has no
   * catalog entry to inherit one from. `null` when none was attached.
   *
   * Always `null` for a PRODUCT line (the item's own image lives on
   * `BuilderItem.imageUrl` instead). */
  imageUrl: string | null;
  /** Whether the line's `imageUrl` should actually render on a sheet/PDF —
   * same gating role as `BuilderItem.showImage`, but only ever set true for
   * a CUSTOM line (by `addCustomLine`, when a photo was attached — there's
   * no separate toggle for it, unlike an item's image). Always `false` for
   * an OPTION line today (never set by `setItemOptions`). */
  showImage: boolean;
};

export type BuilderItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  /** `DocumentItem.listPrice` — see `BuilderLine.listPrice`'s doc comment,
   * same rule one level up. `null` only for a pre-migration row; every item
   * `addItem` creates going forward gets one. */
  listPrice: string | null;
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string | null;
  /** The document's region's discount cap (`Region.maxDiscountPct`) — the
   * same value on every item of a given document, not a per-item/per-series
   * value (discount caps moved from Series to Region — see setItemDiscount
   * in src/lib/actions/documents.ts). `null` means no cap. */
  maxDiscountPct: string | null;
  /** The item's product's series id — needed, alongside `productId`, to
   * look up which options are compatible with it (see
   * `listCompatibleOptions`). `null` only in the defensive case of a
   * snapshot item whose product record no longer resolves a series
   * (shouldn't happen: deleting a referenced product is blocked — see
   * `deleteProduct` in actions/catalog.ts). */
  seriesId: string | null;
  /** The item's product's series *code* (e.g. "M", "X", "EL") — distinct
   * from `seriesId`, needed by `productBlockKey` (src/lib/quotation-data.ts)
   * to map an item to its `machine.*`/`equipment.*`/`software.*` content
   * block. `null` in the same defensive case as `seriesId`. */
  seriesCode: string | null;
  /** The item's own product id — options can be compatible at the
   * product level as well as the series level (see `OptionCompatibility`),
   * so callers need both ids to look up the full compatible-options set.
   * `null` only in the same defensive case as `seriesId`. */
  productId: string | null;
  /** `Product.specs` exactly as stored (opaque `Json?`, e.g.
   * `{ cutHeightCm, cutWidthCm }`) — carried through unvalidated for
   * `buildQuotationData`'s placeholder substitution, which validates its
   * shape defensively at runtime. `null` for an item with no resolving
   * product or no specs recorded. */
  specs: unknown;
  /** `DocumentItem.serialNumber` — set post-installation, used as-is in the
   * quotation's RSP coverage table. */
  serialNumber: string | null;
  imageUrl: string | null;
  /** Whether the item's thumbnail should actually be shown on a rendered
   * document (the sheet renderer/PDF) — distinct from `imageUrl` being
   * present, since a product snapshot can carry an image the author hasn't
   * opted to display. Toggleable from the builder UI via `setItemShowImage`
   * (src/lib/actions/documents.ts); the sheet renderer/PDF (src/lib/sheet-data.ts)
   * only shows the thumbnail when both this and `imageUrl` are set. */
  showImage: boolean;
  /** Same presence check as `imageUrl !== null`, exposed as its own boolean
   * so the builder card can gate the "Show image in PDF" checkbox on it
   * without every caller re-deriving that null-check itself. */
  productHasImage: boolean;
  sortOrder: number;
  lines: BuilderLine[];
  /** This item's own line (base price + its OPTION lines, discounted) as
   * computed by the pricing engine — display-only, mirrors what
   * `recalcDocument` persists at the document level but isn't itself stored
   * per item. */
  total: string;
  /** The item discount resolved to a cash amount (`0.00` when unset) — from
   * the same `computeTotals` call that produces `total` above
   * (`PricingTotals.itemDiscounts`), never re-derived. Feeds
   * `ToSheetItemInput.discountAmount` / `ItemBreakdown.discount.amount`. */
  discountAmount: string;
  /** `DocumentItem.lineGroup` — which production line this item belongs to.
   * Only meaningful for an item `resolveForm` recognizes; read by
   * `ProductionSpecEditor` for its line chip and by `setProductionSpec`'s
   * `±Y` propagation (same lineGroup = same physical line). */
  lineGroup: number;
  /** `DocumentItem.productionSpec` exactly as stored (opaque `Json?`,
   * validated by `specSchemaForCode` on write) — `{}` when nothing has been
   * answered yet. Only meaningful for an item `resolveForm` recognizes. */
  productionSpec: unknown;
};

export type DocumentForBuilder = {
  id: string;
  status: DocumentStatus;
  number: string | null;
  issueDate: Date;
  /** `Document.validityDays` — `null` means "use the org-wide
   * `quote.validityDays` setting" (see `getQuoteValidityDays`,
   * src/lib/queries/settings.ts); a non-null value is a per-quote override
   * set from the builder (see `setValidityDays`, src/lib/actions/documents.ts)
   * for a customer whose approval process runs longer than the usual
   * window. Frozen onto the document at finalize time either way — see
   * `finalizeDocument`'s `document.validityDays ?? (await
   * getQuoteValidityDays())` fallback — so this can be non-null on a DRAFT
   * (an author's own override, not yet finalized) as well as on a FINAL
   * document (the value frozen when it was finalized). */
  validityDays: number | null;
  /** The org-wide default (`Setting` key "quote.validityDays", via
   * `getQuoteValidityDays`) resolved *at read time* — always a number,
   * never the raw override. Exists so `toSheetData` can show a "Valid
   * until" date on a DRAFT that has never had `validityDays` set (the
   * builder's own field stays `null` in that case — see that field's doc
   * comment above — so it can still tell "nothing typed" from "typed 30"
   * apart; this is the *fallback* the sheet computes from, not a value
   * ever written back onto the document). `finalizeDocument` resolves the
   * same default independently (via `getQuoteValidityDays` directly) when
   * it freezes `validityDays` onto the document — this field is read-only
   * display plumbing and never fed back into that write. */
  defaultValidityDays: number;
  currency: string;
  taxName: string;
  taxRate: string;
  /** DELIVERED (the default) or EX_WORKS — see the `DeliveryTerms` enum in
   * schema.prisma and `setDeliveryTerms`/`recalcDocument` in
   * src/lib/actions/documents.ts, which zeroes an EX_WORKS document's
   * effective tax. Surfaced here so the builder's selector (see
   * `DeliveryTermsField`) and the sheet renderers (see `ToSheetDataDoc`,
   * which this structurally satisfies) both read it straight off the
   * document. */
  deliveryTerms: "DELIVERED" | "EX_WORKS";
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string | null;
  subtotal: string;
  /** subtotal - taxableBase, i.e. the amount the document-level discount
   * removes — 0 when `discountValue` is null. */
  discountAmount: string;
  /** Full price before item-level and document-level discounts, for the
   * builder Summary breakdown. */
  summarySubtotal: string;
  /** Combined item-level and document-level discount, for Summary. */
  summaryDiscountAmount: string;
  /** The whole-document region-discount-cap check (see `DocumentConcession`
   * in src/lib/pricing.ts) — same figure `recalcDocument`/`recalcAndEnforce`
   * (src/lib/actions/documents.ts) enforce on every save and
   * `finalizeDocument` re-checks. Surfaced here so the builder can display
   * it (e.g. an "exceeds cap" banner) without a second `computeTotals` run;
   * always present, `exceedsCap` is what a caller actually branches on. */
  documentConcession: DocumentConcession;
  taxAmount: string;
  total: string;
  regionId: string;
  regionCode: string;
  /** `Region.name` (e.g. "Australia") — surfaced alongside `documentConcession`
   * so the builder can build the same "... above the X% limit for
   * <region>" message `concessionCapMessage` produces server-side elsewhere
   * (`recalcDocument`'s `concessionMessage`) without a second query; see
   * `ConcessionCapBadge`/`ConcessionCapToast`. */
  regionName: string;
  /** `Document.entitySnapshot` exactly as stored (an opaque `Json?` column,
   * frozen by `finalizeDocument` — see its doc comment for the shape it
   * writes) — `null` for a document that has never been finalized.
   * Consumers that need to read it (the document sheet mapper) are
   * responsible for validating its shape at runtime since Prisma's `Json`
   * type gives no compile-time guarantee. */
  entitySnapshot: unknown;
  /** The document's *region*'s current entity identity fields — i.e. the
   * live values, not a frozen snapshot. Used as-is to render a DRAFT (which
   * has no snapshot yet); a FINAL document's renderer should prefer
   * `entitySnapshot` instead so an admin editing the region later never
   * retroactively changes an already-issued document. */
  entityName: string;
  entityLegalId: string | null;
  entityAddress: string | null;
  bankDetails: unknown;
  logoUrl: string | null;
  footerText: string | null;
  company: BuilderCompany | null;
  contactId: string | null;
  contact: BuilderContact | null;
  items: BuilderItem[];
  extraLines: BuilderLine[];
  /** `Document.notes` — free-text, admin-authored markdown edited from the
   * builder's Notes section (see `setDocumentNotes`) and rendered on both
   * the quotation and plain document sheets (see `ToSheetDataDoc.notes`).
   * `null` when nothing's been written. */
  notes: string | null;
  /** The document's author — feeds the "Prepared by" block (see
   * `ToSheetAuthorInput`/`DocSheetPreparedBy` in src/lib/sheet-data.ts).
   * Always present: `Document.authorId` is a required field. `avatar` is
   * `User.image` — NextAuth's own profile-picture column, reused here as
   * the "Prepared by" photo (see src/lib/actions/users.ts's `setUserAvatar`
   * for the write side) since this app's credentials/magic-link auth never
   * populates it on its own — a stored `/api/files/<name>` URL that
   * `toSheetData` must resolve through its `ImageResolver` the same way it
   * already does `logoUrl`/item images, or the PDF pipeline would embed a
   * URL Gotenberg's headless Chromium can't fetch. */
  author: { name: string | null; email: string; phone: string | null; avatar: string | null };
  /** Quotation-first pricing display toggles (see `setPriceDisplay` in
   * src/lib/actions/documents.ts) — the builder only ever surfaces its
   * toggle card for a QUOTE, but both flags are read straight through into
   * `QuotationDataDoc` regardless of `type` (see `buildQuotationData`). */
  showItemPrices: boolean;
  showOptionPrices: boolean;
  updatedAt: Date;
};

/**
 * `optionImageMap` (optionId -> Option.imageUrl, built once per
 * `getDocumentForBuilder` call from every OPTION line's `refId` — see
 * below) resolves `imageUrl` for an OPTION line (an OPTION with no `refId`
 * or no matching catalog image gets `null`); a CUSTOM line uses its own
 * `imageUrl`/`showImage` columns instead (there's no catalog entry to
 * resolve); a PRODUCT line always gets `null` (its image lives on
 * `BuilderItem.imageUrl`).
 */
function toBuilderLine(
  line: {
    id: string;
    kind: LineKind;
    code: string | null;
    name: string;
    description: string | null;
    qty: number;
    unitPrice: { toString(): string };
    listPrice: { toString(): string } | null;
    attributes: unknown;
    sortOrder: number;
    refId: string | null;
    imageUrl: string | null;
    showImage: boolean;
  },
  optionImageMap: Map<string, string>
): BuilderLine {
  return {
    id: line.id,
    kind: line.kind,
    code: line.code,
    name: line.name,
    description: line.description,
    qty: line.qty,
    unitPrice: line.unitPrice.toString(),
    listPrice: line.listPrice !== null ? line.listPrice.toString() : null,
    attributes:
      line.attributes && typeof line.attributes === "object" && !Array.isArray(line.attributes)
        ? (line.attributes as Record<string, string | number>)
        : null,
    sortOrder: line.sortOrder,
    imageUrl:
      line.kind === "OPTION"
        ? line.refId
          ? (optionImageMap.get(line.refId) ?? null)
          : null
        : line.imageUrl,
    showImage: line.kind === "OPTION" ? false : line.showImage,
  };
}

function toBuilderContact(contact: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
}): BuilderContact {
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    position: contact.position,
    isPrimary: contact.isPrimary,
  };
}

/**
 * The full document a builder page needs to render: client (company, with
 * its contacts ordered primary-first then by first name) + contact,
 * region, every item (ordered by sortOrder) with its option/product lines
 * (also ordered by sortOrder), and the document-level lines (`itemId` is
 * null — freeform "extra lines" like delivery). Returns `null` both when
 * the document doesn't exist and when it's out of `user`'s scope (a
 * manager opening another manager's document) — callers should 404 either
 * way, never distinguishing the two.
 */
export async function getDocumentForBuilder(
  user: ScopeUser,
  id: string
): Promise<DocumentForBuilder | null> {
  const document = await db.document.findFirst({
    where: { id, ...documentWhereForUser(user) },
    include: {
      region: true,
      // `image` here is `User.image` reused as the avatar — see the
      // `author` field's doc comment above.
      author: { select: { name: true, email: true, phone: true, image: true } },
      company: {
        include: {
          contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
        },
      },
      contact: true,
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          product: { include: { series: true } },
        },
      },
      lines: {
        where: { itemId: null },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!document) return null;

  // Resolved once here (not written back onto `document.validityDays`) —
  // see `defaultValidityDays`'s doc comment above.
  const defaultValidityDays = await getQuoteValidityDays();

  // Every OPTION line's icon in the quotation's unified options table (see
  // src/lib/quotation-data.ts's QuotationOptionRow) comes from the option's
  // *current* catalog `imageUrl`, not a snapshot on the line — `DocumentLine`
  // has no `imageUrl` column, only `refId` (the optionId). One query up
  // front for every distinct refId referenced anywhere in the document
  // (item lines + document-level extra lines) beats a per-line round trip.
  const optionRefIds = Array.from(
    new Set(
      document.items
        .flatMap((item) => item.lines)
        .concat(document.lines)
        .filter((line): line is (typeof document.lines)[number] & { refId: string } => line.kind === "OPTION" && line.refId !== null)
        .map((line) => line.refId)
    )
  );
  const optionImages =
    optionRefIds.length > 0
      ? await db.option.findMany({ where: { id: { in: optionRefIds } }, select: { id: true, imageUrl: true } })
      : [];
  const optionImageMap = new Map(
    optionImages.filter((o): o is { id: string; imageUrl: string } => o.imageUrl !== null).map((o) => [o.id, o.imageUrl])
  );

  // Item totals and the document discount amount aren't persisted per row
  // (recalcDocument only writes the document-level subtotal/tax/total) —
  // recompute them here with the same pure engine so the builder can show
  // "item total" and "discount: -$X" without duplicating the math.
  // The discount cap is the document's region cap (Region.maxDiscountPct) —
  // the same value on every item, not a per-item/series value; see
  // setItemDiscount in src/lib/actions/documents.ts for the enforcement
  // side of this move from Series to Region.
  const regionMaxDiscountPct = document.region.maxDiscountPct ? Number(document.region.maxDiscountPct) : null;
  const regionMaxMarkupPct = document.region.maxMarkupPct ? Number(document.region.maxMarkupPct) : null;
  const engineInput: EngineInput = {
    items: document.items.map((item) => ({
      unitPrice: Number(item.unitPrice),
      listPrice: item.listPrice !== null ? Number(item.listPrice) : null,
      discountMode: item.discountMode,
      discountValue: item.discountValue !== null ? item.discountValue.toString() : null,
      maxDiscountPct: regionMaxDiscountPct,
      lines: item.lines.map((line) => ({
        qty: line.qty,
        unitPrice: Number(line.unitPrice),
        listPrice: line.listPrice !== null ? Number(line.listPrice) : null,
      })),
    })),
    extraLines: document.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    documentDiscountMode: document.discountMode,
    documentDiscountValue: document.discountValue !== null ? document.discountValue.toString() : null,
    regionMaxDiscountPct,
    regionMaxMarkupPct,
    taxRate: Number(document.taxRate),
  };
  const totals = computeTotals(engineInput);

  return {
    id: document.id,
    status: document.status,
    number: document.number,
    issueDate: document.issueDate,
    validityDays: document.validityDays,
    defaultValidityDays,
    currency: document.currency,
    taxName: document.taxName,
    taxRate: document.taxRate.toString(),
    deliveryTerms: document.deliveryTerms,
    discountMode: document.discountMode,
    discountValue: document.discountValue?.toString() ?? null,
    subtotal: document.subtotal.toString(),
    discountAmount: totals.discountAmount.toString(),
    summarySubtotal: totals.grossSubtotal.toString(),
    summaryDiscountAmount: totals.totalDiscountAmount.toString(),
    documentConcession: totals.documentConcession,
    taxAmount: document.taxAmount.toString(),
    total: document.total.toString(),
    regionId: document.regionId,
    regionCode: document.region.code,
    regionName: document.region.name,
    entitySnapshot: document.entitySnapshot,
    entityName: document.region.entityName,
    entityLegalId: document.region.entityLegalId,
    entityAddress: document.region.entityAddress,
    bankDetails: document.region.bankDetails,
    logoUrl: document.region.logoUrl,
    footerText: document.region.footerText,
    company: document.company
      ? {
          id: document.company.id,
          name: document.company.name,
          street: document.company.street,
          city: document.company.city,
          state: document.company.state,
          postcode: document.company.postcode,
          country: document.company.country,
          website: document.company.website,
          // "Distinct delivery address" needs both the flag AND actual data
          // — a company with `deliverySameAsMain` off but every delivery
          // field still blank (e.g. right after unchecking the box, before
          // saving) has nothing worth rendering as a separate block.
          hasDeliveryAddress:
            !document.company.deliverySameAsMain &&
            Boolean(
              document.company.deliveryStreet ||
                document.company.deliveryCity ||
                document.company.deliveryPostcode ||
                document.company.deliveryCountry
            ),
          deliveryStreet: document.company.deliveryStreet,
          deliveryCity: document.company.deliveryCity,
          deliveryState: document.company.deliveryState,
          deliveryPostcode: document.company.deliveryPostcode,
          deliveryCountry: document.company.deliveryCountry,
          deliveryContactName: document.company.deliveryContactName,
          deliveryPhone: document.company.deliveryPhone,
          contacts: document.company.contacts.map(toBuilderContact),
        }
      : null,
    contactId: document.contactId,
    contact: document.contact ? toBuilderContact(document.contact) : null,
    items: document.items.map((item, index) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice.toString(),
      listPrice: item.listPrice !== null ? item.listPrice.toString() : null,
      discountMode: item.discountMode,
      discountValue: item.discountValue?.toString() ?? null,
      maxDiscountPct: document.region.maxDiscountPct?.toString() ?? null,
      seriesId: item.product?.seriesId ?? null,
      seriesCode: item.product?.series.code ?? null,
      productId: item.product?.id ?? null,
      specs: item.product?.specs ?? null,
      serialNumber: item.serialNumber,
      imageUrl: item.imageUrl,
      showImage: item.showImage,
      productHasImage: item.imageUrl !== null,
      sortOrder: item.sortOrder,
      lines: item.lines.map((line) => toBuilderLine(line, optionImageMap)),
      total: totals.itemTotals[index].toString(),
      discountAmount: totals.itemDiscounts[index].toString(),
      lineGroup: item.lineGroup,
      productionSpec: item.productionSpec,
    })),
    extraLines: document.lines.map((line) => toBuilderLine(line, optionImageMap)),
    notes: document.notes,
    author: {
      name: document.author.name,
      email: document.author.email,
      phone: document.author.phone,
      avatar: document.author.image,
    },
    showItemPrices: document.showItemPrices,
    showOptionPrices: document.showOptionPrices,
    updatedAt: document.updatedAt,
  };
}

// --- production forms ---------------------------------------------------------

export const productionFormsInclude = {
  region: true,
  // `select`, not `true`: `author: true` would pull the whole User row --
  // passwordHash included -- into a payload that flows on to the form
  // renderer. The forms print one field, the salesperson's name. Same
  // narrowing getDocumentForBuilder does for the same reason.
  author: { select: { name: true } },
  company: { include: { industry: true } },
  contact: true,
  items: { orderBy: { sortOrder: "asc" }, include: { lines: true } },
  lines: { where: { itemId: null } },
} satisfies Prisma.DocumentInclude;

export type DocumentForForms = Prisma.DocumentGetPayload<{ include: typeof productionFormsInclude }>;

/**
 * A document loaded for production form rendering, scoped to the caller the
 * same way `getDocumentForBuilder` is.
 */
export async function getDocumentForForms(user: ScopeUser, documentId: string) {
  return db.document.findFirst({
    where: { id: documentId, ...documentWhereForUser(user) },
    include: productionFormsInclude,
  });
}

// --- client picker ---------------------------------------------------------

export type ClientPickerContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  isPrimary: boolean;
};

export type ClientPickerCompany = {
  id: string;
  name: string;
  contacts: ClientPickerContact[];
};

/**
 * Every company `user` can see (scoped like listCompanies in
 * src/lib/queries/clients.ts), each with its contacts ordered primary-first
 * then by first name — preloaded in full for the builder's client-picker
 * client component, which does its own search filtering (companies are a
 * small enough list per manager that a client-side filter beats a
 * per-keystroke server round trip).
 */
export async function listClientPickerCompanies(user: ScopeUser): Promise<ClientPickerCompany[]> {
  const companies = await db.company.findMany({
    where: companyWhereForUser(user),
    orderBy: { name: "asc" },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
    },
  });

  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    contacts: c.contacts.map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      isPrimary: contact.isPrimary,
    })),
  }));
}

// --- item picker ---------------------------------------------------------

export type ItemPickerProduct = {
  code: string;
  name: string;
  priced: boolean;
};

export type ItemPickerSeries = {
  code: string;
  name: string;
  maxDiscountPct: string | null;
  products: ItemPickerProduct[];
};

/**
 * The whole catalog tree (every series, each with its active products),
 * flagged per-product with whether it has a usable price in `regionCode`
 * (a price row that exists and isn't `needsReview`) — the "Add item" picker
 * preloads this once so choosing a series/product is instant, and disables
 * unpriced products with a "price required" hint instead of a second round
 * trip.
 */
export async function getItemPickerCatalog(regionCode: string): Promise<ItemPickerSeries[]> {
  const seriesList = await listSeriesWithCounts();

  return Promise.all(
    seriesList.map(async (series) => {
      const detail = await listProductsBySeries(series.code, regionCode);
      return {
        code: series.code,
        name: series.name,
        maxDiscountPct: series.maxDiscountPct,
        products: (detail?.products ?? [])
          .filter((p) => p.active)
          .map((p) => ({
            code: p.code,
            name: p.name,
            priced: Boolean(p.price && !p.price.needsReview),
          })),
      };
    })
  );
}

// --- options editor ---------------------------------------------------------

export type CompatibleOption = {
  id: string;
  code: string;
  name: string;
  shortDescription: string | null;
  /** Raw `Option.attributeSchema`, expected shape (when present) is an array
   * of `{key, label, type: "number"|"text"}` — the options editor is
   * responsible for tolerating anything else (see its `parseAttributeFields`
   * helper) since this is unvalidated admin-entered JSON. */
  attributeSchema: unknown;
  price: { amount: string; needsReview: boolean } | null;
  /** `Option.imageUrl`, rendered as a small icon next to the option in the
   * builder's options editor when present and the "ui.showOptionIcons" app
   * setting is on (see `getShowOptionIcons`, src/lib/queries/settings.ts) —
   * `null` (most options today) shows no icon and no placeholder. */
  imageUrl: string | null;
  /** Whether this option has an `OptionCompatibility` row matching the
   * item — at either the series level (`seriesId`) or the product level
   * (`productId`; e.g. EasyLoader accessories are only compatible with
   * product EL-2020, not the whole EasyLoader series) — see
   * `compatibilityOrFilter`. `false` no longer means "cannot be added":
   * every active option is offered regardless (Ross, in the meeting: "there
   * might be a situation where you do... if you restrict yourself"), this
   * just tells the builder which ones to flag and confirm before adding
   * (see `ItemOptionsEditor`). The `OptionCompatibility` model only ever
   * records a plain yes/no per (option, series/product) pair — no
   * spec/measurement data (e.g. widths) is stored anywhere — so this is the
   * only thing a caller can honestly say about *why* a pairing isn't
   * marked compatible. */
  compatible: boolean;
};

/**
 * Every active option, each flagged with whether it's marked compatible with
 * `productId`/`seriesId` (see `CompatibleOption.compatible`) — until Change
 * 2 this query filtered incompatible options out entirely; it now returns
 * all of them so the builder's options editor can offer everything, visibly
 * marking what the catalog doesn't vouch for (see `ItemOptionsEditor`) —
 * incompatible is a warning now, not a wall. Each result still carries its
 * price in `regionId` if one exists, unpriced or not: a missing/`needsReview`
 * price is a *different* condition (the option literally cannot be priced on
 * this quote) and stays a hard disable in the editor, untouched by this
 * change. Preloaded once per distinct (productId, seriesId) pair on the
 * builder page (not per item) and handed to each item's options editor.
 */
export async function listCompatibleOptions(
  productId: string | null,
  seriesId: string | null,
  regionId: string
): Promise<CompatibleOption[]> {
  const or = compatibilityOrFilter(productId, seriesId);
  if (!or) return [];

  const options = await db.option.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { prices: { where: { regionId } }, compat: { where: { OR: or } } },
  });

  return options.map((o) => {
    const price = o.prices[0];
    return {
      id: o.id,
      code: o.code,
      name: o.name,
      shortDescription: o.shortDescription,
      attributeSchema: o.attributeSchema,
      price: price ? { amount: price.amount.toString(), needsReview: price.needsReview } : null,
      imageUrl: o.imageUrl,
      compatible: o.compat.length > 0,
    };
  });
}
