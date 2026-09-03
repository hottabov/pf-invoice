// Pure zod validation for the PathQuote Support form (Settings -> PathQuote
// Support). No imports from `@/lib/db`, `@prisma/client`, or `next/*` — see
// src/lib/validation/users.ts's header comment for why every validation
// module in this app holds to that so it's safely importable from a plain
// unit test and from the server action that calls it
// (src/lib/actions/support.ts).
import { z } from "zod";

/** Short enough to show in a notification/email subject line without
 * wrapping oddly, long enough for a real problem description ("prices for
 * the X-Calibre are showing AUD not USD", etc). */
export const supportSubjectSchema = z
  .string()
  .trim()
  .min(1, "Subject is required")
  .max(150, "Subject must be at most 150 characters");

/** Generous upper bound — a report may legitimately include steps to
 * reproduce, an item code, a quote number — but still bounded so a runaway
 * paste can't produce an unreasonably large email/database row. */
export const supportBodySchema = z
  .string()
  .trim()
  .min(1, "Message is required")
  .max(5000, "Message must be at most 5000 characters");

export const supportMessageSchema = z.object({
  subject: supportSubjectSchema,
  body: supportBodySchema,
});
export type SupportMessageInput = z.infer<typeof supportMessageSchema>;
