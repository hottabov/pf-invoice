// Pure zod validation for the catalog admin editors (products, options,
// per-region prices, option/series compatibility). No imports from `@/lib/db`
// or any Prisma types — this module must be safely importable from a plain
// unit test and from the server actions that call it.
import { z } from "zod";

// --- shared field pieces -----------------------------------------------

// The extracted catalog has codes that aren't strictly alnum-dash: things
// like "Drills included" and "MTS- additional gantry..." showed up as
// codes during the Excel extraction (see Phase 2). Kept permissive but
// bounded: 2-30 characters, must start alnum, remaining chars may include
// spaces, dots, hyphens, and slashes.
const CODE_REGEX = /^[A-Z0-9][A-Z0-9 .\-/]{1,29}$/;

/** Trims, uppercases, and bounds a catalog code (product/option). */
const codeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => CODE_REGEX.test(value), {
    message: "Code must be 2-30 characters: letters, numbers, spaces, dots, hyphens, or slashes",
  });

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(200, "Name must be at most 200 characters");

/** Optional free text, ≤2000 chars. Missing/empty (incl. "" or null from a
 * FormData.get() on an absent field) collapses to `undefined`. */
const descriptionSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().max(2000, "Description must be at most 2000 characters").optional()
);

/**
 * A checkbox's raw FormData value ("on" when checked, absent/null when
 * unchecked) coerced to a real boolean. Also accepts an actual boolean or
 * "true"/"1" so plain objects (tests, programmatic callers) work the same
 * way as a submitted <form>.
 */
const checkboxBooleanSchema = z.preprocess(
  (value) => value === "on" || value === true || value === "true" || value === "1",
  z.boolean()
);

/** Non-negative integer sort order; missing/empty defaults to 0. */
const sortOrderSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? 0 : value),
  z.coerce
    .number({ error: "Sort order must be a number" })
    .int("Sort order must be a whole number")
    .min(0, "Sort order must be 0 or greater")
);

// --- product ---------------------------------------------------------------

export const productSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  description: descriptionSchema,
  active: checkboxBooleanSchema,
  sortOrder: sortOrderSchema,
});

export type ProductInput = z.infer<typeof productSchema>;

// --- option ------------------------------------------------------------

const shortDescriptionSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().max(500, "Short description must be at most 500 characters").optional()
);

/**
 * Raw JSON text for `Option.attributeSchema`, e.g.
 * `[{"key":"metres","label":"Travel (m)","type":"number"}]`. Empty/blank
 * input becomes `null` (meaning "no attribute schema"); non-empty input
 * must `JSON.parse` to an array or a plain object. The final output is the
 * *parsed* value (or `null`), ready to hand straight to Prisma's Json field.
 */
const attributeSchemaSchema = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed === "" ? null : trimmed;
  })
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null);
      } catch {
        return false;
      }
    },
    { message: "Attribute schema must be valid JSON representing an array or object" }
  )
  .transform((value): unknown => (value === null ? null : JSON.parse(value)));

export const optionSchema = productSchema.extend({
  shortDescription: shortDescriptionSchema,
  attributeSchema: attributeSchemaSchema,
});

export type OptionInput = z.infer<typeof optionSchema>;

// --- price -----------------------------------------------------------------

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

export const priceInputSchema = z.object({
  regionCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{2,3}$/.test(value), {
      message: "Region code must be 2-3 letters",
    }),
  // "" is a deliberate signal meaning "clear this price"; anything else
  // must be a non-negative decimal with at most 2 decimal places.
  amount: z
    .string()
    .trim()
    .refine((value) => value === "" || AMOUNT_REGEX.test(value), {
      message: "Amount must be a non-negative number with at most 2 decimal places",
    }),
});

export type PriceInput = z.infer<typeof priceInputSchema>;

// --- compatibility diff -----------------------------------------------------

export type CompatDiff = { toAdd: string[]; toRemove: string[] };

/**
 * Pure helper: given the series codes an option is currently compatible
 * with and the set submitted from the editor, returns which codes need a
 * compatibility row created and which need one removed. No I/O — the
 * caller resolves codes to series ids and writes the rows.
 */
export function compatDiff(current: string[], submitted: string[]): CompatDiff {
  const currentSet = new Set(current);
  const submittedSet = new Set(submitted);
  return {
    toAdd: submitted.filter((code) => !currentSet.has(code)),
    toRemove: current.filter((code) => !submittedSet.has(code)),
  };
}
