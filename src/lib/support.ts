// Pure decision logic for the support-message send path, split out of
// src/lib/actions/support.ts for the same "no @/lib/db import" reason as
// src/lib/validation/finalize.ts (see that file's header comment) — this
// must stay unit-testable without a database.

export type SupportRecipient = { email: string; name?: string | null };

export type SupportRecipientPlan =
  | { ok: true; to: string[] }
  | { ok: false; error: string };

/** Human-facing refusal shown on the form itself when nobody currently
 * holds the DEVELOPER role — deliberately not phrased as a generic "could
 * not send" error, so the sender understands *why* and what fixes it,
 * rather than assuming their own message was somehow wrong. */
export const NO_DEVELOPER_ERROR =
  "This can't be sent yet — no one currently holds the Developer role. Ask an admin to assign it to someone under Settings → Users, then try again.";

/**
 * Resolves the email addresses a support message should go to, or a plain
 * refusal when there are none. Never returns `ok: true` with an empty `to`
 * list — "refuse to pretend it sent" (see the brief this shipped against)
 * means the caller must be able to tell "nobody to send to" apart from
 * "sent to zero people" without inspecting the array itself.
 */
export function resolveSupportRecipients(developers: readonly SupportRecipient[]): SupportRecipientPlan {
  const to = developers.map((d) => d.email.trim()).filter((email) => email.length > 0);
  if (to.length === 0) {
    return { ok: false, error: NO_DEVELOPER_ERROR };
  }
  return { ok: true, to };
}
