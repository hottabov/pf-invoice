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
 * `undefined` (used for `contactId?` on setDocumentClient — clearing the
 * contact is a valid choice, not an error). */
export const optionalIdSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  idSchema.optional()
);
