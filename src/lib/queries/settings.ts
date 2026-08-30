import { db } from "@/lib/db";

const QUOTE_VALIDITY_SETTING_KEY = "quote.validityDays";

/** Fallback used when no `Setting` row exists for "quote.validityDays" (or
 * its value isn't a finite number) — quotes are valid for a week by
 * default. Exported so the settings page can render this as the field's
 * placeholder/default without duplicating the number. */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 7;

/**
 * Number of days a finalized QUOTE stays valid for, read from the
 * `Setting` table (key "quote.validityDays"). Falls back to
 * `DEFAULT_QUOTE_VALIDITY_DAYS` when no row exists yet or its stored value
 * isn't a finite number (defensive — the only writer, `updateSetting` in
 * src/lib/actions/settings.ts, always validates through
 * `quoteValidityDaysSchema` first).
 *
 * Shared by `finalizeDocument` (src/lib/actions/finalize.ts, which freezes
 * this onto `Document.validityDays` for QUOTE documents) and the main
 * /settings page (which displays/edits it) — pulled out here so both read
 * the same fallback logic instead of duplicating it.
 */
export async function getQuoteValidityDays(): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: QUOTE_VALIDITY_SETTING_KEY } });
  const rawValue = setting?.value;
  return typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : DEFAULT_QUOTE_VALIDITY_DAYS;
}
