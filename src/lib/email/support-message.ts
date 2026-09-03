// Support-message notification email — sent to whoever holds the DEVELOPER
// role when a user submits Settings -> PathQuote Support.
//
// Kept as a pure function, same split as src/lib/email/magic-link.ts (see
// its header comment): no Prisma, no NextAuth, no env reads, so this stays
// unit-testable without a database. See tests/support-message-email.test.ts.

const PRODUCT_NAME = "PathQuote";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Line breaks in a `<pre>`-free HTML block need an explicit <br> per line —
// the message body is plain text (a <textarea>), not markdown/HTML.
function textToHtmlLines(input: string): string {
  return escapeHtml(input).split("\n").join("<br />");
}

export type SupportMessageEmailInput = {
  subject: string;
  body: string;
  authorEmail: string;
  authorName?: string | null;
  authorRole: string;
  regionName?: string | null;
  appVersion: string;
  submittedAt: Date;
  /** The reporting user's own address, already resolved by the caller via
   * `resolveReplyTo` (src/lib/email/reply-to.ts) — the same helper the
   * magic-link email already uses, so a developer replying reaches the
   * reporter directly rather than the noreply sending address. This module
   * only shapes the message; it never computes a Reply-To itself. */
  replyTo?: string;
};

export type SupportMessageEmail = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

export function buildSupportMessageEmail({
  subject,
  body,
  authorEmail,
  authorName,
  authorRole,
  regionName,
  appVersion,
  submittedAt,
  replyTo,
}: SupportMessageEmailInput): SupportMessageEmail {
  const from = authorName ? `${authorName} <${authorEmail}>` : authorEmail;
  const context = [
    `From: ${from}`,
    `Role: ${authorRole}`,
    `Region: ${regionName ?? "Not set"}`,
    `App version: ${appVersion}`,
    `Submitted: ${submittedAt.toISOString()}`,
  ];

  const text = [
    `New PathQuote Support message: ${subject}`,
    "",
    ...context,
    "",
    body,
  ].join("\n");

  const contextRowsHtml = context
    .map((line) => `<tr><td style="padding:2px 0;color:#666;">${escapeHtml(line)}</td></tr>`)
    .join("");

  // Table-based layout and inline styles — same reasoning as
  // buildMagicLinkEmail: Outlook (the recipient here is on Microsoft 365)
  // ignores <style> blocks and most modern CSS.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#7c3aed;padding-bottom:8px;">${PRODUCT_NAME} Support</td>
            </tr>
            <tr>
              <td style="font-size:18px;font-weight:600;padding-bottom:16px;">${escapeHtml(subject)}</td>
            </tr>
            <tr>
              <td style="padding-bottom:20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-size:12px;">
                  ${contextRowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #eee;padding-top:16px;font-size:14px;line-height:22px;">
                ${textToHtmlLines(body)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `[${PRODUCT_NAME} Support] ${subject}`,
    text,
    html,
    replyTo,
  };
}
