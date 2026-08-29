import type { DocumentStatus, DocumentType, LineKind } from "@prisma/client";
import { db } from "@/lib/db";
import { companyWhereForUser, documentWhereForUser, type ScopeUser } from "@/lib/scope";
import { listProductsBySeries, listSeriesWithCounts } from "@/lib/queries/catalog";

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
  imageUrl: string | null;
  sortOrder: number;
  lines: BuilderLine[];
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
  taxAmount: string;
  total: string;
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
    taxAmount: document.taxAmount.toString(),
    total: document.total.toString(),
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
    items: document.items.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice.toString(),
      discountPct: item.discountPct?.toString() ?? null,
      maxDiscountPct: item.product?.series.maxDiscountPct?.toString() ?? null,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      lines: item.lines.map(toBuilderLine),
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
