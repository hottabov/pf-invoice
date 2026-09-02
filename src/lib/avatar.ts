// Pure, dependency-free helpers for displaying a person without a photo —
// initials plus a colour deterministically derived from their name/email —
// shared by every "who is this" surface (dashboard greeting, users list/edit,
// account settings) through the one `Avatar` component (see
// src/components/ui-kit/avatar.tsx) that renders them, per the owner's rule
// that nothing else hand-rolls a second avatar. No React/Next imports here
// so this stays trivially unit-testable (see tests/avatar.test.ts) the same
// way src/lib/sheet-data.ts's pure helpers are.

/** Small, mutually-distinguishable palette an avatar's background colour is
 * deterministically picked from (see `avatarColor`) — chosen to stay legible
 * with white initials text on top. */
const AVATAR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** Cheap, deterministic string hash (djb2-ish, truncated to a 32-bit int via
 * `| 0`) — not cryptographic, just needs to spread similar strings across
 * the palette reasonably evenly and never change between calls/runs for the
 * same input, so the same person always lands on the same colour. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic background colour for an initials avatar, keyed off
 * whatever string identifies the person — pass the same seed `getInitials`
 * would resolve to (their name if set, otherwise their email) so the same
 * person always gets the same colour everywhere they're shown.
 */
export function avatarColor(seed: string): string {
  const index = hashString(seed) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

/**
 * One- or two-letter initials for an avatar fallback: first+last initial of
 * `name` when it's set (just the one initial for a single-word name),
 * otherwise the first letter of `email`. Falls back to "?" for the
 * degenerate case of both being empty — this should never actually happen
 * (`email` is a required `User` field) but keeps the function total rather
 * than ever rendering an empty circle.
 */
export function getInitials(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    const first = words[0]?.[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
    const initials = `${first}${last}`.toUpperCase();
    if (initials) return initials;
  }
  const emailChar = email.trim().charAt(0);
  return emailChar ? emailChar.toUpperCase() : "?";
}

/**
 * First name for a greeting (the dashboard's "Hi, <first name>" — see
 * src/app/(app)/page.tsx), from a session's `user.name` and `user.email`.
 * Falls back to the email's local-part when `name` is missing/blank, or
 * when it looks like an email address itself (never renders an "@" in a
 * greeting) — a magic-link-only user has no display name until they set
 * one.
 */
export function firstNameFrom(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed && !trimmed.includes("@")) {
    return trimmed.split(/\s+/)[0];
  }
  const localPart = email.split("@")[0];
  return localPart || email;
}
