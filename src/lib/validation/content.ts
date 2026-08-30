// Pure zod validation for the content-block admin editor (/settings/content).
// No imports from `@/lib/db` or any Prisma types — this module must be
// safely importable from a plain unit test and from the server actions that
// call it (see src/lib/actions/content.ts).
import { z } from "zod";

/** A content-block key, e.g. "terms.delivery", "option.OFD",
 * "equipment.fabric-master". Matches every key in
 * prisma/seed-data/content-blocks.json: lowercase/uppercase letters,
 * digits, dots, and hyphens, 2-60 characters. Exported so both the
 * server action (which also receives the key as a route param, not just
 * form data) and its unit tests can validate a key without duplicating the
 * pattern. */
export const CONTENT_KEY_REGEX = /^[a-z0-9.-]{2,60}$/i;

const keySchema = z.string().regex(CONTENT_KEY_REGEX, {
  message: "Key must be 2-60 characters: letters, numbers, dots, and hyphens only",
});

/** Optional title, ≤200 chars. Missing/empty (incl. "" or null from a
 * FormData.get() on an absent field) collapses to `undefined` (stored as
 * `null`). */
const titleSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().max(200, "Title must be at most 200 characters").optional()
);

/** Markdown body, 1-20000 chars. Blank bodies are rejected — every block
 * needs *some* content, since it's rendered straight into a quote. */
const bodySchema = z
  .string()
  .min(1, "Body is required")
  .max(20000, "Body must be at most 20000 characters");

/** Non-negative integer sort order; missing/empty defaults to 0. */
const sortOrderSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? 0 : value),
  z.coerce
    .number({ error: "Sort order must be a number" })
    .int("Sort order must be a whole number")
    .min(0, "Sort order must be 0 or greater")
);

export const contentBlockSchema = z.object({
  key: keySchema,
  title: titleSchema,
  body: bodySchema,
  sortOrder: sortOrderSchema,
});

export type ContentBlockInput = z.infer<typeof contentBlockSchema>;

/** A region code as used by createRegionOverride/deleteRegionOverride —
 * 2-3 letters, case-insensitive, normalized to uppercase to match
 * Region.code. Mirrors priceInputSchema's regionCode piece in
 * src/lib/validation/catalog.ts. */
export const regionCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{2,3}$/.test(value), {
    message: "Region code must be 2-3 letters",
  });
