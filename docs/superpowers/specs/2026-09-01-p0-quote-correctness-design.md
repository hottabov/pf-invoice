# P0: quote correctness + invoice removal — design

Date: 2026-09-01
Branch: `feat/p0-quote-correctness` (worktree `.worktrees/p0`)
Source: owner feedback + demo meeting with John and Wayne (`docs/plans/meeting-john-wayne-feature-backlog.md`)

## Context

Two problems, one sprint.

**The base machine price is invisible.** A quote line prints a single figure that
is base price + all options, so the customer cannot see what the machine itself
costs. Wayne named it directly in the demo: *"we have included options, but we
don't have the base model."* The data is not lost — `DocSheetItem` already
carries both `unitPrice` (base) and `total` — but only one of three renderers
prints the base, and the other two collapse to the combined number.

**Invoices do not belong in this tool.** Invoicing is the accountant's job in
their own system. Every invoice code path is dead weight that doubles the
branching in the shared renderers and will keep costing merge pain.

Fixing both together is deliberate: the invoice branches live in exactly the
files the base-price fix has to touch (`sheet-data.ts`, `document-sheet.tsx`,
`documents/[documentId]/page.tsx`). Doing them separately means editing the
same code twice.

## Goals

1. Base machine price visible on every surface that shows a price.
2. Quantity column showing `1` per product line (display only).
3. `Valid until` date visible in the Total Investment block, overridable per quote.
4. Page numbers in PDF footers.
5. Extra lines accept negative amounts (trade-in) and a photo.
6. Invoice support removed completely — code, schema, tests, data.

## Non-goals

- Production order forms. Being built in parallel on `.worktrees/forms`. Nothing
  in this spec touches that feature; the invoice removal makes one of its edge
  cases (`an INVOICE renders no forms`) moot, which that branch handles on rebase.
- Multiplying prices by quantity. A product line is always one machine. More
  machines means more lines. Confirmed by the owner.
- Structured trade-in records (model / serial / removal responsibility as
  columns). The free-text description field already carries that.
- Customer signing portal (backlog items 16 / 16b). Separate spec.

---

## Part A — remove invoice support

### A1. Data model

`Document.type` only ever holds `QUOTE` after this change, so the column, the
enum, and the `NumberSequence.docType` discriminator all go. Leaving a
single-value enum behind would be a trace of the feature, not a simplification.

Schema changes in `prisma/schema.prisma`:

- Delete `enum DocumentType` (`:14-17`).
- Delete `Document.type` (`:229`).
- Delete `Document.sourceQuoteId`, the `sourceQuote` / `invoicesFromQuote`
  self-relation `QuoteToInvoice`, and `@@index([sourceQuoteId])` (`:263-270`, `:277`).
- Delete `NumberSequence.docType`; the unique constraint becomes
  `@@unique([regionCode, year])`.
- Rewrite the stale comment on `showItemPrices` / `showOptionPrices` (`:252-260`)
  which currently explains invoice behaviour.

### A2. Migration

New migration `10_remove_invoices`, ordered so no step depends on an object a
previous step dropped. Invoice rows are deleted outright — confirmed by the
owner; there is no archive step.

```sql
-- 1. purge invoice documents; items and lines cascade
DELETE FROM "Document" WHERE "type" = 'INVOICE';

-- 2. purge invoice number counters
DELETE FROM "NumberSequence" WHERE "docType" = 'INVOICE';

-- 3. drop the quote->invoice backlink
ALTER TABLE "Document" DROP CONSTRAINT "Document_sourceQuoteId_fkey";
DROP INDEX "Document_sourceQuoteId_idx";
ALTER TABLE "Document" DROP COLUMN "sourceQuoteId";

-- 4. drop the discriminators and the enum they share
DROP INDEX "NumberSequence_regionCode_docType_year_key";
ALTER TABLE "NumberSequence" DROP COLUMN "docType";
CREATE UNIQUE INDEX "NumberSequence_regionCode_year_key"
  ON "NumberSequence"("regionCode", "year");
ALTER TABLE "Document" DROP COLUMN "type";
DROP TYPE "DocumentType";
```

`Document.type` has no column default, so no default needs dropping first.
Step 2 must run before step 4 or the `docType` predicate has no column to read.

Deleting the column instead of rewriting the enum avoids the
`CREATE TYPE ..._new` / cast / swap dance entirely — Postgres cannot drop an
enum value in place, but it has no trouble dropping the whole type once nothing
references it.

### A3. Code deleted outright

- `src/lib/invoice-from-quote.ts` (whole file)
- `src/components/builder/create-invoice-button.tsx` (whole file)
- `createInvoiceFromQuote` and its section in `src/lib/actions/documents.ts:850-1042`
- `tests/invoice-from-quote.test.ts` (whole file)
- The "New invoice" buttons on the dashboard (`src/app/(app)/page.tsx:55-60`) and
  the documents list (`src/app/(app)/documents/page.tsx:66-80`)
- The `TABS` type filter on the documents list (`:28-52`) — with one document
  type there is nothing to filter
- The "From quote {number}" backlink block (`documents/[documentId]/page.tsx:266-278`)

### A4. Branches that collapse to constants

| Location | Now | After |
|---|---|---|
| `sheet-data.ts:492-521` | `isQuote` gates `title`, `validUntil`, `showSignature` | `title: "QUOTATION"`, `showSignature: true`, `validUntil` always computed |
| `sheet-data.ts:98, 231` | `type: "QUOTE" \| "INVOICE"` in types | field removed |
| `numbering.ts:9-23, 53` | `NUMBER_PREFIX` map, `type` parameter | `Q` prefix constant; `formatDocNumber` / `allocateNumber` drop the parameter |
| `actions/documents.ts:114-150` | `createDraft(type)` | `createDraft()` |
| `validation/documents.ts:18-19` | `documentTypeSchema` | deleted |
| `finalize.ts:86-88` | validity days set only for quotes | always set |
| `quotation-pdf/route.ts:32`, `quotation/page.tsx:29` | `type !== "QUOTE"` guards | guards removed |
| `preview/page.tsx:56-95` | quote/invoice labels and conditional links | quote wording, links unconditional |
| `documents/page.tsx`, `(app)/page.tsx`, `sticky-footer.tsx` | `FileText` vs `Receipt` icon branch | `FileText`; `Receipt` import removed |
| `documents/[documentId]/page.tsx:179-190` | `PriceDisplayToggles` gated on quote | always rendered |

`src/components/sheet/document-sheet.tsx` is **not** deleted. It renders the
one-page summary sheet of a quote — the version the meeting asked to hand to
Martin — and after this change it simply stops being shared between two document
types.

### A5. Wording

Strings that say "quotes and invoices" become "quotes":
`clients/[companyId]/page.tsx:109`, `actions/clients.ts:180`,
`nav-items.ts:10`, `region-form.tsx:210` (bank details helper),
`documents/page.tsx:61-62, 134`, `(app)/page.tsx:43-44, 78, 89`.

Repo-level names (`README.md` title, the git remote `pf-invoice`, the deploy key
in `docs/runbook.md`) are **out of scope** — renaming them touches CI and the
VPS without changing app behaviour.

---

## Part B — shared line presenter

### B1. Problem

Three surfaces render a product line and each decides for itself how to show the
money:

- `quotation-sheet.tsx:318-348` — base, then options, then a subtotal row that
  only appears when the item has options. Correct.
- `document-sheet.tsx:176` — `item.total` only. Base invisible.
- `builder/items-list.tsx:262` — `item.total` only. Base invisible.

The same three-part idea is expressed once correctly and twice not at all. That
is the bug.

### B2. Shape

`toSheetData` in `src/lib/sheet-data.ts` already carries every number needed. It
gains an explicit per-item breakdown so consumers stop deriving it:

```ts
type ItemBreakdown = {
  qty: number;          // always 1 today; rendered, never multiplied
  basePrice: string;    // the machine on its own
  options: Array<{ name: string; qty: number; lineTotal: string | null }>;
  discountPct: number | null;
  subtotal: string;     // base + options - item discount
};
```

`lineTotal` is `null` when option prices are hidden, so the presenter never has
to know about display flags.

Money arithmetic stays in `src/lib/pricing.ts` — it is the single source of
truth for cents and is not touched by this work.

### B3. Presenter

One component, `src/components/sheet/item-breakdown.tsx`, renders an
`ItemBreakdown`. Used by `quotation-sheet.tsx`, `document-sheet.tsx`, and (in a
compact variant) `builder/items-list.tsx`. Fixing a rendering rule now means
editing one file.

Rules:

- Base price row always renders, labelled with the product code and `Qty 1`.
- Option rows render when `showOptionPrices` is on, each with its own price.
- The subtotal row renders whenever the item has options, whether or not option
  prices are shown — this is what lets a salesperson hide option pricing and
  still show an honest per-machine figure.
- With `showItemPrices` and `showOptionPrices` both off, the item renders with
  no money at all; the document total is still shown, as it is today.

`document-sheet.tsx` currently ignores both display flags. After this change it
honours them, so a summary sheet and a full quotation agree about what is
visible.

### B4. Placeholder

`{{basePrice}}` is added to the description-template substitution in
`quotation-data.ts` alongside the existing `{{price}}`. `{{price}}` keeps its
current meaning (the combined subtotal) so existing catalogue templates keep
working.

---

## Part C — extra lines: negative amounts and photos

### C1. Negative amounts

`customLineSchema` in `src/lib/validation/documents.ts:53-66` rejects a negative
`unitPrice` via `NON_NEGATIVE_AMOUNT_REGEX`. A trade-in is the reason to allow
one: the meeting settled on writing `Trade-in K5 390, serial ..., customer
responsible for removal` as a line with a negative amount, rather than inventing
a trade-in record type.

- Custom document-level lines (`kind: CUSTOM`, `itemId: null`) accept a leading
  minus, at most 2 decimal places.
- Option and product lines keep the non-negative rule — a negative option is a
  data error, not a discount.
- `computeTotals` gains a guard: if the document subtotal computes below zero,
  the action fails with a clear message rather than producing a negative invoice
  total.
- The sheet renders negative extra lines with an explicit minus and distinct
  styling so they cannot be misread as a charge.

### C2. Photos on extra lines

`DocumentLine` already has `showImage` but no image source of its own — options
inherit theirs from the catalogue. A custom line has no catalogue entry, so it
needs its own column.

- Migration `11_document_line_image` adds `DocumentLine.imageUrl String?`, kept
  separate from the destructive invoice migration (see Rollout).
- The extra-line editor gets an upload control and reuses the existing product
  image rendering, so a trade-in, a bought-in bundling table, or a one-off item
  looks like any other line. One mechanism, many uses.

### C3. Upload permission (security)

`POST /api/uploads` (`src/app/api/uploads/route.ts:19`) is ADMIN-only today.
Salespeople need it for their own quote lines.

`src/lib/uploads.ts` already validates well: declared MIME against an allow-list,
magic-byte sniffing to catch a relabelled payload, 5 MB cap, UUID filenames. The
one weak spot for a non-admin uploader is SVG — it is XML, it can carry script,
and it is accepted for catalogue vector art.

The route gains a `purpose` parameter:

| purpose | Role | Accepted types |
|---|---|---|
| `catalog` | ADMIN | jpg, png, webp, svg |
| `document-line` | ADMIN, MANAGER | jpg, png, webp |

`saveUpload` takes the allowed-type set as an argument instead of reading the
module-level constant, so the restriction is enforced in the same place the
sniffing happens and cannot be bypassed by a crafted `Content-Type`.

A MANAGER may only attach an uploaded image to a line on a document they can
already edit; the existing document authorisation covers this and is not
changed.

---

## Part D — quote validity

`Document.validityDays` exists but is written only at finalize time
(`finalize.ts:85-88`) from the org-wide `quote.validityDays` setting, so a
salesperson cannot give one customer a longer window. John's CAPEX scenario
(*"How long does that normally take? Six weeks. Okay, I'll give you eight"*)
needs it per quote.

- The builder gets a `Valid for N days` field, defaulting to the org setting,
  editable while the document is a DRAFT.
- Finalize uses the document's own value when set, falling back to the setting.
- Over 30 days shows an inline warning. It does not block: the cap is a sales
  guideline, not a rule, and the discount cap already covers the case where
  money is actually at risk.
- The sheet prints `Valid until: <date>` inside the Total Investment block, not
  only in the header — the meeting was explicit that the expiry should sit next
  to the price it applies to.

## Part E — PDF page numbers

`src/lib/pdf.ts` gains a footer template passed to Gotenberg: quote number on
the left, `Page X of Y` on the right. Applied in `pdf.ts` itself so both PDF
routes (summary and full quotation) inherit it.

---

## Testing

Baseline before any change: 752 tests across 28 files, all passing.

**Deleted:** `tests/invoice-from-quote.test.ts`.

**Edited to drop invoice cases:** `tests/sheet-data.test.ts` (invoice fixtures,
`title === "INVOICE"`, `showSignature === false`), `tests/numbering.test.ts`
(`INV` prefix), `tests/pdf.test.ts` (`INV-AU-2026-001` fixture),
`tests/documents-validation.test.ts` ("accepts INVOICE").

**New:**

- `item-breakdown`: base price present; subtotal present when the item has
  options; option prices hidden but subtotal shown when `showOptionPrices` is
  off; nothing priced when both flags are off.
- `sheet-data`: `ItemBreakdown` matches `computeTotals` to the cent for an item
  with options and an item discount.
- validation: negative custom line accepted; negative option line rejected;
  document subtotal below zero rejected.
- `validityDays`: builder value wins over the org setting at finalize; falls back
  when unset; `validUntil` equals issue date plus days.
- uploads: SVG rejected for `purpose=document-line`; accepted for
  `purpose=catalog` as ADMIN; `document-line` rejected for a non-authenticated
  caller.
- numbering: sequence allocation is per `(region, year)` after `docType` is gone.

Test-driven per `superpowers:test-driven-development` — each behaviour gets a
failing test before the code that satisfies it.

---

## Rollout

1. Work in `.worktrees/p0` on `feat/p0-quote-correctness`.
2. Land in this order: invoice removal (code, then migration), then the shared
   presenter, then extra lines, then validity, then the PDF footer. Removal
   first because it deletes branches the presenter would otherwise have to
   preserve.
3. Two migrations, not one: `10_remove_invoices` and `11_document_line_image`.
   They are independent, and a failure in the destructive one should not roll
   back a harmless column addition.
4. Merge to `main` before the order-forms branch. That branch then rebases and
   drops its own invoice handling.

## Risks

**The order-forms branch carries about 105 invoice references** in its own copy
of `src` and the schema. Its rebase will be real work. Mitigated by merging this
first — rebasing onto a world without invoices is mechanical deletion, whereas
merging invoice removal into finished order-forms code means re-reviewing that
feature's assumptions.

**The migration destroys data.** Any existing invoice disappears. The owner
confirmed this is intended. The migration should still be run against a restored
copy of production first, and the row counts noted before it runs for real.

**`document-sheet.tsx` starts honouring display flags** it currently ignores. A
saved quote whose flags are off will render less money on the summary sheet than
it did before. This is the intended behaviour — the flags are supposed to control
that sheet too — but it is a visible change to existing documents.
