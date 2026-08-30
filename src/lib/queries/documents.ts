import type { DocumentStatus, DocumentType, LineKind } from "@prisma/client";
import { db } from "@/lib/db";
import { companyWhereForUser, documentWhereForUser, type ScopeUser } from "@/lib/scope";
import { listProductsBySeries, listSeriesWithCounts } from "@/lib/queries/catalog";
import { computeTotals, type EngineInput } from "@/lib/pricing";
import { compatibilityOrFilter } from "@/lib/catalog-compat";

// --- list -------------------------------------------------------------

export type DocumentListItem = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  companyName: string | null;
  total: string;
  currency: string;
  updatedAt: Date;
};

/**
 * Documents visible to `user` (all for ADMIN, own-only for MANAGER, via
 * `documentWhereForUser`), optionally narrowed by type and/or a
 * case-insensitive search on the client company's name, newest-edited
 * first. A document with no client yet (`companyId` is null pre-Task-D-
 * finalize) never matches a non-empty `q`.
 */
export async function listDocuments(
  user: ScopeUser,
  params: { type?: string; q?: string } = {}
): Promise<DocumentListItem[]> {
  const { type, q } = params;

  const where: NonNullable<Parameters<typeof db.document.findMany>[0]>["where"] = {
    ...documentWhereForUser(user),
  };

  if (type === "QUOTE" || type === "INVOICE") {
    where.type = type;
  }

  if (q && q.trim()) {
    where.company = { name: { contains: q.trim(), mode: "insensitive" } };
  }

  const documents = await db.document.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
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
    type: d.type,
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
  isPrimary: boolean;
};

export type BuilderCompany = {
  id: string;
  name: string;
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
};

export type BuilderItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  discountPct: string | null;
  maxDiscountPct: string | null;
  /** The item's product's series id — needed, alongside `productId`, to
   * look up which options are compatible with it (see
   * `listCompatibleOptions`). `null` only in the defensive case of a
   * snapshot item whose product record no longer resolves a series
   * (shouldn't happen: deleting a referenced product is blocked — see
   * `deleteProduct` in actions/catalog.ts). */
  seriesId: string | null;
  /** The item's own product id — options can be compatible at the
   * product level as well as the series level (see `OptionCompatibility`),
   * so callers need both ids to look up the full compatible-options set.
   * `null` only in the same defensive case as `seriesId`. */
  productId: string | null;
  imageUrl: string | null;
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
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
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
  company: BuilderCompany | null;
  contactId: string | null;
  items: BuilderItem[];
  extraLines: BuilderLine[];
  updatedAt: Date;
};

function toBuilderLine(line: {
  id: string;
  kind: LineKind;
  code: string | null;
  name: string;
  description: string | null;
  qty: number;
  unitPrice: { toString(): string };
  attributes: unknown;
  sortOrder: number;
}): BuilderLine {
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
      company: {
        include: {
          contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
        },
      },
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

  // Item totals and the document discount amount aren't persisted per row
  // (recalcDocument only writes the document-level subtotal/tax/total) —
  // recompute them here with the same pure engine so the builder can show
  // "item total" and "discount: -$X" without duplicating the math.
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

  return {
    id: document.id,
    type: document.type,
    status: document.status,
    number: document.number,
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
    company: document.company
      ? {
          id: document.company.id,
          name: document.company.name,
          contacts: document.company.contacts.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            isPrimary: c.isPrimary,
          })),
        }
      : null,
    contactId: document.contactId,
    items: document.items.map((item, index) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice.toString(),
      discountPct: item.discountPct?.toString() ?? null,
      maxDiscountPct: item.product?.series.maxDiscountPct?.toString() ?? null,
      seriesId: item.product?.seriesId ?? null,
      productId: item.product?.id ?? null,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      lines: item.lines.map(toBuilderLine),
      total: totals.itemTotals[index].toString(),
    })),
    extraLines: document.lines.map(toBuilderLine),
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
    };
  });
}
