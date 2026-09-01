// Pure mapper from a loaded document (as `getDocumentForBuilder` returns it,
// or anything structurally compatible) to `DocSheetData` — the flat,
// JSON-serializable shape `DocumentSheet` (src/components/sheet/
// document-sheet.tsx) renders. Deliberately has zero `@/lib/db` or `next/*`
// imports (same reasoning as src/lib/validation/finalize.ts: a plain
// `vitest run` of this file must never need `DATABASE_URL` set) — its only
// dependencies are the equally dependency-free pricing engine and date/money
// formatters. The input type below is defined from scratch rather than
// imported from src/lib/queries/documents.ts so this module can never
// accidentally pull in that file's `@/lib/db` import — TypeScript's
// structural typing means the real `DocumentForBuilder` satisfies
// `ToSheetDataDoc` without either file importing the other.
//
// The FINAL-vs-DRAFT split lives entirely here: a FINAL document's entity
// identity (name/legal id/address/bank details/footer) comes from its frozen
// `entitySnapshot` so a later edit to the region never retroactively changes
// an already-issued document; a DRAFT (which has no snapshot yet) falls back
// to the region's live values. `currency`/`taxName`/`taxRate` are never
// entity-snapshot-dependent — they're set once on the `Document` row itself
// at creation (see `createDraft` in src/lib/actions/documents.ts) and never
// change afterwards, for both DRAFT and FINAL.
import { fromCents, toCents } from "./pricing";
import { formatDateAU } from "./format";
import { displayCountry } from "./countries";

// --- input shape -------------------------------------------------------------

export type ToSheetLineInput = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  qty: number;
  unitPrice: string;
  /** `BuilderLine.imageUrl`/`showImage` — see that type's doc comment.
   * Optional (unlike `ToSheetItemInput`'s always-present pair) so existing
   * fixtures/tests that construct a line without them still type-check;
   * `toDocSheetLine` treats a missing `showImage` the same as `false`. Only
   * a CUSTOM (extra) line's own photo ever renders through this — an
   * OPTION's catalog image is resolved into the same field but
   * `showImage` is never set true for one, so it never actually displays
   * here (see `DocSheetLine.image`). */
  imageUrl?: string | null;
  showImage?: boolean;
};

export type ToSheetItemInput = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string | null;
  /** The item discount resolved to a cash amount (0.00 when unset) — same
   * money the pricing engine already subtracted from base+options to reach
   * `total` below (`PricingTotals.itemDiscounts`, see `getDocumentForBuilder`),
   * carried through as its own field so `ItemBreakdown.discount.amount`
   * never has to re-derive it (money arithmetic stays in pricing.ts, not
   * here — see `buildItemBreakdown`). */
  discountAmount: string;
  /** Pre-computed by the pricing engine (see `getDocumentForBuilder`) —
   * this mapper never re-derives money math, only reshapes it. */
  total: string;
  imageUrl: string | null;
  showImage: boolean;
  lines: ToSheetLineInput[];
};

export type ToSheetCompanyInput = {
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  /** Whether this company actually has a delivery address distinct from
   * the main one above — resolved server-side (see `BuilderCompany` in
   * src/lib/queries/documents.ts) as `!deliverySameAsMain` plus "at least
   * one delivery field is actually filled in", so a company that merely
   * has the flag unset but no delivery data never renders an empty block. */
  hasDeliveryAddress: boolean;
  deliveryStreet: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPostcode: string | null;
  deliveryCountry: string | null;
  deliveryContactName: string | null;
  deliveryPhone: string | null;
};

export type ToSheetContactInput = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

/** The document's author (`Document.author`), as much as the "Prepared by"
 * block needs (owner reference doc: "Prepared by: <manager name / phone>,
 * <email>") — `email` is always set (required on `User`), `name`/`phone`
 * are both optional profile fields an admin may not have filled in. */
export type ToSheetAuthorInput = {
  name: string | null;
  email: string;
  phone: string | null;
};

/** The minimal shape `toSheetData` needs. `entitySnapshot`/`bankDetails` are
 * `unknown` because they're opaque Prisma `Json` columns with no
 * compile-time guarantee about their contents — this module validates their
 * shape defensively at runtime (see `parseEntitySnapshot`) rather than
 * trusting the cast. */
export type ToSheetDataDoc = {
  status: "DRAFT" | "FINAL";
  number: string | null;
  issueDate: Date;
  validityDays: number | null;
  currency: string;
  taxName: string;
  taxRate: string;
  entitySnapshot: unknown;
  entityName: string;
  entityLegalId: string | null;
  entityAddress: string | null;
  bankDetails: unknown;
  logoUrl: string | null;
  footerText: string | null;
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  company: ToSheetCompanyInput | null;
  contact: ToSheetContactInput | null;
  items: ToSheetItemInput[];
  extraLines: ToSheetLineInput[];
  /** The document's author — feeds the "Prepared by" block (see
   * `DocSheetPreparedBy`). Always present: `Document.authorId` is a required
   * field. */
  author: ToSheetAuthorInput;
  /** `Document.notes` exactly as stored — free-text, admin-authored rich
   * text (HTML from the WYSIWYG editor, or legacy markdown for a
   * pre-migration row — see src/lib/rich-text.ts's `isHtmlContent`),
   * rendered by both the quotation sheet and the plain document sheet via
   * `renderStoredRichText` (src/lib/quotation-data.ts's `notesHtml` /
   * `DocumentSheet`'s own call — see its doc comment on why the rendering
   * happens there rather than in this dependency-light mapper). `null` when
   * the author hasn't written any. */
  notes: string | null;
  /** Quotation-first pricing display toggles (see `setPriceDisplay` in
   * src/lib/actions/documents.ts) — carried through so `toSheetData` can
   * gate `DocSheetItem.breakdown.options[].lineTotal` (hidden whenever
   * `showOptionPrices` is off) without the presenter component ever having
   * to know about either flag itself (see `ItemBreakdown`'s doc comment).
   * Also surfaced on `DocSheetData` so `DocumentSheet` — which used to
   * ignore both flags entirely — can compute its own `itemPriceVisible`
   * the same way `QuotationSheet` already does. */
  showItemPrices: boolean;
  showOptionPrices: boolean;
};

/** Resolves a stored image URL (e.g. `/api/files/<uuid>.jpg`) to whatever
 * the caller wants actually embedded in the sheet — the in-app preview
 * route passes an identity function (the URL is fine as-is, the browser is
 * already authenticated), while the future PDF pipeline passes a function
 * that reads the file off disk and returns a base64 data URI (Gotenberg's
 * headless Chromium can't hit an auth-gated `/api/files/...` URL). Returning
 * `undefined` hides the image entirely (e.g. a missing file). Synchronous by
 * design so `toSheetData` itself stays a plain, pure function — an async
 * resolver would force every caller (including this module's own tests)
 * to await a mapper that has no other reason to be async. */
export type ImageResolver = (url: string) => string | undefined;

const identityResolver: ImageResolver = (url) => url;

// --- output shape --------------------------------------------------------

export type DocSheetLine = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  /** Resolved thumbnail source, or `null` when either `showImage` is false,
   * no image was ever attached, or the resolver declined to produce one —
   * same gating as `DocSheetItem.image`. In practice only ever set for a
   * document-level extra line with its own attached photo (a trade-in, a
   * bought-in item); an item's own OPTION sub-lines never have `showImage`
   * set. */
  image: string | null;
};

/**
 * The three-part idea every product-line renderer needs — base price, then
 * options, then a subtotal — expressed once so `quotation-sheet.tsx`,
 * `document-sheet.tsx`, and `builder/items-list.tsx` render it through one
 * shared component (`src/components/sheet/item-breakdown.tsx`) instead of
 * each deciding for itself how to show the money (the bug this type fixes:
 * two of those three surfaces used to print only the combined `total`,
 * leaving the base machine price invisible to the customer).
 */
export type ItemBreakdown = {
  /** Always `1` today — a product line is always one machine; more machines
   * means more lines (confirmed by the owner). Rendered as-is, never
   * multiplied against anything. */
  qty: number;
  /** The machine on its own, with no options folded in — a plain 2dp decimal
   * string ready for `formatMoney`. */
  basePrice: string;
  options: Array<{
    name: string;
    /** The option's own catalog code (e.g. "MTS"), or `null` when it has
     * none — rendered ahead of `name` as "`code` — `name`", same as an
     * item's own `code` alongside its name. Carried through unchanged from
     * `ToSheetLineInput.code` (see `buildItemBreakdown`). */
    code: string | null;
    /** Deduped against `name` the same way `DocSheetLine.description` is
     * (see `dedupeDescription`) — `null` when the option has no
     * description of its own, or when it would just repeat `name`. */
    description: string | null;
    qty: number;
    /** `null` when option prices are hidden (`showOptionPrices` off) — the
     * presenter renders no price for the row in that case rather than
     * needing to know about the display flag itself. */
    lineTotal: string | null;
  }>;
  /** `null` when the item has no discount set. `value` is what the
   * salesperson typed (a bare percentage like "5", or a cash figure like
   * "20000.00"); `amount` is the cash actually deducted, always resolved
   * regardless of `mode` — see `ToSheetItemInput.discountAmount`. */
  discount: { mode: "PERCENT" | "AMOUNT"; value: string; amount: string } | null;
  /** base + options − discount — the pricing engine's own item total
   * (`ToSheetItemInput.total`), never recomputed here. */
  subtotal: string;
};

export type DocSheetItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  /** How to read `discountValue` below — see `DocSheetTotals.discountMode`'s
   * doc comment; same rule at item level. */
  discountMode: "PERCENT" | "AMOUNT";
  /** Percentage string (e.g. "10") when `discountMode` is "PERCENT", a plain
   * decimal cash string (e.g. "20000.00") when "AMOUNT", or `null` when no
   * item discount is set — the sheet only renders an "Item discount" row
   * when this is non-null, formatting it per `discountMode`. */
  discountValue: string | null;
  total: string;
  /** Resolved thumbnail source, or `null` when either `showImage` is false,
   * no image was ever attached, or the resolver declined to produce one. */
  image: string | null;
  lines: DocSheetLine[];
  /** The base/options/discount/subtotal breakdown for this item — see
   * `ItemBreakdown`. */
  breakdown: ItemBreakdown;
};

export type BankDetailRow = { label: string; value: string };

export type DocSheetEntity = {
  name: string;
  legalId: string | null;
  address: string | null;
  bankDetails: BankDetailRow[];
  footerText: string | null;
};

export type DocSheetClient = {
  companyName: string;
  addressLines: string[];
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** The company's delivery address (owner: "client office is not always the
 * manufacturing site") — only ever set when it's genuinely distinct from
 * the main address above (see `ToSheetCompanyInput.hasDeliveryAddress`), so
 * `DocSheetData.delivery` doubles as the sheet's render gate. */
export type DocSheetDelivery = {
  addressLines: string[];
  contactName: string | null;
  phone: string | null;
};

/** Resolved "Prepared by" block — same shape as `ToSheetAuthorInput`, kept
 * as a distinct output type (rather than reusing the input type directly)
 * so a future mapper-side transform (e.g. a display fallback) has somewhere
 * to live without touching the input contract. Today it's a straight
 * passthrough — see `toSheetData`. */
export type DocSheetPreparedBy = {
  name: string | null;
  email: string;
  phone: string | null;
};

export type DocSheetTotals = {
  currency: string;
  subtotal: string;
  /** Whether `discountValue` (below) is a percentage or a cash amount —
   * the sheet's "Discount" row label reads accordingly ("Discount 5%" vs.
   * "Discount $20,000.00"). `discountAmount` (the actual cents subtracted
   * from `subtotal`) is unaffected by this — it's already resolved to cash
   * by the pricing engine regardless of how the discount was entered. */
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string | null;
  discountAmount: string;
  taxName: string;
  taxRate: string;
  taxAmount: string;
  total: string;
};

export type DocSheetData = {
  /** Literal document title — every document is a quote, so this is always
   * "QUOTATION". */
  title: "QUOTATION";
  isDraft: boolean;
  number: string | null;
  issueDate: string;
  /** `DD/MM/YYYY`, computed from `issueDate + validityDays` whenever
   * `validityDays` is known — `null` when it isn't. `validityDays` can be
   * non-null before finalize too now (a per-quote override set from the
   * builder — see `setValidityDays`, src/lib/actions/documents.ts), so a
   * DRAFT can already show a validity date in preview, computed against its
   * (pre-finalize) `issueDate`; finalize freezes both fields together. */
  validityDate: string | null;
  logo: string | null;
  entity: DocSheetEntity;
  client: DocSheetClient | null;
  /** See `DocSheetDelivery` — `null` whenever there's no client (draft) or
   * the client's delivery address is the same as its main address. */
  delivery: DocSheetDelivery | null;
  items: DocSheetItem[];
  extraLines: DocSheetLine[];
  totals: DocSheetTotals;
  /** Always true — every document shows the signature area. */
  showSignature: boolean;
  /** The document's author, for the "Prepared by" block — see
   * `DocSheetPreparedBy`. */
  preparedBy: DocSheetPreparedBy;
  /** `Document.notes` passthrough — see `ToSheetDataDoc.notes`. */
  notes: string | null;
  /** Passthrough of `ToSheetDataDoc.showItemPrices`/`showOptionPrices` — see
   * that field's doc comment. `document-sheet.tsx` computes its own
   * `itemPriceVisible = showItemPrices || showOptionPrices` from these, the
   * same rule `quotation-sheet.tsx` already applies. */
  showItemPrices: boolean;
  showOptionPrices: boolean;
};

// --- helpers ---------------------------------------------------------------

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

type EntitySnapshotShape = {
  entityName: string;
  entityLegalId: string | null;
  entityAddress: string | null;
  bankDetails: unknown;
  logoUrl: string | null;
  footerText: string | null;
};

/** Validates `Document.entitySnapshot` at runtime (it's an opaque `Json?`
 * column — Prisma gives no compile-time guarantee it still has the shape
 * `finalizeDocument` wrote). Returns `null` for a missing or malformed
 * snapshot so callers can fall back to the live region fields instead of
 * rendering `undefined`/garbage. */
function parseEntitySnapshot(json: unknown): EntitySnapshotShape | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.entityName !== "string") return null;
  if (!isNullableString(obj.entityLegalId)) return null;
  if (!isNullableString(obj.entityAddress)) return null;
  if (!isNullableString(obj.logoUrl)) return null;
  if (!isNullableString(obj.footerText)) return null;
  return {
    entityName: obj.entityName,
    entityLegalId: obj.entityLegalId,
    entityAddress: obj.entityAddress,
    bankDetails: "bankDetails" in obj ? obj.bankDetails : null,
    logoUrl: obj.logoUrl,
    footerText: obj.footerText,
  };
}

/** Known `Region.bankDetails` keys (see prisma/seed-lib.ts's `RegionSeed`)
 * mapped to their display label; anything else is humanized from its key
 * (camelCase/snake_case → "Title Case") so an unrecognized key from a future
 * region still renders sensibly instead of being silently dropped. */
const BANK_LABELS: Record<string, string> = {
  bank: "Bank",
  bankName: "Bank",
  accountName: "Account Name",
  accountNo: "Account No.",
  accountNumber: "Account No.",
  swift: "SWIFT",
  swiftCode: "SWIFT",
  bsb: "BSB",
  iban: "IBAN",
  routingNumber: "Routing No.",
  sortCode: "Sort Code",
};

function humanizeBankKey(key: string): string {
  const known = BANK_LABELS[key];
  if (known) return known;
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

/** Flattens the opaque `bankDetails` Json into an ordered list of display
 * rows, skipping any non-string value defensively (the column has no
 * compile-time shape guarantee) rather than rendering `"[object Object]"`. */
function toBankRows(bankDetails: unknown): BankDetailRow[] {
  if (!bankDetails || typeof bankDetails !== "object" || Array.isArray(bankDetails)) return [];
  return Object.entries(bankDetails as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "")
    .map(([key, value]) => ({ label: humanizeBankKey(key), value }));
}

/**
 * Formats already-resolved bank detail rows (see `DocSheetEntity.bankDetails`
 * / `toBankRows`) into a single newline-joined "Label: value" text block —
 * for a caller that needs bank details as plain multi-line text rather than
 * `document-sheet.tsx`'s own `.pq-bank-row` markup, e.g. quotation-data.ts's
 * `{{bankDetails}}` placeholder substitution. Takes the already-resolved
 * `BankDetailRow[]` (not the raw `Json` column) rather than re-deriving from
 * scratch, so it can never disagree with `toSheetData`'s FINAL-vs-DRAFT
 * snapshot resolution (`entitySnapshot` vs. the region's live fields) —
 * every caller shares the exact same label-mapped, already-resolved rows.
 * Markdown-safe: no character `renderMarkdown` treats specially.
 */
export function formatBankDetails(rows: BankDetailRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

type AddressLike = {
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
};

/** Builds the 1-3 line postal address block shared by the main client
 * address and the delivery address (see `toSheetData`) — `country` is
 * rendered through `displayCountry` since it's stored as an ISO alpha-2
 * code (e.g. "AU") going forward, not the English name a reader expects on
 * a printed sheet; a pre-migration free-text value passes through
 * unchanged (see `displayCountry`'s fallback). */
function toAddressLines(address: AddressLike): string[] {
  const lines: string[] = [];
  if (address.street) lines.push(address.street);
  const cityStatePostcode = [address.city, address.state, address.postcode].filter(Boolean).join(", ");
  if (cityStatePostcode) lines.push(cityStatePostcode);
  const country = displayCountry(address.country);
  if (country) lines.push(country);
  return lines;
}

function contactFullName(contact: ToSheetContactInput): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

/** `qty * unitPrice`, exact (see src/lib/pricing.ts), formatted as a plain
 * 2dp decimal string ready for `formatMoney`. */
function lineTotal(qty: number, unitPrice: string): string {
  return fromCents(qty * toCents(unitPrice)).toFixed(2);
}

/**
 * Returns `description` unless it's redundant with `name` — i.e. `name`
 * and `description` are the same string, or one fully contains the other
 * — in which case the sheet would otherwise render the same text twice
 * (catalog items/options are often named with the full sentence-length
 * description). `null`/empty descriptions pass straight through as `null`
 * so the sheet's `description ? <p>…</p> : null` check stays a clean
 * on/off switch.
 */
export function dedupeDescription(name: string, description: string | null): string | null {
  if (!description) return null;
  if (name === description || name.includes(description) || description.includes(name)) {
    return null;
  }
  return description;
}

/**
 * Builds an item's `ItemBreakdown` — the base/options/discount/subtotal
 * shape every product-line renderer shares (see `ItemBreakdown`'s doc
 * comment). `showOptionPrices` is passed explicitly rather than read off
 * `item` because the two callers want different answers to "are option
 * prices visible": `toSheetData` passes the document's actual
 * `showOptionPrices` toggle (a customer-facing sheet honours it), while
 * `getDocumentForBuilder` always passes `true` (the builder is internal to
 * the salesperson, who always sees full pricing detail regardless of what
 * the toggle is currently set to for the customer-facing sheets). No money
 * arithmetic happens here beyond `lineTotal`'s existing `qty * unitPrice` —
 * `basePrice`/`subtotal`/`discount.amount` are all passed through exactly as
 * the pricing engine already resolved them.
 */
export function buildItemBreakdown(
  item: Pick<ToSheetItemInput, "unitPrice" | "discountMode" | "discountValue" | "discountAmount" | "total" | "lines">,
  showOptionPrices: boolean
): ItemBreakdown {
  return {
    qty: 1,
    basePrice: lineTotal(1, item.unitPrice),
    options: item.lines.map((line) => ({
      name: line.name,
      code: line.code,
      description: dedupeDescription(line.name, line.description),
      qty: line.qty,
      lineTotal: showOptionPrices ? lineTotal(line.qty, line.unitPrice) : null,
    })),
    discount:
      item.discountValue !== null
        ? { mode: item.discountMode, value: item.discountValue, amount: item.discountAmount }
        : null,
    subtotal: item.total,
  };
}

function toDocSheetLine(line: ToSheetLineInput, resolveImage: ImageResolver): DocSheetLine {
  return {
    id: line.id,
    code: line.code,
    name: line.name,
    description: dedupeDescription(line.name, line.description),
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: lineTotal(line.qty, line.unitPrice),
    image: line.showImage && line.imageUrl ? (resolveImage(line.imageUrl) ?? null) : null,
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

// --- toSheetData -------------------------------------------------------------

/**
 * Maps a fully-loaded document into the flat `DocSheetData` shape
 * `DocumentSheet` renders. `resolveImage` lets the caller decide how a
 * stored `/api/files/<name>` URL becomes whatever the render target needs
 * (see `ImageResolver`'s doc comment) — defaults to identity, which is
 * exactly right for the in-app preview route (already-authenticated
 * browser, relative URL just works).
 */
export function toSheetData(doc: ToSheetDataDoc, resolveImage: ImageResolver = identityResolver): DocSheetData {
  const isDraft = doc.status === "DRAFT";

  const snapshot = doc.status === "FINAL" ? parseEntitySnapshot(doc.entitySnapshot) : null;
  const entitySource = snapshot ?? {
    entityName: doc.entityName,
    entityLegalId: doc.entityLegalId,
    entityAddress: doc.entityAddress,
    bankDetails: doc.bankDetails,
    logoUrl: doc.logoUrl,
    footerText: doc.footerText,
  };

  const entity: DocSheetEntity = {
    name: entitySource.entityName,
    legalId: entitySource.entityLegalId,
    address: entitySource.entityAddress,
    bankDetails: toBankRows(entitySource.bankDetails),
    footerText: entitySource.footerText,
  };

  const logo = entitySource.logoUrl ? (resolveImage(entitySource.logoUrl) ?? null) : null;

  const client: DocSheetClient | null = doc.company
    ? {
        companyName: doc.company.name,
        addressLines: toAddressLines(doc.company),
        website: doc.company.website,
        contactName: doc.contact ? contactFullName(doc.contact) : null,
        contactEmail: doc.contact?.email ?? null,
        contactPhone: doc.contact?.phone ?? null,
      }
    : null;

  const delivery: DocSheetDelivery | null =
    doc.company && doc.company.hasDeliveryAddress
      ? {
          addressLines: toAddressLines({
            street: doc.company.deliveryStreet,
            city: doc.company.deliveryCity,
            state: doc.company.deliveryState,
            postcode: doc.company.deliveryPostcode,
            country: doc.company.deliveryCountry,
          }),
          contactName: doc.company.deliveryContactName,
          phone: doc.company.deliveryPhone,
        }
      : null;

  const items: DocSheetItem[] = doc.items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: dedupeDescription(item.name, item.description),
    unitPrice: item.unitPrice,
    discountMode: item.discountMode,
    discountValue: item.discountValue,
    total: item.total,
    image: item.showImage && item.imageUrl ? (resolveImage(item.imageUrl) ?? null) : null,
    lines: item.lines.map((line) => toDocSheetLine(line, resolveImage)),
    breakdown: buildItemBreakdown(item, doc.showOptionPrices),
  }));

  const validityDate =
    doc.validityDays !== null ? formatDateAU(addDays(doc.issueDate, doc.validityDays)) : null;

  return {
    title: "QUOTATION",
    isDraft,
    number: doc.number,
    issueDate: formatDateAU(doc.issueDate),
    validityDate,
    logo,
    entity,
    client,
    delivery,
    items,
    extraLines: doc.extraLines.map((line) => toDocSheetLine(line, resolveImage)),
    preparedBy: { name: doc.author.name, email: doc.author.email, phone: doc.author.phone },
    notes: doc.notes,
    showItemPrices: doc.showItemPrices,
    showOptionPrices: doc.showOptionPrices,
    totals: {
      currency: doc.currency,
      subtotal: doc.subtotal,
      discountMode: doc.discountMode,
      discountValue: doc.discountValue,
      discountAmount: doc.discountAmount,
      taxName: doc.taxName,
      taxRate: doc.taxRate,
      taxAmount: doc.taxAmount,
      total: doc.total,
    },
    showSignature: true,
  };
}
