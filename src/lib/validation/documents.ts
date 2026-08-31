// Pure zod validation for the document builder (Phase 4 Task C). No imports
// from `@/lib/db` or any Prisma types — this module must be safely
// importable from a plain unit test and from the server actions that call
// it. Mirrors the style of src/lib/validation/clients.ts.
import { z } from "zod";

/** Every id in this app is a Prisma `cuid()` — 25 lowercase base36
 * characters starting with "c". We don't couple to that exact alphabet
 * (tests use handwritten fixture ids too), just to a plausible length, so a
 * stray empty string or an obviously-wrong value (e.g. a raw name) is
 * rejected before it ever reaches a database query. */
export const idSchema = z
  .string()
  .trim()
  .min(10, "Invalid id")
  .max(40, "Invalid id");

export const documentTypeSchema = z.enum(["QUOTE", "INVOICE"]);
export type DocumentTypeInput = z.infer<typeof documentTypeSchema>;

/** Optional variant of idSchema: missing/blank/`null` collapses to
 * `undefined` (used for `contactId?` on setDocumentClient — an absent
 * contact isn't an error, it tells the action to auto-assign the company's
 * primary contact instead of failing validation). */
export const optionalIdSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  idSchema.optional()
);

// --- Task D: options, custom lines, discounts ------------------------------

/** Optional free text, ≤500 chars (a custom line's description — shorter
 * than the 2000-char catalog description since this is a one-off freeform
 * note, not a product blurb). Missing/empty collapses to `undefined`. */
const customLineDescriptionSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().max(500, "Description must be at most 500 characters").optional()
);

/** Integer quantity, 1..999 — shared by custom lines and option selections. */
const qtySchema = z.coerce
  .number({ error: "Qty must be a number" })
  .int("Qty must be a whole number")
  .min(1, "Qty must be at least 1")
  .max(999, "Qty must be at most 999");

const NON_NEGATIVE_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

/** A freeform document-level line (e.g. "Delivery", "Install") added via the
 * builder's "Extra lines" section. `unitPrice` is kept as a validated string
 * (not coerced to a number) so it can be handed straight to
 * `new Prisma.Decimal(...)` without float rounding — same pattern as
 * `priceInputSchema` in validation/catalog.ts. */
export const customLineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
  qty: qtySchema,
  unitPrice: z
    .string()
    .trim()
    .regex(NON_NEGATIVE_AMOUNT_REGEX, "Unit price must be a non-negative number with at most 2 decimal places"),
  description: customLineDescriptionSchema,
});
export type CustomLineInput = z.infer<typeof customLineSchema>;

const DISCOUNT_PCT_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * A discount percentage field (item- or document-level): an empty string
 * (or a missing/`null` FormData value) means "clear the discount" and
 * collapses to `null`; otherwise it must be a decimal in 0..100 with at
 * most 2 decimal places, parsed to a `number`. "101" and "10.555" both
 * fail — the former out of range, the latter too many decimal places —
 * while "10.55" and "" (→ `null`) both succeed.
 */
export const discountPctSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? null
      : value,
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .regex(DISCOUNT_PCT_REGEX, "Discount must be a number between 0 and 100 with at most 2 decimal places")
      .transform((value) => Number(value))
      .refine((value) => value >= 0 && value <= 100, "Discount must be between 0 and 100"),
  ])
);
export type DiscountPctInput = z.infer<typeof discountPctSchema>;

/** One option selection from the item options editor: the option's code,
 * the quantity of it on the item, and (when the option carries an
 * `attributeSchema`) the freeform attribute values keyed by attribute
 * `key`. Value type is loosely `string | number` — the editor renders
 * "number" and "text" attribute inputs and this schema doesn't re-validate
 * per-attribute types against the option's schema (that's a display/UX
 * concern, not a data-integrity one: the value is stored as-is in
 * `DocumentLine.attributes` Json). */
export const optionSelectionSchema = z.object({
  optionCode: z.string().trim().min(1, "Option code is required").max(120, "Option code is too long"),
  qty: qtySchema,
  attributes: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type OptionSelectionInput = z.infer<typeof optionSelectionSchema>;

// --- item reordering (drag-and-drop) ---------------------------------------

/** The full ordered list of a document's item ids submitted by the builder's
 * drag-and-drop / up-down reorder UI. Bounded to 100 (matches
 * `MAX_OPTION_SELECTIONS` — no document is expected to ever carry more items
 * than that) and rejects duplicates outright; the *set* of ids still has to
 * be checked against the document's actual items by the caller (see
 * `isPermutation`) since a schema alone can't know what the document holds. */
export const reorderSchema = z
  .array(idSchema, { error: "Invalid order" })
  .min(1, "Invalid order")
  .max(100, "Invalid order")
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate item in order");
export type ReorderInput = z.infer<typeof reorderSchema>;

// --- price display toggles (quotation-first) --------------------------------

/** `setPriceDisplay`'s input: both flags are plain booleans (the builder UI
 * toggles them straight from a checkbox's `checked` state, no FormData
 * string-coercion involved — same calling convention as
 * `setItemShowImage`). */
export const priceDisplaySchema = z.object({
  showItemPrices: z.boolean(),
  showOptionPrices: z.boolean(),
});
export type PriceDisplayInput = z.infer<typeof priceDisplaySchema>;

// --- notes (free-text, markdown) --------------------------------------------

/** `setDocumentNotes`'s input: `Document.notes` — free-text markdown edited
 * from the builder's Notes section (see `NotesSection`,
 * src/components/builder/notes-section.tsx). Missing/blank collapses to
 * `null` (clears the field) rather than `undefined`, since — unlike
 * `userNameSchema`'s optional-field pattern — this schema feeds a Prisma
 * write directly and `Document.notes` is nullable, not omittable. 5000 chars
 * — a generous freeform-remarks ceiling, well above the 500-char
 * `customLineDescriptionSchema` bound but still short of the 20000-char
 * content-block body limit (this is quote-specific remarks, not a reusable
 * template). */
export const notesSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? null
      : value,
  z.union([z.null(), z.string().trim().max(5000, "Notes must be at most 5000 characters")])
);
export type NotesInput = z.infer<typeof notesSchema>;

/**
 * Pure set-equality check used to validate a proposed reorder: `proposed`
 * must contain exactly the same ids as `actual` — same set, no duplicates,
 * no missing or extra members — regardless of order (order is the whole
 * point of the caller's request, so it's deliberately not compared here).
 * Two empty arrays count as a permutation of each other. Duplicates in
 * either array make it fail (checked via length-after-Set-dedupe rather than
 * relying on `reorderSchema` having already caught it, so this helper is
 * safe to call standalone in a unit test).
 */
export function isPermutation(proposed: string[], actual: string[]): boolean {
  if (proposed.length !== actual.length) return false;
  const proposedSet = new Set(proposed);
  const actualSet = new Set(actual);
  if (proposedSet.size !== proposed.length) return false;
  if (actualSet.size !== actual.length) return false;
  if (proposedSet.size !== actualSet.size) return false;
  for (const id of proposedSet) {
    if (!actualSet.has(id)) return false;
  }
  return true;
}
