# P0 Quote Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a quote show what the machine actually costs, remove invoice support entirely, and let discounts be a percentage or a fixed amount.

**Architecture:** Invoice code is deleted first so the later tasks never have to preserve a branch that is about to disappear. Money arithmetic stays in `src/lib/pricing.ts` as the single source of truth; `src/lib/sheet-data.ts` gains an explicit per-item breakdown so the three renderers stop deriving their own. A new presenter component renders that breakdown everywhere a line is shown.

**Tech Stack:** Next.js 16, React 19, Prisma 7 (Postgres), Zod 4, Vitest 4, Tailwind 4, Gotenberg for PDF.

**Spec:** `docs/superpowers/specs/2026-09-01-p0-quote-correctness-design.md`

**Scope:** Spec Parts A–F. Part G (Region → Distributor rename, multiple bank accounts) is a separate plan and a separate pull request, per the spec's Rollout section.

**Migration order note:** Prisma applies migrations in folder-name order, so they are numbered in the order they are created here: `10_remove_invoices`, `11_document_line_image`, `12_discount_mode`. This differs from the prose ordering in the spec's Rollout section, which lists them by topic rather than by application order. Task order below follows the migration numbers.

**Working directory:** `.worktrees/p0` on branch `feat/p0-quote-correctness`.

**Sandbox note:** git in this environment cannot unlink files inside `.git`, so a crashed command can leave a stale `*.lock` behind and every later git write fails with "Another git process seems to be running". If that happens, rename the locks aside rather than deleting them:

```bash
cd "$(git rev-parse --git-common-dir)" && \
  for f in $(find . -name "*.lock" -maxdepth 4); do mv "$f" "$f.stale"; done
```

---

## File Structure

**Deleted:**
- `src/lib/invoice-from-quote.ts` — quote→invoice mapper
- `src/components/builder/create-invoice-button.tsx` — the trigger
- `tests/invoice-from-quote.test.ts`

**Created:**
- `src/components/sheet/item-breakdown.tsx` — the one component that renders base price, options, discount and subtotal for a product line. Used by both sheets and (compact) by the builder.
- `prisma/migrations/10_remove_invoices/migration.sql`
- `prisma/migrations/11_document_line_image/migration.sql`
- `prisma/migrations/12_discount_mode/migration.sql`
- `tests/item-breakdown.test.ts`
- `tests/discounts.test.ts`

**Modified (primary responsibility after this plan):**
- `prisma/schema.prisma` — no document type, no invoice backlink, discount mode, line image
- `src/lib/pricing.ts` — resolves a discount (percent or amount) to cents, then subtracts
- `src/lib/sheet-data.ts` — builds `ItemBreakdown`; title and signature become constants
- `src/lib/numbering.ts` — `Q` prefix only, no doc-type parameter
- `src/lib/validation/documents.ts` — negative custom lines, discount mode
- `src/lib/actions/documents.ts` — no invoice creation, discount actions take a mode
- `src/lib/actions/finalize.ts` — validity days always set, document value wins
- `src/lib/uploads.ts` + `src/app/api/uploads/route.ts` — per-purpose type allow-lists
- `src/lib/pdf.ts` — page-number footer
- `src/components/sheet/{document-sheet,quotation-sheet}.tsx` — render `ItemBreakdown`
- `src/components/builder/{item-discount-field,document-discount-field,items-list,extra-lines}.tsx`

---

## Task 1: Strip invoice cases from the test suite

Tests come first: they describe the world without invoices, and they must fail (or stop compiling) before the code changes.

**Files:**
- Delete: `tests/invoice-from-quote.test.ts`
- Modify: `tests/sheet-data.test.ts:54,99,127,145-146,169-171,176`
- Modify: `tests/numbering.test.ts:9-10,21,25`
- Modify: `tests/documents-validation.test.ts:20-21`
- Modify: `tests/pdf.test.ts:13,29-32,72`

- [ ] **Step 1: Delete the invoice test file**

```bash
cd .worktrees/p0
git rm tests/invoice-from-quote.test.ts
```

- [ ] **Step 2: Remove invoice fixtures and assertions from the remaining tests**

In `tests/sheet-data.test.ts`, delete every test whose subject is an invoice and change the shared fixture so it no longer sets `type`. The two assertions that must remain, now unconditional:

```ts
it("titles every document QUOTATION", () => {
  const data = toSheetData(baseDoc());
  expect(data.title).toBe("QUOTATION");
});

it("always shows the signature block", () => {
  const data = toSheetData(baseDoc());
  expect(data.showSignature).toBe(true);
});
```

In `tests/numbering.test.ts`, drop the `INV` cases and remove the type argument:

```ts
it("formats a quote number", () => {
  expect(formatDocNumber("AU", 2026, 1)).toBe("Q-AU-2026-001");
});

it("pads to three digits and grows past 999", () => {
  expect(formatDocNumber("AU", 2026, 42)).toBe("Q-AU-2026-042");
  expect(formatDocNumber("AU", 2026, 1234)).toBe("Q-AU-2026-1234");
});
```

In `tests/documents-validation.test.ts`, delete the "accepts INVOICE" case and any other use of `documentTypeSchema`.

In `tests/pdf.test.ts`, change the `INV-AU-2026-001` fixture to `Q-AU-2026-001` and remove `type` / `title: "INVOICE"` from the fixture object.

- [ ] **Step 3: Run the suite to confirm it fails for the right reason**

Run: `npx vitest run`
Expected: FAIL. `formatDocNumber` still requires 4 arguments, and `toSheetData` fixtures no longer supply `type`. TypeScript errors in the test files are the expected failure — they prove the tests now describe the target state.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/
git commit -m "test: describe a world without invoices"
```

---

## Task 2: Delete invoice code

**Files:**
- Delete: `src/lib/invoice-from-quote.ts`, `src/components/builder/create-invoice-button.tsx`
- Modify: `src/lib/actions/documents.ts:27,114-150,850-1042`
- Modify: `src/lib/numbering.ts:9-58`
- Modify: `src/lib/sheet-data.ts:98,231-234,239,251,492-521`
- Modify: `src/lib/validation/documents.ts:18-19`
- Modify: `src/lib/actions/finalize.ts:86-88,126-127`
- Modify: `src/lib/queries/documents.ts:29-40,257-266,364,497-498`
- Modify: `src/app/(app)/documents/[documentId]/page.tsx:19,44,62,110-112,167,179-190,266-278,290-345`
- Modify: `src/app/(app)/documents/page.tsx:3,28-52,61-80,134,191,205-210,247,262-267`
- Modify: `src/app/(app)/page.tsx:4,43-44,49,55-60,78,89,138,153`
- Modify: `src/app/(app)/documents/[documentId]/preview/page.tsx:56-95`
- Modify: `src/app/(app)/documents/[documentId]/quotation/page.tsx:29,38,51,53`
- Modify: `src/app/api/documents/[documentId]/quotation-pdf/route.ts:18,32`
- Modify: `src/components/builder/sticky-footer.tsx:1,86,94-98`

- [ ] **Step 1: Delete the two invoice-only files**

```bash
git rm src/lib/invoice-from-quote.ts src/components/builder/create-invoice-button.tsx
```

- [ ] **Step 2: Remove `createInvoiceFromQuote` and the type parameter from `createDraft`**

In `src/lib/actions/documents.ts`: delete the import on line 27, delete the whole `// --- create invoice from quote ---` section (`:850-1042`), and change `createDraft` to take no argument:

```ts
export async function createDraft() {
  const session = await requireSession();
  // ...unchanged body, minus the documentTypeSchema parse and the `type` field
  // on the document.create() data object
}
```

Delete `documentTypeSchema` and `DocumentTypeInput` from `src/lib/validation/documents.ts:18-19`.

- [ ] **Step 3: Collapse the numbering helpers**

`src/lib/numbering.ts` — delete `NUMBER_PREFIX` and drop the type parameter:

```ts
const QUOTE_PREFIX = "Q";

export function formatDocNumber(regionCode: string, year: number, counter: number): string {
  return `${QUOTE_PREFIX}-${regionCode}-${year}-${String(counter).padStart(3, "0")}`;
}

export async function allocateNumber(
  tx: Prisma.TransactionClient,
  regionCode: string,
  year: number
): Promise<number> {
  const row = await tx.numberSequence.upsert({
    where: { regionCode_docType_year: { regionCode, docType: "QUOTE", year } },
    create: { regionCode, docType: "QUOTE", year, counter: 1 },
    update: { counter: { increment: 1 } },
    select: { counter: true },
  });
  return row.counter;
}
```

The `docType` in the compound key stays for now — the column is dropped in Task 3, and this file is edited again there. Splitting it this way keeps each commit compiling.

- [ ] **Step 4: Collapse the sheet-data branches**

`src/lib/sheet-data.ts` — remove `type` from `ToSheetDataDoc` (`:98`) and `DocSheetData` (`:231`), and replace `:492-521`:

```ts
const validityDate =
  doc.validityDays !== null ? formatDateAU(addDays(doc.issueDate, doc.validityDays)) : null;

return {
  title: "QUOTATION",
  isDraft,
  // ...rest unchanged, with `type` removed
  showSignature: true,
};
```

- [ ] **Step 5: Un-branch finalize**

`src/lib/actions/finalize.ts:86-88` — drop the `document.type === "QUOTE"` guard so validity days are always resolved, and update the two calls at `:126-127` to the new signatures:

```ts
const validityDays = await getQuoteValidityDays();
// ...
const counter = await allocateNumber(tx, document.region.code, year);
const number = formatDocNumber(document.region.code, year, counter);
```

- [ ] **Step 6: Remove the invoice UI**

- `src/app/(app)/page.tsx`: delete the "New invoice" form (`:55-60`), the `Receipt` import (`:4`), and the icon branch at `:138` (always `FileText`). Change "Your last 5 quotes and invoices" to "Your last 5 quotes".
- `src/app/(app)/documents/page.tsx`: delete `TABS` and `tabHref` (`:28-52`), delete the "New invoice" form (`:66-80`) and give the remaining "New quote" button the brand-filled styling the invoice one had, delete the `Receipt` import and both icon branches (`:205-210`, `:262-267`), and reword the header and empty state to quotes only.
- `src/app/(app)/documents/[documentId]/page.tsx`: delete the `createInvoiceFromQuote` and `CreateInvoiceButton` imports (`:19`, `:44`), the `typeLabel` ternaries (`:62`, `:110-112`), the "From quote" backlink block (`:266-278`), and the `CreateInvoiceButton` render (`:338-341`). Render `PriceDisplayToggles` unconditionally (`:179-190`).
- `src/components/builder/sticky-footer.tsx`: drop the `DocumentType` prop and the icon branch; always `FileText`.
- `src/app/(app)/documents/[documentId]/preview/page.tsx`: replace the `isQuote` ternaries with the quote wording and render the "View full quotation" link unconditionally.
- `src/app/(app)/documents/[documentId]/quotation/page.tsx` and `src/app/api/documents/[documentId]/quotation-pdf/route.ts`: delete the `type !== "QUOTE"` guards.
- `src/lib/queries/documents.ts`: delete the `type` filter from `listDocuments` (`:29-40`), the `sourceQuoteId` / `sourceQuoteNumber` fields (`:257-266`, `:497-498`), and the `sourceQuote` include (`:364`).

- [ ] **Step 7: Reword the remaining strings**

Change "quotes or invoices" to "quotes" in `src/app/(app)/clients/[companyId]/page.tsx:109`, `src/lib/actions/clients.ts:180`, and "Quotes and invoices" in `src/lib/nav-items.ts:10`. In `src/components/regions/region-form.tsx:210`, change "Shown on invoices for this region" to "Shown on quotes for this region".

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, 0 type errors. The tests from Task 1 now pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: remove invoice support from the application"
```

---

## Task 3: Drop the invoice schema

**Files:**
- Create: `prisma/migrations/10_remove_invoices/migration.sql`
- Modify: `prisma/schema.prisma:14-17,229,252-270,276-277,335,340`
- Modify: `src/lib/numbering.ts`
- Modify: `prisma/seed.ts`, `prisma/seed-lib.ts` (only if they set `type` or `docType`)

- [ ] **Step 1: Write the migration**

Create `prisma/migrations/10_remove_invoices/migration.sql`:

```sql
-- Invoicing is done by the accountant in their own system; this tool only
-- issues quotes. Every invoice row, the quote->invoice backlink, and the
-- document-type discriminator go together.

DELETE FROM "Document" WHERE "type" = 'INVOICE';
DELETE FROM "NumberSequence" WHERE "docType" = 'INVOICE';

ALTER TABLE "Document" DROP CONSTRAINT "Document_sourceQuoteId_fkey";
DROP INDEX "Document_sourceQuoteId_idx";
ALTER TABLE "Document" DROP COLUMN "sourceQuoteId";

DROP INDEX "NumberSequence_regionCode_docType_year_key";
ALTER TABLE "NumberSequence" DROP COLUMN "docType";
CREATE UNIQUE INDEX "NumberSequence_regionCode_year_key"
  ON "NumberSequence"("regionCode", "year");

ALTER TABLE "Document" DROP COLUMN "type";
DROP TYPE "DocumentType";
```

- [ ] **Step 2: Update the schema to match**

In `prisma/schema.prisma`: delete `enum DocumentType` (`:14-17`), `Document.type` (`:229`), `Document.sourceQuoteId` / `sourceQuote` / `invoicesFromQuote` and their comment block (`:263-270`), `@@index([sourceQuoteId])` (`:277`), and `NumberSequence.docType` (`:335`). Change the NumberSequence constraint to `@@unique([regionCode, year])`. Rewrite the `showItemPrices` comment (`:252-260`) to drop the sentence about invoices.

- [ ] **Step 3: Finish the numbering change**

`src/lib/numbering.ts` — the compound key loses `docType`:

```ts
const row = await tx.numberSequence.upsert({
  where: { regionCode_year: { regionCode, year } },
  create: { regionCode, year, counter: 1 },
  update: { counter: { increment: 1 } },
  select: { counter: true },
});
```

- [ ] **Step 4: Apply and verify**

Run:
```bash
npx prisma migrate deploy && npx prisma generate && npx vitest run && npx tsc --noEmit
```
Expected: migration applies, client regenerates, tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: drop the document type discriminator and invoice schema"
```

---

## Task 4: Extra lines accept a photo

**Files:**
- Create: `prisma/migrations/11_document_line_image/migration.sql`
- Modify: `prisma/schema.prisma` (DocumentLine)
- Modify: `src/lib/uploads.ts`, `src/app/api/uploads/route.ts`
- Test: `tests/uploads.test.ts`

- [ ] **Step 1: Write the failing upload test**

Add to `tests/uploads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertAllowedType, DOCUMENT_LINE_TYPES, CATALOG_TYPES } from "@/lib/uploads";

describe("upload purpose type sets", () => {
  it("rejects SVG for a document line", () => {
    expect(() => assertAllowedType("svg", DOCUMENT_LINE_TYPES)).toThrow(/not allowed/i);
  });

  it("accepts SVG for the catalog", () => {
    expect(() => assertAllowedType("svg", CATALOG_TYPES)).not.toThrow();
  });

  it("accepts a photo for a document line", () => {
    expect(() => assertAllowedType("jpg", DOCUMENT_LINE_TYPES)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/uploads.test.ts`
Expected: FAIL — `assertAllowedType` is not exported from `@/lib/uploads`.

- [ ] **Step 3: Implement the purpose-scoped allow-lists**

In `src/lib/uploads.ts`, below the existing `ALLOWED` map:

```ts
/** Extensions a catalogue image may use. SVG is here because catalogue art is
 * vector source; it is deliberately absent from DOCUMENT_LINE_TYPES. */
export const CATALOG_TYPES = ["jpg", "png", "webp", "svg"] as const;

/** Extensions a salesperson may attach to a line on their own document. SVG is
 * XML and can carry script, so a non-admin uploader is restricted to raster. */
export const DOCUMENT_LINE_TYPES = ["jpg", "png", "webp"] as const;

export type UploadPurpose = "catalog" | "document-line";

export function assertAllowedType(ext: string, allowed: readonly string[]): void {
  if (!allowed.includes(ext)) {
    throw new UploadValidationError(`File type .${ext} is not allowed here`);
  }
}
```

Change `saveUpload` to take the allowed set and call `assertAllowedType` on the **sniffed** extension, not the declared one:

```ts
export async function saveUpload(file: File, allowed: readonly string[]): Promise<string> {
  // ...existing size and declared-type checks...
  const sniffed = sniffImageType(buf);
  if (!sniffed) throw new UploadValidationError("File is not a valid image");
  assertAllowedType(sniffed, allowed);
  // ...existing write...
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/uploads.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate the route by purpose**

`src/app/api/uploads/route.ts` — replace the blanket ADMIN check:

```ts
const purpose = formData.get("purpose") === "document-line" ? "document-line" : "catalog";

if (purpose === "catalog" && session.user.role !== "ADMIN") {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

const allowed = purpose === "catalog" ? CATALOG_TYPES : DOCUMENT_LINE_TYPES;
const name = await saveUpload(file, allowed);
```

Read `purpose` from the parsed `formData`, after the `file` check, so a missing field defaults to the stricter path.

- [ ] **Step 6: Add the column**

Create `prisma/migrations/11_document_line_image/migration.sql`:

```sql
-- A custom extra line has no catalogue entry to inherit an image from, so it
-- carries its own. Option lines keep using the catalogue image.
ALTER TABLE "DocumentLine" ADD COLUMN "imageUrl" TEXT;
```

Add `imageUrl String?` to `DocumentLine` in `prisma/schema.prisma`, next to the existing `showImage`.

- [ ] **Step 7: Wire the editor**

In the extra-lines editor (`src/components/builder/extra-lines.tsx`), add the same image upload control the product card uses, posting `purpose=document-line`, and persist the returned URL through the existing custom-line action. Render it via the existing line-image markup so an extra line with a photo looks like a product line.

- [ ] **Step 8: Verify and commit**

Run: `npx prisma migrate deploy && npx prisma generate && npx vitest run && npx tsc --noEmit`
Expected: all pass.

```bash
git add -A
git commit -m "feat: extra lines carry their own photo"
```

---

## Task 5: Extra lines accept a negative amount

**Files:**
- Modify: `src/lib/validation/documents.ts:53-66`
- Modify: `src/lib/pricing.ts`
- Test: `tests/documents-validation.test.ts`, `tests/pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/documents-validation.test.ts`:

```ts
it("accepts a negative custom line for a trade-in", () => {
  const parsed = customLineSchema.safeParse({
    name: "Trade-in K5 390",
    qty: "1",
    unitPrice: "-15000.00",
    description: "Serial 12345. Customer responsible for removal.",
  });
  expect(parsed.success).toBe(true);
});

it("rejects a negative amount with more than two decimals", () => {
  const parsed = customLineSchema.safeParse({
    name: "Trade-in",
    qty: "1",
    unitPrice: "-1.005",
    description: undefined,
  });
  expect(parsed.success).toBe(false);
});
```

In `tests/pricing.test.ts`:

```ts
it("lets a negative extra line reduce the subtotal", () => {
  const totals = computeTotals({
    items: [{ unitPrice: "100000.00", discountPct: null, maxDiscountPct: null, lines: [] }],
    extraLines: [{ qty: 1, unitPrice: "-15000.00" }],
    documentDiscountPct: null,
    taxRate: "0",
  });
  expect(totals.subtotal).toBe("85000.00");
});

it("reports a violation when the subtotal goes negative", () => {
  const totals = computeTotals({
    items: [{ unitPrice: "1000.00", discountPct: null, maxDiscountPct: null, lines: [] }],
    extraLines: [{ qty: 1, unitPrice: "-5000.00" }],
    documentDiscountPct: null,
    taxRate: "0",
  });
  expect(totals.negativeSubtotal).toBe(true);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/documents-validation.test.ts tests/pricing.test.ts`
Expected: FAIL — the schema rejects the minus sign, and `negativeSubtotal` is not on `PricingTotals`.

- [ ] **Step 3: Allow the minus in custom lines only**

`src/lib/validation/documents.ts` — add a second regex beside the existing one and use it in `customLineSchema` only:

```ts
const NON_NEGATIVE_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/** A custom line may be negative: a trade-in is entered as a line with a minus,
 * which keeps one mechanism serving many purposes (see the P0 spec, Part C).
 * Option and product lines keep the non-negative rule — a negative option is a
 * data error, not a discount. */
const SIGNED_AMOUNT_REGEX = /^-?\d+(\.\d{1,2})?$/;
```

Swap `NON_NEGATIVE_AMOUNT_REGEX` for `SIGNED_AMOUNT_REGEX` in `customLineSchema.unitPrice` and update the message to "Unit price must be a number with at most 2 decimal places".

- [ ] **Step 4: Flag a negative subtotal in the engine**

`src/lib/pricing.ts` — add to `PricingTotals`:

```ts
negativeSubtotal: boolean;
```

and in `computeTotals`, after `subtotalCents` is computed:

```ts
const negativeSubtotal = subtotalCents < 0;
```

Return it alongside the other totals. The engine reports; it does not throw. The action decides.

- [ ] **Step 5: Reject the save in the action**

In `src/lib/actions/documents.ts`, wherever `recalcDocument` runs, fail the mutation when `totals.negativeSubtotal` is true with the message "Discounts and trade-ins cannot exceed the value of the quote."

- [ ] **Step 6: Render the minus**

In `src/components/sheet/document-sheet.tsx` and `quotation-sheet.tsx`, render a negative line amount with an explicit minus sign and the muted-foreground class, so it cannot be misread as a charge.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat: extra lines accept negative amounts for trade-ins"
```

---

## Task 6: Discounts can be a percentage or a fixed amount

**Files:**
- Create: `prisma/migrations/12_discount_mode/migration.sql`, `tests/discounts.test.ts`
- Modify: `prisma/schema.prisma`, `src/lib/pricing.ts`, `src/lib/validation/documents.ts`
- Modify: `src/lib/actions/documents.ts:650-760`
- Modify: `src/components/builder/{item-discount-field,document-discount-field}.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/discounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTotals } from "@/lib/pricing";

const item = (over = {}) => ({
  unitPrice: "100000.00",
  discountMode: "PERCENT" as const,
  discountValue: null,
  maxDiscountPct: null,
  lines: [],
  ...over,
});

describe("fixed-amount discounts", () => {
  it("deducts exactly the amount typed", () => {
    const totals = computeTotals({
      items: [item({ discountMode: "AMOUNT", discountValue: "20000.00" })],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: null,
      taxRate: "0",
    });
    expect(totals.itemTotals[0]).toBe("80000.00");
  });

  it("caps an amount discount at the item base", () => {
    const totals = computeTotals({
      items: [item({ discountMode: "AMOUNT", discountValue: "150000.00" })],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: null,
      taxRate: "0",
    });
    expect(totals.itemTotals[0]).toBe("0.00");
  });

  it("reports a violation when an amount exceeds the cap as a percentage", () => {
    const totals = computeTotals({
      items: [item({ discountMode: "AMOUNT", discountValue: "20000.00", maxDiscountPct: 10 })],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: null,
      taxRate: "0",
    });
    expect(totals.violations).toHaveLength(1);
    expect(totals.violations[0].allowedPct).toBe(10);
  });

  it("leaves percentage behaviour unchanged", () => {
    const totals = computeTotals({
      items: [item({ discountMode: "PERCENT", discountValue: "5" })],
      extraLines: [],
      documentDiscountMode: "PERCENT",
      documentDiscountValue: null,
      taxRate: "0",
    });
    expect(totals.itemTotals[0]).toBe("95000.00");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/discounts.test.ts`
Expected: FAIL — `EngineInput` has no `discountMode`.

- [ ] **Step 3: Resolve discounts to cents in the engine**

`src/lib/pricing.ts` — replace the percentage-only logic:

```ts
export type DiscountMode = "PERCENT" | "AMOUNT";

/** Resolves a discount to an integer cents amount, never exceeding the base it
 * applies to. Percent keeps the existing half-up rounding; amount is taken at
 * face value and clamped. */
function discountCents(baseCents: number, mode: DiscountMode, value: string | null): number {
  if (value === null) return 0;
  if (mode === "PERCENT") return baseCents - reduceByPercent(baseCents, Number(value));
  return Math.min(toCents(value), baseCents);
}

/** The effective percentage a discount represents, used for the region cap —
 * without this, a cash discount would bypass maxDiscountPct entirely. */
function effectivePct(baseCents: number, discount: number): number {
  return baseCents === 0 ? 0 : (discount / baseCents) * 100;
}
```

In `computeTotals`, per item:

```ts
const discount = discountCents(baseCents, item.discountMode, item.discountValue);
const allowedPct = item.maxDiscountPct ?? 100;
if (effectivePct(baseCents, discount) > allowedPct) {
  violations.push({ itemIndex, allowedPct });
}
return baseCents - discount;
```

and the same pair of calls for the document-level discount against `subtotalCents`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/discounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Migrate the schema**

Create `prisma/migrations/12_discount_mode/migration.sql`:

```sql
-- A discount is now a mode plus a value. Storing a mode rather than two
-- nullable columns makes "both set and disagreeing" unrepresentable.
CREATE TYPE "DiscountMode" AS ENUM ('PERCENT', 'AMOUNT');

ALTER TABLE "Document" RENAME COLUMN "discountPct" TO "discountValue";
ALTER TABLE "Document" ALTER COLUMN "discountValue" TYPE DECIMAL(12,2);
ALTER TABLE "Document" ADD COLUMN "discountMode" "DiscountMode" NOT NULL DEFAULT 'PERCENT';

ALTER TABLE "DocumentItem" RENAME COLUMN "discountPct" TO "discountValue";
ALTER TABLE "DocumentItem" ALTER COLUMN "discountValue" TYPE DECIMAL(12,2);
ALTER TABLE "DocumentItem" ADD COLUMN "discountMode" "DiscountMode" NOT NULL DEFAULT 'PERCENT';
```

Every existing row holds a percentage, so the `PERCENT` default is correct with no data conversion.

Update `prisma/schema.prisma` to match on both models.

- [ ] **Step 6: Update validation and actions**

In `src/lib/validation/documents.ts`, replace `discountPctSchema` with a pair — the mode and a value validated against the mode:

```ts
export const discountModeSchema = z.enum(["PERCENT", "AMOUNT"]);

/** An empty value clears the discount. A percentage is 0..100 with at most two
 * decimals; an amount is any non-negative number with at most two decimals —
 * the engine clamps it to the base, and the region cap is checked separately. */
export const discountValueSchema = z.preprocess(
  (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.union([z.null(), z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a number with at most 2 decimal places")])
);
```

`setItemDiscount` and `setDocumentDiscount` in `src/lib/actions/documents.ts` take `mode` and `value`, keep the existing role rules (MANAGER rejected over cap, ADMIN warned), and word the rejection with both figures, for example: "A $20,000.00 discount is 20% of this item — above the 10% limit for Australia."

- [ ] **Step 7: Add the mode toggle to the UI**

In `item-discount-field.tsx` and `document-discount-field.tsx`, put a two-way toggle beside the number input: `%` and the region's currency symbol. Switching mode clears the value rather than converting it.

- [ ] **Step 8: Verify and commit**

Run: `npx prisma migrate deploy && npx prisma generate && npx vitest run && npx tsc --noEmit`
Expected: all pass.

```bash
git add -A
git commit -m "feat: discounts can be a percentage or a fixed amount"
```

---

## Task 7: One presenter for the item breakdown

**Files:**
- Create: `src/components/sheet/item-breakdown.tsx`, `tests/item-breakdown.test.ts`
- Modify: `src/lib/sheet-data.ts:480-490`
- Modify: `src/components/sheet/document-sheet.tsx:176`
- Modify: `src/components/sheet/quotation-sheet.tsx:318-348`
- Modify: `src/components/builder/items-list.tsx:262`
- Modify: `src/lib/quotation-data.ts:582`

- [ ] **Step 1: Write the failing test**

Create `tests/item-breakdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toSheetData } from "@/lib/sheet-data";
import { baseDoc } from "./helpers/sheet-fixtures";

describe("item breakdown", () => {
  it("carries the base price separately from the subtotal", () => {
    const data = toSheetData(baseDoc());
    const item = data.items[0];
    expect(item.breakdown.basePrice).toBe("175000.00");
    expect(item.breakdown.subtotal).toBe("186000.00");
  });

  it("always reports qty 1 for a product line", () => {
    const data = toSheetData(baseDoc());
    expect(data.items[0].breakdown.qty).toBe(1);
  });

  it("hides option prices but keeps the subtotal when showOptionPrices is off", () => {
    const data = toSheetData(baseDoc({ showOptionPrices: false, showItemPrices: true }));
    const item = data.items[0];
    expect(item.breakdown.options.every((o) => o.lineTotal === null)).toBe(true);
    expect(item.breakdown.subtotal).toBe("186000.00");
  });

  it("resolves a fixed discount to cash", () => {
    const data = toSheetData(baseDoc({ itemDiscountMode: "AMOUNT", itemDiscountValue: "6000.00" }));
    expect(data.items[0].breakdown.discount).toEqual({
      mode: "AMOUNT",
      value: "6000.00",
      amount: "6000.00",
    });
  });
});
```

Add `baseDoc` to `tests/helpers/sheet-fixtures.ts` if it does not already exist there, building a document with one M5180 at `175000.00` and one option at `11000.00`.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/item-breakdown.test.ts`
Expected: FAIL — `item.breakdown` is undefined.

- [ ] **Step 3: Build the breakdown in sheet-data**

`src/lib/sheet-data.ts` — add the type and populate it in the `items` map (`:480-490`):

```ts
export type ItemBreakdown = {
  qty: number;
  basePrice: string;
  options: Array<{ name: string; qty: number; lineTotal: string | null }>;
  discount: { mode: "PERCENT" | "AMOUNT"; value: string; amount: string } | null;
  subtotal: string;
};
```

```ts
const optionPricesVisible = doc.showOptionPrices;

const items: DocSheetItem[] = doc.items.map((item) => ({
  // ...existing fields...
  breakdown: {
    qty: 1,
    basePrice: item.unitPrice,
    options: item.lines.map((line) => ({
      name: line.name,
      qty: line.qty,
      lineTotal: optionPricesVisible ? lineTotal(line.qty, line.unitPrice) : null,
    })),
    discount:
      item.discountValue === null
        ? null
        : { mode: item.discountMode, value: item.discountValue, amount: item.discountAmount },
    subtotal: item.total,
  },
}));
```

`item.discountAmount` comes from `computeTotals` via `src/lib/queries/documents.ts` — add it to the per-item mapping there alongside `total`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/item-breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the presenter**

Create `src/components/sheet/item-breakdown.tsx`:

```tsx
import type { ItemBreakdown } from "@/lib/sheet-data";
import { formatMoney } from "@/lib/format";

type Props = {
  breakdown: ItemBreakdown;
  code: string;
  currency: string;
  /** When false the item shows no money at all — the document total still does. */
  showPrices: boolean;
  variant?: "sheet" | "compact";
};

/**
 * The single place a product line's money is laid out: base price, then each
 * option, then the discount, then the subtotal. Three surfaces render this —
 * the quotation sheet, the summary sheet and the builder card — and before it
 * existed two of them silently collapsed to one lump sum, which is the bug this
 * component was created to prevent recurring.
 */
export function ItemBreakdownRows({ breakdown, code, currency, showPrices, variant = "sheet" }: Props) {
  if (!showPrices) return null;

  const hasOptions = breakdown.options.length > 0;

  return (
    <div className={variant === "compact" ? "text-xs" : "text-sm"}>
      <Row label={`${code} — base`} qty={breakdown.qty} amount={formatMoney(breakdown.basePrice, currency)} />
      {breakdown.options.map((option, i) => (
        <Row
          key={i}
          label={option.name}
          qty={option.qty}
          amount={option.lineTotal ? formatMoney(option.lineTotal, currency) : null}
          muted
        />
      ))}
      {breakdown.discount && (
        <Row
          label={breakdown.discount.mode === "PERCENT" ? `Discount ${breakdown.discount.value}%` : "Discount"}
          amount={`−${formatMoney(breakdown.discount.amount, currency)}`}
          muted
        />
      )}
      {hasOptions && <Row label={`${code} subtotal`} amount={formatMoney(breakdown.subtotal, currency)} strong />}
    </div>
  );
}
```

Implement the local `Row` helper in the same file — label on the left, optional qty, amount right-aligned, with `muted` and `strong` toggling the existing sheet typography classes.

- [ ] **Step 6: Use it in all three places**

- `quotation-sheet.tsx:318-348` — replace the hand-rolled base/option/subtotal rows with `<ItemBreakdownRows variant="sheet" showPrices={itemPriceVisible} />`.
- `document-sheet.tsx:176` — replace the single `item.total` cell with the same component, and stop ignoring the display flags: compute `itemPriceVisible = data.showItemPrices || data.showOptionPrices` exactly as the quotation sheet does, which requires adding those two flags to `DocSheetData`.
- `items-list.tsx:262` — render `variant="compact"` with `showPrices` always true; the builder is internal.

- [ ] **Step 7: Add the basePrice placeholder**

`src/lib/quotation-data.ts` — add `{{basePrice}}` to the substitution map, resolving to the item's `breakdown.basePrice`. Leave `{{price}}` pointing at the combined subtotal so existing catalogue templates keep working.

- [ ] **Step 8: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat: show the base machine price on every surface"
```

---

## Task 8: Per-quote validity

**Files:**
- Modify: `src/lib/actions/finalize.ts:85-88`
- Modify: `src/lib/actions/documents.ts` (new `setValidityDays` action)
- Modify: `src/lib/validation/documents.ts`
- Modify: `src/components/builder/` (new field), `src/components/sheet/*` (Total Investment block)
- Test: `tests/validity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/validity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validityDaysSchema } from "@/lib/validation/documents";

describe("validity days", () => {
  it("accepts a value inside the usual range", () => {
    expect(validityDaysSchema.safeParse("30").success).toBe(true);
  });

  it("accepts a longer window for a slow capex process", () => {
    expect(validityDaysSchema.safeParse("56").success).toBe(true);
  });

  it("clears to null when empty", () => {
    expect(validityDaysSchema.parse("")).toBeNull();
  });

  it("rejects zero and negatives", () => {
    expect(validityDaysSchema.safeParse("0").success).toBe(false);
    expect(validityDaysSchema.safeParse("-5").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/validity.test.ts`
Expected: FAIL — `validityDaysSchema` does not exist.

- [ ] **Step 3: Add the schema and the action**

In `src/lib/validation/documents.ts`:

```ts
/** Days a quote stays valid. Null means "use the org-wide setting". Over 30 is
 * allowed — a customer's capex approval can genuinely take six weeks — and the
 * UI warns rather than blocks. */
export const validityDaysSchema = z.preprocess(
  (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.union([z.null(), z.coerce.number().int().min(1).max(365)])
);
```

Add `setValidityDays` to `src/lib/actions/documents.ts`, DRAFT-only, following the shape of `setNotes`.

- [ ] **Step 4: Prefer the document's own value at finalize**

`src/lib/actions/finalize.ts`:

```ts
const validityDays = document.validityDays ?? (await getQuoteValidityDays());
```

- [ ] **Step 5: Show it where the price is**

Add a `Valid for N days` input to the builder next to the notes field, defaulting to the org setting, and render `Valid until: <date>` inside the Total Investment block in both sheets — not only in the header. Show an inline warning above 30 days that does not block submission.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat: per-quote validity window shown with the total"
```

---

## Task 9: Page numbers in the PDF footer

**Files:**
- Modify: `src/lib/pdf.ts`
- Test: `tests/pdf.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/pdf.test.ts`:

```ts
it("sends a footer with the quote number and page numbers", () => {
  const footer = buildFooterHtml("Q-AU-2026-001");
  expect(footer).toContain("Q-AU-2026-001");
  expect(footer).toContain('class="pageNumber"');
  expect(footer).toContain('class="totalPages"');
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL — `buildFooterHtml` is not exported.

- [ ] **Step 3: Implement it**

In `src/lib/pdf.ts`:

```ts
/** Gotenberg substitutes the pageNumber/totalPages spans from Chromium's own
 * print classes; everything else is literal markup. Font size is set inline
 * because the footer is rendered in its own document with no stylesheet. */
export function buildFooterHtml(documentNumber: string | null): string {
  const left = documentNumber ?? "Draft";
  return `<div style="width:100%;font-size:8px;font-family:sans-serif;color:#666;padding:0 12mm;display:flex;justify-content:space-between;">
  <span>${left}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}
```

Pass it to Gotenberg as the `footer.html` part and enable `printBackground`, in the shared render function so both PDF routes inherit it.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add -A
git commit -m "feat: page numbers in the PDF footer"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run everything**

```bash
npx vitest run && npx tsc --noEmit && npx next build
```
Expected: 0 failures, 0 type errors, successful build.

- [ ] **Step 2: Check the migrations apply from empty**

```bash
npx prisma migrate reset --force && npx prisma db seed
```
Expected: all 12 migrations apply in order, seed completes.

- [ ] **Step 3: Manual smoke check**

Create a draft quote, add an M-series product with two options, set an item discount as `%` then switch to the currency mode, add a negative extra line with a photo, set validity to 45 days, preview, and download both PDFs. Confirm: base price visible on both sheets and in the builder; qty column shows 1; the negative line renders with a minus; `Valid until` appears next to the total; page numbers appear in both PDFs.

- [ ] **Step 4: Confirm nothing invoice-shaped survives**

```bash
grep -ri "invoice" src/ prisma/schema.prisma tests/ --exclude-dir=node_modules
```
Expected: no matches in `src/` or `tests/`. Matches in `docs/` and in the terms-and-conditions seed text (`prisma/seed-data/content-blocks.json:229`, which is a payment-terms sentence, not a feature) are fine.

---

## Self-Review

**Spec coverage:** Part A → Tasks 1–3. Part B → Task 7. Part C → Tasks 4–5. Part D → Task 8. Part E → Task 9. Part F → Task 6. Part G → deliberately excluded, separate plan.

**Type consistency:** `ItemBreakdown` is defined in Task 7 Step 3 and consumed in Task 7 Step 5 under the same field names. `DiscountMode` is defined in Task 6 Step 3 and reused by `ItemBreakdown.discount.mode`. `assertAllowedType`, `CATALOG_TYPES` and `DOCUMENT_LINE_TYPES` are defined in Task 4 Step 3 and used in Step 5. `negativeSubtotal` is added in Task 5 Step 4 and consumed in Step 5. `validityDaysSchema` is defined in Task 8 Step 3 and used in Steps 4–5.

**Known follow-up:** `Document.showItemPrices` / `showOptionPrices` must be added to `DocSheetData` in Task 7 Step 6 for the summary sheet to honour them; this is called out in that step rather than left implicit.
