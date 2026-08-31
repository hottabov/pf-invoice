// Pure copy-mapping for "Create invoice" (owner: sales approve a quote ->
// invoice without re-entering anything — see `createInvoiceFromQuote` in
// src/lib/actions/documents.ts). Deliberately has zero `@/lib/db` or
// `next/*` imports, same discipline as src/lib/sheet-data.ts and
// src/lib/quotation-data.ts: this is the one piece of the copy that's worth
// unit testing without a database, so the shape-mapping logic (what gets
// copied, what gets stripped, what gets set fresh) lives here as a plain
// function; the action itself only loads the source QUOTE, calls this, and
// persists the result inside one transaction.

// --- input shape (a loaded QUOTE, as the action reads it) -------------------

export type QuoteCopyLine = {
  kind: "OPTION" | "PRODUCT" | "CUSTOM";
  refId: string | null;
  code: string | null;
  name: string;
  description: string | null;
  qty: number;
  /** Decimal snapshot as a string — see DocumentLine.unitPrice — never a
   * `number`, so this can be handed straight to `new Prisma.Decimal(...)`
   * without float rounding, same convention as every other money field in
   * this module. */
  unitPrice: string;
  attributes: unknown;
  showImage: boolean;
  sortOrder: number;
};

export type QuoteCopyItem = {
  productId: string | null;
  sortOrder: number;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  discountPct: string | null;
  serialNumber: string | null;
  showImage: boolean;
  imageUrl: string | null;
  /** This item's own OPTION lines (never document-level lines — those are
   * `QuoteForCopy.lines` instead). */
  lines: QuoteCopyLine[];
};

/** The minimal shape `buildInvoiceCopyPayload` needs from a loaded QUOTE
 * document — deliberately not typed against Prisma's generated payload so
 * this stays trivial to unit test with hand-built fixtures, same reasoning
 * as `FinalizableDocument` in src/lib/validation/finalize.ts. No `id`s for
 * items/lines at all: the new invoice's rows get fresh ones from the
 * database, so there's nothing here to "strip" — a row that never carried a
 * source id can't leak one. */
export type QuoteForCopy = {
  id: string;
  companyId: string | null;
  contactId: string | null;
  regionId: string;
  currency: string;
  taxName: string;
  taxRate: string;
  discountPct: string | null;
  notes: string | null;
  showItemPrices: boolean;
  showOptionPrices: boolean;
  items: QuoteCopyItem[];
  /** Document-level lines only (`itemId: null` — freeform "extra lines" like
   * delivery/install), same convention as `BuilderItem`/`DocumentForBuilder`
   * elsewhere in the app. */
  lines: QuoteCopyLine[];
};

// --- output shape (what the action persists) --------------------------------

export type InvoiceCopyDocument = {
  type: "INVOICE";
  status: "DRAFT";
  companyId: string | null;
  contactId: string | null;
  regionId: string;
  currency: string;
  taxName: string;
  taxRate: string;
  discountPct: string | null;
  notes: string | null;
  showItemPrices: boolean;
  showOptionPrices: boolean;
  /** The QUOTE this invoice was copied from — always set (that's the whole
   * point of this module), never `null`, unlike the schema column itself
   * (which is nullable so a from-scratch invoice, and a quote that later
   * gets its source deleted, both read `null`). */
  sourceQuoteId: string;
};

export type InvoiceCopyItem = Omit<QuoteCopyItem, "lines"> & { lines: QuoteCopyLine[] };

export type InvoiceCopyPayload = {
  document: InvoiceCopyDocument;
  items: InvoiceCopyItem[];
  extraLines: QuoteCopyLine[];
};

/**
 * Maps a loaded QUOTE to everything needed to create its DRAFT INVOICE copy:
 * the document's own business/pricing/catalog fields (client, region,
 * currency, tax, discount, notes, price-display toggles) carried over
 * as-is, every item deep-copied with its OPTION lines, and every
 * document-level line deep-copied — `type`/`status`/`sourceQuoteId` are the
 * only fields this ever sets fresh rather than copying. Deliberately excludes
 * `authorId`: unlike every other field here, authorship belongs to whoever
 * clicks "Create invoice" (the caller's own session), not to the quote's
 * original author, so the action sets it itself rather than this pure
 * mapper inventing an opinion about it.
 */
export function buildInvoiceCopyPayload(quote: QuoteForCopy): InvoiceCopyPayload {
  return {
    document: {
      type: "INVOICE",
      status: "DRAFT",
      companyId: quote.companyId,
      contactId: quote.contactId,
      regionId: quote.regionId,
      currency: quote.currency,
      taxName: quote.taxName,
      taxRate: quote.taxRate,
      discountPct: quote.discountPct,
      notes: quote.notes,
      showItemPrices: quote.showItemPrices,
      showOptionPrices: quote.showOptionPrices,
      sourceQuoteId: quote.id,
    },
    items: quote.items.map((item) => ({
      productId: item.productId,
      sortOrder: item.sortOrder,
      code: item.code,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
      serialNumber: item.serialNumber,
      showImage: item.showImage,
      imageUrl: item.imageUrl,
      lines: item.lines.map((line) => ({ ...line })),
    })),
    extraLines: quote.lines.map((line) => ({ ...line })),
  };
}
