// Who should a client's reply go to?
//
// Outgoing mail is sent From noreply@q.pathfindercut.com — that's the Resend
// sending subdomain, and it accepts nothing. Clients reply anyway (they don't
// read "noreply"), so every message needs a Reply-To pointing at a human.
//
// For a quote, that human is the manager who built it (Document.author). If
// there isn't one — or they've since been deactivated — replies fall back to
// the shared inbox in EMAIL_REPLY_TO (sales@pathfindercut.com).
//
// Pure and env-free on purpose; the caller reads the env var. Tested in
// tests/reply-to.test.ts.

export type ReplyToAuthor = {
  email: string;
  name?: string | null;
  /** Absent means active — callers may select a narrow set of columns. */
  active?: boolean | null;
};

// RFC 5322 atext, plus "." which is fine inside a dot-atom display name.
// Anything else (comma, angle bracket, colon, quote, backslash…) forces the
// display name into a quoted-string.
const SAFE_DISPLAY_NAME = /^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~.]+$/;

function formatAddress(email: string, name: string | null): string {
  if (!name) return email;
  if (SAFE_DISPLAY_NAME.test(name)) return `${name} <${email}>`;
  const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}" <${email}>`;
}

/**
 * Strip CR/LF and collapse the remaining whitespace.
 *
 * The name comes from an editable user profile, so a newline in it would let
 * that user forge extra headers (Bcc, etc.) on every email carrying their
 * name. Nodemailer guards against this too, but a header value should never
 * be able to contain a line break in the first place.
 */
function sanitize(value: string | null | undefined): string {
  return (value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function resolveReplyTo(
  author: ReplyToAuthor | null | undefined,
  fallback: string | null | undefined
): string | undefined {
  const authorEmail = sanitize(author?.email);
  const isActive = author?.active !== false;

  if (authorEmail && isActive) {
    const name = sanitize(author?.name) || null;
    return formatAddress(authorEmail, name);
  }

  // An empty string here means "send no Reply-To header at all", which is
  // better than an empty one.
  return sanitize(fallback) || undefined;
}
