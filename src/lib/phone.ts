// Pure phone-number validation wrapper around `google-libphonenumber`
// (Seegno, Portugal — Google's own official JS port of libphonenumber;
// deliberately chosen over `libphonenumber-js` per the owner's "no
// Russian-authored libraries" constraint). No `@/lib/db` or `next/*`
// imports — safe from a plain `vitest run` and from src/lib/validation/
// clients.ts, which needs it at schema-definition time.
import { PhoneNumberUtil, PhoneNumberFormat } from "google-libphonenumber";

const phoneUtil = PhoneNumberUtil.getInstance();

export type PhoneValidationResult =
  | { ok: true; e164: string | null; national: string | null }
  | { ok: false; reason: string };

/**
 * Validates a raw phone-number string, optionally interpreted relative to
 * `defaultRegion` (an ISO alpha-2 country code, e.g. "AU") when the number
 * has no leading "+" country code of its own. Returns `{ ok: true, e164:
 * null, national: null }` for an empty/blank `raw` — every phone field in
 * this app is optional (see `phoneSchema` in src/lib/validation/clients.ts),
 * so "nothing entered" is success, not a validation failure. A non-empty
 * string that libphonenumber can't parse or doesn't consider valid comes
 * back as `{ ok: false, reason }` with a message safe to show the user
 * directly.
 */
export function validatePhone(raw: string | null | undefined, defaultRegion?: string): PhoneValidationResult {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") {
    return { ok: true, e164: null, national: null };
  }

  let parsed;
  try {
    parsed = phoneUtil.parseAndKeepRawInput(trimmed, defaultRegion);
  } catch {
    return { ok: false, reason: "Enter a valid phone number, e.g. +61 3 9338 3471" };
  }

  if (!phoneUtil.isValidNumber(parsed)) {
    return { ok: false, reason: "Enter a valid phone number, e.g. +61 3 9338 3471" };
  }

  return {
    ok: true,
    e164: phoneUtil.format(parsed, PhoneNumberFormat.E164),
    national: phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL),
  };
}
