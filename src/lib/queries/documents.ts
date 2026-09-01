import type { DocumentStatus, LineKind } from "@prisma/client";
import { db } from "@/lib/db";
import { companyWhereForUser, documentWhereForUser, type ScopeUser } from "@/lib/scope";
import { listProductsBySeries, listSeriesWithCounts } from "@/lib/queries/catalog";
import { computeTotals, type EngineInput } from "@/lib/pricing";
import { compatibilityOrFilter } from "@/lib/catalog-compat";

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
  discountPct: string | null;
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
};

export type DocumentForBuilder = {
  id: string;
  status: DocumentStatus;
  number: string | null;
  issueDate: Date;
  /** Only ever non-null once a document has been through
   * `finalizeDocument` (see src/lib/actions/finalize.ts) — a still-DRAFT
   * document always has `null` here. */
  validityDays: number | null;
  currency: string;
  taxName: string;
  taxRate: string;
  discountPct: string | null;
  subtotal: string;
  /** subtotal - taxableBase, i.e. the amount the document-level discount
   * removes — 0 when `discountPct` is null. Surfaced so the sticky footer
   * can show "Discount: -$X" only when a document discount is actually set. */
  discountAmount: string;
  taxAmount: string;
  total: string;
  regionId: string;
  regionCode: string;
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
   * Always present: `Document.authorId` is a required field. */
  author: { name: string | null; email: string; phone: string | null };
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
      author: { select: { name: true, email: true, phone: true } },
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
  const engineInput: EngineInput = {
    items: document.items.map((item) => ({
      unitPrice: Number(item.unitPrice),
      discountPct: item.discountPct !== null ? Number(item.discountPct) : null,
      maxDiscountPct: regionMaxDiscountPct,
      lines: item.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    })),
    extraLines: document.lines.map((line) => ({ qty: line.qty, unitPrice: Number(line.unitPrice) })),
    documentDiscountPct: document.discountPct !== null ? Number(document.discountPct) : null,
    taxRate: Number(document.taxRate),
  };
  const totals = computeTotals(engineInput);

  return {
    id: document.id,
    status: document.status,
    number: document.number,
    issueDate: document.issueDate,
    validityDays: document.validityDays,
    currency: document.currency,
    taxName: document.taxName,
    taxRate: document.taxRate.toString(),
    discountPct: document.discountPct?.toString() ?? null,
    subtotal: document.subtotal.toString(),
    discountAmount: totals.discountAmount.toString(),
    taxAmount: document.taxAmount.toString(),
    total: document.total.toString(),
    regionId: document.regionId,
    regionCode: document.region.code,
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
      discountPct: item.discountPct?.toString() ?? null,
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
    })),
    extraLines: document.lines.map((line) => toBuilderLine(line, optionImageMap)),
    notes: document.notes,
    author: { name: document.author.name, email: document.author.email, phone: document.author.phone },
    showItemPrices: document.showItemPrices,
    showOptionPrices: document.showOptionPrices,
    updatedAt: document.updatedAt,
  };
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
};

/**
 * Active options compatible with `productId` and/or `seriesId` — an option
 * counts as compatible when it has a compat row at either the series level
 * (matching `seriesId`) or the product level (matching `productId`; e.g.
 * EasyLoader accessories are only compatible with product EL-2020, not the
 * whole EasyLoader series) — see `compatibilityOrFilter`. Each result
 * carries its price in `regionId` if one exists. Preloaded once per distinct
 * (productId, seriesId) pair on the builder page (not per item) and handed
 * to each item's options editor — a product with no price row at all, or
 * one flagged `needsReview`, is still included (so the editor can show it
 * disabled with "price required") rather than silently hidden.
 */
export async function listCompatibleOptions(
  productId: string | null,
  seriesId: string | null,
  regionId: string
): Promise<CompatibleOption[]> {
  const or = compatibilityOrFilter(productId, seriesId);
  if (!or) return [];

  const options = await db.option.findMany({
    where: { active: true, compat: { some: { OR: or } } },
    orderBy: { sortOrder: "asc" },
    include: { prices: { where: { regionId } } },
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
    };
  });
}
