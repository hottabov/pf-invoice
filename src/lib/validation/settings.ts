// Pure zod validation for the app-settings editor (main /settings page). No
// imports from `@/lib/db` or any Prisma types — mirrors the style of
// src/lib/validation/users.ts and src/lib/validation/regions.ts.
import { z } from "zod";

/** Keys `updateSetting` (src/lib/actions/settings.ts) is allowed to write.
 * Kept as an array (rather than inlining string literals at each call site)
 * so a new setting only needs adding here plus a new schema/case in the
 * action's switch. */
export const ALLOWED_SETTING_KEYS = ["quote.validityDays", "ui.showOptionIcons"] as const;
export type SettingKey = (typeof ALLOWED_SETTING_KEYS)[number];

export function isAllowedSettingKey(key: string): key is SettingKey {
  return (ALLOWED_SETTING_KEYS as readonly string[]).includes(key);
}

/** Number of days a finalized QUOTE stays valid for, read by
 * `getQuoteValidityDays` (src/lib/queries/settings.ts). A whole number of
 * days from 1 to 365 inclusive; the default of 7 (used when no `Setting` row
 * exists yet) lives with that query, not here. */
export const quoteValidityDaysSchema = z.coerce
  .number({ error: "Quote validity must be a number" })
  .int("Quote validity must be a whole number")
  .min(1, "Quote validity must be at least 1 day")
  .max(365, "Quote validity must be at most 365 days");
export type QuoteValidityDaysInput = z.infer<typeof quoteValidityDaysSchema>;

/** Whether the builder's options editor shows each compatible option's small
 * icon (read by `getShowOptionIcons`, src/lib/queries/settings.ts; default
 * true when unset). The setting form (mirroring `QuoteValidityForm`) submits
 * this as the literal string "true"/"false" via `FormData`, not a checkbox's
 * native on/absent encoding — `z.coerce.boolean()` would treat the string
 * "false" as truthy, so this validates the two literal strings explicitly. */
export const showOptionIconsSchema = z
  .enum(["true", "false"], { error: "Invalid value" })
  .transform((value) => value === "true");
export type ShowOptionIconsInput = z.infer<typeof showOptionIconsSchema>;
